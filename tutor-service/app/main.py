"""
EduTutor.AI - Main Application
FastAPI entry point pre PB3 prototyp
"""

import asyncio
import os
from contextlib import asynccontextmanager

# Pre-warm torch.nn at module-load time to defeat a circular-import race.
# Symptom (v0.4.5 backend.log on user's clean Windows install):
#   ERROR - Failed to process document <id>: cannot import name 'nn' from
#   partially initialized module 'torch' (most likely due to a circular import)
# Why: chromadb's embedding loader does `from torch import nn` from a worker
# thread spawned by the FastAPI handler. If the chat handler thread is also
# touching torch concurrently, the second thread sees `torch` mid-init and
# `torch.nn` doesn't exist yet. Force the full module tree to load ONCE on
# the main thread before any request handler can spawn workers — Python's
# module import lock then guarantees subsequent threads see the finished
# module, not a partial one.
try:
    import torch  # noqa: F401 — eager import; intentional
    import torch.nn  # noqa: F401 — force submodule init
    import torch.nn.functional  # noqa: F401 — used by sentence-transformers
except ImportError:
    pass  # torch is optional; chromadb falls back to ONNX embedding
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging
import redis.asyncio as redis

from app.api import conversations, knowledge_bases, notes, transformations, health, chat, tts, stt, llm, ws_avatar, system, performance, diagnostics, lipsync, modes, voice_clones, emotion, user, avatar_dev, avatar_debug, podcasts, prompt_eval, prompts
from app.api._dev_gate import require_dev_mode  # v0.8.0 security gate
from fastapi import Depends as _Depends
from app.database import create_tables
from app.middleware.user_identity import UserIdentityMiddleware
from app.config.llm_config import LLM_CONFIG
from app.config.rag_config import RAG_CONFIG
from app.config.tts_config import TTS_CONFIG

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
# Packaged installs persist user-entered keys to a writable per-user file
# (the Program Files .env is read-only). Load it last so it wins. See
# EDU_ENV_FILE in desktop/orchestrator.mjs and _write_env_key in api/system.py.
if os.getenv("EDU_ENV_FILE"):
    load_dotenv(dotenv_path=os.environ["EDU_ENV_FILE"], override=True)

