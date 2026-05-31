"""User identity + preferences API.

`/user/me` exposes the user_id resolved by the Phase 8a UserIdentityMiddleware.
`/user/preferences` GET/POST stores the atmosphere-onboarding personality
choices (assistant name, user name, qualitative personality sliders) and any
future free-form prefs. Persists as JSON under ``./data/user_prefs/<user_id>.json``
keyed by user_id; no new SQLAlchemy table required.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


class UserMeResponse(BaseModel):
    user_id: str
    is_anonymous: bool
    display_name: str | None = None
    email: str | None = None


@router.get("/user/me", response_model=UserMeResponse)
async def user_me(request: Request, db: AsyncSession = Depends(get_db)) -> UserMeResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return UserMeResponse(user_id="", is_anonymous=True)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return UserMeResponse(user_id=user_id, is_anonymous=True)

    return UserMeResponse(
        user_id=user.id,
        is_anonymous=user.is_anonymous,
        display_name=user.name,
        email=user.email,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Preferences — atmosphere onboarding
# ─────────────────────────────────────────────────────────────────────────────

_PREFS_DIR = Path("./data/user_prefs")
_PREFS_LOCK = asyncio.Lock()


class UserPreferences(BaseModel):
    """Personality + identity choices captured during onboarding.

    All fields optional so the frontend can save incrementally. The qualitative
    sliders are 0..N integer indices (frontend decides label mapping).
    """
    user_name: str | None = Field(default=None, max_length=80)
    assistant_name: str | None = Field(default=None, max_length=80)
    formality: int | None = Field(default=None, ge=0, le=10)
    humor: int | None = Field(default=None, ge=0, le=10)
    directness: int | None = Field(default=None, ge=0, le=10)
    verbosity: int | None = Field(default=None, ge=0, le=10)
    interests: list[str] | None = Field(default=None, max_length=40)
    schedule: str | None = Field(default=None, max_length=40)
    # v0.7.0 (W5): user-supplied custom system prompt — appended after the
    # slider-derived persona block so it can refine tone without losing the
    # baseline. Limit 2000 chars to prevent context window abuse.
    custom_system_prompt: str | None = Field(default=None, max_length=2000)
    extra: dict[str, Any] | None = None


def _prefs_path(user_id: str) -> Path:
    # Defensive: only allow safe filename characters in user_id (it comes from
    # middleware but the file path is on disk; UUIDs and similar are fine).
    safe = "".join(c for c in user_id if c.isalnum() or c in "-_") or "anon"
    return _PREFS_DIR / f"{safe}.json"


def _load_prefs_sync(user_id: str) -> dict[str, Any]:
    path = _prefs_path(user_id)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read prefs for %s: %s", user_id, exc)
        return {}


def _save_prefs_sync(user_id: str, prefs: dict[str, Any]) -> None:
    _PREFS_DIR.mkdir(parents=True, exist_ok=True)
    path = _prefs_path(user_id)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(prefs, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


@router.get("/user/preferences", response_model=UserPreferences)
async def get_preferences(request: Request) -> UserPreferences:
    """Read this user's stored onboarding/personality preferences.

    Returns an all-null UserPreferences if nothing's been saved yet — callers
    use that to detect "first run".
    """
    user_id = getattr(request.state, "user_id", None) or "anon"
    async with _PREFS_LOCK:
        data = await asyncio.to_thread(_load_prefs_sync, user_id)
    return UserPreferences(**data) if data else UserPreferences()


@router.post("/user/preferences", response_model=UserPreferences)
async def update_preferences(prefs: UserPreferences, request: Request) -> UserPreferences:
    """Merge-update preferences. Fields set to null are ignored (not cleared),
    so the frontend can PATCH-style save just the field that changed.

    To explicitly clear a field, send it as the empty string (for strings) or
    an explicit empty list (for ``interests``).
    """
    user_id = getattr(request.state, "user_id", None) or "anon"
    incoming = prefs.model_dump(exclude_unset=True)
    if not incoming:
        raise HTTPException(status_code=400, detail="no fields to update")

    async with _PREFS_LOCK:
        existing = await asyncio.to_thread(_load_prefs_sync, user_id)
        merged = {**existing, **incoming}
        await asyncio.to_thread(_save_prefs_sync, user_id, merged)
    return UserPreferences(**merged)
