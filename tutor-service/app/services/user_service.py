"""User identity helpers — anonymous-by-default user upsert.

Phase 8a extracted these helpers from `app/api/conversations.py` so the new
`user_identity_middleware` can share the exact same upsert semantics as the
existing `/conversations` endpoint. Behaviour is byte-identical to the prior
inline `_get_or_create_anon_user`.

The single function here is intentionally small — it is the join point
between the identity middleware and the existing conversations API.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_or_create_anon_user(user_id: str, db: AsyncSession) -> User:
    """Return existing User row or create an anonymous one with the given id.

    Idempotent. Safe to call concurrently — the worst case is two concurrent
    requests both seeing no row and both inserting; the second insert raises
    IntegrityError which the caller's transaction can roll back. In practice
    the Phase 8a middleware never races itself for the same user_id within a
    single process because each request resolves identity once.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(id=user_id, is_anonymous=True)
        db.add(user)
        await db.flush()
    return user
