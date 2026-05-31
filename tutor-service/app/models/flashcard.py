"""Flashcard model — FSRS-scheduled retrieval-practice cards.

Phase 8a: user_id is now a ForeignKey to users.id with ON DELETE CASCADE.
Phase 7's hardcoded ``user_id='default'`` is migrated at boot via
``_backfill_legacy_default_flashcards()`` in app/database.py — those rows
are reassigned to a single synthetic legacy user whose UUID is persisted
to ``data/legacy_user_id.txt`` so the same legacy user is reused across
restarts. New rows must always carry a real user_id from the
UserIdentityMiddleware (no default).
"""
from datetime import datetime

from sqlalchemy import String, Text, DateTime, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Flashcard(Base, TimestampMixin):
    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    fsrs_state: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_flashcards_user_due", "user_id", "due_at"),
    )

    def __repr__(self) -> str:
        return f"<Flashcard {self.id} {self.front!r}>"
