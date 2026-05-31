"""
EduTutor.AI - Pydantic Schemas
Request/Response schemas for API validation
"""

from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
)
from app.schemas.knowledge_base import (
    DocumentUploadResponse,
    SearchQuery,
    SearchResult,
    SearchResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
)

__all__ = [
    "ConversationCreate",
    "ConversationResponse",
    "MessageCreate",
    "MessageResponse",
    "DocumentUploadResponse",
    "SearchQuery",
    "SearchResult",
    "SearchResponse",
    "KnowledgeBaseCreate",
    "KnowledgeBaseResponse",
]
