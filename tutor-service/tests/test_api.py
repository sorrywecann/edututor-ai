"""
EduTutor.AI — API smoke tests

These tests hit the running FastAPI app via ASGI (no real network).
Database uses SQLite in-memory via the auto-fallback in database.py.
"""
import os
import pytest
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("VECTOR_DB_BACKEND", "chroma")
os.environ.setdefault("STT_PROVIDER", "mock")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_endpoint_shape():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "services" in data
    assert "model" in data
    assert data["status"] in ("ok", "degraded")


@pytest.mark.asyncio
async def test_readiness_probe():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/health/ready")
    assert resp.status_code == 200
    assert resp.json()["ready"] is True


@pytest.mark.asyncio
async def test_liveness_probe():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/health/live")
    assert resp.status_code == 200
    assert resp.json()["alive"] is True


@pytest.mark.asyncio
async def test_root_endpoint():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "EduTutor.AI API"
    assert data["status"] == "running"


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_conversation_returns_id():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/conversations", json={"user_id": "test-user-abc"})
    assert resp.status_code == 200
    data = resp.json()
    assert "conversation_id" in data
    assert "room_name" in data
    assert "token" in data
    assert "server_url" in data


@pytest.mark.asyncio
async def test_create_conversation_with_knowledge_base():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(
            "/api/v1/conversations",
            json={"user_id": "test-user-abc", "knowledge_base_id": "test-kb"},
        )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Knowledge bases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_knowledge_bases_returns_list():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/knowledge-bases")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_and_delete_knowledge_base():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        # Pre-cleanup in case previous run left it behind
        await c.delete("/api/v1/knowledge-bases/api-test-kb")

        resp = await c.post(
            "/api/v1/knowledge-bases",
            json={"name": "api-test-kb", "description": "Created by test"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "api-test-kb"

        # Cleanup
        del_resp = await c.delete("/api/v1/knowledge-bases/api-test-kb")
        assert del_resp.status_code == 200


# ---------------------------------------------------------------------------
# Chat — greeting shortcut (no LLM needed)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_greeting_returns_slovak():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(
            "/api/v1/chat",
            json={"message": "__greeting__", "language": "sk"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] in ("static", "openai", "ollama", "anthropic", "mock")
    assert "EduTutor" in data["response"] or "Dobrý deň" in data["response"] or "Ahoj" in data["response"]
    # Avatar bridge fields present
    assert "emotion" in data
    assert "viseme_timeline" in data
    assert "audio_duration_ms" in data
