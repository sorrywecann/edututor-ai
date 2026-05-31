"""Phase 8b Task 8 — pin the episodic memory service contract.

Per-user episodic memory stores prior conversation summaries in a dedicated
ChromaDB collection per user (edu_memory_<uid>).  The recall_memory tool
(Phase 8b Task 11) reads from these collections so the LLM can reference
what it already knows about the learner from past sessions.

Contracts pinned:
  - New user has no prior memory: recall() returns [] before any remember().
  - remember() + recall(): a stored summary can be retrieved by semantic query.
  - Per-user collection isolation: User A's memories are invisible to User B.
    This is the CRITICAL invariant — a data-leak here breaks privacy entirely.
    - Graceful degradation: ChromaDB init failure → recall() returns [], no
    exception propagates to the caller.  Follows the asymmetric DI pattern:
    failures in optional context must not crash the hot path.
  - Idempotent upsert: calling remember() twice with the same conversation_id
    stores exactly one document (upsert semantics); the second call wins.

Test isolation: a session-scoped fixture redirects all episodic memory Chroma
access to a tmp directory so tests cannot pollute data/chroma/. A function-
scoped cleanup fixture deletes each test's collections in teardown.

Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
"""
from __future__ import annotations

import uuid

import pytest

pytest.importorskip("chromadb")
# sentence_transformers imports torchcodec eagerly, which raises RuntimeError
# (not ImportError) if the host ffmpeg major version does not match the one
# torchcodec was built against — common on fresh-clone dev machines.
# pytest.importorskip only catches ImportError, so wrap manually to keep the
# suite green wherever the embedding stack is unavailable for any reason.
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

    Replaces the module-level _get_chroma_client function with a lambda that
    returns a client pointed at a session-scoped tmp dir.  This prevents any
    test collection from leaking into the real data/chroma/ store.  The
    original function is restored after the session so other test suites that
    run in the same process are unaffected.
    """
    import app.services.episodic_memory_service as ems

    tmpdir = tmp_path_factory.mktemp("chroma_episodic")
    _test_client = chromadb.PersistentClient(
        path=str(tmpdir),
        settings=Settings(anonymized_telemetry=False),
    )

    original_fn = ems._get_chroma_client
    ems._get_chroma_client = lambda: _test_client
    yield _test_client
    ems._get_chroma_client = original_fn


@pytest.fixture
def _cleanup(_override_chroma_to_tempdir):
    """Function-scoped fixture: register user IDs and delete their collections
    in teardown so tests cannot leak Chroma state into one another.
    """
    from app.services.episodic_memory_service import _collection_name

    _registered: list[str] = []

    def register(uid: str) -> str:
        _registered.append(uid)
        return uid

    yield register

    for uid in _registered:
        try:
            _override_chroma_to_tempdir.delete_collection(_collection_name(uid))
        except Exception:
            pass


@pytest.mark.asyncio
async def test_recall_empty_for_new_user(_cleanup):
    """recall() returns [] for a user who has never had remember() called.

    Contract pinned: the chat hot-path (Task 11 recall_memory tool) must
    tolerate an empty result list as 'no prior context' without crashing.
    This test pins that the empty-collection fast-path works for brand-new
    users who have not yet had any conversations summarised.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.services.episodic_memory_service import recall

    uid = _cleanup(str(uuid.uuid4()))
    result = await recall(uid, "anything")
    assert result == []


@pytest.mark.asyncio
async def test_remember_then_recall_returns_summary(_cleanup):
    """A summary stored via remember() can be retrieved via recall().

    Contract pinned: the round-trip from remember() to recall() must work
    end-to-end — the stored document must appear in the recall() results when
    the query is semantically related to the stored text.  Since there is only
    one document in the collection, the semantic threshold is not at risk;
    this test pins the mechanics of embed-upsert-query without relying on
    specific cosine-similarity margins.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.services.episodic_memory_service import recall, remember

    uid = _cleanup(str(uuid.uuid4()))
    await remember(uid, "Student studied perfectum", conversation_id="conv_a1")
    result = await recall(uid, "past tense")
    assert any("perfectum" in doc for doc in result)


@pytest.mark.asyncio
async def test_per_user_isolation(_cleanup):
    """CRITICAL: User A's memories are not visible to User B.

    Contract pinned: each user has a separate Chroma collection namespaced by
    _collection_name(user_id).  This test pins that no cross-collection leak
    can occur — User B's recall() call must never return documents belonging
    to User A, even when User B's collection is empty.  A regression here
    would be a privacy breach.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.services.episodic_memory_service import recall, remember

    uid_a = _cleanup(str(uuid.uuid4()))
    uid_b = _cleanup(str(uuid.uuid4()))

    await remember(uid_a, "secret-marker-aaa", conversation_id="conv_iso")
    result_b = await recall(uid_b, "anything about user a")

    assert all("secret-marker-aaa" not in doc for doc in result_b), (
        "User B's recall() must never contain User A's documents"
    )


@pytest.mark.asyncio
async def test_recall_handles_chromadb_init_failure_gracefully(monkeypatch):
    """recall() returns [] and does not raise when ChromaDB init fails.

    Contract pinned: the episodic memory service must degrade gracefully on
    any infrastructure failure — Chroma unavailable, disk full, permissions
    error — so that a failing episodic memory layer cannot crash the chat hot-
    path.  Follows the asymmetric DI pattern (see docs/adrs/001-asymmetric-DI.md):
    optional services log a warning and return safe defaults instead of propagating exceptions.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    import app.services.episodic_memory_service as ems
    from app.services.episodic_memory_service import recall

    def _failing_client():
        raise RuntimeError("Simulated ChromaDB init failure")

    monkeypatch.setattr(ems, "_get_chroma_client", _failing_client)

    result = await recall(str(uuid.uuid4()), "test query")
    assert result == []


@pytest.mark.asyncio
async def test_remember_idempotent_on_same_conversation_id(
    _cleanup, _override_chroma_to_tempdir
):
    """remember() called twice with the same conversation_id stores one document.

    Contract pinned: upsert semantics guarantee that replaying or retrying a
    remember() call (e.g. after a transient failure) does not create duplicate
    documents.  The second call must win — the stored document must reflect
    the second summary, not the first.  collection.count() must be 1, not 2.

    Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.services.episodic_memory_service import _collection_name, recall, remember

    uid = _cleanup(str(uuid.uuid4()))

    await remember(uid, "First summary content", conversation_id="conv1")
    await remember(uid, "Second summary content", conversation_id="conv1")

    col = _override_chroma_to_tempdir.get_collection(_collection_name(uid))
    assert col.count() == 1, "Upsert on same conversation_id must not create duplicates"

    results = await recall(uid, "summary")
    assert len(results) == 1
    assert results[0] == "Second summary content", (
        "Second upsert must overwrite the first document"
    )
