"""Skill abstraction — the value type the chat tool-call loop dispatches against.

A Skill bundles a logical group of LLM-callable tools (OpenAI function-calling
schema) together with their async handlers. Examples (future):
    - MemorySkill: memory_recall(query)
    - SearchSkill: web_search(query), summarize_url(url)
    - CalendarSkill: get_events(range), create_event(args)

A Skill instance is registered into the SkillRegistry. The chat handler
queries the registry for the tools belonging to the active LearningMode's
enabled_skills list, injects the OpenAI function schemas into the LLM
call, then dispatches any tool calls back through the registry.

Phase 6b ships only this abstraction + the registry — no real skills yet.
Phase 7 introduces the first concrete Skill subclasses.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List


@dataclass(frozen=True)
class ToolDef:
    """A single LLM-callable tool, addressable by a globally unique name.

    The ``parameters`` dict is a JSON Schema fragment the LLM sees verbatim
    in OpenAI function-calling format. ``handler`` is the async callable
    that executes the tool — it must accept keyword arguments matching the
    ``parameters`` schema and return a string the LLM can read back.
    """

    name: str
    description: str
    parameters: Dict[str, Any]
    handler: Callable[..., Awaitable[str]]

    def to_openai_schema(self) -> Dict[str, Any]:
        """Render this tool as an OpenAI ``tools=[...]`` array entry."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class Skill(ABC):
    """Base class for a logical bundle of LLM-callable tools.

    Subclasses MUST override ``name``, ``description``, and ``tools()``.
    The ``name`` must match what LearningMode.enabled_skills lists; the
    ``description`` is shown to the LLM as part of the system prompt so
    the model knows when this skill is relevant.
    """

    name: str = ""
    description: str = ""

    @abstractmethod
    def tools(self) -> List[ToolDef]:
        """Return the list of tools this skill exposes to the LLM."""
