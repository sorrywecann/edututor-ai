"""
EduTutor.AI - Database session factory

Auto-detects database backend:
  - PostgreSQL when DATABASE_URL env var starts with "postgresql"
  - SQLite (via aiosqlite) otherwise — zero Docker needed, persists to ./data/edututor.db
"""
import logging
import os
import uuid
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool, StaticPool

from app.models.base import Base
from app.models.conversation import Conversation, Message  # noqa: F401
from app.models.flashcard import Flashcard  # noqa: F401
from app.models.knowledge_base import Document, KnowledgeBase  # noqa: F401
from app.models.note import Note  # noqa: F401
from app.models.transformation import TransformationTemplate, TransformationResult  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models import user_profile  # noqa: F401
from app.models import podcast  # noqa: F401

LEGACY_USER_ID_FILE = Path(os.getenv("LEGACY_USER_ID_PATH", "./data/legacy_user_id.txt"))

logger = logging.getLogger(__name__)

_DB_URL_ENV = os.getenv("DATABASE_URL", "")

if _DB_URL_ENV.startswith("postgresql"):
    DATABASE_URL = _DB_URL_ENV
    engine = create_async_engine(DATABASE_URL, echo=False, poolclass=NullPool)
    logger.info(f"DB backend: PostgreSQL")
else:
    _sqlite_path = Path(os.getenv("SQLITE_PATH", "./data/edututor.db"))
    _sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite+aiosqlite:///{_sqlite_path}"
    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        poolclass=NullPool,
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    logger.info(f"DB backend: SQLite at {_sqlite_path}")

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def create_tables() -> None:
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_document_context_mode_column)
        await conn.run_sync(_backfill_legacy_default_flashcards)


def _ensure_document_context_mode_column(sync_conn) -> None:
    """Backfill schema changes for installs without Alembic migrations."""
    inspector = inspect(sync_conn)
    try:
        columns = {column["name"] for column in inspector.get_columns("documents")}
    except Exception as exc:
        logger.warning(f"Could not inspect documents table for context_mode: {exc}")
        return

    if "context_mode" in columns:
        return

    sync_conn.exec_driver_sql(
        "ALTER TABLE documents ADD COLUMN context_mode VARCHAR(20) NOT NULL DEFAULT 'full'"
    )
    logger.info("Added missing documents.context_mode column with default 'full'")


def _resolve_legacy_user_id() -> str:
    """Return a stable UUID for the synthetic 'pre-Phase-8 demo user'.

    Priority: env LEGACY_USER_ID > file at LEGACY_USER_ID_FILE > generate
    new + persist to file. Persisting to disk means the same UUID is
    used on every boot, so anyone whose previous flashcards got
    backfilled keeps reaching them.
    """
    env_value = os.getenv("LEGACY_USER_ID", "").strip()
    if env_value:
        try:
            uuid.UUID(env_value)
            return env_value
        except (ValueError, AttributeError):
            logger.warning("LEGACY_USER_ID env var is not a valid UUID; ignoring")

    if LEGACY_USER_ID_FILE.exists():
        try:
            stored = LEGACY_USER_ID_FILE.read_text().strip()
            uuid.UUID(stored)
            return stored
        except (ValueError, OSError) as exc:
            logger.warning(f"Could not read {LEGACY_USER_ID_FILE}: {exc}")

    new_id = str(uuid.uuid4())
    try:
        LEGACY_USER_ID_FILE.parent.mkdir(parents=True, exist_ok=True)
        LEGACY_USER_ID_FILE.write_text(new_id)
        logger.info(f"Generated and persisted legacy user_id: {new_id}")
    except OSError as exc:
        logger.warning(f"Could not persist legacy user_id to {LEGACY_USER_ID_FILE}: {exc}")
    return new_id


def _backfill_legacy_default_flashcards(sync_conn) -> None:
    """Reassign Phase 7's hardcoded user_id='default' flashcards to a real User row.

    Idempotent. Safe to re-run on every boot.

    1. Detect rows where user_id='default'.
    2. If any exist: resolve a stable legacy UUID, ensure the User row
       exists for that UUID (anonymous), then UPDATE flashcards.
    3. Log the legacy user_id at INFO so the operator can correlate it
       with their old data if questions arise.
    """
    try:
        result = sync_conn.exec_driver_sql(
            "SELECT COUNT(*) FROM flashcards WHERE user_id = 'default'"
        )
        count = result.scalar() or 0
    except Exception as exc:
        logger.warning(f"Could not inspect flashcards for legacy default rows: {exc}")
        return

    if count == 0:
        return

    legacy_id = _resolve_legacy_user_id()
    try:
        sync_conn.exec_driver_sql(
            "INSERT OR IGNORE INTO users (id, is_anonymous, is_active, created_at, updated_at) "
            "VALUES (?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            (legacy_id,),
        )
        sync_conn.exec_driver_sql(
            "UPDATE flashcards SET user_id = ? WHERE user_id = 'default'",
            (legacy_id,),
        )
        logger.info(
            f"Backfilled {count} legacy 'default' flashcard(s) to user_id={legacy_id}"
        )
    except Exception as exc:
        logger.warning(f"Backfill of legacy default flashcards failed: {exc}")


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
