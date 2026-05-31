"""Phase 8a — pin chat.py threading of request.state.user_id into skill dispatch.

These tests prove the integration: cookie/header on /chat request -> middleware
sets request.state.user_id -> chat() forwards it to _run_tool_loop ->
_run_tool_loop forwards to registry.dispatch -> SpacedRepetitionSkill receives
it -> Flashcard row carries that user_id.

The Slovak tutor flow regression is explicitly pinned: sk mode (empty
enabled_skills) bypasses the tool loop and is byte-identical to Phase 7
regardless of whether identity is resolved or not.
"""
from __future__ import annotations

import os
import uuid
from typing import List
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete, select

from app.deps import llm_service_dep
from app.database import AsyncSessionLocal
from app.middleware.user_identity import HEADER_NAME
from app.models.flashcard import Flashcard
from app.models.user import User
from app.services.llm_service import LLMService, ChatMessage
from app.skills import get_registry


class _ScriptedLLM(LLMService):
    def __init__(self, scripted: List[str]) -> None:
        super().__init__()
        self.scripted = list(scripted)
        self._provider = "fake"
        self._available_providers = {"fake": True}
        self.calls: List[List[ChatMessage]] = []

    async def generate(self, messages, **_kwargs) -> str:
        self.calls.append(list(messages))
        if not self.scripted:
            return "[scripted LLM exhausted]"
        return self.scripted.pop(0)


@pytest_asyncio.fixture
async def fresh_registry():
    """Reset SkillRegistry + register Phase 7/8 skills before each test."""
    from app.skills.startup import register_default_skills
    get_registry().reset()
    register_default_skills()
    yield


@pytest_asyncio.fixture
async def isolated_flashcards():
    """Truncate flashcards before+after each test for determinism."""
    from app.database import create_tables
    await create_tables()
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Flashcard))
        await session.commit()
    yield
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Flashcard))
        await session.commit()


@pytest.mark.asyncio
async def test_chat_passes_user_id_to_skill(fresh_registry, isolated_flashcards):
    """X-EduTutor-User-Id on /chat -> Flashcard row carries that exact user_id."""
    from app.main import app

    user_id = str(uuid.uuid4())
    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "add_card", "arguments": {"front": "test-front", "back": "test-back"}}</tool_call>',
        "Done.",
    ])

    async def fake_dep():
        return fake_llm

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/chat",
                json={"message": "add card", "mode_id": "tutor_practice"},
                headers={HEADER_NAME: user_id},
            )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    assert resp.status_code == 200

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Flashcard).where(Flashcard.front == "test-front")
        )
        row = result.scalar_one_or_none()

    assert row is not None
    assert row.user_id == user_id


@pytest.mark.asyncio
async def test_two_users_get_isolated_flashcards_via_chat(fresh_registry, isolated_flashcards):
    """User A's add_card via /chat must not appear in User B's flashcards."""
    from app.main import app

    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "add_card", "arguments": {"front": "user-a-front", "back": "user-a-back"}}</tool_call>',
        "Done.",
    ])

    async def fake_dep():
        return fake_llm

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            await c.post(
                "/api/v1/chat",
                json={"message": "add card", "mode_id": "tutor_practice"},
                headers={HEADER_NAME: user_a},
            )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    async with AsyncSessionLocal() as session:
        a_count = (await session.execute(
            select(Flashcard).where(Flashcard.user_id == user_a)
        )).scalars().all()
        b_count = (await session.execute(
            select(Flashcard).where(Flashcard.user_id == user_b)
        )).scalars().all()

    assert len(a_count) == 1
    assert len(b_count) == 0


@pytest.mark.asyncio
async def test_chat_sk_mode_unaffected_by_identity_change(fresh_registry):
    """Slovak tutor flow (empty enabled_skills) must be byte-identical regardless
    of whether a user_id was resolved by middleware. Pins backwards compat."""
    from app.main import app

    fake_llm = _ScriptedLLM(scripted=["Ahoj! Ako ti môžem pomôcť?"])

    async def fake_dep():
        return fake_llm

    user_id = str(uuid.uuid4())
    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/chat",
                json={"message": "Ahoj", "mode_id": "sk"},
                headers={HEADER_NAME: user_id},
            )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    assert resp.status_code == 200
    assert len(fake_llm.calls) == 1, (
        f"sk mode must call LLM exactly once (bypass-when-empty), got {len(fake_llm.calls)}"
    )
    body = resp.json()
    assert body["response"] == "Ahoj! Ako ti môžem pomôcť?"


@pytest.mark.asyncio
async def test_chat_without_identity_header_falls_back_to_handler_default(
    fresh_registry, isolated_flashcards,
):
    """No header -> middleware generates one -> chat uses it -> isolation preserved."""
    from app.main import app

    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "add_card", "arguments": {"front": "no-header-front", "back": "no-header-back"}}</tool_call>',
        "Done.",
    ])

    async def fake_dep():
        return fake_llm

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/chat",
                json={"message": "add card", "mode_id": "tutor_practice"},
            )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    assert resp.status_code == 200

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Flashcard).where(Flashcard.front == "no-header-front")
        )
        row = result.scalar_one_or_none()

    assert row is not None
    uuid.UUID(row.user_id)
    assert row.user_id != "default"
