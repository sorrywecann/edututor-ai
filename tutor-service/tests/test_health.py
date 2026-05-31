"""Health endpoint tests — backend-agnostic (works with chroma or weaviate)."""
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_health_returns_required_fields():
    """Health endpoint must return status, services, model, latency_ms."""
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    data = response.json()

    assert "status" in data
    assert "services" in data
    assert "model" in data
    assert "latency_ms" in data


@pytest.mark.asyncio
async def test_health_includes_vector_db_service():
    """Services dict must include a vector_db entry (either chroma or weaviate)."""
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health")

    data = response.json()
    services = data["services"]

    # Key is "vector_db (chroma)" or "vector_db (weaviate)" depending on backend
    vector_keys = [k for k in services if k.startswith("vector_db")]
    assert vector_keys, f"No vector_db key in services: {services}"

    # Must return a real probe result — not an empty string or placeholder
    assert services[vector_keys[0]], "vector_db status is empty"


@pytest.mark.asyncio
async def test_health_includes_database_and_redis():
    """Database and redis must always be present in services."""
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health")

    data = response.json()
    assert "database" in data["services"]
    assert "redis" in data["services"]


@pytest.mark.asyncio
async def test_health_status_is_ok_or_degraded():
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health")

    data = response.json()
    assert data["status"] in ("ok", "degraded")
