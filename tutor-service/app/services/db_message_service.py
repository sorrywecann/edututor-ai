"""
EduTutor.AI — DB Message Write-Through Service

Saves every user+assistant turn to the SQLite messages table.
Called alongside memory_service.append_turn so both stay in sync.
Self-contained: opens its own session so chat.py needs no DB dependency changes.
"""
import logging
import uuid

logger = logging.getLogger(__name__)


async def save_turn(conversation_id: str, user_text: str, assistant_text: str) -> None:
    """Persist a user+assistant exchange to the messages table."""
    from app.database import AsyncSessionLocal
    from app.models.conversation import Message, MessageRole

    try:
        async with AsyncSessionLocal() as db:
            db.add(Message(
                id=str(uuid.uuid4()),
                conversation_id=conversation_id,
                role=MessageRole.USER,
                content=user_text,
            ))
            db.add(Message(
                id=str(uuid.uuid4()),
                conversation_id=conversation_id,
                role=MessageRole.ASSISTANT,
                content=assistant_text,
            ))
            await db.commit()
    except Exception as e:
        logger.warning(f"db_message_service.save_turn failed (non-critical): {e}")
