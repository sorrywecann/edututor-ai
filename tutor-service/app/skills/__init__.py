"""Skill registry — process-singleton holding all registered Skills.

Usage from chat.py::

    from app.skills import get_registry
    registry = get_registry()
    tool_schemas = registry.tools_for(["memory", "search"])  # OpenAI fn array
    if tool_schemas:
        result = await registry.dispatch(
            "memory_recall", {"query": "..."}, user_id=request.state.user_id,
        )

Phase 8a: dispatch() accepts an optional ``user_id`` keyword. Each
ToolDef's handler signature is inspected at registration time; the
registry only forwards ``user_id`` to handlers whose signature accepts
it. This keeps handlers like web_search (user-agnostic) free of
boilerplate while letting per-user handlers like spaced_repetition pin
their data to a real user.
"""
from __future__ import annotations

import inspect
import logging
from typing import Any, Dict, Iterable, List, Optional, Set

from app.skills.base import Skill, ToolDef

logger = logging.getLogger(__name__)


class SkillRegistry:
    """Process-singleton skill + tool registry.

    Skills are registered by name; each skill exposes one or more tools.
    The registry maintains a flat tool-name -> ToolDef map for O(1) dispatch
    and rejects collisions (two skills cannot register the same tool name).
    """

    def __init__(self) -> None:
        self._skills: Dict[str, Skill] = {}
        self._handlers: Dict[str, ToolDef] = {}
        self._handlers_accept_user_id: Set[str] = set()

    def register(self, skill: Skill) -> None:
        if not skill.name:
            raise ValueError("Skill must declare a non-empty 'name' attribute")
        if skill.name in self._skills:
            raise ValueError(
                f"Skill '{skill.name}' already registered. Skill names must be unique "
                f"and stable — they appear in LearningMode.enabled_skills config."
            )
        for tool in skill.tools():
            if tool.name in self._handlers:
                raise ValueError(
                    f"Tool '{tool.name}' already registered (would collide with skill "
                    f"'{self._tool_owner(tool.name)}'). Tool names must be globally unique "
                    f"because the LLM dispatches by tool name, not by skill."
                )
            self._handlers[tool.name] = tool
            if _handler_accepts_user_id(tool.handler):
                self._handlers_accept_user_id.add(tool.name)
        self._skills[skill.name] = skill
        logger.info(
            "Skill registered: %s (%d tool%s)",
            skill.name, len(skill.tools()), "" if len(skill.tools()) == 1 else "s",
        )

    def _tool_owner(self, tool_name: str) -> str:
        for skill_name, skill in self._skills.items():
            if any(t.name == tool_name for t in skill.tools()):
                return skill_name
        return "<unknown>"

    def tools_for(self, skill_names: Iterable[str]) -> List[Dict[str, Any]]:
        """Return OpenAI ``tools=[...]`` array for the named skills.

        Unknown skill names are silently ignored — callers (LearningMode)
        may reference skills that aren't loaded in this deployment, and
        that should not break the chat path.
        """
        out: List[Dict[str, Any]] = []
        for name in skill_names:
            skill = self._skills.get(name)
            if skill is None:
                continue
            for tool in skill.tools():
                out.append(tool.to_openai_schema())
        return out

    async def dispatch(
        self,
        tool_name: str,
        args: Dict[str, Any],
        *,
        user_id: Optional[str] = None,
    ) -> str:
        """Run a tool by name with the given keyword arguments.

        ``user_id`` is forwarded as a kwarg to handlers whose signature
        accepts it (detected once at registration time). Handlers that
        don't accept ``user_id`` are called with ``args`` only — this
        lets user-agnostic skills like web_search stay free of boilerplate
        while per-user skills like spaced_repetition get the caller's
        identity automatically.

        Raises ``KeyError`` for unknown tool names so the chat tool-call
        loop can surface the error back to the LLM as a system message
        (the LLM can then choose a different tool or recover).
        """
        tool = self._handlers.get(tool_name)
        if tool is None:
            raise KeyError(f"Unknown tool: {tool_name!r}")
        if user_id is not None and tool_name in self._handlers_accept_user_id:
            return await tool.handler(user_id=user_id, **args)
        return await tool.handler(**args)

    def known_skill_names(self) -> List[str]:
        return sorted(self._skills.keys())

    def reset(self) -> None:
        """Clear the registry. Test-only."""
        self._skills.clear()
        self._handlers.clear()
        self._handlers_accept_user_id.clear()


def _handler_accepts_user_id(handler) -> bool:
    try:
        sig = inspect.signature(handler)
    except (TypeError, ValueError):
        return False
    return "user_id" in sig.parameters


_registry: SkillRegistry | None = None


def get_registry() -> SkillRegistry:
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
    return _registry


__all__ = ["Skill", "ToolDef", "SkillRegistry", "get_registry"]
