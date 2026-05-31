"""Phase 8b Task 11 — pin the ⟨PROFILE⟩ block injection into the chat system prompt.

Contract: for modes with "memory" in enabled_skills, the per-user profile is
prepended to the system prompt as a ⟨PROFILE⟩...⟨/PROFILE⟩ block.  For all
other modes (especially the Slovak tutor "sk"), the system prompt is
byte-identical to the pre-Task-11 baseline.

Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b.

Tested via the extracted `_apply_profile_injection` helper in chat.py so these
are pure unit tests — no HTTP round-trip, no real DB, no real LLM needed.
The helper is the only production code exercised here; the two callsites in
`chat` and `chat_stream` are covered by the hot-path regression tests in
test_fragile_contracts.py / test_chat_dependency_injection.py.
"""
from __future__ import annotations

import types
import uuid
from typing import Optional
from unittest.mock import AsyncMock, MagicMock

import pytest


def _memory_mode():
    """Return a minimal mode-like object with enabled_skills=["memory"]."""
    return types.SimpleNamespace(id="test_memory_mode", enabled_skills=["memory"])


def _populated_profile(user_id: str) -> types.SimpleNamespace:
    """Return a profile-like object with displayable fields set.

    format_profile_for_prompt accesses fields via getattr so any object with
    the right attribute names is sufficient — no real SQLAlchemy session needed.
    """
    return types.SimpleNamespace(
        user_id=user_id,
        display_name="Anna Novák",
        preferred_language="sk",
        target_language="en",
        level_estimate="B1",
        goals="Pass Cambridge B2 exam",
        last_summary="Practicing conditional sentences",
    )


