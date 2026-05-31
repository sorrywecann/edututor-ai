"""UserProfile model — per-user structured profile for Phase 8b memory features.

Stores slow-moving facts about the user (display name, language preferences,
skill-level estimate, goals, last conversation summary). Used by Phase 8b Tasks
10 and 11: loaded into the system-prompt <PROFILE> block at chat start (Task 10)
and written by the update_profile skill tool (Task 11).

Phase 8a FK contract: user_id references users.id with ON DELETE CASCADE,
same pattern as Flashcard.user_id introduced in Phase 8a.
One row per user — user_id is the primary key.
"""
from typing import Optional

from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserProfile(Base, TimestampMixin):
    """Per-user structured profile row. One row per user, keyed on user_id."""

    __tablename__ = "user_profile"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    display_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    preferred_language: Mapped[Optional[str]] = mapped_column(
        String(10),
        nullable=True,
    )
    target_language: Mapped[Optional[str]] = mapped_column(
        String(10),
        nullable=True,
    )
    level_estimate: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
    )
    goals: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    last_summary: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<UserProfile user_id={self.user_id!r} display_name={self.display_name!r}>"
