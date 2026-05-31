"""User profile CRUD service — per-user structured profile store.

Called from two Phase 8b callsites:
  - Task 10 (chat hot-path): format_profile_for_prompt() converts the profile
    into a <PROFILE> block prepended to the system prompt so the tutor has
    context about the learner.
  - Task 11 (update_profile skill tool): upsert_profile() persists
    tutor-observed facts to the user_profile table.

get_profile and upsert_profile are async and require an AsyncSession caller.
format_profile_for_prompt is synchronous — no DB access, safe to call inline
during system-prompt construction.

Privacy invariant: format_profile_for_prompt MUST NOT include user_id in its
output. The raw DB identifier must never be leaked into LLM context.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_profile import UserProfile

# Ordered list of profile fields rendered in the <PROFILE> block.
# user_id intentionally absent — privacy invariant pinned by test_user_profile.py.
_DISPLAYABLE_FIELDS = (
    "display_name",
    "preferred_language",
    "target_language",
    "level_estimate",
    "goals",
    "last_summary",
)


async def get_profile(user_id: str, db: AsyncSession) -> Optional[UserProfile]:
    """Return the UserProfile for user_id, or None if no row exists.

    Does not raise on a missing row. Other DB errors propagate to the caller
    so the chat hot-path can degrade gracefully (empty prompt block) while
    unexpected errors are not silently swallowed.
    """
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def upsert_profile(
    user_id: str, db: AsyncSession, **fields: object
) -> UserProfile:
    """Insert a new UserProfile or update the existing one with the given fields.

    First call for a user_id creates the row. Subsequent calls update only the
    provided keyword fields — unspecified fields are left unchanged. Callers
    must commit the session after this returns.
    """
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = UserProfile(user_id=user_id, **fields)
        db.add(profile)
    else:
        for key, value in fields.items():
            setattr(profile, key, value)
    await db.flush()
    return profile


def format_profile_for_prompt(profile: Optional[UserProfile]) -> str:
    """Render a UserProfile as a \u27e8PROFILE\u27e9 block for injection into a system prompt.

    Returns '' when profile is None or all displayable fields are None.
    Returns a delimited block otherwise. user_id is never included (privacy invariant).
    """
    if profile is None:
        return ""

    lines = [
        f"{field}: {getattr(profile, field)}"
        for field in _DISPLAYABLE_FIELDS
        if getattr(profile, field, None) is not None
    ]

    if not lines:
        return ""

    return "\u27e8PROFILE\u27e9\n" + "\n".join(lines) + "\n\u27e8/PROFILE\u27e9"
