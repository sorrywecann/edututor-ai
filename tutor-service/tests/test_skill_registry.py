"""Pin the SkillRegistry contract that Phase 6c's tool-call loop and Phase
6d's LearningMode.enabled_skills both depend on.

These tests run on an isolated registry per case (not the process singleton)
to avoid cross-test pollution.
"""
from typing import List

import pytest

from app.skills import SkillRegistry, get_registry
from app.skills.base import Skill, ToolDef


class _DummySkill(Skill):
    name = "dummy"
    description = "A no-op skill used by tests."

    async def _handle_echo(self, text: str) -> str:
        return f"echo: {text}"

    def tools(self) -> List[ToolDef]:
        return [
            ToolDef(
                name="dummy_echo",
                description="Echo back the input string with a prefix.",
                parameters={
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                },
                handler=self._handle_echo,
            )
        ]


class _ConflictingSkill(Skill):
    name = "conflict"
    description = "Tries to register the same tool name as DummySkill."

    async def _handle_echo(self, text: str) -> str:
        return "shouldn't reach"

    def tools(self) -> List[ToolDef]:
        return [
            ToolDef(
                name="dummy_echo",
                description="Same tool name — should be rejected.",
                parameters={"type": "object", "properties": {"text": {"type": "string"}}},
                handler=self._handle_echo,
            )
        ]


def test_empty_registry_returns_no_tools():
    reg = SkillRegistry()
    assert reg.tools_for(["any", "skill"]) == []


def test_registering_skill_makes_tools_queryable():
    reg = SkillRegistry()
    reg.register(_DummySkill())
    schemas = reg.tools_for(["dummy"])
    assert len(schemas) == 1
    assert schemas[0]["type"] == "function"
    assert schemas[0]["function"]["name"] == "dummy_echo"


def test_unknown_skill_name_silently_returns_empty():
    """LearningMode.enabled_skills may reference skills not loaded in this
    deployment; the chat path must NOT crash on that — it should just get
    no tools for the unknown skill."""
    reg = SkillRegistry()
    reg.register(_DummySkill())
    schemas = reg.tools_for(["dummy", "not_loaded_skill"])
    assert len(schemas) == 1, "unknown skill name should not raise; just be skipped"


@pytest.mark.asyncio
async def test_dispatch_invokes_registered_handler():
    reg = SkillRegistry()
    reg.register(_DummySkill())
    result = await reg.dispatch("dummy_echo", {"text": "hello"})
    assert result == "echo: hello"


@pytest.mark.asyncio
async def test_dispatch_unknown_tool_raises_key_error():
    """Unknown tool name MUST raise KeyError so the chat tool-call loop can
    feed the error back as a system message and let the LLM recover."""
    reg = SkillRegistry()
    with pytest.raises(KeyError):
        await reg.dispatch("not_a_real_tool", {})


def test_skill_name_collision_is_rejected():
    reg = SkillRegistry()
    reg.register(_DummySkill())
    with pytest.raises(ValueError, match="already registered"):
        reg.register(_DummySkill())


def test_tool_name_collision_is_rejected():
    """Two different skills cannot register the same tool name — the LLM
    dispatches by tool name, not by skill, so collisions are unresolvable."""
    reg = SkillRegistry()
    reg.register(_DummySkill())
    with pytest.raises(ValueError, match="already registered"):
        reg.register(_ConflictingSkill())


def test_skill_without_name_is_rejected():
    class _NamelessSkill(Skill):
        name = ""
        description = "broken"
        def tools(self) -> List[ToolDef]:
            return []

    reg = SkillRegistry()
    with pytest.raises(ValueError, match="non-empty 'name'"):
        reg.register(_NamelessSkill())


def test_tool_def_renders_openai_schema_correctly():
    """Pin the OpenAI function-calling schema shape — chat.py passes this
    verbatim to llm.generate(tools=...). A drift here would silently break
    every LLM call once Phase 6c lands."""
    async def _h(**_kwargs: object) -> str:
        return ""
    t = ToolDef(
        name="x",
        description="d",
        parameters={"type": "object"},
        handler=_h,
    )
    schema = t.to_openai_schema()
    assert schema["type"] == "function"
    assert schema["function"]["name"] == "x"
    assert schema["function"]["description"] == "d"
    assert schema["function"]["parameters"] == {"type": "object"}


def test_get_registry_returns_singleton():
    """Phase 6c reaches for get_registry() in chat.py; it must be a process
    singleton so all hot-paths see the same registered skills."""
    a = get_registry()
    b = get_registry()
    assert a is b
