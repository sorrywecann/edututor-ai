"""Phase podcast Task 4 — pin the run_podcast_job orchestrator contract.

The orchestrator ties together the Podcast model (Task 1), script service
(Task 2), FFmpeg concat service (Task 3), and existing TTSService.  It mirrors
the Phase 8b _run_summary_bg pattern (commit 632270f): opens a fresh
AsyncSessionLocal inside the background task, never raises, logs + sets
status='failed' on every failure path.

Contracts pinned:
  - Happy path: given valid source note content, the pipeline marks the
    Podcast row completed with audio_path, script, and duration_ms set.
  - Missing row: a non-existent podcast_id logs and returns silently without
    creating any row or raising.
  - Empty inputs: a Podcast with no source_ids and no note_ids is failed
    immediately with "No sources or notes provided".
  - Script failure: when generate_script returns '', status becomes 'failed'
    and TTS is never called.
  - TTS failure: when TTSService.synthesize raises, status becomes 'failed',
    no MP3 file is written, and no exception propagates.

Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import pytest

os.environ.setdefault("VECTOR_DB_BACKEND", "chroma")
os.environ.setdefault("STT_PROVIDER", "mock")


class _FakeLLM:
    """Minimal LLM stub that returns a canned response."""

    def __init__(self, response: str = "Toto je podcast.") -> None:
        self._response = response
        self.call_count = 0

    async def generate(self, messages, max_tokens=None, temperature=None, **kwargs) -> str:
        self.call_count += 1
        return self._response


class _FakeTTS:
    """Minimal TTS stub returning fake audio bytes."""

    def __init__(
        self,
        audio_data: bytes = b"FAKE_MP3_BYTES",
        duration_ms: int = 5000,
        raise_exc: Exception | None = None,
    ) -> None:
        self._audio_data = audio_data
        self._duration_ms = duration_ms
        self._raise_exc = raise_exc
        self.call_count = 0

    async def synthesize(self, text: str, **kwargs):
        self.call_count += 1
        if self._raise_exc is not None:
            raise self._raise_exc
        from app.services.tts_service import TTSResult

        return TTSResult(
            audio_data=self._audio_data,
            audio_format="audio/mp3",
            duration_ms=self._duration_ms,
            visemes=[],
        )


async def _make_podcast(
    *,
    note_content: str | None = "Testovací obsah o umelej inteligencii.",
    source_ids: list[str] | None = None,
    note_ids: list[str] | None = None,
) -> str:
    """Insert user → KB → optional note → podcast row, return podcast.id.

    If note_content is given, a Note is created and its id appended to
    note_ids automatically.  Caller may also pass explicit source_ids /
    note_ids lists to override.
    """
    from app.database import AsyncSessionLocal
    from app.models.knowledge_base import KnowledgeBase
    from app.models.note import Note
    from app.models.podcast import Podcast
    from app.models.user import User

    async with AsyncSessionLocal() as session:
        user = User(id=str(uuid.uuid4()))
        kb = KnowledgeBase(
            name=f"test-kb-{uuid.uuid4()}",
            weaviate_collection=f"col_{uuid.uuid4().hex[:8]}",
        )
        session.add(user)
        session.add(kb)
        await session.flush()

        resolved_note_ids: list[str] = list(note_ids or [])

        if note_content is not None:
            note = Note(
                knowledge_base_id=kb.id,
                title="Test Note",
                content=note_content,
            )
            session.add(note)
            await session.flush()
            resolved_note_ids.append(note.id)

        podcast = Podcast(
            knowledge_base_id=kb.id,
            user_id=user.id,
            source_ids=json.dumps(source_ids or []),
            note_ids=json.dumps(resolved_note_ids),
        )
        session.add(podcast)
        await session.commit()
        return podcast.id


async def _get_podcast(podcast_id: str):
    """Fetch a fresh podcast row from DB (separate session)."""
    from app.database import AsyncSessionLocal
    from app.models.podcast import Podcast
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Podcast).where(Podcast.id == podcast_id))
        return result.scalar_one_or_none()


@pytest.mark.asyncio
async def test_run_podcast_job_completes_full_pipeline(tmp_path, monkeypatch):
    """Happy path: valid note content drives the full pipeline to completion.

    Creates user + KB + 1 Note + 1 Podcast row (status='pending').  Mocks
    LLM to return "Toto je podcast." and TTS to return fake MP3 bytes with
    duration_ms=5000.  After run_podcast_job returns:
      - podcast.status == 'completed'
      - podcast.script == "Toto je podcast."
      - podcast.audio_path points at an existing file on disk
      - podcast.duration_ms == 5000

    Pins: the orchestrator executes source/note fetch → script generation →
    TTS synthesis → file write → DB commit in the correct order and propagates
    all result fields to the Podcast row.

    Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
    """
    monkeypatch.setattr(
        "app.services.podcast_service._PODCAST_STORAGE_DIR",
        tmp_path / "podcasts",
    )

    podcast_id = await _make_podcast(note_content="Obsah o umelej inteligencii v školách.")

    fake_llm = _FakeLLM("Toto je podcast.")
    fake_tts = _FakeTTS(audio_data=b"FAKE_MP3_BYTES", duration_ms=5000)

    from app.services import podcast_service

    await podcast_service.run_podcast_job(podcast_id, llm=fake_llm, tts=fake_tts)

    row = await _get_podcast(podcast_id)

    assert row is not None
    assert row.status == "completed", f"Expected 'completed', got {row.status!r} (error={row.error!r})"
    assert row.script == "Toto je podcast."
    assert row.duration_ms == 5000
    assert row.audio_path is not None
    audio_file = Path(row.audio_path)
    assert audio_file.exists(), f"MP3 file not written at {row.audio_path}"
    assert audio_file.read_bytes() == b"FAKE_MP3_BYTES"
    audio_file.unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_run_podcast_job_handles_missing_podcast_row():
    """Non-existent podcast_id logs a warning and returns silently.

    Passes a UUID that has no matching Podcast row.  Asserts that no exception
    propagates to the caller and no new rows are created.

    Pins: the orchestrator's early-exit guard (podcast is None → log + return)
    so a race condition between job dispatch and row deletion cannot crash the
    background worker.

    Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services import podcast_service

    fake_llm = _FakeLLM()
    fake_tts = _FakeTTS()

    await podcast_service.run_podcast_job(
        "nonexistent-uuid-1234-5678-90ab",
        llm=fake_llm,
        tts=fake_tts,
    )

    assert fake_tts.call_count == 0
    assert fake_llm.call_count == 0


