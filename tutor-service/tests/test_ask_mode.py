"""Phase 3.1 — Ask Mode endpoint contract tests.

Pins the wire shape and design intent of `POST /api/v1/knowledge-bases/{name}/ask`:
top-15 retrieval (wider than chat's top-5), Slovak citation instruction in
the system prompt, 404 for missing KB, Phase 8a user_id threading through
request.state, and the response shape the frontend relies on
({question, answer, sources, latency_ms}).

Architected by oracle ses_1de56909fffeJKK9qx7t926qvh during the 2026-05-13
Ask Mode refinement pass (Phase 3.1 of kb-overhaul) — the endpoint shipped
back in Apr 2026 but was test-naked until now.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import delete

from app.database import AsyncSessionLocal
from app.middleware.user_identity import HEADER_NAME
from app.models.knowledge_base import KnowledgeBase as KBModel
from app.services.llm_service import LLMService, ChatMessage


class _CapturingLLM(LLMService):
    def __init__(self, scripted: str = "Toto je odpoveď.") -> None:
        super().__init__()
        self._provider = "fake"
        self._available_providers = {"fake": True}
        self.captured_messages: List[List[ChatMessage]] = []
        self._scripted = scripted

    async def generate(self, messages, **_kwargs) -> str:
        self.captured_messages.append(list(messages))
        return self._scripted

    def get_system_prompt(self) -> str:
        return "Si vzdelávací asistent."


@pytest_asyncio.fixture
async def seeded_kb():
    """Create a KB, yield its name, clean up after."""
    from app.database import create_tables
    await create_tables()
    name = "ask-mode-test-kb"
    async with AsyncSessionLocal() as session:
        await session.execute(delete(KBModel).where(KBModel.name == name))
        await session.commit()
        kb = KBModel(
            name=name,
            description="ask mode test",
            weaviate_collection=f"{name}-col",
        )
        session.add(kb)
        await session.commit()
    yield name
    async with AsyncSessionLocal() as session:
        await session.execute(delete(KBModel).where(KBModel.name == name))
        await session.commit()


@pytest.fixture
def stub_rag_top_k(monkeypatch):
    """Capture the top_k arg the endpoint passes to RAG; return one synthetic chunk."""
    calls: Dict[str, Any] = {"top_k": None, "kb": None}

    from app.schemas.knowledge_base import ContextChunk
    stub_chunk = ContextChunk(
        chunk_id="stub-chunk-1",
        document_id="stub-doc-1",
        filename="doc.md",
        page=None,
        chunk_index=0,
        content="Toto je obsah stub dokumentu pre Ask Mode test.",
        score=0.9,
    )

    class _StubRAG:
        async def search_with_metadata(self, *, query, knowledge_base, top_k, similarity_threshold, document_ids):
            calls["top_k"] = top_k
            calls["kb"] = knowledge_base
            return [stub_chunk]

    async def _get_stub():
        return _StubRAG()

    monkeypatch.setattr("app.api.knowledge_bases.get_rag_service", _get_stub)
    return calls


@pytest.fixture
def stub_llm(monkeypatch):
    """Replace get_llm_service with a capturing LLM."""
    capturing = _CapturingLLM()

    async def _get_stub():
        return capturing

    monkeypatch.setattr("app.api.knowledge_bases.get_llm_service", _get_stub)
    return capturing


@pytest.fixture
def stub_active_ids(monkeypatch):
    """Make _resolve_active_document_ids return None (no doc filter)."""
    async def _stub(*_args, **_kwargs):
        return None
    monkeypatch.setattr("app.api.chat._resolve_active_document_ids", _stub)


@pytest.mark.asyncio
async def test_ask_returns_answer_and_sources_for_existing_kb(seeded_kb, stub_rag_top_k, stub_llm, stub_active_ids):
    """Happy path: POST returns 200 with {question, answer, sources, latency_ms}.

    Pins the response shape the frontend AskMode.tsx + api.askKnowledgeBase()
    method depend on. Changing any field name here breaks the UI silently."""
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/knowledge-bases/{seeded_kb}/ask",
            json={"question": "Ako sa máš?"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["question"] == "Ako sa máš?"
    assert body["answer"] == "Toto je odpoveď."
    assert isinstance(body["sources"], list)
    assert len(body["sources"]) == 1
    assert isinstance(body["latency_ms"], int)
    assert body["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_ask_returns_404_for_missing_kb(stub_rag_top_k, stub_llm, stub_active_ids):
    """POST to nonexistent KB returns 404 with informative detail.

    Pins the not-found behaviour so refactors don't accidentally 500 or 200
    on a missing KB."""
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/knowledge-bases/no-such-kb/ask",
            json={"question": "x"},
        )
    assert resp.status_code == 404
    assert "no-such-kb" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_ask_uses_top_15_retrieval_not_top_5(seeded_kb, stub_rag_top_k, stub_llm, stub_active_ids):
    """Ask Mode design intent: wider retrieval (15) than chat's narrow top-5.

    The whole point of Ask Mode is comprehensive coverage — pinning top_k=15
    locks the design promise. If a future refactor uses the chat default of 5,
    this test fires red."""
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/knowledge-bases/{seeded_kb}/ask",
            json={"question": "test"},
        )
    assert resp.status_code == 200
    assert stub_rag_top_k["top_k"] == 15, (
        f"Ask Mode must use top_k=15 (wider than chat), got {stub_rag_top_k['top_k']}"
    )
    assert stub_rag_top_k["kb"] == seeded_kb


@pytest.mark.asyncio
async def test_ask_includes_citation_instruction_in_system_prompt(seeded_kb, stub_rag_top_k, stub_llm, stub_active_ids):
    """Slovak citation instruction `[Zdroj N]` must be in the system prompt
    so the LLM emits citations the frontend can render.

    Pins the citation-format contract; the frontend's AskMode component
    detects these markers when rendering source links."""
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/knowledge-bases/{seeded_kb}/ask",
            json={"question": "test"},
        )
    assert resp.status_code == 200
    assert len(stub_llm.captured_messages) == 1
    system_msg = stub_llm.captured_messages[0][0]
    assert system_msg.role == "system"
    assert "[Zdroj N]" in system_msg.content
    assert "POUŽI TIETO INFORMÁCIE" in system_msg.content


@pytest.mark.asyncio
async def test_ask_threads_user_id_from_phase8a_middleware(seeded_kb, stub_rag_top_k, stub_llm, stub_active_ids, caplog):
    """Phase 8a invariant: every request has request.state.user_id set by
    UserIdentityMiddleware. The ask endpoint logs the first 8 chars (privacy
    invariant from Phase 8b) for audit purposes. This pins both halves of the
    contract: the X-EduTutor-User-Id header is honoured AND the log line is
    privacy-safe (no full UUID)."""
    from app.main import app
    user_uuid = "abc12345-deef-4444-8888-eeeeeeeeeeee"
    transport = ASGITransport(app=app)
    with caplog.at_level(logging.INFO, logger="app.api.knowledge_bases"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/knowledge-bases/{seeded_kb}/ask",
                json={"question": "test"},
                headers={HEADER_NAME: user_uuid},
            )
    assert resp.status_code == 200
    log_text = "\n".join(r.message for r in caplog.records)
    assert "ask:" in log_text
    assert user_uuid[:8] in log_text
    assert user_uuid not in log_text, "privacy invariant: full user_id must NOT be logged"
