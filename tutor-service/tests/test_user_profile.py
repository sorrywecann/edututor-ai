"""Phase 8b Task 7 — pin the user_profile table and service contract.

UserProfile is the structured per-user data store introduced in Phase 8b.
It replaces ad-hoc note-taking by capturing slow-moving facts (display name,
language preferences, skill estimate, goals, last session summary) that persist
across sessions. Phase 8b Tasks 10 and 11 build on this foundation:
  - Task 10: format_profile_for_prompt() is inserted as a <PROFILE> block
    into the system prompt at the start of every chat session.
  - Task 11: the update_profile skill tool calls upsert_profile() to persist
    tutor-observed updates.

Privacy invariant: user_id MUST NOT appear in the formatted output so that
the raw DB identifier is never leaked into LLM context or chat history.

Test isolation: each async test opens a fresh AsyncSession. The session-scoped
conftest fixture ensures all tables (including user_profile) exist before any
test in this module runs.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select, text

from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services.user_profile_service import (
    format_profile_for_prompt,
    get_profile,
    upsert_profile,
)


async def _create_user(session) -> str:
    """Create a bare anonymous user row and return its id."""
    user_id = str(uuid.uuid4())
    session.add(User(id=user_id, is_anonymous=True))
    await session.flush()
    return user_id


@pytest.mark.asyncio
async def test_get_profile_returns_none_for_new_user():
    """get_profile returns None when no user_profile row exists for the user.

    Contract pinned: callers in chat.py must treat None as 'no profile yet'
    and produce an empty prompt block rather than raising. This pins that
    get_profile never raises on a missing row — it returns None, consistent
    with scalar_one_or_none() semantics used throughout the codebase (e.g.
    user_service.get_or_create_anon_user, Phase 8a).
    """
    async with AsyncSessionLocal() as db:
        user_id = await _create_user(db)
        await db.commit()

        result = await get_profile(user_id, db)
        assert result is None


@pytest.mark.asyncio
async def test_upsert_profile_creates_then_updates():
    """upsert_profile creates a new row on first call, updates it on second call.

    Contract pinned: exactly one user_profile row exists per user regardless of
    how many times upsert_profile is called. This prevents duplicate rows from
    corrupting the profile (which would break the single-row SELECT in
    get_profile and format_profile_for_prompt). Mirrors the idempotent upsert
    pattern established in user_service.get_or_create_anon_user (Phase 8a).
    """
    async with AsyncSessionLocal() as db:
        user_id = await _create_user(db)
        await db.commit()

        profile = await upsert_profile(user_id, db, display_name="Alica")
        await db.commit()
        assert profile.display_name == "Alica"
        assert profile.user_id == user_id

        profile = await upsert_profile(
            user_id, db, display_name="Alica K.", preferred_language="sk"
        )
        await db.commit()
        assert profile.display_name == "Alica K."
        assert profile.preferred_language == "sk"

        count_result = await db.execute(
            select(func.count(UserProfile.user_id)).where(
                UserProfile.user_id == user_id
            )
        )
        assert count_result.scalar() == 1


@pytest.mark.asyncio
async def test_format_profile_returns_empty_string_for_none():
    """format_profile_for_prompt returns '' for None input and for all-None fields.

    Contract pinned: the caller (chat.py hot-path, Task 10) must be able to
    prefix-concat the output onto a system prompt without extra guards — an empty
    string is safe to concat. This test pins both branches: None profile object
    and a profile object where every displayable field is None.
    """
    assert format_profile_for_prompt(None) == ""

    dummy = UserProfile(user_id="dummy-id")
    assert format_profile_for_prompt(dummy) == ""


@pytest.mark.asyncio
async def test_format_profile_returns_block_when_set():
    """format_profile_for_prompt returns a <PROFILE> block for non-empty profiles.

    Contract pinned:
    - Output must open with exactly '\u27e8PROFILE\u27e9' and close with '\u27e8/PROFILE\u27e9'.
    - Each non-None displayable field appears as 'key: value'.
    - user_id MUST NOT appear anywhere in the output (privacy / LLM-leak prevention).
      This is a hard invariant: the raw DB UUID must never flow into LLM context.
    """
    profile = UserProfile(
        user_id="must-not-appear",
        display_name="Alica",
        preferred_language="sk",
    )
    result = format_profile_for_prompt(profile)

    assert result.startswith("\u27e8PROFILE\u27e9")
    assert result.endswith("\u27e8/PROFILE\u27e9")
    assert "display_name: Alica" in result
    assert "preferred_language: sk" in result
    assert "must-not-appear" not in result
    assert "user_id" not in result


@pytest.mark.asyncio
async def test_profile_cascades_on_user_delete():
    """Deleting a User row also deletes the associated UserProfile row (ON DELETE CASCADE).

    Contract pinned: user_profile.user_id has ForeignKey('users.id', ondelete='CASCADE').
    Without this the Phase 8b profile accumulates orphan rows as anonymous users
    churn, leaking PII and inflating the DB size. Matches the same CASCADE guarantee
    on Flashcard.user_id introduced in Phase 8a (see test_flashcard_migration.py).

    SQLite FK enforcement is off by default. `PRAGMA foreign_keys` is also a
    no-op once a transaction has begun, so issuing it through the session (which
    auto-begins on first execute) silently does nothing — which is why a plain
    `db.execute("PRAGMA foreign_keys = ON")` never actually enabled it. Enable
    it on the raw DBAPI connection via a connect listener scoped to THIS test,
    then remove it: enforcement must not leak into other tests, several of which
    insert intentional orphan rows (e.g. the legacy-flashcard migration).
    """
    from sqlalchemy import event

    from app.database import engine

    def _enable_fk(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    event.listen(engine.sync_engine, "connect", _enable_fk)
    try:
        async with AsyncSessionLocal() as db:
            user_id = await _create_user(db)
            await db.commit()

            await upsert_profile(user_id, db, display_name="ToDelete")
            await db.commit()

            existing = await get_profile(user_id, db)
            assert existing is not None

            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one()
            await db.delete(user)
            await db.commit()

            count_result = await db.execute(
                select(func.count(UserProfile.user_id)).where(
                    UserProfile.user_id == user_id
                )
            )
            assert count_result.scalar() == 0
    finally:
        event.remove(engine.sync_engine, "connect", _enable_fk)
