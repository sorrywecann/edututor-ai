"""End-to-end Phase 7 contracts: chat request -> mode lookup -> tool_schemas
resolved from enabled_skills -> tool loop dispatches -> result fed back to LLM
-> final response returned. This is the integration that proves the platform
spine actually wires through, not just the units in isolation.

Three flows covered:
1. assistant mode -> search_web dispatch (web_search skill, mocked DDG backend).
2. tutor_practice mode -> add_card dispatch (spaced_repetition skill, isolated DB).
3. sk mode -> tool loop bypass (enabled_skills=[], no dispatch, byte-identical
   to pre-Phase-7 production Slovak tutor flow).

Plus one tool-loop recovery test: LLM emits wrong argument name -> handler
raises TypeError -> loop catches, feeds back as system message, LLM retries
with the correct name on the next iteration. Pins the cost-of-mistake at
exactly one extra LLM call.
"""
import os
from typing import AsyncIterator, List
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.deps import llm_service_dep
from app.services.llm_service import LLMService, ChatMessage
from app.skills import get_registry


class _ScriptedLLM(LLMService):
    """Scripted LLM: each generate() returns the next item from `scripted`.

    Tracks all messages it received so tests can assert on iteration count,
    correct prompt construction, and tool-result feedback ordering.
    """

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
    """Reset SkillRegistry + register Phase 7 skills before each test.
    Without this, test order changes whether get_registry() has skills."""
    from app.skills.startup import register_default_skills
    get_registry().reset()
    register_default_skills()
    yield


@pytest_asyncio.fixture
async def isolated_flashcards():
    """Truncate flashcards table around each test to keep tutor_practice
    integration tests deterministic."""
    from app.database import create_tables, AsyncSessionLocal
    from app.models.flashcard import Flashcard
    from sqlalchemy import delete

    await create_tables()
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Flashcard))
        await session.commit()

    yield

    async with AsyncSessionLocal() as session:
        await session.execute(delete(Flashcard))
        await session.commit()


@pytest.mark.asyncio
async def test_chat_assistant_mode_dispatches_search_web(fresh_registry):
    """Assistant mode + LLM emitting a tool call -> handler dispatched (with
    mocked DDG backend) -> result fed back -> final answer returned. This is
    the canary that proves Phase 7 actually wires end-to-end."""
    from app.main import app

    fake_results = [
        {"title": "Slovakia News", "href": "https://example.com/sk", "body": "Slovakia announced X."}
    ]
    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "search_web", "arguments": {"query": "Slovakia news"}}</tool_call>',
        "Slovakia announced X (source: example.com).",
    ])

    async def fake_dep():
        return fake_llm

    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._ddg_search", return_value=fake_results):
            app.dependency_overrides[llm_service_dep] = fake_dep
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post("/api/v1/chat", json={
                        "message": "What's the latest news from Slovakia?",
                        "mode_id": "assistant",
                    })
            finally:
                app.dependency_overrides.pop(llm_service_dep, None)

    assert resp.status_code == 200
    body = resp.json()
    assert "Slovakia" in body["response"]
    assert "example.com" in body["response"]
    assert len(fake_llm.calls) >= 2, (
        f"tool loop must call LLM at least twice (call + final), got {len(fake_llm.calls)}"
    )


@pytest.mark.asyncio
async def test_chat_sk_mode_bypasses_tool_loop(fresh_registry):
    """Slovak production mode has enabled_skills=[]. The tool loop MUST
    bypass to a single llm.generate() call — byte-identical to pre-Phase-7
    behaviour. Pins backwards compatibility for the hot path."""
    from app.main import app

    fake_llm = _ScriptedLLM(scripted=["Ahoj! Ako ti môžem pomôcť?"])

    async def fake_dep():
        return fake_llm

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat", json={
                "message": "Ahoj",
                "mode_id": "sk",
            })
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    assert resp.status_code == 200
    assert len(fake_llm.calls) == 1, (
        f"sk mode must call LLM exactly once (bypass-when-empty), got {len(fake_llm.calls)}"
    )


@pytest.mark.asyncio
async def test_chat_tutor_practice_mode_dispatches_add_card(fresh_registry, isolated_flashcards):
    """tutor_practice mode + LLM emitting an add_card tool call -> Flashcard
    row created in SQLite -> result fed back -> final answer returned.
    Pins the stateful-skill integration: a Skill that hits the real DB still
    works through the same tool loop as a stateless one."""
    from app.main import app

    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "add_card", "arguments": {"front": "mačka", "back": "cat"}}</tool_call>',
        "Pridal som ti kartičku 'mačka' → 'cat'. Hotovo!",
    ])

    async def fake_dep():
        return fake_llm

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat", json={
                "message": "Pridaj kartičku mačka -> cat",
                "mode_id": "tutor_practice",
            })
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    assert resp.status_code == 200
    body = resp.json()
    assert "kartičku" in body["response"] or "mačka" in body["response"]
    assert len(fake_llm.calls) >= 2

    from app.database import AsyncSessionLocal
    from app.models.flashcard import Flashcard
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Flashcard).where(Flashcard.front == "mačka"))
        row = result.scalar_one_or_none()
    assert row is not None, "add_card was not actually persisted to flashcards table"
    assert row.back == "cat"


