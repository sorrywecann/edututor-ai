"""Pin Phase 6d's LearningMode extension contract.

Two new fields landed: ``enabled_skills: list[str]`` and ``agent_type: str``.
These are the wires that connect:
  - Skill ABC + SkillRegistry (Phase 6b)
  - chat.py's _run_tool_loop (Phase 6c)
  - persona / avatar UI differentiation (Phase 6e+)

Backwards compatibility is the hard guarantee: every pre-existing mode must
load unchanged. The defaults (empty list, "tutor") make chat.py's tool loop
bypass entirely — Slovak tutor flow today is byte-identical to v0.
"""
import pytest

from app.config.learning_modes import LearningMode, get_default_mode, get_mode


def test_existing_sk_mode_loads_with_safe_defaults():
    """The 'sk' mode (production Slovak tutor) must load with empty skills
    and agent_type='tutor' so chat.py's tool loop bypasses entirely. A
    future config edit that breaks this would silently activate the tool
    loop on the Slovak production flow."""
    mode = get_mode("sk")
    assert mode is not None
    assert mode.enabled_skills == [], (
        "sk mode must NOT enable any skills until Phase 7 explicitly opts in"
    )
    assert mode.agent_type == "tutor"


def test_existing_en_mode_loads_with_safe_defaults():
    mode = get_mode("en")
    assert mode is not None
    assert mode.enabled_skills == []
    assert mode.agent_type == "tutor"


def test_default_mode_has_safe_defaults():
    mode = get_default_mode()
    assert mode.enabled_skills == []
    assert mode.agent_type == "tutor"


def test_custom_mode_can_specify_skills():
    """A future Phase 7 mode definition with enabled_skills = ['memory',
    'search'] must persist that list verbatim. Tools_for(mode.enabled_skills)
    is what chat.py reads."""
    mode = LearningMode(
        id="custom-test",
        label="Test",
        description="test mode",
        ui_locale="en",
        stt_language="en",
        tts_voice="af_heart",
        tts_provider="kokoro",
        tutor_name="Test",
        tutor_color="#000000",
        system_prompt_file="en.md",
        greeting_instruction="Hi.",
        enabled_skills=["memory", "search"],
        agent_type="assistant",
    )
    assert mode.enabled_skills == ["memory", "search"]
    assert mode.agent_type == "assistant"


def test_enabled_skills_default_is_isolated_per_instance():
    """Defensive: dataclass field(default_factory=list) prevents shared
    mutable default. Two LearningMode instances must NOT share the same
    underlying list — appending to one must not affect the other."""
    a = LearningMode(
        id="a", label="A", description="", ui_locale="en", stt_language="en",
        tts_voice="x", tts_provider="edge", tutor_name="A", tutor_color="#000",
        system_prompt_file="en.md", greeting_instruction="hi",
    )
    b = LearningMode(
        id="b", label="B", description="", ui_locale="en", stt_language="en",
        tts_voice="x", tts_provider="edge", tutor_name="B", tutor_color="#000",
        system_prompt_file="en.md", greeting_instruction="hi",
    )
    a.enabled_skills.append("memory")
    assert b.enabled_skills == [], (
        "shared mutable default leaked across instances — field() factory broke"
    )


def test_agent_type_accepts_documented_values():
    """The agent_type enum-as-doc lists 'tutor' | 'assistant' | 'researcher'
    | 'coach'. This test pins all four as accepted values so future avatar-
    animation code can switch on them safely."""
    for agent_type in ("tutor", "assistant", "researcher", "coach"):
        mode = LearningMode(
            id=f"type-{agent_type}", label=agent_type, description="",
            ui_locale="en", stt_language="en", tts_voice="x", tts_provider="edge",
            tutor_name="X", tutor_color="#000", system_prompt_file="en.md",
            greeting_instruction="hi", agent_type=agent_type,
        )
        assert mode.agent_type == agent_type


def test_assistant_mode_enables_web_search_only():
    """Phase 7 ships a new 'assistant' mode opting in to web_search alone.
    Bilingual (stt_language='auto'); English-leaning persona (Aria).
    MUST NOT enable spaced_repetition (that's tutor_practice's job)."""
    from app.config.learning_modes import get_all_modes
    modes = get_all_modes()
    assert "assistant" in modes
    a = modes["assistant"]
    assert a.enabled_skills == ["web_search"]
    assert a.agent_type == "assistant"


