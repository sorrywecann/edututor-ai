"""
EduTutor.AI — Weaviate RAG backend

Production vector store — requires Weaviate running (Docker or cloud).
Set WEAVIATE_URL and optionally WEAVIATE_API_KEY.

Implements the shared RAG interface:
  initialize(), search(), process_document(), delete_document(),
  delete_collection(), is_ready(), close()

To run Weaviate locally:
  docker run -d -p 8080:8080 -p 50051:50051 cr.weaviate.io/semitechnologies/weaviate:latest
"""
import logging
import os
import tempfile
from functools import reduce
from pathlib import Path
from typing import Any, Dict, List, Optional

import tiktoken

from app.config.rag_config import rag_config
from app.schemas.knowledge_base import ContextChunk
from app.services.rag_utils import extract_text as _extract_text_util, split_text as _split_text_util

logger = logging.getLogger(__name__)


class WeaviateRAGService:
    def __init__(self):
        self._client = None
        self._embedder: Optional[Any] = None
        self._openai_client = None
        self._tokenizer = tiktoken.get_encoding("cl100k_base")
        self._use_openai = False

    async def initialize(self) -> None:
        import weaviate
        from weaviate.classes.config import Configure, Property, DataType

        weaviate_host = rag_config.weaviate_url.replace("http://", "").replace("https://", "")
        host_only = weaviate_host.split(":")[0]

        try:
            self._client = weaviate.connect_to_local(host=host_only, port=8080)
            logger.info(f"[weaviate] Connected to {rag_config.weaviate_url}")
        except Exception as e:
            logger.warning(f"[weaviate] connect_to_local failed, trying custom: {e}")
            self._client = weaviate.connect_to_custom(
                http_host=host_only,
                http_port=8080,
                http_secure=False,
                grpc_host=host_only,
                grpc_port=50051,
                grpc_secure=False,
            )

        openai_key = os.getenv("OPENAI_API_KEY")
        if rag_config.use_openai_embeddings and openai_key:
            from openai import OpenAI
            self._openai_client = OpenAI(api_key=openai_key)
            self._use_openai = True
            logger.info(f"[weaviate] Using OpenAI embeddings: {rag_config.openai_embedding_model}")
        else:
            logger.info(f"[weaviate] Loading local embeddings: {rag_config.embedding_model}")
            from sentence_transformers import SentenceTransformer
            self._embedder = SentenceTransformer(rag_config.embedding_model)

        await self._ensure_collection(rag_config.collection_name)

    async def close(self) -> None:
        if self._client:
            self._client.close()

    def _count_tokens(self, text: str) -> int:
        return len(self._tokenizer.encode(text))

    def _generate_embedding(self, text: str) -> List[float]:
        if self._use_openai and self._openai_client:
            response = self._openai_client.embeddings.create(
                model=rag_config.openai_embedding_model, input=text
            )
            return response.data[0].embedding
        if not self._embedder:
            raise RuntimeError("Embedding model not loaded")
        return self._embedder.encode(text).tolist()

    async def _ensure_collection(self, collection_name: str) -> None:
        import weaviate
        from weaviate.classes.config import Configure, Property, DataType

        if not self._client:
            raise RuntimeError("Weaviate client not initialized")
        try:
            if not self._client.collections.exists(collection_name):
                self._client.collections.create(
                    name=collection_name,
                    properties=[
                        Property(name="content", data_type=DataType.TEXT),
                        Property(name="document_id", data_type=DataType.TEXT),
                        Property(name="chunk_index", data_type=DataType.INT),
                        Property(name="source", data_type=DataType.TEXT),
                        Property(name="page", data_type=DataType.INT),
                        Property(name="knowledge_base", data_type=DataType.TEXT),
                    ],
                    vectorizer_config=Configure.Vectorizer.none(),
                )
                logger.info(f"[weaviate] Created collection: {collection_name}")
        except Exception as e:
            logger.warning(f"[weaviate] Collection may already exist: {e}")

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

        await self._ensure_collection(knowledge_base)
        collection = self._client.collections.get(knowledge_base)

        total_tokens = 0
        with collection.batch.dynamic() as batch:
            for i, chunk in enumerate(chunks):
                embedding = self._generate_embedding(chunk)
                total_tokens += self._count_tokens(chunk)
                batch.add_object(
                    properties={
                        "content": chunk,
                        "document_id": document_id,
                        "chunk_index": i,
                        "source": filename,
                        "page": i // 3 + 1,
                        "knowledge_base": knowledge_base,
                    },
                    vector=embedding,
                )

        logger.info(f"[weaviate] Indexed {len(chunks)} chunks from {filename!r}")
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
        from weaviate.classes.query import MetadataQuery

        query_embedding = self._generate_embedding(query)
        collection = self._client.collections.get(knowledge_base)

        results = collection.query.near_vector(
            near_vector=query_embedding,
            limit=top_k,
            return_metadata=MetadataQuery(distance=True),
        )

        search_results = []
        for obj in results.objects:
            score = 1.0 - (obj.metadata.distance or 0.0)
            if score >= similarity_threshold:
                search_results.append({
                    "content": obj.properties.get("content", ""),
                    "score": round(score, 3),
                    "metadata": {
                        "source": obj.properties.get("source", ""),
                        "page": obj.properties.get("page", 0),
                        "document_id": obj.properties.get("document_id", ""),
                        "chunk_index": obj.properties.get("chunk_index", 0),
                    },
                    "document_id": obj.properties.get("document_id"),
                    "chunk_index": obj.properties.get("chunk_index"),
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

        from weaviate.classes.query import MetadataQuery
        import weaviate.classes.query as wq

        query_embedding = self._generate_embedding(query)
        collection = self._client.collections.get(knowledge_base)

        filters = None
        if document_ids is not None:
            filter_parts = [
                wq.Filter.by_property("document_id").equal(document_id)
                for document_id in document_ids
            ]
            filters = reduce(lambda left, right: left | right, filter_parts)

        results = collection.query.near_vector(
            near_vector=query_embedding,
            limit=top_k,
            filters=filters,
            return_metadata=MetadataQuery(distance=True),
        )

        chunks: List[ContextChunk] = []
        for obj in results.objects:
            score = 1.0 - (obj.metadata.distance or 0.0)
            if score >= similarity_threshold:
                chunks.append(
                    ContextChunk(
                        chunk_id=str(obj.uuid),
                        document_id=obj.properties.get("document_id", ""),
                        filename=obj.properties.get("source", "unknown"),
                        page=obj.properties.get("page"),
                        chunk_index=obj.properties.get("chunk_index", 0),
                        content=obj.properties.get("content", ""),
                        score=round(score, 3),
                    )
                )
        return chunks

    async def delete_document(self, document_id: str, knowledge_base: str) -> int:
        if not self._client:
            raise RuntimeError("RAG service not initialized")
        import weaviate.classes.query as wq
        collection = self._client.collections.get(knowledge_base)
        result = collection.data.delete_many(
            where=wq.Filter.by_property("document_id").equal(document_id)
        )
        return result.successful if hasattr(result, "successful") else 0

    async def delete_collection(self, knowledge_base: str) -> None:
        if not self._client:
            return
        try:
            self._client.collections.delete(knowledge_base)
            logger.info(f"[weaviate] Deleted collection: {knowledge_base!r}")
        except Exception as e:
            logger.warning(f"[weaviate] Could not delete collection {knowledge_base!r}: {e}")

    def is_ready(self) -> bool:
        try:
            return self._client is not None and self._client.is_ready()
        except Exception:
            return False
