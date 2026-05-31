"""
EduTutor.AI - Conversations API
API endpoints for conversation management with LiveKit integration
"""

import os
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
try:
    from livekit import api as livekit_api
except ImportError:
    livekit_api = None
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User
from app.models.conversation import Conversation as ConvModel, ConversationStatus, Message as MsgModel, MessageRole
from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationDetail,
)
from app.services.user_service import get_or_create_anon_user as _get_or_create_anon_user
from app.deps import llm_service_dep
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)
router = APIRouter()

# LiveKit configuration
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")


def generate_livekit_token(
    room_name: str,
    participant_identity: str,
    participant_name: Optional[str] = None,
    knowledge_base: Optional[str] = None,
) -> str:
    """Generate LiveKit JWT token for room access.

    Returns an empty string when livekit is not installed — the frontend only
    reads conversation_id from the response, never the token itself.
    """
    if livekit_api is None:
        logger.debug("livekit not installed — returning empty token (conversation still works)")
        return ""

    token = livekit_api.AccessToken(
        api_key=LIVEKIT_API_KEY,
        api_secret=LIVEKIT_API_SECRET,
    )

    token.with_identity(participant_identity)
    if participant_name:
        token.with_name(participant_name)

    # Grant permissions
    token.with_grants(
        livekit_api.VideoGrants(
            room=room_name,
            room_join=True,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        )
    )

    # Set expiration (1 hour)
    token.with_ttl(timedelta(hours=1))

    return token.to_jwt()


async def create_livekit_room(
    room_name: str,
    knowledge_base: Optional[str] = None,
) -> None:
    if livekit_api is None:
        return
    try:
        room_service = livekit_api.RoomService(
            url=LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://"),
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
        )

        metadata = {}
        if knowledge_base:
            metadata["knowledge_base"] = knowledge_base

        await room_service.create_room(
            livekit_api.CreateRoomRequest(
                name=room_name,
                empty_timeout=300,  # 5 minutes
                max_participants=10,
                metadata=json.dumps(metadata) if metadata else None,
            )
        )

        logger.info(f"Created LiveKit room: {room_name}")

    except Exception as e:
        logger.warning(f"Could not create LiveKit room (may not be running): {e}")


