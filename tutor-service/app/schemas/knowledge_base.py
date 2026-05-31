"""
EduTutor.AI - Knowledge Base Schemas
Pydantic models for knowledge base API
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum


class DocumentStatus(str, Enum):
    """Processing status of a document"""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class KnowledgeBaseCreate(BaseModel):
    """Request model for creating a knowledge base"""

    name: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    description: Optional[str] = Field(None, max_length=500)

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "programming-101",
                "description": "Basic programming concepts",
            }
        }
    }


class KnowledgeBaseResponse(BaseModel):
    """Response model for knowledge base"""

    id: str
    name: str
    description: Optional[str]
    document_count: int
    total_chunks: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeBaseUpdate(BaseModel):
    """Request model for updating a knowledge base"""

    name: Optional[str] = Field(None, min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    description: Optional[str] = Field(None, max_length=500)


class DocumentUploadResponse(BaseModel):
    """Response model for document upload"""

    document_id: str
    filename: str
    file_type: str
    file_size: int
    status: DocumentStatus
    chunk_count: int
    token_count: int

    model_config = {"from_attributes": True}


class DocumentDetail(BaseModel):
    """Detailed document information"""

    id: str
    knowledge_base_id: str
    filename: str
    file_type: str
    file_size: int
    status: DocumentStatus
    chunk_count: int
    token_count: int
    context_mode: str = "full"
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    """Update document settings."""

    context_mode: str = Field(pattern=r"^(full|insights|off)$")


class ContextChunk(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    page: Optional[int] = None
    chunk_index: int
    content: str
    score: float

    model_config = ConfigDict(from_attributes=True)


class SearchQuery(BaseModel):
    """Search query parameters"""

    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(5, ge=1, le=20)
    similarity_threshold: float = Field(0.65, ge=0.0, le=1.0)
    filter_metadata: Optional[Dict[str, Any]] = None


class SearchResult(BaseModel):
    """Single search result"""

    content: str
    score: float
    metadata: Dict[str, Any]
    document_id: Optional[str] = None
    chunk_index: Optional[int] = None


class SearchResponse(BaseModel):
    """Response model for search"""

    results: List[SearchResult]
    query: str
    total_results: int
    search_time_ms: float