# Logging setup
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    logger.info("Starting EduTutor.AI Backend...")
    logger.info(f"LLM Config: {LLM_CONFIG['model_name']}")
    logger.info(f"RAG Config: backend={RAG_CONFIG['vector_db_backend']} collection={RAG_CONFIG['collection_name']}")
    logger.info(f"TTS Config: {TTS_CONFIG['voice_name']}")

    # Initialize connections
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")

    try:
        # Redis connection test
        app.state.redis = redis.from_url(redis_url)
        pong = await app.state.redis.ping()
        if pong:
            logger.info("Redis connected successfully")
    except Exception as e:
        logger.warning(f"Redis connection failed (non-critical): {e}")
        app.state.redis = None

    vector_backend = os.getenv("VECTOR_DB_BACKEND", "chroma")
    try:
        from app.services.rag_service import get_rag_service
        await get_rag_service()
        logger.info(f"Vector DB backend: {vector_backend} (initialized)")
    except Exception as e:
        logger.warning(f"RAG init failed (will retry on first use): {e}")

    # Database setup
    try:
        await create_tables()
        logger.info("Database tables created/verified")

        # Initialize FTS5
        try:
            from app.services.fts_service import init_fts
            await init_fts()
            logger.info("FTS5 full-text search initialized")
        except Exception as e:
            logger.warning(f"FTS5 init failed (non-critical): {e}")

        # Seed default transformation templates
        try:
            from app.database import AsyncSessionLocal
            from app.api.transformations import seed_default_templates
            async with AsyncSessionLocal() as session:
                await seed_default_templates(session)
                logger.info("Default transformation templates seeded")
        except Exception as e:
            logger.warning(f"Seed failed (non-critical): {e}")
    except Exception as e:
        logger.warning(f"Database setup failed (non-critical for dev): {e}")

    try:
        from app.skills import get_registry as get_skill_registry
        from app.skills.startup import register_default_skills, validate_mode_skill_references
        from app.config.learning_modes import get_all_modes
        register_default_skills()
        validate_mode_skill_references(get_all_modes())
        logger.info("Skills registered: %s", get_skill_registry().known_skill_names())
    except Exception as e:
        logger.warning(f"Skill registration failed (chat falls back to no-tools mode): {e}")

    heartbeat_task = None
    try:
        from app.services.avatar_broadcaster import get_avatar_broadcaster, idle_heartbeat_loop
        import asyncio as _asyncio
        broadcaster = get_avatar_broadcaster()
        heartbeat_task = _asyncio.create_task(idle_heartbeat_loop(broadcaster))
        logger.info("Idle heartbeat task started (3-6s interval blinks)")
    except Exception as e:
        logger.warning(f"Idle heartbeat startup failed (avatar may freeze between turns): {e}")

    try:
        from app.services.tts_service import get_tts_service
        import asyncio as _asyncio

        async def _prewarm_edge() -> None:
            try:
                svc = await get_tts_service()
                async for _ in svc.stream_chunks("Ahoj.", provider="edge", voice="sk-SK-LukasNeural"):
                    pass
                logger.info("Edge TTS prewarm complete (DNS+TLS+WS handshake cached)")
            except Exception as exc:
                logger.warning(f"Edge TTS prewarm failed (first request will pay handshake cost): {exc}")

        _asyncio.create_task(_prewarm_edge())
    except Exception as e:
        logger.warning(f"Edge TTS prewarm scheduling failed: {e}")

    try:
        from app.services.tts_service import get_tts_service
        import asyncio as _asyncio

        async def _prewarm_omnivoice() -> None:
            try:
                svc = await get_tts_service()
                await svc.synthesize_with_options(
                    text="Ahoj.", provider="omnivoice", voice="auto"
                )
                logger.info("OmniVoice prewarm complete")
            except Exception as exc:
                logger.warning(f"OmniVoice prewarm failed (first request will load model): {exc}")

        _asyncio.create_task(_prewarm_omnivoice())
    except Exception as e:
        logger.warning(f"OmniVoice prewarm scheduling failed: {e}")

    try:
        from app.services.audio2lipsync_client import (
            get_lipsync_provider,
            check_health,
        )
        active = get_lipsync_provider()
        logger.info("Lipsync provider active: %s", active)
        if active in ("audio2lipsync", "hybrid"):
            ok = await check_health()
            if ok:
                logger.info(
                    "Audio2Lipsync model loaded OK — "
                    "sentence_end will carry audio-aligned ARKit frames"
                )
            else:
                logger.warning(
                    "Audio2Lipsync model failed to load — falling back to "
                    "text/word-boundary visemes (set LIPSYNC_PROVIDER=text "
                    "to silence this and skip the load attempt next time)"
                )
    except Exception as e:
        logger.warning(f"Lipsync provider startup check failed: {e}")

    yield

    if heartbeat_task is not None:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass  # Expected on graceful shutdown
        except Exception as e:
            logger.warning(f"Heartbeat task exited with error: {e}")

    # Shutdown
    logger.info("Shutting down EduTutor.AI Backend...")
    if app.state.redis:
        await app.state.redis.close()


# Create FastAPI app
app = FastAPI(
    title="EduTutor.AI API",
    description="API pre inteligentný vzdelávací avatar",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

_API_KEY = os.getenv("EDUTUTOR_API_KEY")
_PUBLIC_PATHS = frozenset({"/health", "/docs", "/redoc", "/openapi.json", "/api/v1/health"})


class OptionalAPIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not _API_KEY:
            return await call_next(request)
        path = request.url.path
        if path in _PUBLIC_PATHS or path.startswith("/docs") or path.startswith("/redoc"):
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        if (auth.startswith("Bearer ") and auth[7:] == _API_KEY) or request.headers.get("x-api-key") == _API_KEY:
            return await call_next(request)
        return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)