@router.get("/stats")
async def get_stats(
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Return aggregate learning stats using SQL aggregation."""
    from datetime import date, timedelta
    from app.models.conversation import Message as MsgModel, MessageRole
    from sqlalchemy import text

    stmt = select(func.count(ConvModel.id))
    if user_id:
        stmt = stmt.where(ConvModel.user_id == user_id)
    session_count = (await db.execute(stmt)).scalar() or 0

    turns_stmt = select(func.count(MsgModel.id)).where(MsgModel.role == MessageRole.ASSISTANT)
    if user_id:
        turns_stmt = turns_stmt.join(ConvModel).where(ConvModel.user_id == user_id)
    total_turns = (await db.execute(turns_stmt)).scalar() or 0

    words_stmt = select(func.sum(func.length(MsgModel.content))).where(MsgModel.role == MessageRole.ASSISTANT)
    if user_id:
        words_stmt = words_stmt.join(ConvModel).where(ConvModel.user_id == user_id)
    total_chars = (await db.execute(words_stmt)).scalar() or 0
    total_words = total_chars // 6

    user_words_stmt = select(func.sum(func.length(MsgModel.content))).where(MsgModel.role == MessageRole.USER)
    if user_id:
        user_words_stmt = user_words_stmt.join(ConvModel).where(ConvModel.user_id == user_id)
    user_chars = (await db.execute(user_words_stmt)).scalar() or 0
    user_words = user_chars // 6

    user_msg_stmt = select(func.count(MsgModel.id)).where(MsgModel.role == MessageRole.USER)
    if user_id:
        user_msg_stmt = user_msg_stmt.join(ConvModel).where(ConvModel.user_id == user_id)
    user_messages = (await db.execute(user_msg_stmt)).scalar() or 0

    last_q = select(func.max(ConvModel.created_at))
    if user_id:
        last_q = last_q.where(ConvModel.user_id == user_id)
    last_session_at = (await db.execute(last_q)).scalar()

    date_col = func.date(ConvModel.created_at)
    dates_q = select(date_col).distinct().order_by(date_col.desc())
    if user_id:
        dates_q = dates_q.where(ConvModel.user_id == user_id)
    rows = (await db.execute(dates_q)).all()
    session_dates = []
    for (r,) in rows:
        if r is None:
            continue
        try:
            session_dates.append(r if isinstance(r, date) else date.fromisoformat(str(r)))
        except (ValueError, TypeError):
            pass

    today = date.today()
    yesterday = today - timedelta(days=1)
    streak = 0
    if session_dates:
        expected = today if session_dates[0] == today else yesterday
        for d in session_dates:
            if d == expected:
                streak += 1
                expected = expected - timedelta(days=1)
            else:
                break

    avg_turns = round(total_turns / session_count, 1) if session_count > 0 else 0

    activity_q = (
        select(func.date(ConvModel.created_at).label("day"), func.count().label("n"))
        .group_by(func.date(ConvModel.created_at))
        .order_by(func.date(ConvModel.created_at).desc())
        .limit(14)
    )
    if user_id:
        activity_q = activity_q.where(ConvModel.user_id == user_id)
    activity_rows = (await db.execute(activity_q)).all()
    activity = [{"date": str(d), "sessions": n} for d, n in activity_rows]

    recent_q = (
        select(MsgModel.content)
        .where(MsgModel.role == MessageRole.USER)
        .order_by(MsgModel.created_at.desc())
        .limit(8)
    )
    recent_rows = (await db.execute(recent_q)).all()
    recent_topics = [row[0][:100] for row in recent_rows if row[0] and len(row[0].strip()) > 5]

    return {
        "session_count": session_count,
        "total_turns": total_turns,
        "total_words": total_words,
        "user_messages": user_messages,
        "user_words": user_words,
        "streak_days": streak,
        "avg_turns_per_session": avg_turns,
        "last_session_at": last_session_at.isoformat() if last_session_at else None,
        "activity": activity,
        "recent_topics": recent_topics,
    }


@router.get("/conversations")
async def list_conversations(
    limit: int = 20,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List recent conversations ordered by creation date."""
    from app.models.conversation import Message as MsgModel, MessageRole
    from app.services import memory_service as mem

    limit = min(max(1, limit), 100)
    stmt = select(ConvModel).order_by(ConvModel.created_at.desc())
    if user_id:
        stmt = stmt.where(ConvModel.user_id == user_id)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    conversations = result.scalars().all()

    if not conversations:
        return []

    conv_ids = [str(c.id) for c in conversations]

    # Batch: message counts per conversation
    count_rows = await db.execute(
        select(MsgModel.conversation_id, func.count().label("cnt"))
        .where(MsgModel.conversation_id.in_(conv_ids))
        .group_by(MsgModel.conversation_id)
    )
    db_counts: dict = {row.conversation_id: row.cnt for row in count_rows}

    # Batch: first assistant message per conversation (for preview)
    preview_rows = await db.execute(
        select(MsgModel.conversation_id, MsgModel.content, MsgModel.created_at)
        .where(
            MsgModel.conversation_id.in_(conv_ids),
            MsgModel.role == MessageRole.ASSISTANT,
        )
        .order_by(MsgModel.created_at)
    )
    db_previews: dict = {}
    for row in preview_rows:
        if row.conversation_id not in db_previews:
            c = row.content
            db_previews[row.conversation_id] = c[:80] + ("…" if len(c) > 80 else "")

    rows = []
    for c in conversations:
        conv_id = str(c.id)

        # Count: SQLite first, fall back to JSON cache for legacy sessions
        msg_count = db_counts.get(conv_id, 0)
        if msg_count == 0:
            history = mem.get_history(conv_id)
            msg_count = len(history)

        if msg_count == 0:
            continue  # skip ghost sessions

        # Preview: SQLite first, fall back to JSON cache
        preview = db_previews.get(conv_id)
        if not preview:
            history = mem.get_history(conv_id)
            raw = next((m["content"] for m in history if m.get("role") == "assistant"), None)
            if raw:
                preview = raw[:80] + ("…" if len(raw) > 80 else "")

        rows.append({
            "id": conv_id,
            "title": getattr(c, "session_name", None) or "Session",
            "status": c.status.value if c.status else "unknown",
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "message_count": msg_count,
            "preview": preview,
        })
    return rows


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return full message history for a conversation."""
    from app.models.conversation import Message as MsgModel
    from app.services import memory_service as mem

    result = await db.execute(select(ConvModel).where(ConvModel.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail=f"Conversation '{conversation_id}' not found")

    # SQLite is the source of truth; fall back to JSON cache for legacy sessions
    msg_result = await db.execute(
        select(MsgModel)
        .where(MsgModel.conversation_id == conversation_id)
        .order_by(MsgModel.created_at)
    )
    db_messages = msg_result.scalars().all()

    if db_messages:
        messages = [{"role": m.role.value, "content": m.content} for m in db_messages]
    else:
        messages = mem.get_history(conversation_id)

    return {
        "conversation_id": conversation_id,
        "title": getattr(conv, "session_name", None) or "Session",
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "messages": messages,
        "count": len(messages),
    }


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    request: ConversationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new conversation and return LiveKit room credentials.

    - **user_id**: User identifier
    - **knowledge_base_id**: Optional knowledge base ID for RAG context

    Returns room credentials for joining the voice conversation.
    """
    conversation_id = str(uuid.uuid4())
    room_name = f"edu-{conversation_id[:8]}"

    # Generate participant token
    token = generate_livekit_token(
        room_name=room_name,
        participant_identity=request.user_id,
        participant_name=f"User-{request.user_id[:8]}",
        knowledge_base=request.knowledge_base_id,
    )

    # Ensure user row exists (anonymous)
    await _get_or_create_anon_user(request.user_id, db)

    # Persist conversation
    conv = ConvModel(
        id=conversation_id,
        user_id=request.user_id,
        knowledge_base_id=request.knowledge_base_id,
        room_name=room_name,
        status=ConversationStatus.ACTIVE,
    )
    db.add(conv)
    await db.flush()

    # Create room in background (don't wait for it)
    background_tasks.add_task(
        create_livekit_room,
        room_name,
        request.knowledge_base_id,
    )

    # Get WebSocket URL for client
    server_url = LIVEKIT_URL.replace("http://", "ws://").replace("https://", "wss://")
    if not server_url.startswith("ws"):
        server_url = f"ws://{server_url.split('://')[-1]}"

    return ConversationResponse(
        conversation_id=conversation_id,
        room_name=room_name,
        token=token,
        server_url=server_url,
        created_at=datetime.now(timezone.utc),
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get conversation details"""
    result = await db.execute(
        select(ConvModel).where(ConvModel.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail=f"Conversation '{conversation_id}' not found")

    return ConversationDetail(
        conversation_id=conv.id,
        user_id=conv.user_id,
        knowledge_base_id=conv.knowledge_base_id,
        room_name=conv.room_name,
        status=conv.status.value,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=0,
    )


@router.delete("/conversations/{conversation_id}")
async def end_conversation(
    conversation_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(llm_service_dep),
):
    """End a conversation and clean up resources"""
    room_name = f"edu-{conversation_id[:8]}"

    try:
        room_service = livekit_api.RoomService(
            url=LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://"),
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
        )

        await room_service.delete_room(livekit_api.DeleteRoomRequest(room=room_name))

        logger.info(f"Deleted LiveKit room: {room_name}")

    except Exception as e:
        logger.warning(f"Could not delete LiveKit room: {e}")

    result = await db.execute(select(ConvModel).where(ConvModel.id == conversation_id))
    conv = result.scalar_one_or_none()
    if conv:
        conv.status = ConversationStatus.ENDED
        await db.flush()
        conv_id = conv.id
        user_id = conv.user_id
        msg_result = await db.execute(
            select(MsgModel)
            .where(MsgModel.conversation_id == conv_id)
            .order_by(MsgModel.created_at)
        )
        msgs = msg_result.scalars().all()
        formatted = [
            {
                "role": m.role.value if hasattr(m.role, "value") else str(m.role),
                "content": m.content,
            }
            for m in msgs
        ]
        if formatted:
            background_tasks.add_task(_run_summary_bg, conv_id, user_id, formatted, llm)

    return {"conversation_id": conversation_id, "status": "ended"}


async def _run_summary_bg(
    conv_id: str,
    user_id: str,
    formatted: list,
    llm: LLMService,
) -> None:
    """Background: summarize ended conversation, store in episodic memory.

    Receives pre-fetched messages so no new DB session is needed — avoids
    a StaticPool transaction conflict where a second session's ROLLBACK (on
    close) can undo the primary session's unflushed UPDATE.
    """
    try:
        from app.services import conversation_summarizer, episodic_memory_service

        summary = await conversation_summarizer.summarize_conversation(formatted, llm)
        if summary:
            await episodic_memory_service.remember(user_id, summary, conversation_id=conv_id)
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).warning(
            f"summary bg task failed for conv={conv_id[:8]}: {e}"
        )


@router.post("/conversations/{conversation_id}/token")
async def refresh_token(conversation_id: str, user_id: str):
    """Refresh LiveKit token for an existing conversation"""
    room_name = f"edu-{conversation_id[:8]}"

    token = generate_livekit_token(
        room_name=room_name,
        participant_identity=user_id,
        participant_name=f"User-{user_id[:8]}",
    )

    return {
        "token": token,
        "expires_in": 3600,  # 1 hour
    }


# ── KB Chat Sessions (lightweight, no LiveKit) ─────────────────────────

class KBSessionCreate(BaseModel):
    name: str = Field(default="Nová relácia", max_length=255)


class KBSessionResponse(BaseModel):
    id: str
    name: str
    message_count: int
    is_pinned: bool
    created_at: str

    model_config = {"from_attributes": True}


@router.get("/knowledge-bases/{kb_name}/sessions", response_model=list[KBSessionResponse])
async def list_kb_sessions(kb_name: str, db: AsyncSession = Depends(get_db)):
    from app.models.knowledge_base import KnowledgeBase as KBModel
    kb_result = await db.execute(select(KBModel).where(KBModel.name == kb_name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(404, detail=f"Knowledge base '{kb_name}' not found")

    convs = await db.execute(
        select(ConvModel)
        .where(ConvModel.knowledge_base_id == kb.id, ConvModel.status == ConversationStatus.ACTIVE)
        .order_by(ConvModel.is_pinned.desc(), ConvModel.updated_at.desc())
    )
    sessions = []
    for c in convs.scalars().all():
        count_row = await db.execute(
            select(func.count(MsgModel.id)).where(MsgModel.conversation_id == c.id)
        )
        msg_count = count_row.scalar() or 0
        if msg_count == 0 and c.session_name is None:
            continue
        sessions.append(KBSessionResponse(
            id=c.id,
            name=c.session_name or f"Relácia {c.id[:6]}",
            message_count=msg_count,
            is_pinned=c.is_pinned,
            created_at=c.created_at.isoformat() if c.created_at else "",
        ))
    return sessions


@router.post("/knowledge-bases/{kb_name}/sessions", response_model=KBSessionResponse)
async def create_kb_session(
    kb_name: str,
    request: KBSessionCreate,
    db: AsyncSession = Depends(get_db),
):
    from app.models.knowledge_base import KnowledgeBase as KBModel
    kb_result = await db.execute(select(KBModel).where(KBModel.name == kb_name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(404, detail=f"Knowledge base '{kb_name}' not found")

    conv = ConvModel(
        user_id="kb-session",
        knowledge_base_id=kb.id,
        room_name=f"kb-{kb_name}-{uuid.uuid4().hex[:8]}",
        status=ConversationStatus.ACTIVE,
        session_name=request.name,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return KBSessionResponse(
        id=conv.id, name=conv.session_name or request.name,
        message_count=0, is_pinned=False,
        created_at=conv.created_at.isoformat() if conv.created_at else "",
    )


@router.patch("/conversations/{conv_id}")
async def update_kb_session(conv_id: str, name: Optional[str] = None, pin: Optional[bool] = None, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConvModel).where(ConvModel.id == conv_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, detail="Session not found")
    if name is not None:
        conv.session_name = name
    if pin is not None:
        conv.is_pinned = pin
    await db.commit()
    return {"id": conv_id, "ok": True}
