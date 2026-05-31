"""Async store layer for the Flashcard model — keeps SQL out of the Skill handler.

Uses the project's AsyncSessionLocal so the FSRS card lifecycle shares the
same SQLite/PostgreSQL connection pool as the rest of the app. Each call
opens its own short session — Skill handlers run inside chat handlers that
already have their own DB session, but introducing a dependency on it would
couple SkillRegistry to FastAPI's request lifecycle. Keeping the Skill
self-contained (it opens/closes its own session per call) is the right
trade-off for now; Phase 8 may move to context-managed sessions if hot-path
latency becomes an issue.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.flashcard import Flashcard


async def add_card(*, user_id: str, front: str, back: str, fsrs_state: str, due_at: datetime) -> int:
    async with AsyncSessionLocal() as session:
        card = Flashcard(user_id=user_id, front=front, back=back, fsrs_state=fsrs_state, due_at=due_at)
        session.add(card)
        await session.commit()
        await session.refresh(card)
        return card.id


async def get_card(*, user_id: str, card_id: int) -> Optional[Flashcard]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Flashcard).where(Flashcard.id == card_id, Flashcard.user_id == user_id)
        )
        return result.scalar_one_or_none()


async def update_card(*, user_id: str, card_id: int, fsrs_state: str, due_at: datetime) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Flashcard).where(Flashcard.id == card_id, Flashcard.user_id == user_id)
        )
        card = result.scalar_one_or_none()
        if card is None:
            return
        card.fsrs_state = fsrs_state
        card.due_at = due_at
        await session.commit()


async def list_due(*, user_id: str, limit: int) -> List[Flashcard]:
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Flashcard)
            .where(Flashcard.user_id == user_id, Flashcard.due_at <= now)
            .order_by(Flashcard.due_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())