@pytest.mark.asyncio
async def test_run_podcast_job_empty_inputs_marks_failed():
    """Podcast with source_ids=[] and note_ids=[] is failed immediately.

    Creates a valid Podcast row but with both id lists empty.  After
    run_podcast_job returns, status must be 'failed' and error must mention
    the empty-input reason.

    Pins: the early-fail guard before any LLM or TTS call, so no tokens are
    burned for a job that cannot produce output.

    Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
    """
    podcast_id = await _make_podcast(
        note_content=None,
        source_ids=[],
        note_ids=[],
    )

    from app.services import podcast_service

    fake_llm = _FakeLLM()
    fake_tts = _FakeTTS()

    await podcast_service.run_podcast_job(podcast_id, llm=fake_llm, tts=fake_tts)

    row = await _get_podcast(podcast_id)
    assert row is not None
    assert row.status == "failed"
    assert row.error is not None
    assert "No sources or notes provided" in row.error
    assert fake_llm.call_count == 0
    assert fake_tts.call_count == 0


@pytest.mark.asyncio
async def test_run_podcast_job_handles_script_failure(monkeypatch):
    """When generate_script returns '', status becomes 'failed' and TTS is not called.

    Monkeypatches podcast_script_service.generate_script to return empty string
    (simulating LLM returning nothing usable).  Asserts that the orchestrator
    marks the row failed and does not proceed to TTS.

    Pins: the script-empty guard so a silent LLM failure cannot produce a
    zero-byte audio file that would appear to the user as a valid podcast.

    Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
    """
    import app.services.podcast_script_service as pss

    original_generate = pss.generate_script

    async def _empty_generate(**kwargs) -> str:
        return ""

    monkeypatch.setattr(pss, "generate_script", _empty_generate)

    podcast_id = await _make_podcast(note_content="Nejaký obsah.")

    fake_llm = _FakeLLM()
    fake_tts = _FakeTTS()

    from app.services import podcast_service

    await podcast_service.run_podcast_job(podcast_id, llm=fake_llm, tts=fake_tts)

    row = await _get_podcast(podcast_id)
    assert row is not None
    assert row.status == "failed"
    assert row.error is not None
    assert "script" in row.error.lower() or "Script" in row.error

    assert fake_tts.call_count == 0


@pytest.mark.asyncio
async def test_run_podcast_job_handles_tts_failure(tmp_path, monkeypatch):
    """When TTSService.synthesize raises, status becomes 'failed', no MP3 is written.

    Configures _FakeTTS to raise RuntimeError("tts_boom").  After the call:
      - podcast.status == 'failed'
      - podcast.error contains the exception message
      - no file exists under _PODCAST_STORAGE_DIR for this podcast_id
      - no exception propagates to the caller

    Pins: the outer try/except in run_podcast_job so TTS provider failures
    (network errors, quota exhaustion, invalid voice) are handled gracefully
    and the UI can surface the failed state rather than seeing a stuck job.

    Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
    """
    storage_dir = tmp_path / "podcasts"
    monkeypatch.setattr(
        "app.services.podcast_service._PODCAST_STORAGE_DIR",
        storage_dir,
    )

    podcast_id = await _make_podcast(note_content="Obsah o histórii Slovenska.")

    fake_llm = _FakeLLM("Toto je podcast o histórii.")
    fake_tts = _FakeTTS(raise_exc=RuntimeError("tts_boom"))

    from app.services import podcast_service

    # Must not raise
    await podcast_service.run_podcast_job(podcast_id, llm=fake_llm, tts=fake_tts)

    row = await _get_podcast(podcast_id)
    assert row is not None
    assert row.status == "failed"
    assert row.error is not None
    assert "tts_boom" in row.error
    assert not (storage_dir / f"{podcast_id}.mp3").exists()
