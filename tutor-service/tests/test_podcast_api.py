"""Podcast REST API contract tests — Task 5.

Pins the 4-endpoint podcast router: POST schedule, GET status, GET audio, DELETE.

The router is NOT yet registered in main.py (Task 8 handles that). Tests use a
purpose-built FastAPI app that includes podcasts.router + UserIdentityMiddleware
so the Phase 8a user_id resolution path is exercised identically to production.

Background jobs are mocked via unittest.mock.patch so no real LLM/TTS calls are
made and tests remain deterministic.

Oracle review session: ses_1e1513e5effepQMVbZMKljQot5.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.middleware.user_identity import HEADER_NAME
from app.models.knowledge_base import KnowledgeBase
from app.models.note import Note
from app.models.podcast import Podcast


def _make_test_app():
    """Build an isolated FastAPI app with only the podcasts router mounted."""
    from fastapi import FastAPI
    from app.middleware.user_identity import UserIdentityMiddleware
    from app.api import podcasts as podcasts_module
    from app.deps import llm_service_dep, tts_service_dep

    fa = FastAPI()
    fa.add_middleware(UserIdentityMiddleware)
    fa.include_router(podcasts_module.router, prefix="/api/v1")

    # Stub real LLM and TTS for every test in this module; run_podcast_job
    # is additionally patched per-test so the BG work is a no-op.
    async def _fake_llm() -> MagicMock:
        return MagicMock()

    async def _fake_tts() -> MagicMock:
        return MagicMock()

    fa.dependency_overrides[llm_service_dep] = _fake_llm
    fa.dependency_overrides[tts_service_dep] = _fake_tts
    return fa


_app = _make_test_app()


@pytest_asyncio.fixture()
async def kb():
    """Persist a KnowledgeBase row and yield the detached ORM object."""
    async with AsyncSessionLocal() as session:
        kb_obj = KnowledgeBase(
            name=f"test-kb-{uuid.uuid4().hex[:8]}",
            weaviate_collection="test_col",
        )
        session.add(kb_obj)
        await session.commit()
        await session.refresh(kb_obj)
    yield kb_obj


@pytest_asyncio.fixture()
async def note(kb):
    """Persist a Note belonging to the kb fixture and yield the detached ORM object."""
    async with AsyncSessionLocal() as session:
        n = Note(
            knowledge_base_id=kb.id,
            title="Test note",
            content="Some learning content for the podcast.",
        )
        session.add(n)
        await session.commit()
        await session.refresh(n)
    yield n


@pytest.mark.asyncio
async def test_create_podcast_returns_pending_status(note):
    """POST schedules a podcast job immediately and returns status='pending'.

    Contract: the endpoint is non-blocking — it persists a Podcast row with
    status='pending', enqueues the background job, and returns before generation
    completes. The client polls GET /api/v1/podcasts/{id} for updates.

    The background job (run_podcast_job) is patched to a no-op AsyncMock so
    the test does not attempt real LLM/TTS work.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5.
    """
    user_id = str(uuid.uuid4())

    with patch("app.services.podcast_service.run_podcast_job", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as c:
            resp = await c.post(
                f"/api/v1/knowledge-bases/{note.knowledge_base_id}/podcasts",
                json={"note_ids": [note.id], "format": "summary"},
                headers={HEADER_NAME: user_id},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending"
    assert body["format"] == "summary"
    assert body["id"], "Response must carry a podcast id"

    # Confirm the row exists in the shared SQLite DB.
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Podcast).where(Podcast.id == body["id"]))
        row = result.scalar_one_or_none()

    assert row is not None, "Podcast row must be persisted to DB before returning"
    assert row.status == "pending"


@pytest.mark.asyncio
async def test_create_podcast_404_for_missing_kb():
    """POST to a nonexistent kb_id must return 404 before any row is created.

    Contract: KB existence is verified first; unknown kb_id short-circuits and
    returns 404 without creating a Podcast row or scheduling work.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5.
    """
    missing_kb_id = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as c:
        resp = await c.post(
            f"/api/v1/knowledge-bases/{missing_kb_id}/podcasts",
            json={"note_ids": [str(uuid.uuid4())], "format": "summary"},
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_podcast_400_empty_inputs(kb):
    """POST with source_ids=[] and note_ids=[] must return 400.

    Contract: at least one content source is required. Rejecting upfront prevents
    a Podcast row being created only to immediately fail in the background job.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5.
    """
    async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as c:
        resp = await c.post(
            f"/api/v1/knowledge-bases/{kb.id}/podcasts",
            json={"source_ids": [], "note_ids": [], "format": "summary"},
        )
    assert resp.status_code == 400
    detail = resp.json()["detail"].lower()
    assert "source_ids" in detail or "note_ids" in detail


@pytest.mark.asyncio
async def test_create_podcast_400_invalid_format(note):
    """POST with format='random' must return 400.

    Contract: only {"summary", "deep_dive", "qa"} are accepted. Unknown formats
    are rejected before the DB row is created so no wasted job slot is allocated.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5.
    """
    async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as c:
        resp = await c.post(
            f"/api/v1/knowledge-bases/{note.knowledge_base_id}/podcasts",
            json={"note_ids": [note.id], "format": "random"},
        )
    assert resp.status_code == 400
    detail = resp.json()["detail"].lower()
    assert "format" in detail or "random" in detail


@pytest.mark.asyncio
async def test_get_podcast_status_returns_metadata(tmp_path):
    """GET for a completed podcast returns all fields including audio_url.

    Contract: status='completed' -> audio_url=/api/v1/podcasts/{id}/audio.
    duration_ms and script fields are propagated from the DB row unchanged.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5.
    """
    user_id = str(uuid.uuid4())
    podcast_id = str(uuid.uuid4())
    kb_id = str(uuid.uuid4())
    audio_file = tmp_path / "out.mp3"
    audio_file.write_bytes(b"FAKE_MP3")

    async with AsyncSessionLocal() as session:
        kb = KnowledgeBase(
            id=kb_id,
            name=f"kb-meta-{uuid.uuid4().hex[:6]}",
            weaviate_collection="tc",
        )
        session.add(kb)
        await session.flush()
        p = Podcast(
            id=podcast_id,
            knowledge_base_id=kb_id,
            user_id=user_id,
            title="My Completed Podcast",
            format="deep_dive",
            voice_id="sk-SK-LukasNeural",
            provider="edge",
            status="completed",
            audio_path=str(audio_file),
            duration_ms=5000,
            script="Hello, this is the script.",
        )
        session.add(p)
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as c:
        resp = await c.get(
            f"/api/v1/podcasts/{podcast_id}",
            headers={HEADER_NAME: user_id},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == podcast_id
    assert body["status"] == "completed"
    assert body["audio_url"] == f"/api/v1/podcasts/{podcast_id}/audio"
    assert body["duration_ms"] == 5000
    assert body["script"] == "Hello, this is the script."


@pytest.mark.asyncio
async def test_get_podcast_403_for_different_user():
    """GET as user B for user A's podcast must return 403.

    Phase 8a invariant: X-EduTutor-User-Id resolves to request.state.user_id
    via UserIdentityMiddleware. The ownership check in GET rejects cross-user
    access so anonymous sessions cannot read each other's podcast data.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5.
    """
    user_a_id = str(uuid.uuid4())
    user_b_id = str(uuid.uuid4())
    podcast_id = str(uuid.uuid4())
    kb_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        kb = KnowledgeBase(
            id=kb_id,
            name=f"kb-403-{uuid.uuid4().hex[:6]}",
            weaviate_collection="tc",
        )
        session.add(kb)
        await session.flush()
        p = Podcast(
            id=podcast_id,
            knowledge_base_id=kb_id,
            user_id=user_a_id,
            title="User A podcast",
            format="summary",
            voice_id="sk-SK-LukasNeural",
            provider="edge",
            status="pending",
        )
        session.add(p)
        await session.commit()

    # User B tries to read user A's podcast — must be denied.
    async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as c:
        resp = await c.get(
            f"/api/v1/podcasts/{podcast_id}",
            headers={HEADER_NAME: user_b_id},
        )

    assert resp.status_code == 403
