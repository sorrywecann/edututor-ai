"""Podcast model — generation job state row.

Maps 1:1 to a podcast generation request. Created when a user requests
podcast audio from selected knowledge-base documents and notes. Worker
process steps through pending -> processing -> completed/failed.

Pattern mirrors TransformationResult (app/models/transformation.py:31-45):
UUID PK, status-as-string with "pending" default, nullable Text for
variable-length content, FK references with CASCADE.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Podcast(Base, TimestampMixin):
    """Podcast generation job row. One row per generation request."""

    __tablename__ = "podcasts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    knowledge_base_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), default="Podcast")
    format: Mapped[str] = mapped_column(String(20), default="summary")
    voice_id: Mapped[str] = mapped_column(String(100), default="sk-SK-LukasNeural")
    provider: Mapped[str] = mapped_column(String(20), default="edge")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    script: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audio_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_ids: Mapped[str] = mapped_column(Text, default="[]")
    note_ids: Mapped[str] = mapped_column(Text, default="[]")

    def __repr__(self) -> str:
        return f"<Podcast kb={self.knowledge_base_id!r} status={self.status!r}>"