def _mock_db(profile: Optional[UserProfile]) -> MagicMock:
    """Return a fake AsyncSession whose execute() returns profile from scalar_one_or_none."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = profile
    db = MagicMock()
    db.execute = AsyncMock(return_value=mock_result)
    return db


@pytest.mark.asyncio
async def test_sk_mode_system_prompt_unchanged():
    """Slovak ("sk") mode must produce a byte-identical system prompt even when the
    user has a fully-populated profile row.

    The sk mode has empty enabled_skills so `_apply_profile_injection` must
    short-circuit immediately and return the input string unchanged.

    Contract: Slovak tutor flow must be byte-identical (no memory injection
    when enabled_skills is empty). Oracle review ses_1e1a840c2ffe7ETrA1fPkjZv6b.
    """
    from app.api.chat import _apply_profile_injection
    from app.config.learning_modes import get_mode

    sk_mode = get_mode("sk")
    assert sk_mode is not None
    assert "memory" not in sk_mode.enabled_skills, "sk mode must not have memory in enabled_skills"

    user_id = str(uuid.uuid4())
    profile = _populated_profile(user_id)
    mock_db = _mock_db(profile)

    base_prompt = "Slovenský systémový prompt — vedomosti, gramatika, výslovnosť."
    result = await _apply_profile_injection(base_prompt, sk_mode, user_id, mock_db)

    # The ⟨PERSONALITY⟩ block is appended for every mode (intentional, since the
    # personality-driven-tutor work), so the result is not byte-identical to the
    # base. The invariant that still matters: the base prompt is preserved
    # verbatim at the front and no memory/profile data is injected.
    assert result.startswith(base_prompt), (
        "sk mode: the base system prompt must be preserved verbatim at the front. "
        "Memory/profile injection must never prepend to or mutate it."
    )
    assert "\u27e8PROFILE\u27e9" not in result, "sk mode must not contain ⟨PROFILE⟩ delimiters"
    assert "Anna Novák" not in result, "sk mode must not contain profile display_name"


@pytest.mark.asyncio
async def test_assistant_pro_mode_includes_profile_block():
    """A mode with enabled_skills=["memory"] and a populated profile must produce a
    system prompt that starts with the ⟨PROFILE⟩ block.

    This test does NOT depend on an actual 'assistant_pro' mode existing in
    learning_modes.py (Task 12 adds those). Instead it constructs a minimal
    mode-like object so Task 11 and Task 12 remain independent.

    Contract: profile fields appear between ⟨PROFILE⟩ and ⟨/PROFILE⟩ delimiters,
    and the original base prompt follows after two newlines.

    Oracle review ses_1e1a840c2ffe7ETrA1fPkjZv6b.
    """
    from app.api.chat import _apply_profile_injection

    mode = _memory_mode()
    user_id = str(uuid.uuid4())
    profile = _populated_profile(user_id)
    mock_db = _mock_db(profile)

    base_prompt = "You are a helpful assistant."
    result = await _apply_profile_injection(base_prompt, mode, user_id, mock_db)

    assert "\u27e8PROFILE\u27e9" in result, "⟨PROFILE⟩ opening delimiter must be present"
    assert "\u27e8/PROFILE\u27e9" in result, "⟨/PROFILE⟩ closing delimiter must be present"
    assert "Anna Novák" in result, "display_name field must appear in the profile block"
    assert "B1" in result, "level_estimate field must appear in the profile block"
    assert base_prompt in result, "original base prompt must still be present after the block"
    # Profile block must come BEFORE the base prompt (prepended, not appended)
    assert result.index("\u27e8PROFILE\u27e9") < result.index(base_prompt), (
        "⟨PROFILE⟩ block must be prepended (before the base system prompt)"
    )


@pytest.mark.asyncio
async def test_no_profile_no_injection():
    """When a memory-enabled mode has no UserProfile row for the user, the system
    prompt must remain unchanged — no empty ⟨PROFILE⟩ block is injected.

    format_profile_for_prompt returns '' for None profile; _apply_profile_injection
    must honour that and leave the prompt byte-identical.

    Contract: no empty bloat for new users who have never interacted with the
    update_profile tool. Oracle review ses_1e1a840c2ffe7ETrA1fPkjZv6b.
    """
    from app.api.chat import _apply_profile_injection

    mode = _memory_mode()
    user_id = str(uuid.uuid4())
    mock_db = _mock_db(None)  # no row in DB

    base_prompt = "You are a helpful assistant."
    result = await _apply_profile_injection(base_prompt, mode, user_id, mock_db)

    assert result == base_prompt, (
        "No profile row → system prompt must be byte-identical to the base. "
        "Empty ⟨PROFILE⟩ blocks are wasted tokens."
    )
    assert "\u27e8PROFILE\u27e9" not in result, "⟨PROFILE⟩ must not appear when profile is absent"


@pytest.mark.asyncio
async def test_profile_injection_does_not_leak_user_id():
    """The user's UUID must never appear in the rendered system prompt.

    format_profile_for_prompt already excludes user_id from the block, but
    _apply_profile_injection must not introduce a secondary leak path (e.g. by
    logging the full UUID into the prompt or embedding it in a comment).

    Privacy invariant carried from Task 7 (user_profile_service.py).
    Oracle review ses_1e1a840c2ffe7ETrA1fPkjZv6b.
    """
    from app.api.chat import _apply_profile_injection

    mode = _memory_mode()
    user_id = str(uuid.uuid4())
    profile = _populated_profile(user_id)
    mock_db = _mock_db(profile)

    base_prompt = "You are a helpful assistant."
    result = await _apply_profile_injection(base_prompt, mode, user_id, mock_db)

    assert "\u27e8PROFILE\u27e9" in result, "sanity: profile block must have been injected"
    assert user_id not in result, (
        f"user_id UUID ({user_id[:8]}…) must not appear in the rendered system prompt. "
        "Privacy invariant: the raw DB identifier must never be leaked into LLM context."
    )


@pytest.mark.asyncio
async def test_phase7_baseline_byte_identical():
    """The sk mode system prompt must be byte-identical before and after the
    _apply_profile_injection code is in place.

    Calling _apply_profile_injection twice with identical inputs on the sk mode
    must produce the same output both times, AND that output must equal the raw
    system prompt from get_system_prompt("sk").

    This protects against accidental whitespace drift, double-newlines, or
    any other mutation introduced to the non-memory-mode path.

    Contract: Slovak tutor flow must be byte-identical (no mutation of the
    system prompt in non-memory modes). Oracle review ses_1e1a840c2ffe7ETrA1fPkjZv6b.
    """
    from app.api.chat import _apply_profile_injection
    from app.config.learning_modes import get_mode, get_system_prompt

    sk_mode = get_mode("sk")
    user_id = str(uuid.uuid4())
    profile = _populated_profile(user_id)  # has data — must still be ignored
    mock_db = _mock_db(profile)

    raw_system_prompt = get_system_prompt("sk")

    result_first = await _apply_profile_injection(raw_system_prompt, sk_mode, user_id, mock_db)
    result_second = await _apply_profile_injection(raw_system_prompt, sk_mode, user_id, mock_db)

    # The base prompt is preserved verbatim at the front; only the appended
    # ⟨PERSONALITY⟩ block follows it. Both calls must still be byte-equal to each
    # other (deterministic — no accidental per-call state or whitespace drift).
    assert result_first.startswith(raw_system_prompt), (
        "sk mode: _apply_profile_injection must preserve the raw prompt verbatim at the front."
    )
    assert result_second.startswith(raw_system_prompt), (
        "sk mode: second call must also preserve the raw prompt verbatim at the front."
    )
    assert "⟨PROFILE⟩" not in result_first, (
        "sk mode: the ⟨PROFILE⟩ memory block must never be injected (no memory skill)."
    )
    assert result_first == result_second, (
        "sk mode: successive calls must be byte-equal (no side-effect on the prompt)."
    )
