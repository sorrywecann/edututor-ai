"""
EduTutor.AI — Conversations API Tests

Covers every endpoint in conversations.py:
  - POST /conversations       (create — already tested in test_api.py, extended here)
  - GET  /conversations/{id}  (get conversation details)
  - DELETE /conversations/{id} (end conversation)
  - POST /conversations/{id}/token (refresh LiveKit token)

Edge cases:
  - Get non-existent conversation → 404
  - End non-existent conversation
  - Token refresh structure
  - Response schema field presence
"""
import os
import pytest

os.environ.setdefault("VECTOR_DB_BACKEND", "chroma")
os.environ.setdefault("STT_PROVIDER", "mock")


# ---------------------------------------------------------------------------
# Create (extended checks)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_conversation_token_is_string():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/conversations", json={"user_id": "user-tok-test"})

    data = resp.json()
    assert isinstance(data["token"], str)
    # Token is empty when livekit is not installed (CI) — that's OK
    try:
        import livekit  # noqa: F401
        assert len(data["token"]) > 20
    except ImportError:
        assert data["token"] == ""


@pytest.mark.asyncio
async def test_create_conversation_room_name_format():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/conversations", json={"user_id": "user-room-test"})

    room = resp.json()["room_name"]
    assert room.startswith("edu-")


@pytest.mark.asyncio
async def test_create_conversation_server_url_is_websocket():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/conversations", json={"user_id": "user-ws-test"})

    url = resp.json()["server_url"]
    assert url.startswith("ws://") or url.startswith("wss://")


@pytest.mark.asyncio
async def test_two_conversations_have_different_ids():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r1 = await c.post("/api/v1/conversations", json={"user_id": "user-uniq-1"})
        r2 = await c.post("/api/v1/conversations", json={"user_id": "user-uniq-2"})

    assert r1.json()["conversation_id"] != r2.json()["conversation_id"]


# ---------------------------------------------------------------------------
# GET /conversations/{id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_conversation_returns_created_conv():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        create = await c.post("/api/v1/conversations", json={"user_id": "user-get-conv"})
        conv_id = create.json()["conversation_id"]

        resp = await c.get(f"/api/v1/conversations/{conv_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_id"] == conv_id
    assert data["user_id"] == "user-get-conv"
    assert "status" in data
    assert "room_name" in data


@pytest.mark.asyncio
async def test_get_conversation_status_is_active():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        create = await c.post("/api/v1/conversations", json={"user_id": "user-status-test"})
        conv_id = create.json()["conversation_id"]
        resp = await c.get(f"/api/v1/conversations/{conv_id}")

    assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_get_nonexistent_conversation_returns_404():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/conversations/conv-does-not-exist-xyz-000")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /conversations/{id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_end_conversation_returns_200():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        create = await c.post("/api/v1/conversations", json={"user_id": "user-end-conv"})
        conv_id = create.json()["conversation_id"]
        resp = await c.delete(f"/api/v1/conversations/{conv_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_id"] == conv_id
    assert data["status"] == "ended"


@pytest.mark.asyncio
async def test_end_conversation_updates_status_to_ended():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        create = await c.post("/api/v1/conversations", json={"user_id": "user-ended-status"})
        conv_id = create.json()["conversation_id"]
        await c.delete(f"/api/v1/conversations/{conv_id}")
        resp = await c.get(f"/api/v1/conversations/{conv_id}")

    assert resp.status_code == 200
    assert resp.json()["status"] == "ended"


@pytest.mark.asyncio
async def test_end_nonexistent_conversation_does_not_crash():
    """Ending a non-existent conversation should not return 500."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.delete("/api/v1/conversations/conv-ghost-xyz-000")

    # Either 200 (graceful no-op) or 404 — never 500
    assert resp.status_code in (200, 404)


# ---------------------------------------------------------------------------
# POST /conversations/{id}/token
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_token_returns_jwt():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        create = await c.post("/api/v1/conversations", json={"user_id": "user-refresh"})
        conv_id = create.json()["conversation_id"]
        resp = await c.post(
            f"/api/v1/conversations/{conv_id}/token",
            params={"user_id": "user-refresh"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert isinstance(data["token"], str)
    try:
        import livekit  # noqa: F401
        assert len(data["token"]) > 20
    except ImportError:
        assert data["token"] == ""


@pytest.mark.asyncio
async def test_refresh_token_includes_expiry():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        create = await c.post("/api/v1/conversations", json={"user_id": "user-expiry"})
        conv_id = create.json()["conversation_id"]
        resp = await c.post(
            f"/api/v1/conversations/{conv_id}/token",
            params={"user_id": "user-expiry"},
        )

    data = resp.json()
    assert "expires_in" in data
    assert data["expires_in"] == 3600  # 1 hour


@pytest.mark.asyncio
async def test_refresh_token_different_from_original():
    """Token for different user_id should differ (different identity in JWT)."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        create = await c.post("/api/v1/conversations", json={"user_id": "user-a"})
        conv_id = create.json()["conversation_id"]
        original_token = create.json()["token"]

        resp = await c.post(
            f"/api/v1/conversations/{conv_id}/token",
            params={"user_id": "user-b"},  # different user
        )
        new_token = resp.json()["token"]

    try:
        import livekit  # noqa: F401
        assert original_token != new_token
    except ImportError:
        assert original_token == "" and new_token == ""
