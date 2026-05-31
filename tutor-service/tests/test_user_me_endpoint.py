"""Phase 8a — pin GET /api/v1/user/me contract.

The endpoint returns the user resolved by UserIdentityMiddleware. It is
the only request-shape contract the frontend uses to confirm "the server
knows about me." Phase 8b will extend it with profile data; for now the
fields are the User model defaults (anonymous + null name/email).

Tests cover both "fresh request" and "explicit identity" angles so
api.ts changes that send X-EduTutor-User-Id are exercised end-to-end:
the test directly mimics what core/src/lib/api.ts does (sends the
header sourced from getPersistentUserId() in localStorage).
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.middleware.user_identity import COOKIE_NAME, HEADER_NAME


@pytest.mark.asyncio
async def test_user_me_returns_resolved_id_for_fresh_request():
    """Fresh request -> returns server-issued UUID, is_anonymous=true, null fields."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/user/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_id"]
    uuid.UUID(body["user_id"])
    assert body["is_anonymous"] is True
    assert body["display_name"] is None
    assert body["email"] is None


@pytest.mark.asyncio
async def test_user_me_returns_header_id_when_provided():
    """X-EduTutor-User-Id header -> response.user_id matches the header value."""
    sent_id = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/user/me", headers={HEADER_NAME: sent_id})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == sent_id


@pytest.mark.asyncio
async def test_user_me_returns_cookie_id_when_only_cookie_present():
    """Cookie-only request -> response.user_id matches the cookie value."""
    sent_id = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/user/me", cookies={COOKIE_NAME: sent_id})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == sent_id


@pytest.mark.asyncio
async def test_user_me_two_browsers_get_distinct_ids():
    """Two fresh AsyncClient instances simulate two browsers — must get different IDs."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as browser_a:
        a = (await browser_a.get("/api/v1/user/me")).json()["user_id"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as browser_b:
        b = (await browser_b.get("/api/v1/user/me")).json()["user_id"]
    assert a != b
    uuid.UUID(a)
    uuid.UUID(b)
