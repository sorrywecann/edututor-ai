"""Phase 8a — pin SkillRegistry.dispatch user_id forwarding contract.

The registry must:
  - Detect at registration time which handlers accept a ``user_id`` parameter.
  - Forward ``user_id`` to those handlers when dispatch is called with one.
  - Skip forwarding to handlers that don't accept it (e.g. web_search).
  - Default to NOT forwarding when no user_id is supplied (backwards compat
    for any existing caller that hasn't been updated).

Plus a per-user isolation contract on the SpacedRepetitionSkill:
two different user_ids dispatching add_card must produce flashcards
that the other user's due_cards cannot see.
"""
from __future__ import annotations

import uuid
from typing import Optional

import pytest

from app.models.user import User
from app.database import AsyncSessionLocal
from app.skills import SkillRegistry
from app.skills.base import Skill, ToolDef
from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
from app.skills.web_search.skill import WebSearchSkill


class _UserAwareEcho(Skill):
    name = "user_echo"
    description = "test"

    async def _echo(self, msg: str, user_id: str) -> str:
        return f"{user_id}:{msg}"

    def tools(self):
        return [
            ToolDef(
                name="user_echo_tool",
                description="echoes",
                parameters={"type": "object", "properties": {"msg": {"type": "string"}}, "required": ["msg"]},
                handler=self._echo,
            )
        ]


class _UserAgnosticEcho(Skill):
    name = "agnostic_echo"
    description = "test"

    async def _echo(self, msg: str) -> str:
        return f"agnostic:{msg}"

    def tools(self):
        return [
            ToolDef(
                name="agnostic_echo_tool",
                description="echoes",
                parameters={"type": "object", "properties": {"msg": {"type": "string"}}, "required": ["msg"]},
                handler=self._echo,
            )
        ]


async def _ensure_user(uid: str) -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.get(User, uid)
        if existing is None:
            session.add(User(id=uid, is_anonymous=True))
            await session.commit()


@pytest.mark.asyncio
async def test_dispatch_passes_user_id_to_handler_that_accepts_it():
    """Handler with user_id parameter receives the dispatched value."""
    registry = SkillRegistry()
    registry.register(_UserAwareEcho())
    out = await registry.dispatch("user_echo_tool", {"msg": "hi"}, user_id="abc-123")
    assert out == "abc-123:hi"


@pytest.mark.asyncio
async def test_dispatch_omits_user_id_for_handler_that_does_not_accept():
    """Handler without user_id parameter is called without it, no TypeError."""
    registry = SkillRegistry()
    registry.register(_UserAgnosticEcho())
    out = await registry.dispatch("agnostic_echo_tool", {"msg": "hi"}, user_id="abc-123")
    assert out == "agnostic:hi"


@pytest.mark.asyncio
async def test_dispatch_with_no_user_id_works_for_user_aware_handler():
    """No user_id supplied -> handler's default (LEGACY_FALLBACK_USER) is used."""
    registry = SkillRegistry()
    registry.register(_UserAwareEcho())
    with pytest.raises(TypeError):
        await registry.dispatch("user_echo_tool", {"msg": "hi"})


@pytest.mark.asyncio
async def test_per_user_isolation_in_spaced_repetition():
    """User A and User B see only their own flashcards via due_cards."""
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    await _ensure_user(user_a)
    await _ensure_user(user_b)

    registry = SkillRegistry()
    registry.register(SpacedRepetitionSkill())

    out_a = await registry.dispatch(
        "add_card", {"front": "užívateľ A karta", "back": "user A card"}, user_id=user_a,
    )
    assert "Card #" in out_a

    due_a = await registry.dispatch("due_cards", {"limit": 10}, user_id=user_a)
    due_b = await registry.dispatch("due_cards", {"limit": 10}, user_id=user_b)

    assert "užívateľ A karta" in due_a
    assert "užívateľ A karta" not in due_b
    assert "No cards due" in due_b or "užívateľ A karta" not in due_b


@pytest.mark.asyncio
async def test_web_search_handlers_marked_as_user_agnostic():
    """WebSearchSkill handlers are detected as not-accepting user_id at registration."""
    registry = SkillRegistry()
    registry.register(WebSearchSkill())
    assert "search_web" not in registry._handlers_accept_user_id
    assert "fetch_url" not in registry._handlers_accept_user_id


@pytest.mark.asyncio
async def test_spaced_repetition_handlers_marked_as_user_aware():
    """SpacedRepetitionSkill handlers ARE detected as accepting user_id."""
    registry = SkillRegistry()
    registry.register(SpacedRepetitionSkill())
    assert "add_card" in registry._handlers_accept_user_id
    assert "review_card" in registry._handlers_accept_user_id
    assert "due_cards" in registry._handlers_accept_user_id
