"""Pin the chat-side tool-call loop contract.

Phase 6c introduced ``_run_tool_loop()`` in app/api/chat.py — the prompt-based
multi-iteration tool-dispatch helper that turns the LLM into an agent. These
tests pin five contracts the rest of the platform depends on:

  1. Bypass-when-empty: with no tools, behaviour is byte-identical to a
     direct ``llm.generate(messages)`` call. The Slovak tutor flow today
     has zero skills enabled and must NOT see any change.
  2. Single-call dispatch: a single <tool_call> emission triggers exactly
     one registry dispatch, results are fed back, the LLM finishes.
  3. Multi-call dispatch: chained tool calls (A then B then final) all
     execute in order, max_iterations is respected.
  4. Error recovery: registry KeyError + handler exceptions are surfaced
     to the LLM as system messages so it can recover, not crash the chat.
  5. Callback hooks: on_tool_start / on_tool_end fire with correct args
     so the chat handler can broadcast agentState=searching during dispatch.
"""
from typing import List
from unittest.mock import AsyncMock

import pytest

from app.api.chat import _run_tool_loop, _tool_use_system_addendum
from app.skills import SkillRegistry, get_registry
from app.skills.base import Skill, ToolDef
from app.services.llm_service import ChatMessage, LLMService


class _FakeLLM(LLMService):
    """LLM stub that returns a scripted sequence of responses, one per call."""

    def __init__(self, scripted: List[str]) -> None:
        super().__init__()
        self._provider = "mock"
        self._scripted = list(scripted)
        self._calls: List[List[ChatMessage]] = []

    async def generate(
        self, messages, max_tokens=None, temperature=None, top_k=None, stream=False
    ) -> str:
        self._calls.append(list(messages))
        if not self._scripted:
            raise RuntimeError("FakeLLM ran out of scripted responses")
        return self._scripted.pop(0)


