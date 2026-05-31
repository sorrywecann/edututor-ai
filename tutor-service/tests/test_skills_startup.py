"""Pin Phase 7 startup wiring: both WebSearchSkill and SpacedRepetitionSkill
are registered in main.py's lifespan via register_default_skills(); unknown
skill names referenced by any LearningMode trigger a logged warning so typos
aren't silently swallowed by tools_for() at runtime.
"""
import logging
import pytest

from app.skills import get_registry


def test_register_default_skills_registers_both():
    """register_default_skills() registers both Phase 7 skills idempotently —
    calling twice MUST NOT raise even though SkillRegistry.register itself
    rejects duplicate names."""
    from app.skills.startup import register_default_skills
    get_registry().reset()
    register_default_skills()
    names = get_registry().known_skill_names()
    assert "web_search" in names
    assert "spaced_repetition" in names

    register_default_skills()
    names2 = get_registry().known_skill_names()
    assert names2.count("web_search") == 1
    assert names2.count("spaced_repetition") == 1


def test_validate_mode_skill_references_warns_on_unknown(caplog):
    """Unknown skill name in any LearningMode triggers WARNING-level log so
    config typos surface at boot. tools_for() silently ignores unknown names
    (correct for runtime safety) but that masks misspellings."""
    from app.skills.startup import register_default_skills, validate_mode_skill_references
    from app.config.learning_modes import LearningMode

    get_registry().reset()
    register_default_skills()

    fake_modes = {
        "test": LearningMode(
            id="test", label="t", description="d", ui_locale="en",
            stt_language="en", tts_voice="x", tts_provider="edge",
            tutor_name="t", tutor_color="#fff", system_prompt_file="en.md",
            greeting_instruction="g",
            enabled_skills=["web_serach"],
        ),
    }
    with caplog.at_level(logging.WARNING):
        validate_mode_skill_references(fake_modes)

    assert any("web_serach" in rec.message for rec in caplog.records)


def test_validate_mode_skill_references_no_warning_when_valid(caplog):
    """When all referenced skills are registered, no WARNING fires — empty
    enabled_skills list is also fine (production sk/en/learn-en-from-sk)."""
    from app.skills.startup import register_default_skills, validate_mode_skill_references
    from app.config.learning_modes import LearningMode

    get_registry().reset()
    register_default_skills()

    fake_modes = {
        "ok": LearningMode(
            id="ok", label="t", description="d", ui_locale="en",
            stt_language="en", tts_voice="x", tts_provider="edge",
            tutor_name="t", tutor_color="#fff", system_prompt_file="en.md",
            greeting_instruction="g",
            enabled_skills=["web_search"],
        ),
        "empty": LearningMode(
            id="empty", label="t", description="d", ui_locale="en",
            stt_language="en", tts_voice="x", tts_provider="edge",
            tutor_name="t", tutor_color="#fff", system_prompt_file="en.md",
            greeting_instruction="g",
            enabled_skills=[],
        ),
    }
    with caplog.at_level(logging.WARNING):
        validate_mode_skill_references(fake_modes)

    typo_warnings = [r for r in caplog.records if "unknown skill" in r.message]
    assert typo_warnings == []
