"""
EduTutor.AI - RAG Configuration
Konfigurácia vektorovej databázy a RAG pipeline pre PB3
"""

from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class RAGConfig(BaseSettings):
    """Konfigurácia pre Retrieval-Augmented Generation"""

    # Vector DB backend selection
    # "chroma"   → embedded ChromaDB, no Docker (default for dev/local)
    # "weaviate" → Weaviate server, requires Docker or cloud (production)
    vector_db_backend: str = Field(
        default="chroma",
        description="Vector database backend: 'chroma' or 'weaviate'",
    )

    # Weaviate connection (used when vector_db_backend=weaviate)
    weaviate_url: str = Field(
        default="http://localhost:8080", description="URL adresa Weaviate servera"
    )
    weaviate_api_key: Optional[str] = Field(
        default=None, description="API kľúč pre Weaviate (ak je potrebný)"
    )
    collection_name: str = Field(
        default="EduTutorKnowledge", description="Názov kolekcie v Weaviate"
    )

    embedding_model: str = Field(
        default="paraphrase-multilingual-MiniLM-L12-v2",
        description="Multilingual embedding model pre slovenčinu",
    )
    embedding_dimension: int = Field(
        default=384, description="Dimenzia embedding vektorov"
    )
    use_openai_embeddings: bool = Field(
        default=False, description="Použiť OpenAI embeddings namiesto lokálnych"
    )
    openai_embedding_model: str = Field(
        default="text-embedding-3-small", description="OpenAI embedding model"
    )

    # Chunking settings
    chunk_size: int = Field(
        default=500, ge=100, le=2000, description="Veľkosť chunku v tokenoch"
    )
    chunk_overlap: int = Field(
        default=80, ge=0, le=500, description="Prekrytie medzi chunkmi"
    )

    # Retrieval settings
    top_k_results: int = Field(
        default=5, ge=1, le=20, description="Počet najrelevantnejších dokumentov"
    )
    similarity_threshold: float = Field(
        default=0.65,
        ge=0.0,
        le=1.0,
        description="Minimálna podobnosť pre zaradenie výsledku",
    )
    similarity_metric: str = Field(
        default="cosine", description="Metrika podobnosti: cosine, dot, euclidean"
    )

    # Filtering
    filter_metadata: bool = Field(
        default=True, description="Povoliť filtrovanie podľa metadát"
    )

    # Performance
    batch_size: int = Field(default=100, description="Veľkosť batchu pri indexovaní")
    timeout_seconds: int = Field(default=30, description="Timeout pre Weaviate dotazy")

    model_config = SettingsConfigDict(
        env_prefix="RAG_",
        env_file=".env",
        extra="ignore",
    )


rag_config = RAGConfig()

RAG_CONFIG = {
    "vector_db_backend": rag_config.vector_db_backend,
    "weaviate_url": rag_config.weaviate_url,
    "collection_name": rag_config.collection_name,
    "embedding_model": rag_config.embedding_model,
    "chunk_size": rag_config.chunk_size,
    "chunk_overlap": rag_config.chunk_overlap,
    "top_k_results": rag_config.top_k_results,
    "similarity_threshold": rag_config.similarity_threshold,
}


def get_rag_config() -> RAGConfig:
    """Get RAG configuration"""
    return rag_config
