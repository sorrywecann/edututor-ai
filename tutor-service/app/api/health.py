"""EduTutor.AI — Health Check API with real service probes."""

import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Dict

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text

router = APIRouter()

MODEL_ID = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5")
VECTOR_DB_BACKEND = os.getenv("VECTOR_DB_BACKEND", "chroma").lower()


class HealthResponse(BaseModel):
    status: str
    services: Dict[str, str]
    model: str
    latency_ms: float


async def _probe_database(request: Request) -> str:
    try:
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return "ok"
    except Exception as e:
        return f"error: {type(e).__name__}"


async def _probe_redis(request: Request) -> str:
    try:
        if hasattr(request.app.state, "redis") and request.app.state.redis:
            await request.app.state.redis.ping()
            return "ok"
        return "not_configured"
    except Exception as e:
        return f"error: {type(e).__name__}"


async def _probe_chroma() -> str:
    """Probe embedded ChromaDB by checking the data directory exists."""
    try:
        from app.services.chroma_rag_service import CHROMA_PERSIST_PATH
        # ChromaDB is embedded — if it initialized, the path exists
        if CHROMA_PERSIST_PATH.exists():
            return "ok"
        # Not yet initialized (first run) — still healthy, will init on first use
        return "ok (lazy_init)"
    except Exception as e:
        return f"error: {type(e).__name__}"


async def _probe_weaviate() -> str:
    """Probe remote Weaviate via HTTP health endpoint."""
    try:
        weaviate_url = os.getenv("WEAVIATE_URL", "http://localhost:8080")
        base = weaviate_url.rstrip("/")
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{base}/v1/.well-known/ready")
            return "ok" if r.status_code == 200 else f"http_{r.status_code}"
    except Exception as e:
        return f"error: {type(e).__name__}"


async def _probe_vector_db() -> tuple[str, str]:
    """Return (backend_name, status) based on VECTOR_DB_BACKEND env var."""
    if VECTOR_DB_BACKEND == "weaviate":
        return "weaviate", await _probe_weaviate()
    return "chroma", await _probe_chroma()


async def _probe_livekit() -> str:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get("http://localhost:7880")
            # LiveKit returns 426 Upgrade Required for plain HTTP — means it's up
            return "ok" if r.status_code in (200, 426) else f"http_{r.status_code}"
    except Exception as e:
        return f"error: {type(e).__name__}"


async def _probe_tts() -> str:
    try:
        import edge_tts  # noqa: F401
        return "ok"
    except ImportError:
        return "not_configured"
    except Exception as e:
        return f"error: {type(e).__name__}"


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    """System health check — probes all connected services."""
    t0 = time.monotonic()

    (
        db_status,
        redis_status,
        (vector_backend, vector_status),
        livekit_status,
        tts_status,
    ) = await asyncio.gather(
        _probe_database(request),
        _probe_redis(request),
        _probe_vector_db(),
        _probe_livekit(),
        _probe_tts(),
    )

    services = {
        "database": db_status,
        f"vector_db ({vector_backend})": vector_status,
        "redis": redis_status,
        "tts": tts_status,
    }

    overall = "ok" if all(
        v.startswith("ok") or v == "not_configured" for v in services.values()
    ) else "degraded"
    latency_ms = round((time.monotonic() - t0) * 1000, 1)

    return HealthResponse(
        status=overall,
        services=services,
        model=MODEL_ID,
        latency_ms=latency_ms,
    )


@router.get("/health/ready")
async def readiness_check(request: Request):
    """Readiness probe — returns 200 only when critical deps are reachable.

    Use for orchestrator traffic-routing decisions (k8s readiness, docker-compose
    `depends_on: condition: service_healthy`). Returns 503 with details if DB,
    Redis, or the configured vector DB is unreachable.

    Convention: failing readiness means "don't route traffic here yet", not
    "restart this pod" (that's the liveness probe's job).
    """
    db_status, redis_status, vector = await asyncio.gather(
        _probe_database(request),
        _probe_redis(request),
        _probe_vector_db(),
    )
    backend_name, vector_status = vector
    services = {
        "database": db_status,
        "redis": redis_status,
        f"vector_db ({backend_name})": vector_status,
    }
    critical_ok = all(
        v == "ok" or v.startswith("ok ") or v == "not_configured"
        for v in services.values()
    )
    if not critical_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"ready": False, "services": services},
        )
    return {"ready": True, "services": services}


@router.get("/health/live")
async def liveness_check():
    """Liveness probe — returns 200 if the Python process is alive.

    Deliberately checks NO external dependencies. Convention: failing liveness
    means "restart this pod", so we never want to restart just because Redis
    is briefly unreachable (that's a transient dependency issue, not a process
    failure). Use /health/ready for dependency-aware decisions.
    """
    return {"alive": True}
