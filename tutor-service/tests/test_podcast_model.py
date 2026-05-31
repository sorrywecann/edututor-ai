"""Phase Podcast Task 1 — pin the Podcast model contract.

Podcast is the generation-job-state row created when a user requests
podcast audio from selected knowledge-base documents and notes. It
mirrors the TransformationResult pattern (app/models/transformation.py:31-45)
with UUID PK, string-status with "pending" default, and FK references
with ON DELETE CASCADE.

Phase 8a FK invariant: user_id references users.id with ON DELETE CASCADE,
same pattern as Flashcard.user_id (Phase 8a) and UserProfile.user_id
(Phase 8b). knowledge_base_id references knowledge_bases.id with the same
cascade.

Test isolation: each async test opens a fresh AsyncSession. The
session-scoped conftest fixture ensures all tables exist before any
test in this module runs.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import inspect, text

from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase
from app.models.podcast import Podcast


async def _create_user(session) -> str:
    """Create a bare anonymous user row and return its id."""
    user_id = str(uuid.uuid4())
    session.add(User(id=user_id, is_anonymous=True))
    await session.flush()
    return user_id


async def _create_knowledge_base(session) -> str:
    """Create a bare knowledge base row and return its id."""
    kb_id = str(uuid.uuid4())
    session.add(
        KnowledgeBase(
            id=kb_id,
            name=f"test-kb-{kb_id[:8]}",
            weaviate_collection="test",
        )
    )
    await session.flush()
    return kb_id


@pytest.mark.asyncio
async def test_podcast_table_created_with_user_fk():
    """Podcast row inserts cleanly with FK references and cascades on user delete.

    Contract pinned:
    - A Podcast row can reference a valid User and KnowledgeBase without FK violation.
    - The ON DELETE CASCADE clause is present on the model definition (schema-level).
    - When the referenced User is deleted, the Podcast row is cascade-deleted
      (ON DELETE CASCADE on user_id FK, verified at the DB level with SQLite
      PRAGMA foreign_keys enabled).

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5 -- Phase 8a FK invariant
    extends to the new Podcast table.
    """
    podcast_mapper = inspect(Podcast)
    user_col = podcast_mapper.columns["user_id"]
    user_fks = list(user_col.foreign_keys)
    assert len(user_fks) == 1
    assert user_fks[0].ondelete == "CASCADE"

    async with AsyncSessionLocal() as session:
        await session.execute(text("PRAGMA foreign_keys = ON"))

        user_id = await _create_user(session)
        kb_id = await _create_knowledge_base(session)

        podcast = Podcast(knowledge_base_id=kb_id, user_id=user_id)
        session.add(podcast)
        await session.flush()

        assert podcast.id is not None
        assert podcast.knowledge_base_id == kb_id
        assert podcast.user_id == user_id

        pid = podcast.id

        user = await session.get(User, user_id)
        assert user is not None
        await session.delete(user)
        await session.flush()

        session.expire_all()
        deleted = await session.get(Podcast, pid)
        assert deleted is None


@pytest.mark.asyncio
async def test_podcast_defaults_match_transformation_pattern():
    """Podcast defaults mirror TransformationResult convention.

    Contract pinned:
    - status defaults to "pending" (TransformationResult convention)
    - format defaults to "summary"
    - source_ids and note_ids default to "[]" (JSON string of empty array)
    - script, audio_path, duration_ms, error all default to None
    - All other string fields have sensible defaults (no nullable-without-default gaps)

    Pattern reference: app/models/transformation.py:31-45 -- same UUID PK,
    string-status with "pending" default, nullable Text/var-length columns.
    """
    async with AsyncSessionLocal() as session:
        user_id = await _create_user(session)
        kb_id = await _create_knowledge_base(session)

        podcast = Podcast(knowledge_base_id=kb_id, user_id=user_id)
        session.add(podcast)
        await session.flush()

        assert podcast.status == "pending"
        assert podcast.format == "summary"
        assert podcast.title == "Podcast"
        assert podcast.voice_id == "sk-SK-LukasNeural"
        assert podcast.provider == "edge"
        assert podcast.source_ids == "[]"
        assert podcast.note_ids == "[]"
        assert podcast.script is None
        assert podcast.audio_path is None
        assert podcast.duration_ms is None
        assert podcast.error is None
