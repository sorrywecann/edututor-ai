"""
EduTutor.AI - Note Model
"""
import uuid
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.knowledge_base import KnowledgeBase


class Note(Base, TimestampMixin):
    __tablename__ = "notes"

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
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    source_type: Mapped[str] = mapped_column(String(30), default="manual")
    source_message_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    source_references: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    knowledge_base: Mapped["KnowledgeBase"] = relationship(back_populates="notes")

    def __repr__(self) -> str:
        return f"<Note {self.title!r}>"
