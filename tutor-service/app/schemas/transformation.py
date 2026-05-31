"""
EduTutor.AI - Transformation Schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TransformationTemplateResponse(BaseModel):
    id: str
    name: str
    prompt: str
    icon: str
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TransformationTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    prompt: str = Field(..., min_length=1)
    icon: str = Field(default="sparkles")


class ApplyTransformationRequest(BaseModel):
    document_id: str
    template_id: str


class TransformationResultResponse(BaseModel):
    id: str
    document_id: str
    template_id: str
    content: str
    status: str
    is_stale: bool
    created_at: datetime

    model_config = {"from_attributes": True}
