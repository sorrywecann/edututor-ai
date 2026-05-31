"""Per-user episodic memory — Chroma collection edu_memory_<user_id_with_dashes_replaced>
stores prior conversation summaries; LLM reads via recall_memory tool.

Zero new dependencies — reuses chroma_rag_service's persistent client path and the
SentenceTransformer embedder model from rag_config.  Graceful degradation on every
failure mode (init fails, query fails, embedding fails) — log warning + return safe
default.  Follows the asymmetric DI pattern: this is an optional service pulled lazily
inside the handler body, so its failures degrade gracefully (no memory recall) rather
than crashing the chat hot path with a 500.  See docs/adrs/001-asymmetric-DI.md.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.config.rag_config import rag_config
from app.services.chroma_rag_service import CHROMA_PERSIST_PATH

logger = logging.getLogger(__name__)

_chroma_client = None
_embedder = None


def _collection_name(user_id: str) -> str:
    return "edu_memory_" + user_id.replace("-", "_")


def _get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        import chromadb
        from chromadb.config import Settings

        CHROMA_PERSIST_PATH.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(
            path=str(CHROMA_PERSIST_PATH),
            settings=Settings(anonymized_telemetry=False),
        )
    return _chroma_client


def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        _embedder = SentenceTransformer(rag_config.embedding_model)
    return _embedder


async def remember(
    user_id: str,
    summary: str,
    *,
    conversation_id: str,
    metadata: Optional[dict] = None,
) -> None:
    """Store a conversation summary in the user's episodic memory collection.

    Upserts on conversation_id — idempotent; the second call wins on duplicate ids.
    No-op + warning on any failure so callers are not disrupted by storage errors.
    """
    try:
        client = _get_chroma_client()
        embedder = _get_embedder()
        collection = client.get_or_create_collection(_collection_name(user_id))
        embedding = embedder.encode([summary])[0].tolist()
        upsert_kwargs: dict = {
            "ids": [conversation_id],
            "documents": [summary],
            "embeddings": [embedding],
        }
        if metadata:
            upsert_kwargs["metadatas"] = [metadata]
        collection.upsert(**upsert_kwargs)
    except Exception as e:
        logger.warning(f"remember failed for user_id={user_id[:8]}...: {e}")


async def recall(
    user_id: str,
    query: str,
    *,
    top_k: int = 3,
) -> list[str]:
    """Return the top-k most semantically relevant summaries from the user's memory.

    Returns [] when the collection is empty, the user has no memory yet, or any
    failure occurs.  Callers must treat [] as 'no prior context available'.
    """
    try:
        client = _get_chroma_client()
        collection = client.get_or_create_collection(_collection_name(user_id))
        count = collection.count()
        if count == 0:
            return []
        embedder = _get_embedder()
        query_embedding = embedder.encode([query])[0].tolist()
        n = min(top_k, count)
        result = collection.query(query_embeddings=[query_embedding], n_results=n)
        return (result.get("documents") or [[]])[0]
    except Exception as e:
        logger.warning(f"recall failed for user_id={user_id[:8]}...: {e}")
        return []
