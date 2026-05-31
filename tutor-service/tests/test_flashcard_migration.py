"""Phase 8a — pin Flashcard.user_id migration from Phase 7's hardcoded 'default'.

These tests pin the data-preservation contract: anyone who used the
spaced_repetition tutor in Phase 7 had their flashcards stored with
user_id='default' (a string literal, no FK). Phase 8a's migration must
preserve those rows by reassigning them to a synthetic 'legacy user'
whose UUID is persisted to disk so the same identity is reused across
restarts.

Test isolation: each test uses a temporary path for the legacy_user_id
file via monkeypatching LEGACY_USER_ID_FILE, then resets the conftest
shared SQLite DB by deleting flashcard rows manually. We do NOT try to
drop and recreate the whole schema because the conftest's
session-scoped autouse fixture would have already created tables.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import text

from app import database as db_module
from app.database import (
    AsyncSessionLocal,
    _backfill_legacy_default_flashcards,
    _resolve_legacy_user_id,
    create_tables,
)
from app.models.user import User


async def _seed_legacy_default_flashcards(n: int) -> None:
    async with AsyncSessionLocal() as session:
        for i in range(n):
            await session.execute(
                text(
                    "INSERT INTO flashcards (user_id, front, back, fsrs_state, due_at, "
                    "created_at, updated_at) VALUES "
                    "('default', :front, :back, '{}', :due_at, :now, :now)"
                ),
                {
                    "front": f"front-{i}",
                    "back": f"back-{i}",
                    "due_at": datetime.now(timezone.utc),
                    "now": datetime.now(timezone.utc),
                },
            )
        await session.commit()


async def _count_default_flashcards() -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT COUNT(*) FROM flashcards WHERE user_id = 'default'")
        )
        return result.scalar() or 0


async def _count_flashcards_for(user_id: str) -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT COUNT(*) FROM flashcards WHERE user_id = :uid"),
            {"uid": user_id},
        )
        return result.scalar() or 0


async def _delete_all_flashcards() -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(text("DELETE FROM flashcards"))
        await session.commit()


@pytest.fixture(autouse=True)
def _isolate_legacy_id_file(tmp_path, monkeypatch):
    """Each test gets its own legacy_user_id.txt path — no cross-test leakage."""
    fake_path = tmp_path / "legacy_user_id.txt"
    monkeypatch.setattr(db_module, "LEGACY_USER_ID_FILE", fake_path)
    monkeypatch.delenv("LEGACY_USER_ID", raising=False)
    yield


@pytest.mark.asyncio
async def test_default_rows_reassigned_to_legacy_user():
    """Phase-7 'default' flashcards are reassigned to a single legacy User row."""
    await _delete_all_flashcards()
    await _seed_legacy_default_flashcards(3)
    assert await _count_default_flashcards() == 3

    await create_tables()

    assert await _count_default_flashcards() == 0
    legacy_id = _resolve_legacy_user_id()
    uuid.UUID(legacy_id)
    assert await _count_flashcards_for(legacy_id) == 3
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM users WHERE id = :uid"),
            {"uid": legacy_id},
        )
        assert result.scalar_one_or_none() == legacy_id


@pytest.mark.asyncio
async def test_legacy_user_id_persists_across_boots():
    """Two consecutive boots produce the same legacy UUID via the persisted file."""
    await _delete_all_flashcards()
    await _seed_legacy_default_flashcards(1)

    await create_tables()
    first_id = _resolve_legacy_user_id()

    await _seed_legacy_default_flashcards(1)
    await create_tables()
    second_id = _resolve_legacy_user_id()

    assert first_id == second_id
    assert await _count_flashcards_for(first_id) == 2


@pytest.mark.asyncio
async def test_fresh_install_no_default_rows_creates_no_legacy_user():
    """Empty flashcards table -> backfill is a no-op, no legacy user created."""
    await _delete_all_flashcards()

    async with db_module.engine.begin() as conn:
        await conn.run_sync(_backfill_legacy_default_flashcards)

    assert not db_module.LEGACY_USER_ID_FILE.exists()
