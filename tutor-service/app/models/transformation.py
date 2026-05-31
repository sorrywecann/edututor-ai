"""
EduTutor.AI - Transformation Models
"""
import uuid
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, Text, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.knowledge_base import Document


class TransformationTemplate(Base, TimestampMixin):
    __tablename__ = "transformation_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(String(50), default="sparkles")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    results: Mapped[list["TransformationResult"]] = relationship(back_populates="template", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<TransformationTemplate {self.name!r}>"


class TransformationResult(Base, TimestampMixin):
    __tablename__ = "transformation_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id: Mapped[str] = mapped_column(String(36), ForeignKey("transformation_templates.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    is_stale: Mapped[bool] = mapped_column(Boolean, default=False)

    template: Mapped["TransformationTemplate"] = relationship(back_populates="results")
    document: Mapped["Document"] = relationship()

    def __repr__(self) -> str:
        return f"<TransformationResult doc={self.document_id!r} status={self.status!r}>"
