"""
EduTutor.AI - Conversation and Message Models
"""

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Text, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid
import enum

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.knowledge_base import KnowledgeBase


class ConversationStatus(enum.Enum):
    """Status of a conversation"""

    ACTIVE = "active"
    ENDED = "ended"
    ERROR = "error"


class MessageRole(enum.Enum):
    """Role of message sender"""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Conversation(Base, TimestampMixin):
    """Conversation session between user and AI tutor"""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    knowledge_base_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("knowledge_bases.id", ondelete="SET NULL"),
        nullable=True,
    )

    # LiveKit room info
    room_name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
    )

    status: Mapped[ConversationStatus] = mapped_column(
        SQLEnum(ConversationStatus),
        default=ConversationStatus.ACTIVE,
    )

    # Chat session metadata
    session_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_pinned: Mapped[bool] = mapped_column(default=False)

    # Session metadata
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata",
        JSON,
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="conversations",
    )
    knowledge_base: Mapped[Optional["KnowledgeBase"]] = relationship(
        "KnowledgeBase",
        back_populates="conversations",
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )

    def __repr__(self) -> str:
        return f"<Conversation {self.id} ({self.status.value})>"


class Message(Base, TimestampMixin):
    """Individual message in a conversation"""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role: Mapped[MessageRole] = mapped_column(
        SQLEnum(MessageRole),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # Audio metadata
    audio_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )
    duration_ms: Mapped[Optional[int]] = mapped_column(
        nullable=True,
    )

    # RAG context used
    rag_context: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    # Relationships
    conversation: Mapped["Conversation"] = relationship(
        "Conversation",
        back_populates="messages",
    )

    def __repr__(self) -> str:
        return f"<Message {self.id} ({self.role.value})>"
