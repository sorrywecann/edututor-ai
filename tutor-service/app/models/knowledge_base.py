"""
EduTutor.AI - Knowledge Base and Document Models
"""

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Text, Integer, ForeignKey, JSON, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid
import enum

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class DocumentStatus(enum.Enum):
    """Processing status of a document"""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class KnowledgeBase(Base, TimestampMixin):
    """Knowledge base collection for RAG"""

    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Weaviate collection name
    weaviate_collection: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # Stats
    document_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    total_chunks: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    # Relationships
    documents: Mapped[List["Document"]] = relationship(
        "Document",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        "Conversation",
        back_populates="knowledge_base",
    )
    notes: Mapped[List["Note"]] = relationship(
        "Note",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<KnowledgeBase {self.name} ({self.document_count} docs)>"


class Document(Base, TimestampMixin):
    """Document stored in a knowledge base"""

    __tablename__ = "documents"

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

    # File info
    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    file_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # Processing info
    status: Mapped[DocumentStatus] = mapped_column(
        SQLEnum(DocumentStatus),
        default=DocumentStatus.PENDING,
    )
    chunk_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    token_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    context_mode: Mapped[str] = mapped_column(
        String(20),
        default="full",
        server_default="full",
        nullable=False,
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Metadata
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata",
        JSON,
        nullable=True,
    )

    # Relationships
    knowledge_base: Mapped["KnowledgeBase"] = relationship(
        "KnowledgeBase",
        back_populates="documents",
    )

    def __repr__(self) -> str:
        return f"<Document {self.filename} ({self.status.value})>"
