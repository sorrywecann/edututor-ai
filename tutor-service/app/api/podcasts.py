"""Podcast generation REST endpoints.

POST   /api/v1/knowledge-bases/{kb_id}/podcasts  - schedule a job
GET    /api/v1/podcasts/{id}                     - status + metadata
GET    /api/v1/podcasts/{id}/audio               - stream MP3
DELETE /api/v1/podcasts/{id}                     - delete row + MP3

Mirrors transformations.py:53-130 pattern (BackgroundTask + status polling).

Per Phase 8a invariant: podcasts are scoped to request.state.user_id.
GET/DELETE require ownership; POST defaults user_id to request.state.user_id.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import llm_service_dep, tts_service_dep
from app.models.knowledge_base import Document, KnowledgeBase
from app.models.note import Note
from app.models.podcast import Podcast
from app.services import podcast_service

logger = logging.getLogger(__name__)
router = APIRouter()

_VALID_FORMATS = frozenset({"summary", "deep_dive", "qa"})


class PodcastCreateRequest(BaseModel):
    source_ids: list[str] = []
    note_ids: list[str] = []
    format: str = "summary"
    voice_id: str = "sk-SK-LukasNeural"
    provider: str = "edge"
    title: Optional[str] = None


class PodcastResponse(BaseModel):
    id: str
    title: str
    status: str
    format: str
    voice_id: str
    provider: str
    duration_ms: Optional[int] = None
    audio_url: Optional[str] = None
    script: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str


def _to_response(podcast: Podcast) -> PodcastResponse:
    """Convert ORM row to PodcastResponse; audio_url is only populated when completed."""
    audio_url = (
        f"/api/v1/podcasts/{podcast.id}/audio" if podcast.status == "completed" else None
    )
    return PodcastResponse(
        id=podcast.id,
        title=podcast.title,
        status=podcast.status,
        format=podcast.format,
        voice_id=podcast.voice_id,
        provider=podcast.provider,
        duration_ms=podcast.duration_ms,
        audio_url=audio_url,
        script=podcast.script,
        error=podcast.error,
        created_at=podcast.created_at.isoformat(),
        updated_at=podcast.updated_at.isoformat(),
    )


@router.post("/knowledge-bases/{kb_id}/podcasts", response_model=PodcastResponse)
async def create_podcast(
    kb_id: str,
    payload: PodcastCreateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    llm=Depends(llm_service_dep),
    tts=Depends(tts_service_dep),
) -> PodcastResponse:
    """Schedule a podcast generation job for a knowledge base.

    Returns immediately with status='pending'. Mirrors the BackgroundTask
    pattern in transformations.py:100-122.
    """
    kb_result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = kb_result.scalar_one_or_none()
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if payload.format not in _VALID_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format {payload.format!r}. Must be one of: {sorted(_VALID_FORMATS)}",
        )

    if not payload.source_ids and not payload.note_ids:
        raise HTTPException(
            status_code=400,
            detail="At least one of source_ids or note_ids must be non-empty",
        )

    for src_id in payload.source_ids:
        doc_result = await db.execute(
            select(Document).where(
                Document.id == src_id,
                Document.knowledge_base_id == kb_id,
            )
        )
        if doc_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=400,
                detail=f"Document {src_id!r} not found in this knowledge base",
            )

    for note_id in payload.note_ids:
        note_result = await db.execute(
            select(Note).where(
                Note.id == note_id,
                Note.knowledge_base_id == kb_id,
            )
        )
        if note_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=400,
                detail=f"Note {note_id!r} not found in this knowledge base",
            )

    user_id: str = request.state.user_id
    title = payload.title or f"{kb.name} podcast"

    podcast = Podcast(
        knowledge_base_id=kb_id,
        user_id=user_id,
        title=title,
        format=payload.format,
        voice_id=payload.voice_id,
        provider=payload.provider,
        status="pending",
        source_ids=json.dumps(payload.source_ids),
        note_ids=json.dumps(payload.note_ids),
    )
    db.add(podcast)
    await db.commit()
    await db.refresh(podcast)

    background_tasks.add_task(podcast_service.run_podcast_job, podcast.id, llm=llm, tts=tts)
    logger.info(
        "Podcast job scheduled: podcast_id=%.8s kb_id=%.8s user_id=%.8s",
        podcast.id,
        kb_id,
        user_id,
    )
    return _to_response(podcast)


@router.get("/podcasts/{podcast_id}", response_model=PodcastResponse)
async def get_podcast(
    podcast_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PodcastResponse:
    """Return podcast status and metadata.

    403 when the requesting user does not own the podcast (Phase 8a ownership invariant).
    """
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if podcast is None:
        raise HTTPException(status_code=404, detail="Podcast not found")
    if podcast.user_id != request.state.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _to_response(podcast)


@router.get("/podcasts/{podcast_id}/audio")
async def get_podcast_audio(
    podcast_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Stream the generated MP3 file.

    425 (Too Early) when generation is still in progress.
    410 (Gone) when audio_path does not exist on disk.
    """
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if podcast is None:
        raise HTTPException(status_code=404, detail="Podcast not found")
    if podcast.status != "completed":
        raise HTTPException(status_code=425, detail="Podcast generation not yet complete")
    if not podcast.audio_path or not Path(podcast.audio_path).exists():
        raise HTTPException(status_code=410, detail="Audio file is no longer available")
    return FileResponse(
        podcast.audio_path,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f"inline; filename={podcast.title}.mp3",
        },
    )


@router.delete("/podcasts/{podcast_id}")
async def delete_podcast(
    podcast_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete the podcast row and associated MP3 file.

    File deletion is best-effort: missing-file errors are silently ignored.
    """
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if podcast is None:
        raise HTTPException(status_code=404, detail="Podcast not found")
    if podcast.user_id != request.state.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if podcast.audio_path:
        try:
            Path(podcast.audio_path).unlink(missing_ok=True)
        except Exception:
            pass

    await db.delete(podcast)
    await db.commit()
    return {"deleted": True}
