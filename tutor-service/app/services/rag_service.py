"""
EduTutor.AI — RAG Service Factory

Selects the vector database backend based on the VECTOR_DB_BACKEND env var.

  VECTOR_DB_BACKEND=chroma    (default) — embedded ChromaDB, zero Docker
  VECTOR_DB_BACKEND=weaviate  — Weaviate, requires Docker or cloud

Both backends expose the same interface so all API code is backend-agnostic.

Quick switch:
  # Local dev / testing
  export VECTOR_DB_BACKEND=chroma

  # Production / staging with Docker
  export VECTOR_DB_BACKEND=weaviate
  export WEAVIATE_URL=http://localhost:8080
"""
import asyncio
import logging
import os
from typing import Union

logger = logging.getLogger(__name__)

VECTOR_DB_BACKEND = os.getenv("VECTOR_DB_BACKEND", "chroma").lower()

if VECTOR_DB_BACKEND == "weaviate":
    from app.services.weaviate_rag_service import WeaviateRAGService as RAGService
    logger.info("Vector DB backend: Weaviate")
else:
    from app.services.chroma_rag_service import ChromaRAGService as RAGService
    if VECTOR_DB_BACKEND != "chroma":
        logger.warning(
            f"Unknown VECTOR_DB_BACKEND={VECTOR_DB_BACKEND!r}, defaulting to ChromaDB"
        )
    else:
        logger.info("Vector DB backend: ChromaDB (embedded)")

# Singleton instance
_rag_service = None
_rag_service_init_lock = asyncio.Lock()


async def get_rag_service() -> RAGService:
    """Return the initialized RAG service singleton.

    Concurrency-safe via double-checked locking. _rag_service is only set AFTER
    successful initialize(); if init fails the next call retries from scratch.
    """
    global _rag_service
    if _rag_service is not None:
        return _rag_service
    async with _rag_service_init_lock:
        if _rag_service is None:
            svc = RAGService()
            await svc.initialize()
            _rag_service = svc
    return _rag_service