def test_tutor_practice_mode_enables_spaced_repetition_only():
    """Phase 7 ships a new 'tutor_practice' mode opting in to spaced_repetition
    alone. Slovak-only (Lukáš + Edge sk-SK voice). MUST NOT enable web_search
    (production avoids exposing the tutor to public-internet egress)."""
    from app.config.learning_modes import get_all_modes
    modes = get_all_modes()
    assert "tutor_practice" in modes
    t = modes["tutor_practice"]
    assert t.enabled_skills == ["spaced_repetition"]
    assert t.agent_type == "tutor"


def test_existing_modes_remain_skill_free_after_phase7():
    """Pin backwards compatibility: production sk/en/learn-en-from-sk modes
    MUST keep enabled_skills=[] and agent_type='tutor' so chat.py's tool loop
    bypasses for them. Byte-identical Slovak tutor flow is the hard contract."""
    from app.config.learning_modes import get_all_modes
    modes = get_all_modes()
    for mode_id in ("sk", "en", "learn-en-from-sk"):
        assert modes[mode_id].enabled_skills == [], (
            f"{mode_id} must not have enabled_skills modified by Phase 7"
        )
        assert modes[mode_id].agent_type == "tutor"


def test_assistant_pro_mode_exists_with_memory_skill():
    """Phase 8b adds 'assistant_pro' — memory-enabled variant of 'assistant'.

    Contract pinned (Oracle review ses_1e1a840c2ffe7ETrA1fPkjZv6b):
    - Additive only: base 'assistant' mode UNCHANGED (web_search only, no memory).
    - 'assistant_pro' enables both web_search and memory; agent_type='assistant'.
    - system_prompt_file must point to a file that exists on disk.
    - Slovak tutor flow byte-identical (unaffected by this addition).
    """
    import os
    from app.config.learning_modes import get_all_modes, PROMPTS_DIR
    modes = get_all_modes()

    assert "assistant_pro" in modes, "assistant_pro mode missing from learning_modes.py"
    p = modes["assistant_pro"]
    assert "memory" in p.enabled_skills
    assert "web_search" in p.enabled_skills
    assert p.agent_type == "assistant"

    prompt_path = os.path.join(PROMPTS_DIR, p.system_prompt_file)
    assert os.path.isfile(prompt_path), f"assistant_pro prompt file not found: {prompt_path}"

    a = modes["assistant"]
    assert a.enabled_skills == ["web_search"], (
        "base 'assistant' must stay web_search-only; memory belongs only in assistant_pro"
    )
    assert "memory" not in a.enabled_skills


def test_tutor_practice_pro_mode_exists_with_memory_skill():
    """Phase 8b adds 'tutor_practice_pro' — memory-enabled variant of 'tutor_practice'.

    Contract pinned (Oracle review ses_1e1a840c2ffe7ETrA1fPkjZv6b):
    - Additive only: base 'tutor_practice' mode UNCHANGED (spaced_repetition only, no memory).
    - 'tutor_practice_pro' enables both spaced_repetition and memory; agent_type='tutor'.
    - system_prompt_file must point to a file that exists on disk.
    - Slovak tutor flow byte-identical (unaffected by this addition).
    """
    import os
    from app.config.learning_modes import get_all_modes, PROMPTS_DIR
    modes = get_all_modes()

    assert "tutor_practice_pro" in modes, "tutor_practice_pro mode missing from learning_modes.py"
    t = modes["tutor_practice_pro"]
    assert "memory" in t.enabled_skills
    assert "spaced_repetition" in t.enabled_skills
    assert t.agent_type == "tutor"

    prompt_path = os.path.join(PROMPTS_DIR, t.system_prompt_file)
    assert os.path.isfile(prompt_path), f"tutor_practice_pro prompt file not found: {prompt_path}"

    tp = modes["tutor_practice"]
    assert tp.enabled_skills == ["spaced_repetition"], (
        "base 'tutor_practice' must stay spaced_repetition-only; memory belongs only in tutor_practice_pro"
    )
    assert "memory" not in tp.enabled_skills
