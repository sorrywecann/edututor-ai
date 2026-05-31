"""Podcast generation orchestrator.

End-to-end flow for a queued Podcast row:
  1. Mark status = 'processing'
  2. Fetch note bodies from DB (by JSON id arrays); Document text is in the
     vector store so ORM rows contribute only what's available via getattr.
  3. Generate script via podcast_script_service.generate_script
  4. Synthesize speech via TTSService for the whole script (single TTS call)
  5. Write MP3 to data/podcasts/<podcast_id>.mp3
  6. Update Podcast row: status='completed', audio_path, duration_ms, script
  7. On any exception: status='failed', error=str(e), commit + log warning

Background-job pattern: fresh AsyncSessionLocal, pre-fetched IDs only
(no stale ORM refs), graceful-degrade.

Single-voice monologue MVP. Multi-speaker dialogue is a stretch goal; the
audio_concat_service is available for chunking when scripts exceed TTS API
limits.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm_service import LLMService
    from app.services.tts_service import TTSService

logger = logging.getLogger(__name__)

_PODCAST_STORAGE_DIR = Path(__file__).parent.parent.parent / "data" / "podcasts"


async def run_podcast_job(
    podcast_id: str,
    *,
    llm: "LLMService",
    tts: "TTSService",
) -> None:
    """Long-running orchestrator. Called from BackgroundTasks.

    Reads the Podcast row, runs the pipeline, writes outcome back.
    Never raises — every failure path sets status='failed' + error message.
    """
    from app.database import AsyncSessionLocal
    from app.models.podcast import Podcast
    from app.services import podcast_script_service
    from sqlalchemy import select

    _PODCAST_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(select(Podcast).where(Podcast.id == podcast_id))
            podcast = result.scalar_one_or_none()
            if podcast is None:
                logger.warning(f"run_podcast_job: podcast_id={podcast_id[:8]} not found")
                return

            podcast.status = "processing"
            await session.commit()

            sources, notes = await _fetch_inputs(session, podcast)
            if not sources and not notes:
                _fail(podcast, "No sources or notes provided")
                await session.commit()
                return

            script = await podcast_script_service.generate_script(
                sources=sources,
                notes=notes,
                format=podcast.format,
                llm=llm,
            )
            if not script:
                _fail(podcast, "Script generation returned empty")
                await session.commit()
                return

            podcast.script = script

            tts_result = await tts.synthesize(script)
            audio_bytes = tts_result.audio_data
            duration_ms = tts_result.duration_ms

            if not audio_bytes:
                _fail(podcast, "TTS returned empty audio")
                await session.commit()
                return

            output_path = _PODCAST_STORAGE_DIR / f"{podcast.id}.mp3"
            output_path.write_bytes(audio_bytes)

            podcast.status = "completed"
            podcast.audio_path = str(output_path)
            podcast.duration_ms = duration_ms
            await session.commit()

            logger.info(f"podcast {podcast_id[:8]} ready: {output_path.stat().st_size} bytes")

        except Exception as e:
            logger.warning(f"run_podcast_job failed for {podcast_id[:8]}: {e}")
            try:
                result = await session.execute(select(Podcast).where(Podcast.id == podcast_id))
                podcast = result.scalar_one_or_none()
                if podcast is not None:
                    _fail(podcast, str(e))
                    await session.commit()
            except Exception as inner:
                logger.warning(f"run_podcast_job: failed-state write also failed: {inner}")


async def _fetch_inputs(session, podcast) -> tuple[list[str], list[str]]:
    """Return (source_texts, note_bodies) for the podcast job.

    Document ORM rows have no text body (content lives in the vector store).
    getattr fallback ensures zero-length strings are filtered rather than
    causing KeyError when the Document model evolves.
    """
    from app.models.knowledge_base import Document
    from app.models.note import Note
    from sqlalchemy import select

    source_ids = json.loads(podcast.source_ids or "[]")
    note_ids = json.loads(podcast.note_ids or "[]")

    sources: list[str] = []
    if source_ids:
        rows = await session.execute(select(Document).where(Document.id.in_(source_ids)))
        for doc in rows.scalars():
            text = getattr(doc, "content", None) or getattr(doc, "body", None) or ""
            if text:
                sources.append(text)

    notes: list[str] = []
    if note_ids:
        rows = await session.execute(select(Note).where(Note.id.in_(note_ids)))
        for note in rows.scalars():
            body = note.content or ""
            if body:
                notes.append(body)

    return sources, notes


def _fail(podcast, message: str) -> None:
    podcast.status = "failed"
    podcast.error = message[:500]
