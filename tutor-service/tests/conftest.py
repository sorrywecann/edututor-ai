"""
Global test configuration.

Override environment variables BEFORE any app module is imported so that
module-level code (database.py, rag_service.py) picks up the test settings.

Test environment:
  - SQLite via aiosqlite → no Postgres needed
  - ChromaDB in temp dir → no Weaviate needed
  - STT mock provider   → no ML model loading
"""
import os

# Must happen before ANY app import — module-level code in database.py reads these
os.environ["DATABASE_URL"] = ""          # empty → SQLite fallback
os.environ["VECTOR_DB_BACKEND"] = "chroma"
os.environ["STT_PROVIDER"] = "mock"

import asyncio
import pytest
import pytest_asyncio


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped event loop — required so session-scoped async fixtures work
    with pytest-asyncio 0.21+ (default event_loop is function-scoped)."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_db_tables():
    """Create all SQLite tables once per test session."""
    from app.database import create_tables
    await create_tables()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def cleanup_test_knowledge_bases():
    """Delete all test-scaffold KBs after the test session.

    Tests create KBs with names like kb-crud-<uuid>, test-kb-<uuid>, etc.
    but rarely clean them up. Without this fixture, every test run leaks
    KBs into the shared SQLite database, eventually accumulating hundreds
    of noise entries that pollute the KB workspace UI.
    """
    yield
    import logging
    logger = logging.getLogger(__name__)
    from app.database import engine
    from sqlalchemy import text
    async with engine.begin() as conn:
        result = await conn.execute(
            text("DELETE FROM documents WHERE knowledge_base_id IN "
                 "(SELECT id FROM knowledge_bases WHERE name LIKE 'kb-%' "
                 "OR name LIKE 'test-%' OR name = 'testing')")
        )
        docs_deleted = result.rowcount
        result = await conn.execute(
            text("DELETE FROM knowledge_bases WHERE name LIKE 'kb-%' "
                 "OR name LIKE 'test-%' OR name = 'testing'")
        )
        kbs_deleted = result.rowcount
        if kbs_deleted:
            logger.info(
                "Test KB cleanup: %d KBs + %d docs removed",
                kbs_deleted, docs_deleted,
            )

    # Clean orphaned ChromaDB test collections
    try:
        import chromadb
        from chromadb.config import Settings
        client = chromadb.PersistentClient(
            path="data/chroma",
            settings=Settings(anonymized_telemetry=False),
        )
        for coll in client.list_collections():
            if coll.name.startswith("kb-") or coll.name.startswith("test"):
                client.delete_collection(coll.name)
                logger.info("Test ChromaDB collection deleted: %s", coll.name)
    except Exception:
        pass
