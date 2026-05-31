"""Phase 8c podcast wiring smoke tests — Task 8 (final).

Confirms the podcasts router is registered in main.py and the endpoints
are reachable. Pure mechanical wiring verification — no service logic
is exercised.

The full router contract (create, get, delete, auth) is pinned by
test_podcast_api.py (Task 5). This file only checks that main.py includes
the router so those deeper tests would pass in production.

Oracle: ses_1e1513e5effepQMVbZMKljQot5 · Task 8 of 8.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_podcasts_endpoints_listed_in_openapi():
    """Smoke: /api/v1/podcasts/{podcast_id} exists in OpenAPI paths.

    If the podcasts router is not registered in main.py, the path will
    be absent from /openapi.json. This test fails fast if the Task 8
    main.py edit was missed.
    """
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        resp = await c.get("/openapi.json")

    assert resp.status_code == 200
    paths = resp.json()["paths"]

    # Every podcast endpoint should appear in the schema
    assert (
        "/api/v1/podcasts/{podcast_id}" in paths
    ), "GET /api/v1/podcasts/{id} missing from OpenAPI — router not registered"
    assert (
        "/api/v1/podcasts/{podcast_id}/audio" in paths
    ), "GET /api/v1/podcasts/{id}/audio missing from OpenAPI — router not registered"
    assert (
        "/api/v1/knowledge-bases/{kb_id}/podcasts" in paths
    ), "POST /knowledge-bases/{kb}/podcasts missing from OpenAPI — router not registered"


@pytest.mark.asyncio
async def test_podcasts_post_route_is_handled():
    """Smoke: POST with fake KB returns 404 from handler (not FastAPI generic 404).

    The difference:
      - FastAPI default 404 = {"detail":"Not Found"} — the router isn't mounted.
      - Handler 404 = {"detail":"Knowledge base not found"} — the router IS mounted
        and the handler rejected a nonexistent KB.

    A 422 (validation error) would also prove the route exists, but the KB-lookup
    runs before Pydantic validation in this endpoint, so we check the error msg.
    """
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        resp = await c.post(
            "/api/v1/knowledge-bases/00000000-0000-0000-0000-000000000000/podcasts",
            json={"format": "summary"},  # KB lookup happens first -> 404 from handler
        )

    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body, body
    assert "knowledge base" in body["detail"].lower(), (
        f"Expected handler 404 ('knowledge base not found'), "
        f"got generic FastAPI 404 body: {body}"
    )
