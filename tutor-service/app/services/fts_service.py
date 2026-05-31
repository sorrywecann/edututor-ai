"""
EduTutor.AI - Full-Text Search (SQLite FTS5)
"""
import logging
from typing import List

from sqlalchemy import text
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def init_fts():
    """Create FTS5 virtual table if not exists."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(text(
                "CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5("
                "chunk_id, document_id, content"
                ")"
            ))


async def index_chunk(chunk_id: str, document_id: str, content: str):
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("INSERT OR REPLACE INTO chunk_fts(chunk_id, document_id, content) VALUES (:cid, :did, :txt)"),
                {"cid": chunk_id, "did": document_id, "txt": content},
            )
            await session.commit()
    except Exception as e:
        logger.warning(f"FTS5 index failed: {e}")


async def delete_document_chunks(document_id: str):
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("DELETE FROM chunk_fts WHERE document_id = :did"),
                {"did": document_id},
            )
            await session.commit()
    except Exception as e:
        logger.warning(f"FTS5 delete failed: {e}")


async def text_search(query: str, limit: int = 10) -> List[dict]:
    if not query or len(query) > 500:
        return []
    query = query.replace('"', '').replace('*', '').replace("'", '')
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text(
                    "SELECT chunk_id, document_id, "
                    "snippet(chunk_fts, 1, '<mark>', '</mark>', '...', 40) AS snippet "
                    "FROM chunk_fts WHERE content MATCH :q LIMIT :lim"
                ),
                {"q": query, "lim": limit},
            )
            rows = result.fetchall()
            return [{"chunk_id": r[0], "document_id": r[1], "content": r[2]} for r in rows]
    except Exception as e:
        logger.warning(f"FTS5 search failed: {e}")
        return []
