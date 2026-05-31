"""MemorySkill — per-user cross-session memory tool surface.

Two tools:
  recall_memory(query)         — semantic search of past conversation summaries
  update_profile(field, value) — tutor explicitly writes a fact to the user profile

Both receive user_id from SkillRegistry.dispatch (Phase 8a contract, see
tutor-service/app/skills/__init__.py:90-115 for signature inspection).
Both gracefully degrade — return strings the LLM can show or summarize,
never raise.

Architected by oracle ses_1e1a840c2ffe7ETrA1fPkjZv6b for Phase 8b plan.
"""
from __future__ import annotations

from typing import List

from app.skills.base import Skill, ToolDef
from app.services import episodic_memory_service, user_profile_service
from app.database import AsyncSessionLocal

_ALLOWED_FIELDS = ("display_name", "preferred_language", "target_language", "level_estimate", "goals")


class MemorySkill(Skill):
    name = "memory"
    description = "Recall prior conversations and update the per-user profile."

    async def _recall_memory(self, query: str, *, user_id: str) -> str:
        if not user_id:
            return "No user context — cannot recall."
        summaries = await episodic_memory_service.recall(user_id, query, top_k=3)
        if not summaries:
            return "No prior memories."
        return "Prior context:\n" + "\n".join(f"- {s}" for s in summaries)

    async def _update_profile(self, field: str, value: str, *, user_id: str) -> str:
        if not user_id:
            return "No user context — cannot update profile."
        if field not in _ALLOWED_FIELDS:
            return f"Unknown profile field: {field!r}. Allowed: {', '.join(_ALLOWED_FIELDS)}"
        async with AsyncSessionLocal() as session:
            await user_profile_service.upsert_profile(user_id, session, **{field: value})
            await session.commit()
        return f"Profile updated: {field}={value}"

    def tools(self) -> List[ToolDef]:
        return [
            ToolDef(
                name="recall_memory",
                description="Search past tutoring conversation summaries for relevant context. Use when the user references prior sessions or asks 'remember when we…'",
                parameters={
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "What to look for in past sessions"}},
                    "required": ["query"],
                },
                handler=self._recall_memory,
            ),
            ToolDef(
                name="update_profile",
                description=f"Save a fact to the persistent user profile. Allowed fields: {', '.join(_ALLOWED_FIELDS)}.",
                parameters={
                    "type": "object",
                    "properties": {
                        "field": {"type": "string", "enum": list(_ALLOWED_FIELDS), "description": "Which profile field to update"},
                        "value": {"type": "string", "description": "The new value"},
                    },
                    "required": ["field", "value"],
                },
                handler=self._update_profile,
            ),
        ]
