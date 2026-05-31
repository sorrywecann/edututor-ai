"""Phase 8b Task 10 — pin the MemorySkill tool-surface contract.

MemorySkill exposes two tools: recall_memory(query) and update_profile(field, value).
Both receive user_id from SkillRegistry.dispatch (Phase 8a contract — signature
inspection at app/skills/__init__.py:90-115 forwards user_id only to handlers that
declare it). Both degrade gracefully — no exception propagates to the caller, all
error paths return strings the LLM can consume or summarize.

Contracts pinned:
  - Skill metadata: name == "memory", non-empty description, exactly 2 tools with
    names {"recall_memory", "update_profile"}.
  - recall_memory JSON Schema: "query" is in properties and required.
  - update_profile JSON Schema: "field" has an enum of the 5 allowed fields; "value"
    is a string; both are in required.
  - recall_returns_no_memories: a brand-new user with no prior summaries gets
    "No prior memories." (not an exception, not []).
  - update_profile_rejects_unknown_field: a call with field="ssn" returns an error
    string starting "Unknown profile field" and writes nothing to the DB.
  - update_profile_persists_known_field: field="level_estimate", value="A2" returns
    the canonical "Profile updated: level_estimate=A2" string and a user_profile row
    exists in the DB with level_estimate="A2" after the call.

Test isolation:
  - Chroma tests reuse the session-scoped tmpdir override from test_memory_recall.py
    via a local session-scoped autouse fixture (same pattern — replaces
    _get_chroma_client in episodic_memory_service with a lambda pointing at tmpdir).
  - DB tests create a fresh User row inside each test so the user_profile FK
    constraint is satisfied; rows are not cleaned up (UUID uniqueness prevents
    cross-test collisions).

Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
"""
from __future__ import annotations

import uuid

import pytest

pytest.importorskip("chromadb")
# See test_memory_recall.py for the rationale on the manual try/except —
# sentence_transformers can raise RuntimeError (not ImportError) when its
# torchcodec dep fails to load against the host's ffmpeg major version.
try:
    import sentence_transformers  # noqa: F401
except Exception as exc:
    pytest.skip(
        f"sentence_transformers unavailable: {exc}",
        allow_module_level=True,
    )

import chromadb
from chromadb.config import Settings


@pytest.fixture(scope="session", autouse=True)
def _override_chroma_to_tempdir(tmp_path_factory):
    """Redirect episodic_memory_service to a temporary Chroma directory.

    Same pattern as test_memory_recall.py: replaces _get_chroma_client at the
    module level so all calls within this session use an isolated tmp client.
    Restored after the session so other modules run unaffected.
    """
    import app.services.episodic_memory_service as ems

    tmpdir = tmp_path_factory.mktemp("chroma_memory_skill")
    _test_client = chromadb.PersistentClient(
        path=str(tmpdir),
        settings=Settings(anonymized_telemetry=False),
    )

    original_fn = ems._get_chroma_client
    ems._get_chroma_client = lambda: _test_client
    yield _test_client
    ems._get_chroma_client = original_fn


async def _create_user_row(session) -> str:
    """Insert a bare anonymous User row and return its id (UUID string).

    Required before upsert_profile calls because user_profile.user_id has
    a FK constraint referencing users.id (Phase 8a contract, ON DELETE CASCADE).
    """
    from app.models.user import User

    user_id = str(uuid.uuid4())
    session.add(User(id=user_id, is_anonymous=True))
    await session.flush()
    return user_id


def test_metadata():
    """MemorySkill declares the correct name, a non-empty description, and
    exactly two tools with globally unique names recall_memory and update_profile.

    Contract pinned: startup.py registers MemorySkill under name "memory" and
    LearningMode.enabled_skills lists use that key. Tool names must be globally
    unique (SkillRegistry.register raises ValueError on collision) and must
    match what the LLM is trained to call.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.skills.memory.skill import MemorySkill

    skill = MemorySkill()
    assert skill.name == "memory"
    assert skill.description, "description must be non-empty"

    tools = skill.tools()
    assert len(tools) == 2

    tool_names = {t.name for t in tools}
    assert tool_names == {"recall_memory", "update_profile"}


def test_recall_memory_schema():
    """recall_memory ToolDef parameters JSON Schema exposes 'query' in both
    properties and required.

    Contract pinned: the LLM receives this schema verbatim in the OpenAI
    function-calling format. 'query' in required means the LLM must supply it;
    its presence in properties means the LLM can inspect its type/description.
    If this schema is malformed, the LLM will either call the tool incorrectly
    or refuse to call it at all.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.skills.memory.skill import MemorySkill

    skill = MemorySkill()
    recall_tool = next(t for t in skill.tools() if t.name == "recall_memory")

    params = recall_tool.parameters
    assert "query" in params["properties"]
    assert "query" in params["required"]


