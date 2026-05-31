"""Phase 8a — pin user_identity_middleware contract.

The middleware must:
  - Resolve the user_id from header (primary) or cookie (backup) or
    create-new (fallback), in that priority order.
  - Set request.state.user_id to a non-empty UUID for every non-OPTIONS request.
  - Upsert the corresponding row into the users table (anonymous=True).
  - Issue a Set-Cookie: edu_uid=<uuid> response cookie when the cookie was
    missing or invalid, NEVER on OPTIONS requests (CORS hygiene).
  - Preserve the legacy frontend localStorage flow: when the frontend sends
    an unknown UUID via X-EduTutor-User-Id, the middleware adopts that exact
    UUID rather than minting a new one. This is what prevents Phase-7 users
    from losing access to their conversations on first Phase 8a deploy.

Failure modes that MUST NOT crash a request:
  - DB unavailable → middleware logs, sets request.state.user_id, continues.
  - Invalid UUID in header or cookie → middleware ignores it, falls through
    to the next priority level.
"""
from __future__ import annotations

import uuid
from typing import Optional

import pytest
from fastapi import APIRouter, Request
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.database import AsyncSessionLocal
from app.middleware.user_identity import COOKIE_NAME, HEADER_NAME
from app.models.user import User


_probe_router = APIRouter()


@_probe_router.get("/__probe_user_id")
async def _probe_user_id(request: Request) -> dict:
    return {"user_id": getattr(request.state, "user_id", None)}


_probe_mounted = False


def _ensure_probe_route() -> None:
    global _probe_mounted
    if not _probe_mounted:
        app.include_router(_probe_router)
        _probe_mounted = True


async def _user_row_exists(user_id: str) -> bool:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_first_request_with_no_identity_creates_user_and_sets_cookie():
    """A fresh request gets a server-issued UUID, a new users row, and the cookie back."""
    _ensure_probe_route()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/__probe_user_id")
    assert resp.status_code == 200
    body = resp.json()
    new_id = body["user_id"]
    assert new_id is not None
    uuid.UUID(new_id)
    assert resp.cookies.get(COOKIE_NAME) == new_id
    assert await _user_row_exists(new_id)


@pytest.mark.asyncio
async def test_header_takes_precedence_over_cookie():
    """X-EduTutor-User-Id wins over Cookie: edu_uid (legacy localStorage flow preserved)."""
    _ensure_probe_route()
    header_id = str(uuid.uuid4())
    cookie_id = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(
            "/__probe_user_id",
            headers={HEADER_NAME: header_id},
            cookies={COOKIE_NAME: cookie_id},
        )
    assert resp.json()["user_id"] == header_id
    assert await _user_row_exists(header_id)


@pytest.mark.asyncio
async def test_subsequent_request_reuses_cookie_when_no_header():
    """Cookie-only request reuses the same user_id, no new row created."""
    _ensure_probe_route()
    cookie_id = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp1 = await c.get("/__probe_user_id", cookies={COOKIE_NAME: cookie_id})
        resp2 = await c.get("/__probe_user_id", cookies={COOKIE_NAME: cookie_id})
    assert resp1.json()["user_id"] == cookie_id
    assert resp2.json()["user_id"] == cookie_id
    assert await _user_row_exists(cookie_id)


@pytest.mark.asyncio
async def test_invalid_uuid_in_header_or_cookie_creates_new():
    """Garbage UUID values are ignored; middleware falls through to create-new."""
    _ensure_probe_route()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get(
            "/__probe_user_id",
            headers={HEADER_NAME: "not-a-uuid"},
            cookies={COOKIE_NAME: "also-not-a-uuid"},
        )
    assert resp.status_code == 200
    new_id = resp.json()["user_id"]
    uuid.UUID(new_id)
    assert new_id not in ("not-a-uuid", "also-not-a-uuid")
    assert resp.cookies.get(COOKIE_NAME) == new_id


@pytest.mark.asyncio
async def test_uuid_pointing_to_deleted_user_creates_row_with_same_uuid():
    """A valid-format UUID with no DB row is upserted as-is — does not generate a different UUID."""
    _ensure_probe_route()
    fresh_id = str(uuid.uuid4())
    assert not await _user_row_exists(fresh_id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/__probe_user_id", headers={HEADER_NAME: fresh_id})
    assert resp.json()["user_id"] == fresh_id
    assert await _user_row_exists(fresh_id)


@pytest.mark.asyncio
async def test_options_request_does_not_set_cookie():
    """OPTIONS preflight short-circuits before identity logic — no Set-Cookie response."""
    _ensure_probe_route()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.options(
            "/__probe_user_id",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
    assert COOKIE_NAME not in resp.cookies


@pytest.mark.asyncio
async def test_existing_anonymous_user_id_from_legacy_localstorage_preserved():
    """Pre-Phase-8 user with localStorage UUID keeps it after upgrade — no orphaning."""
    _ensure_probe_route()
    legacy_id = str(uuid.uuid4())
    assert not await _user_row_exists(legacy_id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp1 = await c.get("/__probe_user_id", headers={HEADER_NAME: legacy_id})
        resp2 = await c.get("/__probe_user_id", headers={HEADER_NAME: legacy_id})
    assert resp1.json()["user_id"] == legacy_id
    assert resp2.json()["user_id"] == legacy_id
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == legacy_id))
        rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].is_anonymous is True
