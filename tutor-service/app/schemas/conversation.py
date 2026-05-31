"""
EduTutor.AI - Conversation Schemas
Pydantic models for conversation API
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class MessageRole(str, Enum):
    """Role of message sender"""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ConversationCreate(BaseModel):
    """Request model for creating a conversation"""

    user_id: str = Field(..., description="User identifier")
    knowledge_base_id: Optional[str] = Field(
        None, description="Optional knowledge base for RAG"
    )

    model_config = {
        "json_schema_extra": {
            "example": {"user_id": "user-123", "knowledge_base_id": "kb-456"}
        }
    }


class ConversationResponse(BaseModel):
    """Response model for conversation creation"""

    conversation_id: str
    room_name: str
    token: str = Field(..., description="LiveKit JWT token")
    server_url: str = Field(..., description="LiveKit server WebSocket URL")
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetail(BaseModel):
    """Detailed conversation info"""

    conversation_id: str
    user_id: str
    knowledge_base_id: Optional[str]
    room_name: str
    status: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    """Request model for creating a message"""

    content: str = Field(..., min_length=1, max_length=10000)
    role: MessageRole = MessageRole.USER


class MessageResponse(BaseModel):
    """Response model for a message"""

    id: str
    conversation_id: str
    role: MessageRole
    content: str
    audio_url: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TranscriptionEvent(BaseModel):
    """WebSocket event for real-time transcription"""

    text: str
    is_final: bool
    confidence: float = 1.0
    language: str = "sk"


class AgentSpeechEvent(BaseModel):
    """WebSocket event for agent speech"""

    event_type: str  # "started" | "ended"
    text: Optional[str] = None
    audio_url: Optional[str] = None