def test_update_profile_schema():
    """update_profile ToolDef parameters schema has 'field' with a 5-item enum
    and 'value' as a string; both are in required.

    Contract pinned: the field enum is the canonical allowed-fields gate — only
    the five fields listed here can be persisted by the LLM without going through
    the upsert_profile service directly. If the enum were wrong the LLM would
    attempt to update arbitrary columns. 'value' must be a string type so the
    LLM does not attempt to pass structured objects.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.skills.memory.skill import MemorySkill

    _EXPECTED_FIELDS = ("display_name", "preferred_language", "target_language", "level_estimate", "goals")

    skill = MemorySkill()
    update_tool = next(t for t in skill.tools() if t.name == "update_profile")

    params = update_tool.parameters
    props = params["properties"]

    assert set(props["field"]["enum"]) == set(_EXPECTED_FIELDS)
    assert props["value"]["type"] == "string"
    assert "field" in params["required"]
    assert "value" in params["required"]


@pytest.mark.asyncio
async def test_recall_returns_no_memories_for_new_user(_override_chroma_to_tempdir):
    """recall_memory handler returns 'No prior memories.' for a brand-new user.

    Contract pinned: the handler must never raise on an empty collection.
    episodic_memory_service.recall() returns [] for a user with no summaries;
    the handler converts that to a human-readable 'No prior memories.' string
    the LLM can relay to the user. This pins the graceful empty-state path that
    the chat hot-path relies on when a user starts their very first session.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.skills.memory.skill import MemorySkill

    skill = MemorySkill()
    uid = str(uuid.uuid4())
    result = await skill._recall_memory(query="anything", user_id=uid)
    assert result == "No prior memories."


@pytest.mark.asyncio
async def test_update_profile_rejects_unknown_field():
    """update_profile handler returns an error string for an unknown field name.

    Contract pinned: the _ALLOWED_FIELDS gate must reject any field not in the
    tuple — including sensitive fields like 'ssn', 'email', 'password' — and
    must do so WITHOUT touching the database (no row is created or modified).
    The returned string starts with 'Unknown profile field' so the LLM can
    surface a meaningful error without crashing the tool-call loop.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.database import AsyncSessionLocal
    from app.models.user_profile import UserProfile
    from app.skills.memory.skill import MemorySkill
    from sqlalchemy import select

    skill = MemorySkill()
    uid = str(uuid.uuid4())

    result = await skill._update_profile(field="ssn", value="123-45-6789", user_id=uid)
    assert result.startswith("Unknown profile field"), f"Got: {result!r}"

    # Verify no row was written for this user
    async with AsyncSessionLocal() as db:
        row = await db.execute(select(UserProfile).where(UserProfile.user_id == uid))
        assert row.scalar_one_or_none() is None, "update_profile must not write a row on field rejection"


@pytest.mark.asyncio
async def test_update_profile_persists_known_field():
    """update_profile handler writes level_estimate='A2' to the user_profile table.

    Contract pinned: a valid (field, value) pair must result in a committed
    user_profile row readable by a subsequent DB query. The return string is the
    canonical 'Profile updated: <field>=<value>' format the LLM uses to confirm
    the update to the tutor system prompt. If this round-trip fails, the tutor
    loses the ability to remember the user's progress level across sessions.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.models.user_profile import UserProfile
    from app.skills.memory.skill import MemorySkill
    from sqlalchemy import select

    skill = MemorySkill()

    async with AsyncSessionLocal() as db:
        uid = await _create_user_row(db)
        await db.commit()

    result = await skill._update_profile(field="level_estimate", value="A2", user_id=uid)
    assert result == "Profile updated: level_estimate=A2", f"Got: {result!r}"

    async with AsyncSessionLocal() as db:
        row_result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == uid)
        )
        profile = row_result.scalar_one_or_none()
        assert profile is not None, "user_profile row must exist after update_profile call"
        assert profile.level_estimate == "A2"