@pytest.mark.asyncio
async def test_chat_recovers_from_wrong_argument_name(fresh_registry):
    """Per Metis: LLM may emit {q: ...} instead of {query: ...}. dispatch()
    calls handler(q='...') which raises TypeError. Tool loop catches it,
    feeds error back as system message, LLM retries on next iteration with
    the correct name and produces the final answer. Cost: one extra LLM
    call, no user-visible failure."""
    from app.main import app

    fake_results = [
        {"title": "Recovered", "href": "https://r.example", "body": "."}
    ]
    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "search_web", "arguments": {"q": "test"}}</tool_call>',
        '<tool_call>{"name": "search_web", "arguments": {"query": "test"}}</tool_call>',
        "Got it after retry.",
    ])

    async def fake_dep():
        return fake_llm

    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._ddg_search", return_value=fake_results):
            app.dependency_overrides[llm_service_dep] = fake_dep
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    resp = await c.post("/api/v1/chat", json={
                        "message": "anything",
                        "mode_id": "assistant",
                    })
            finally:
                app.dependency_overrides.pop(llm_service_dep, None)

    assert resp.status_code == 200
    assert "after retry" in resp.json()["response"]
    assert len(fake_llm.calls) == 3, (
        f"expected 3 LLM calls (wrong-arg, correct-arg, final), got {len(fake_llm.calls)}"
    )


class _CaptureBroadcaster:
    """Stand-in AvatarBroadcaster that records every payload it would broadcast.
    connection_count > 0 so the early-return-when-no-clients branch in
    _broadcast_avatar_state doesn't suppress the call."""

    def __init__(self) -> None:
        self.connection_count = 1
        self.payloads: List[dict] = []

    async def broadcast(self, payload: dict) -> None:
        self.payloads.append(dict(payload))


@pytest.mark.asyncio
async def test_chat_broadcasts_searching_state_during_web_search(fresh_registry):
    """Per Metis: real Skills (web_search 200-2000ms) MUST broadcast
    agentState='searching' so the UE5 avatar shows a searching state instead
    of freezing during dispatch. Pins the on_tool_start callback wiring at
    the chat() callsite."""
    from app.main import app

    capture = _CaptureBroadcaster()
    fake_results = [{"title": "x", "href": "https://x", "body": "."}]
    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "search_web", "arguments": {"query": "test"}}</tool_call>',
        "Final answer.",
    ])

    async def fake_dep():
        return fake_llm

    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._ddg_search", return_value=fake_results):
            with patch("app.api.chat.get_avatar_broadcaster", return_value=capture):
                app.dependency_overrides[llm_service_dep] = fake_dep
                try:
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                        await c.post("/api/v1/chat", json={
                            "message": "anything",
                            "mode_id": "assistant",
                        })
                finally:
                    app.dependency_overrides.pop(llm_service_dep, None)

    states = [p.get("agentState") for p in capture.payloads if "agentState" in p]
    assert "searching" in states, (
        f"expected agentState='searching' broadcast during web_search dispatch, got: {states}"
    )


@pytest.mark.asyncio
async def test_chat_broadcasts_writing_state_during_add_card(fresh_registry, isolated_flashcards):
    """Per Metis: spaced_repetition tools (add_card / review_card) write to
    the DB — UE5 should see agentState='writing' so a different idle
    animation can play vs web search. Pins the per-skill state mapping."""
    from app.main import app

    capture = _CaptureBroadcaster()
    fake_llm = _ScriptedLLM(scripted=[
        '<tool_call>{"name": "add_card", "arguments": {"front": "pes", "back": "dog"}}</tool_call>',
        "Pridané.",
    ])

    async def fake_dep():
        return fake_llm

    with patch("app.api.chat.get_avatar_broadcaster", return_value=capture):
        app.dependency_overrides[llm_service_dep] = fake_dep
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.post("/api/v1/chat", json={
                    "message": "Pridaj kartičku",
                    "mode_id": "tutor_practice",
                })
        finally:
            app.dependency_overrides.pop(llm_service_dep, None)

    states = [p.get("agentState") for p in capture.payloads if "agentState" in p]
    assert "writing" in states, (
        f"expected agentState='writing' broadcast during add_card dispatch, got: {states}"
    )
