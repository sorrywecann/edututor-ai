"""SpacedRepetitionSkill — FSRS-scheduled flashcard practice.

Three tools:
- add_card(front, back) -> creates a Flashcard row, returns its id and "due now".
- review_card(card_id, rating) -> applies FSRS scheduler.review_card and persists.
- due_cards(limit) -> lists cards whose due_at <= now, ordered by due_at ASC.

Phase 8a: handlers accept ``user_id`` injected by SkillRegistry.dispatch
from request.state.user_id (set by UserIdentityMiddleware). Per-user
isolation is enforced at the SQL layer via store.py — flashcards added
by user A are invisible to user B. Phase 7 used a hardcoded
'default' user_id; those rows were migrated by
_backfill_legacy_default_flashcards() to a stable synthetic legacy user.

The fsrs.Card state is JSON-serialized via Card.to_dict /
Card.from_dict so the algorithm can evolve without schema changes (any
new fields fsrs adds round-trip through the JSON blob).

Async DB access uses the existing AsyncSessionLocal. The Skill keeps
SQL out of its handlers — store-layer functions in store.py do the
persistence work so the handlers stay focused on FSRS rating mapping
and result formatting.
"""
from __future__ import annotations

import json
import logging
from typing import List

from app.skills.base import Skill, ToolDef
from app.skills.spaced_repetition import store

logger = logging.getLogger(__name__)

_LEGACY_FALLBACK_USER = "default"
_VALID_RATINGS = {"again", "hard", "good", "easy"}


class SpacedRepetitionSkill(Skill):
    name = "spaced_repetition"
    description = (
        "Manage flashcard-based retrieval practice using the FSRS algorithm "
        "(the same one used by Anki). Use add_card to record new facts; "
        "review_card after the student answers; due_cards to fetch what's "
        "ready to review now."
    )

    async def _handle_add(self, front: str, back: str, user_id: str = _LEGACY_FALLBACK_USER) -> str:
        from fsrs import Card
        card = Card()
        try:
            card_id = await store.add_card(
                user_id=user_id,
                front=front,
                back=back,
                fsrs_state=json.dumps(card.to_dict()),
                due_at=card.due,
            )
        except Exception as exc:  # noqa: BLE001 — DB errors must be recoverable
            logger.warning("add_card failed: %s", exc)
            return f"[add_card error: {exc.__class__.__name__}: {exc}]"
        return f"Card #{card_id} added (front: {front!r}). Due now (ready to review)."

    async def _handle_review(self, card_id: int, rating: str, user_id: str = _LEGACY_FALLBACK_USER) -> str:
        if rating not in _VALID_RATINGS:
            return f"[review_card error: invalid rating {rating!r}; use again|hard|good|easy]"

        from fsrs import Scheduler, Card, Rating
        rating_enum = {
            "again": Rating.Again,
            "hard": Rating.Hard,
            "good": Rating.Good,
            "easy": Rating.Easy,
        }[rating]

        try:
            row = await store.get_card(user_id=user_id, card_id=card_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("review_card lookup failed: %s", exc)
            return f"[review_card error: {exc.__class__.__name__}: {exc}]"

        if row is None:
            return f"[review_card error: card #{card_id} not found]"

        try:
            card = Card.from_dict(json.loads(row.fsrs_state))
        except Exception as exc:  # noqa: BLE001 — corrupt card state should not crash chat
            logger.warning("review_card state deserialize failed for card_id=%s: %s", card_id, exc)
            return f"[review_card error: corrupt card state for #{card_id}]"

        scheduler = Scheduler()
        card, _log = scheduler.review_card(card, rating_enum)

        try:
            await store.update_card(
                user_id=user_id,
                card_id=card_id,
                fsrs_state=json.dumps(card.to_dict()),
                due_at=card.due,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("review_card update failed: %s", exc)
            return f"[review_card error: {exc.__class__.__name__}: {exc}]"

        return f"Card #{card_id} reviewed ({rating}). Next due: {card.due.isoformat()}"

    async def _handle_due(self, limit: int = 10, user_id: str = _LEGACY_FALLBACK_USER) -> str:
        bounded_limit = max(1, min(int(limit) if limit else 10, 50))
        try:
            rows = await store.list_due(user_id=user_id, limit=bounded_limit)
        except Exception as exc:  # noqa: BLE001
            logger.warning("due_cards failed: %s", exc)
            return f"[due_cards error: {exc.__class__.__name__}: {exc}]"

        if not rows:
            return "No cards due for review right now."
        lines = [f"Due cards (≤{bounded_limit}):"]
        for r in rows:
            lines.append(f"  #{r.id}: {r.front} → {r.back} (due {r.due_at.isoformat()})")
        return "\n".join(lines)

    def tools(self) -> List[ToolDef]:
        return [
            ToolDef(
                name="add_card",
                description="Create a new flashcard (front question/term, back answer/translation).",
                parameters={
                    "type": "object",
                    "properties": {
                        "front": {"type": "string", "description": "Question or term shown to the learner."},
                        "back": {"type": "string", "description": "Answer or translation revealed after."},
                    },
                    "required": ["front", "back"],
                },
                handler=self._handle_add,
            ),
            ToolDef(
                name="review_card",
                description="Record the learner's performance on a card and schedule the next review using FSRS.",
                parameters={
                    "type": "object",
                    "properties": {
                        "card_id": {"type": "integer", "description": "Card ID returned by add_card or due_cards."},
                        "rating": {
                            "type": "string",
                            "enum": ["again", "hard", "good", "easy"],
                            "description": "FSRS rating: again (forgot), hard (recalled with effort), good (recalled), easy (trivial).",
                        },
                    },
                    "required": ["card_id", "rating"],
                },
                handler=self._handle_review,
            ),
            ToolDef(
                name="due_cards",
                description="List cards ready for review now (FSRS-scheduled).",
                parameters={
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Max cards to return (1-50, default 10).",
                            "minimum": 1,
                            "maximum": 50,
                            "default": 10,
                        },
                    },
                    "required": [],
                },
                handler=self._handle_due,
            ),
        ]
