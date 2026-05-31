"""
EduTutor.AI — ChromaDB RAG backend

Embedded vector store — no Docker, no external services.
Data persists to ./data/chroma/  (override via CHROMA_PERSIST_PATH env var).

Implements the shared RAG interface:
  initialize(), search(), process_document(), delete_document(),
  delete_collection(), is_ready(), close()
"""
import hashlib
import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import tiktoken

from app.config.rag_config import rag_config
from app.schemas.knowledge_base import ContextChunk
from app.services.rag_utils import extract_text as _extract_text_util, split_text as _split_text_util
from app.services.fts_service import index_chunk as _fts_index

logger = logging.getLogger(__name__)

CHROMA_PERSIST_PATH = Path(os.getenv("CHROMA_PERSIST_PATH", "./data/chroma"))


def _safe_name(name: str) -> str:
    """Sanitize to ChromaDB collection naming rules (3-63 chars, alphanumeric + _ + -)."""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
    if not safe or not safe[0].isalnum():
        safe = "kb_" + safe
    if not safe[-1].isalnum():
        safe = safe.rstrip("_-") or safe
    if len(safe) < 3:
        safe = (safe + "___")[:3]
    return safe[:63]


class ChromaRAGService:
    def __init__(self):
        self._client = None          # chromadb.PersistentClient
        self._embedder = None  # SentenceTransformer — lazy-loaded on first initialize()
        self._tokenizer = tiktoken.get_encoding("cl100k_base")
        self._collections: Dict[str, Any] = {}

    async def initialize(self) -> None:
        import chromadb
        from chromadb.config import Settings

        CHROMA_PERSIST_PATH.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(
            path=str(CHROMA_PERSIST_PATH),
            settings=Settings(anonymized_telemetry=False),
        )
        logger.info(f"ChromaDB initialized at {CHROMA_PERSIST_PATH}")

        logger.info(f"Loading embedding model: {rag_config.embedding_model}")
        from sentence_transformers import SentenceTransformer
        self._embedder = SentenceTransformer(rag_config.embedding_model)

        logger.info("Text splitter ready (plain Python, no langchain dependency)")

    async def close(self) -> None:
        pass  # ChromaDB PersistentClient has no explicit close

    def _count_tokens(self, text: str) -> int:
        return len(self._tokenizer.encode(text))

    def _embed(self, texts: List[str]) -> List[List[float]]:
        if not self._embedder:
            raise RuntimeError("Embedding model not loaded")
        return self._embedder.encode(texts, show_progress_bar=False).tolist()

    def _get_collection(self, name: str):
        safe = _safe_name(name)
        if safe not in self._collections:
            self._collections[safe] = self._client.get_or_create_collection(
                name=safe,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collections[safe]

    async def process_document(
        self,
        content: bytes,
        filename: str,
        file_type: str,
        knowledge_base: str,
        document_id: str,
    ) -> Dict[str, Any]:
        if not self._client:
            raise RuntimeError("RAG service not initialized")

        text = await self._extract_text(content, filename, file_type)
        chunks = _split_text_util(
            text,
            chunk_size=rag_config.chunk_size,
            chunk_overlap=rag_config.chunk_overlap,
            length_fn=self._count_tokens,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        collection = self._get_collection(knowledge_base)

        ids, embeddings, metadatas, documents = [], [], [], []
        total_tokens = 0

        # Batch embed all chunks at once — much faster than one-by-one
        BATCH_SIZE = 32
        all_embeddings = []
        for batch_start in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[batch_start:batch_start + BATCH_SIZE]
            all_embeddings.extend(self._embed(batch))

        for i, (chunk, emb) in enumerate(zip(chunks, all_embeddings)):
            chunk_id = hashlib.md5(f"{document_id}:{i}".encode()).hexdigest()
            total_tokens += self._count_tokens(chunk)
            ids.append(chunk_id)
            embeddings.append(emb)
            documents.append(chunk)
            metadatas.append({
                "document_id": document_id,
                "chunk_index": i,
                "source": filename,
                "knowledge_base": knowledge_base,
            })

        if ids:
            collection.upsert(
                ids=ids, embeddings=embeddings,
                documents=documents, metadatas=metadatas,
            )
            for cid, did, txt in zip(ids, [document_id] * len(ids), chunks):
                await _fts_index(cid, did, txt)

        logger.info(f"[chroma] Indexed {len(chunks)} chunks from {filename!r}")
        return {"chunk_count": len(chunks), "token_count": total_tokens}

    async def _extract_text(self, content: bytes, filename: str, file_type: str) -> str:
        return await _extract_text_util(content, filename, file_type)

    async def search(
        self,
        query: str,
        knowledge_base: str,
        top_k: int = 5,
        similarity_threshold: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        if similarity_threshold is None:
            similarity_threshold = rag_config.similarity_threshold

        if not self._client:
            raise RuntimeError("RAG service not initialized")

        collection = self._get_collection(knowledge_base)
        count = collection.count()
        if count == 0:
            return []

        query_emb = self._embed([query])[0]
        results = collection.query(
            query_embeddings=[query_emb],
            n_results=min(top_k, count),
            include=["documents", "metadatas", "distances"],
        )

        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        search_results = []
        for doc, meta, dist in zip(docs, metas, distances):
            score = max(0.0, 1.0 - (dist / 2.0))
            if score >= similarity_threshold:
                search_results.append({
                    "content": doc,
                    "score": round(score, 3),
                    "metadata": {
                        "source": meta.get("source", ""),
                        "page": meta.get("page", 0),
                        "document_id": meta.get("document_id", ""),
                        "chunk_index": meta.get("chunk_index", 0),
                    },
                    "document_id": meta.get("document_id"),
                    "chunk_index": meta.get("chunk_index"),
                })
        return search_results

    async def search_with_metadata(
        self,
        query: str,
        knowledge_base: str,
        top_k: int = 5,
        similarity_threshold: Optional[float] = None,
        document_ids: Optional[List[str]] = None,
    ) -> List[ContextChunk]:
        if similarity_threshold is None:
            similarity_threshold = rag_config.similarity_threshold

        if not self._client:
            raise RuntimeError("RAG service not initialized")

        if document_ids is not None and not document_ids:
            return []

        collection = self._get_collection(knowledge_base)
        count = collection.count()
        if count == 0:
            return []

        query_emb = self._embed([query])[0]
        query_kwargs: Dict[str, Any] = {
            "query_embeddings": [query_emb],
            "n_results": min(top_k, count),
            "include": ["documents", "metadatas", "distances"],
        }
        if document_ids is not None:
            query_kwargs["where"] = {"document_id": {"$in": document_ids}}

        results = collection.query(**query_kwargs)

        ids = results.get("ids", [[]])[0]
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        chunks: List[ContextChunk] = []
        for chunk_id, doc, meta, dist in zip(ids, docs, metas, distances):
            score = max(0.0, 1.0 - (dist / 2.0))
            if score >= similarity_threshold:
                chunks.append(
                    ContextChunk(
                        chunk_id=chunk_id,
                        document_id=meta.get("document_id", ""),
                        filename=meta.get("source", "unknown"),
                        page=meta.get("page"),
                        chunk_index=meta.get("chunk_index", 0),
                        content=doc,
                        score=round(score, 3),
                    )
                )
        return chunks

    async def get_document_chunks(self, document_id: str, knowledge_base: str) -> list[str]:
        """Return all stored chunk texts for a document."""
        if not self._client:
            return []
        collection = self._get_collection(knowledge_base)
        result = collection.get(where={"document_id": document_id}, include=["documents"])
        docs = result.get("documents", [])
        return docs if docs else []

    async def delete_document(self, document_id: str, knowledge_base: str) -> int:
        if not self._client:
            raise RuntimeError("RAG service not initialized")
        collection = self._get_collection(knowledge_base)
        existing = collection.get(
            where={"document_id": {"$eq": document_id}},
            include=[],
        )
        ids_to_delete = existing.get("ids", [])
        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
        return len(ids_to_delete)

    async def delete_collection(self, knowledge_base: str) -> None:
        if not self._client:
            return
        safe = _safe_name(knowledge_base)
        try:
            self._client.delete_collection(safe)
            self._collections.pop(safe, None)
            logger.info(f"[chroma] Deleted collection: {safe!r}")
        except Exception as e:
            logger.warning(f"[chroma] Could not delete collection {safe!r}: {e}")

    def is_ready(self) -> bool:
        return self._client is not None and self._embedder is not None
