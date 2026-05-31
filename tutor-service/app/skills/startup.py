"""Startup-time Skill registration + LearningMode reference validation.

Single place where Phase 7+ Skills are registered into the SkillRegistry.
register_default_skills() is idempotent — safe to call from main.py lifespan
AND from test fixtures that need a clean registry state.

validate_mode_skill_references walks every configured LearningMode and logs
a WARNING per unknown skill name. tools_for() silently ignores unknown names
at runtime (correct for runtime safety — a deployment may not have every
skill installed) but that silence masks misspellings, so this validation
surfaces them at boot.
"""
from __future__ import annotations

import logging
from typing import Mapping

from app.config.learning_modes import LearningMode
from app.skills import get_registry
from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
from app.skills.web_search import WebSearchSkill

logger = logging.getLogger(__name__)


def register_default_skills() -> None:
    registry = get_registry()
    known = set(registry.known_skill_names())
    if "web_search" not in known:
        registry.register(WebSearchSkill())
    if "spaced_repetition" not in known:
        registry.register(SpacedRepetitionSkill())
    if "memory" not in known:
        from app.skills.memory import MemorySkill
        registry.register(MemorySkill())


def validate_mode_skill_references(modes: Mapping[str, LearningMode]) -> None:
    registered = set(get_registry().known_skill_names())
    for mode in modes.values():
        for skill_name in getattr(mode, "enabled_skills", []) or []:
            if skill_name not in registered:
                logger.warning(
                    "LearningMode %r references unknown skill %r — typo or unregistered? "
                    "tools_for() will silently ignore it at runtime.",
                    mode.id, skill_name,
                )