app.add_middleware(UserIdentityMiddleware)
app.add_middleware(OptionalAPIKeyMiddleware)

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "https://edututor.ai",
]
_cors_env = os.getenv("CORS_ORIGINS", "").strip()
_cors_origins = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else _DEFAULT_CORS_ORIGINS
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-EduTutor-User-Id"],
)

# Include routers
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(conversations.router, prefix="/api/v1", tags=["Conversations"])
app.include_router(knowledge_bases.router, prefix="/api/v1", tags=["Knowledge Bases"])
app.include_router(notes.router, prefix="/api/v1", tags=["Notes"])
app.include_router(transformations.router, prefix="/api/v1", tags=["Transformations"])
app.include_router(chat.router, prefix="/api/v1", tags=["Chat"])
app.include_router(tts.router, prefix="/api/v1", tags=["TTS"])
app.include_router(stt.router, prefix="/api/v1", tags=["STT"])
app.include_router(llm.router, prefix="/api/v1", tags=["LLM"])
app.include_router(ws_avatar.router)   # No /api/v1 prefix — WebSocket routes must be at root
app.include_router(system.router, prefix="/api/v1", tags=["System"])
app.include_router(performance.router, prefix="/api/v1", tags=["Performance"])
# v0.8.0 security: diagnostics endpoints expose RAG chunk dumps + benchmark
# harnesses. Gate behind EDU_DEV_MODE so production builds return 404.
app.include_router(
    diagnostics.router, prefix="/api/v1", tags=["Diagnostics"],
    dependencies=[_Depends(require_dev_mode)],
)
app.include_router(lipsync.router, prefix="/api/v1", tags=["Lipsync"])
app.include_router(modes.router, prefix="/api/v1", tags=["Modes"])
app.include_router(voice_clones.router, prefix="/api/v1", tags=["Voice Clones"])
app.include_router(emotion.router, prefix="/api/v1", tags=["Emotion"])
app.include_router(user.router, prefix="/api/v1", tags=["User"])
app.include_router(avatar_dev.router, prefix="/api/v1", tags=["Avatar Dev"])
# v0.7.0 (W6): avatar debug harness — emotion+viseme injection for QA.
# Already self-prefixed at /api/v1/avatar/debug. Gated by
# EDU_DEV_AVATAR_DEBUG env so production builds reject all calls with 403.
app.include_router(avatar_debug.router, tags=["Avatar Debug"])
app.include_router(podcasts.router, prefix="/api/v1", tags=["Podcasts"])
# v0.8.0 security: prompt_eval endpoints leak the full assembled system
# prompt (preview-prompt) and run side-by-side eval (chat/eval, chat/rag-eval)
# which can drain the configured OpenAI/Anthropic credits. Gate behind
# EDU_DEV_MODE so production builds return 404.
app.include_router(
    prompt_eval.router, prefix="/api/v1", tags=["Prompt Eval"],
    dependencies=[_Depends(require_dev_mode)],
)
app.include_router(prompts.router, prefix="/api/v1", tags=["Prompts"])

# Prometheus metrics: OPTIONAL — install `prometheus-fastapi-instrumentator` to enable.
# Silent skip if not installed (kept optional to keep the base install lean).
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")
    logger.info("Prometheus metrics exposed at /metrics")
except ImportError:
    logger.info("prometheus-fastapi-instrumentator not installed; /metrics disabled")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Sanitized JSON error response for unhandled exceptions.

    Logs the full traceback server-side. Returns a generic message to the
    client to avoid leaking stack traces / internal paths. Validation errors
    (Pydantic) and HTTPException are handled by FastAPI's defaults — this
    only catches truly unexpected exceptions.
    """
    logger.exception(
        f"Unhandled exception on {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {exc}"
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred. Server logs contain details.",
            "path": request.url.path,
        },
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "EduTutor.AI API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app", host="0.0.0.0", port=8000, reload=True, log_level="info"
    )