class _DummySearchSkill(Skill):
    name = "search"
    description = "Stub search skill for tests."

    def __init__(self) -> None:
        self.calls: List[str] = []

    async def _handle(self, query: str) -> str:
        self.calls.append(query)
        return f"[result for: {query}]"

    async def _failing(self, **_kw) -> str:
        raise RuntimeError("simulated tool failure")

    def tools(self) -> List[ToolDef]:
        return [
            ToolDef(
                name="search_query",
                description="Search the web for a query.",
                parameters={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
                handler=self._handle,
            ),
            ToolDef(
                name="failing_tool",
                description="Always raises — used to test recovery.",
                parameters={"type": "object", "properties": {}},
                handler=self._failing,
            ),
        ]


@pytest.fixture(autouse=True)
def _isolated_registry():
    """Each test gets a clean process-singleton registry; restore on teardown."""
    reg = get_registry()
    reg.reset()
    yield
    reg.reset()


@pytest.mark.asyncio
async def test_empty_tool_schemas_bypasses_loop_and_passes_messages_through():
    llm = _FakeLLM(["direct response no tools"])
    messages = [
        ChatMessage(role="system", content="you are helpful"),
        ChatMessage(role="user", content="hi"),
    ]
    result = await _run_tool_loop(llm=llm, messages=messages, tool_schemas=[])

    assert result == "direct response no tools"
    assert len(llm._calls) == 1, "empty-tools path must not loop"
    assert llm._calls[0] == messages, (
        "byte-identical pass-through: empty-tools must NOT mutate messages "
        "or inject the tool addendum"
    )


@pytest.mark.asyncio
async def test_single_tool_call_dispatches_and_finishes():
    skill = _DummySearchSkill()
    get_registry().register(skill)

    llm = _FakeLLM([
        '<tool_call>{"name": "search_query", "arguments": {"query": "Python"}}</tool_call>',
        "Python is a programming language. Sources: [result for: Python]",
    ])
    messages = [ChatMessage(role="user", content="What is Python?")]

    schemas = get_registry().tools_for(["search"])
    result = await _run_tool_loop(llm=llm, messages=messages, tool_schemas=schemas)

    assert "Python is a programming language" in result
    assert skill.calls == ["Python"], "tool handler received exactly the LLM's args"
    assert len(llm._calls) == 2, "one call to detect tool, one for final answer"


@pytest.mark.asyncio
async def test_callbacks_fire_with_correct_arguments():
    skill = _DummySearchSkill()
    get_registry().register(skill)
    llm = _FakeLLM([
        '<tool_call>{"name": "search_query", "arguments": {"query": "AI"}}</tool_call>',
        "Done.",
    ])
    on_start = AsyncMock()
    on_end = AsyncMock()

    schemas = get_registry().tools_for(["search"])
    await _run_tool_loop(
        llm=llm,
        messages=[ChatMessage(role="user", content="?")],
        tool_schemas=schemas,
        on_tool_start=on_start,
        on_tool_end=on_end,
    )

    on_start.assert_awaited_once_with("search_query")
    on_end.assert_awaited_once()
    args, _kwargs = on_end.await_args
    assert args[0] == "search_query"
    assert "[result for: AI]" in args[1]


@pytest.mark.asyncio
async def test_unknown_tool_name_is_recoverable_not_fatal():
    skill = _DummySearchSkill()
    get_registry().register(skill)
    llm = _FakeLLM([
        '<tool_call>{"name": "not_registered", "arguments": {}}</tool_call>',
        "Sorry, I tried a tool that does not exist.",
    ])
    schemas = get_registry().tools_for(["search"])
    result = await _run_tool_loop(
        llm=llm,
        messages=[ChatMessage(role="user", content="?")],
        tool_schemas=schemas,
    )
    assert "Sorry" in result, "LLM must get the chance to apologise after KeyError"


@pytest.mark.asyncio
async def test_handler_exception_is_recoverable_not_fatal():
    skill = _DummySearchSkill()
    get_registry().register(skill)
    llm = _FakeLLM([
        '<tool_call>{"name": "failing_tool", "arguments": {}}</tool_call>',
        "I noticed the tool failed; here is a manual answer.",
    ])
    schemas = get_registry().tools_for(["search"])
    result = await _run_tool_loop(
        llm=llm,
        messages=[ChatMessage(role="user", content="?")],
        tool_schemas=schemas,
    )
    assert "manual answer" in result, "handler exception must NOT crash chat"


@pytest.mark.asyncio
async def test_malformed_tool_call_json_is_recoverable():
    """A malformed <tool_call> blob does NOT raise — it appends a system
    message asking the LLM to retry without a tool, and the loop continues.
    The LLM gets up to max_iterations=4 attempts before falling back."""
    skill = _DummySearchSkill()
    get_registry().register(skill)
    llm = _FakeLLM([
        '<tool_call>{"name": broken-json-here}</tool_call>',
        "Without a tool, the answer is X.",
        "fallback (should not be reached on the happy retry path)",
        "fallback 2",
        "fallback 3 (max_iterations=4 absolute cap)",
    ])
    schemas = get_registry().tools_for(["search"])
    result = await _run_tool_loop(
        llm=llm,
        messages=[ChatMessage(role="user", content="?")],
        tool_schemas=schemas,
    )
    assert "answer is X" in result, (
        "after the parse error system-message, the LLM's next response is "
        "the final answer (no tool call) and the loop returns it"
    )


@pytest.mark.asyncio
async def test_max_iterations_terminates_loop():
    """Defensive: an LLM that never stops calling tools must NOT spin forever.

    With max_iterations=2 and an LLM that keeps emitting tool calls, the loop
    runs 2 in-loop iterations (consuming script[0] and script[1]) then makes
    ONE final llm.generate() call (consuming script[2]) whose response is
    returned verbatim — even if it's still a tool-call string. The point is
    the loop terminates, not that the result is clean.
    """
    skill = _DummySearchSkill()
    get_registry().register(skill)

    infinite = ['<tool_call>{"name": "search_query", "arguments": {"query": "x"}}</tool_call>'] * 50
    llm = _FakeLLM(infinite)
    schemas = get_registry().tools_for(["search"])

    result = await _run_tool_loop(
        llm=llm,
        messages=[ChatMessage(role="user", content="?")],
        tool_schemas=schemas,
        max_iterations=2,
    )
    assert "<tool_call>" in result, (
        "with max_iterations=2 hit and infinite tool calls, the loop returns "
        "the last response verbatim — termination is the contract, clean text isn't"
    )
    assert len(llm._calls) == 3, "2 in-loop iterations + 1 forced final llm.generate()"


@pytest.mark.asyncio
async def test_addendum_lists_each_registered_tool():
    skill = _DummySearchSkill()
    get_registry().register(skill)
    schemas = get_registry().tools_for(["search"])
    addendum = _tool_use_system_addendum(schemas)

    assert "search_query" in addendum
    assert "failing_tool" in addendum
    assert "<tool_call>" in addendum, "addendum must teach the LLM the wire format"


@pytest.mark.asyncio
async def test_addendum_is_empty_string_when_no_tools():
    """Phase 6c bypass-when-empty: zero tools = zero addendum = no system
    prompt mutation. Slovak tutor flow today depends on this."""
    addendum = _tool_use_system_addendum([])
    assert addendum == ""


@pytest.mark.asyncio
async def test_chat_handler_uses_skill_registry_when_mode_has_skills(monkeypatch):
    """Phase 6c integration verification: /chat handler MUST route through
    _run_tool_loop when the active LearningMode has enabled_skills. Phase 6c
    landed the helper but the chat handler integration was completed in a
    follow-up — this test pins that integration so a future refactor cannot
    silently revert to direct llm.generate(messages) and skip tool dispatch.
    """
    from httpx import AsyncClient, ASGITransport
    from unittest.mock import patch
    import app.config.learning_modes as lm_module
    from app.config.learning_modes import LearningMode
    from app.deps import llm_service_dep
    from app.skills.base import Skill, ToolDef

    skill = _DummySearchSkill()
    get_registry().register(skill)

    skill_mode = LearningMode(
        id="skill-test", label="Skill Test", description="",
        ui_locale="en", stt_language="en", tts_voice="af_heart",
        tts_provider="kokoro", tutor_name="Test", tutor_color="#000000",
        system_prompt_file="en.md", greeting_instruction="Start.",
        enabled_skills=["search"], agent_type="assistant",
    )

    real_get_mode = lm_module.get_mode
    def fake_get_mode(mode_id):
        if mode_id == "skill-test":
            return skill_mode
        return real_get_mode(mode_id)
    monkeypatch.setattr(lm_module, "get_mode", fake_get_mode)
    import app.api.chat as chat_module
    monkeypatch.setattr(chat_module, "get_mode", fake_get_mode)

    fake_llm = _FakeLLM([
        '<tool_call>{"name": "search_query", "arguments": {"query": "test"}}</tool_call>',
        "Final answer using the search result.",
    ])

    async def fake_dep():
        return fake_llm

    from app.main import app
    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat", json={
                "message": "what is python?",
                "language": "en",
                "mode_id": "skill-test",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert "Final answer" in data["response"], (
            "chat() did not route through _run_tool_loop when enabled_skills "
            "was non-empty. The skill's tool was never dispatched. Phase 6c "
            "integration is broken."
        )
        assert skill.calls == ["test"], (
            "search_query handler was not invoked — tool dispatch broke"
        )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)
