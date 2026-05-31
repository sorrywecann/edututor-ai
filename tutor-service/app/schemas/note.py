"""
EduTutor.AI - Note Schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(default="")
    source_type: str = Field(default="manual", pattern=r"^(manual|ai_generated|saved_from_chat)$")
    source_message_id: Optional[str] = None
    source_references: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "Kľúčové pojmy",
                "content": "# Fotosyntéza\n\nFotosyntéza je proces...",
                "source_type": "manual",
            }
        }
    }


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = None


class NoteResponse(BaseModel):
    id: str
    knowledge_base_id: str
    title: str
    content: str
    source_type: str
    source_message_id: Optional[str] = None
    source_references: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SaveFromChatRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1)
    source_references: Optional[str] = None
