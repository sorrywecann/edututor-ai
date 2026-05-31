"""
EduTutor.AI — Chat + RAG Integration Tests

Tests that the /api/v1/chat endpoint correctly:
  1. Injects RAG context into the system prompt when knowledge_base is set
  2. Returns rag_sources in the response
  3. Works without RAG when knowledge_base is omitted
  4. Handles the __greeting__ shortcut without LLM
  5. Passes conversation_id through and stores memory

LLM calls are mocked so these tests don't need API keys.
ChromaDB is seeded with real Slovak educational content from fixtures.
"""
import os
import json
import pytest
import pytest_asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

chromadb = pytest.importorskip("chromadb", reason="chromadb not installed — skipping RAG integration tests")
# sentence_transformers ≥ 5 eagerly imports torchcodec which requires
# libtorchcodec_core (FFmpeg-bound). Skip on machines lacking system FFmpeg.
try:
    import sentence_transformers  # noqa: F401
except (ImportError, OSError, RuntimeError) as _st_err:
    pytest.skip(
        f"sentence-transformers stack unavailable ({_st_err.__class__.__name__}): {_st_err}",
        allow_module_level=True,
    )

os.environ.setdefault("VECTOR_DB_BACKEND", "chroma")
os.environ.setdefault("STT_PROVIDER", "mock")

FIXTURES = Path(__file__).parent / "fixtures"

MOCK_LLM_RESPONSE = (
    "Kvadratická rovnica má tvar ax² + bx + c = 0. "
    "Riešenie nájdeme pomocou diskriminantu D = b² - 4ac."
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def chroma_temp_dir(tmp_path_factory):
    """Point ChromaDB to a temp dir for the whole module."""
    tmp = tmp_path_factory.mktemp("chroma_chat_test")
    os.environ["CHROMA_PERSIST_PATH"] = str(tmp)
    yield tmp


@pytest_asyncio.fixture(scope="module")
async def seeded_kb(chroma_temp_dir):
    """Seed the 'matematika' KB with algebra content. Returns KB name."""
    import importlib
    import app.services.chroma_rag_service as m
    importlib.reload(m)

    svc = m.ChromaRAGService()
    await svc.initialize()

    content = (FIXTURES / "matematika_algebra.txt").read_bytes()
    await svc.process_document(
        content=content,
        filename="matematika_algebra.txt",
        file_type="txt",
        knowledge_base="matematika-test",
        document_id="math-chat-001",
    )
    await svc.close()  # flush to disk

    # Re-open a fresh instance pointing to the same temp path and inject as singleton
    svc2 = m.ChromaRAGService()
    await svc2.initialize()

    # Patch the singleton so the API uses this seeded service
    import app.services.rag_service as factory
    factory._rag_service = svc2
    yield "matematika-test"

    await svc2.close()
    factory._rag_service = None


# ---------------------------------------------------------------------------
# Greeting — no LLM needed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_greeting_shortcut_no_llm():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/chat", json={"message": "__greeting__", "language": "sk"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] in ("static", "openai", "ollama", "anthropic", "mock")
    assert "EduTutor" in data["response"] or "Dobrý deň" in data["response"] or "Ahoj" in data["response"]
    # Avatar fields
    assert data["emotion"] in ("encouraging", "encouraging_mild", "neutral", "joy")
    assert isinstance(data["viseme_timeline"], list)
    assert data["audio_duration_ms"] > 0


# ---------------------------------------------------------------------------
# Chat without RAG — mocked LLM
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_without_rag_returns_response():
    """Basic chat: no knowledge_base, LLM mocked."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    with patch("app.services.llm_service.LLMService.generate", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = "Ahoj! Som EduTutor, váš asistent."

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat", json={
                "message": "Ahoj, ako sa máš?",
                "language": "sk",
            })

    assert resp.status_code == 200
    data = resp.json()
    assert data["response"] == "Ahoj! Som EduTutor, váš asistent."
    assert data["rag_sources"] is None  # no KB = no sources
    assert data["emotion"] in ("neutral", "encouraging", "joy", "correcting", "celebrating")
    assert isinstance(data["latency_ms"], int)


# ---------------------------------------------------------------------------
# Chat with RAG — verifies context injection and rag_sources
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_with_rag_returns_sources(seeded_kb):
    """With knowledge_base set, response must include rag_sources."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    with patch("app.services.llm_service.LLMService.generate", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = MOCK_LLM_RESPONSE

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat", json={
                "message": "Vysvetli mi kvadratickú rovnicu",
                "language": "sk",
                "knowledge_base": seeded_kb,
            })

    assert resp.status_code == 200
    data = resp.json()
    # RAG sources must be returned
    assert data["rag_sources"] is not None, "Expected rag_sources but got None"
    assert len(data["rag_sources"]) > 0
    for src in data["rag_sources"]:
        assert "content" in src
        assert "source" in src
        assert "score" in src
        assert 0.0 <= src["score"] <= 1.0


@pytest.mark.asyncio
async def test_rag_context_injected_into_llm_prompt(seeded_kb):
    """The LLM generate() call must include RAG context in its messages."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    captured_messages = []

    async def capture_generate(messages, **kwargs):
        captured_messages.extend(messages)
        return MOCK_LLM_RESPONSE

    with patch("app.services.llm_service.LLMService.generate", side_effect=capture_generate):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            await c.post("/api/v1/chat", json={
                "message": "Čo je diskriminant?",
                "language": "sk",
                "knowledge_base": seeded_kb,
                "similarity_threshold": 0.4,
            })

    # System message must contain the RAG inject marker
    system_msgs = [m for m in captured_messages if m.role == "system"]
    assert system_msgs, "No system message found"
    system_content = system_msgs[0].content
    assert "POUŽI TIETO INFORMÁCIE" in system_content or "diskriminant" in system_content.lower(), \
        "RAG context not injected into system prompt"
    assert "[Zdroj 1:" in system_content


# ---------------------------------------------------------------------------
# Conversation memory — conversation_id persists turns
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_conversation_memory_persists_across_turns():
    """Two turns with the same conversation_id should build up history."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.services import memory_service

    conv_id = "test-conv-memory-001"
    memory_service.clear(conv_id)  # clean slate

    call_count = 0

    async def mock_gen(messages, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "Veľká Morava vznikla v roku 833."
        return "Áno, Cyril a Metod prišli na Veľkú Moravu v roku 863."

    with patch("app.services.llm_service.LLMService.generate", side_effect=mock_gen):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            # Turn 1
            resp1 = await c.post("/api/v1/chat", json={
                "message": "Kedy vznikla Veľká Morava?",
                "language": "sk",
                "conversation_id": conv_id,
            })
            assert resp1.status_code == 200

            # Turn 2 — LLM should receive turn 1 in its message history
            resp2 = await c.post("/api/v1/chat", json={
                "message": "A kedy prišiel Cyril a Metod?",
                "language": "sk",
                "conversation_id": conv_id,
            })
            assert resp2.status_code == 200

    # Memory should now contain both turns (2 user + 2 assistant = 4 messages)
    history = memory_service.get_history(conv_id)
    assert len(history) == 4
    assert history[0]["role"] == "user"
    assert history[1]["role"] == "assistant"
    assert "833" in history[1]["content"]

    memory_service.clear(conv_id)  # cleanup


# ---------------------------------------------------------------------------
# Chat fallback on LLM error
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_returns_fallback_on_llm_error():
    """If LLM raises, endpoint must return fallback Slovak message, not 500."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    with patch("app.services.llm_service.LLMService.generate", side_effect=RuntimeError("LLM down")):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat", json={
                "message": "Niečo sa opýtam",
                "language": "sk",
            })

    assert resp.status_code == 200  # must NOT be 500
    data = resp.json()
    assert data["provider"] == "fallback"
    assert "Prepáčte" in data["response"] or "chyba" in data["response"].lower()


# ---------------------------------------------------------------------------
# Avatar bridge fields always present
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_response_always_has_avatar_fields():
    """emotion, intensity, viseme_timeline, audio_duration_ms must always be in response."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    with patch("app.services.llm_service.LLMService.generate", new_callable=AsyncMock) as m:
        m.return_value = "Test odpoveď pre avatar."
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat", json={"message": "test", "language": "sk"})

    data = resp.json()
    assert "emotion" in data
    assert "intensity" in data
    assert "viseme_timeline" in data
    assert "audio_duration_ms" in data
    assert isinstance(data["viseme_timeline"], list)
    assert isinstance(data["intensity"], float)


@pytest.mark.asyncio
async def test_chat_stream_emits_context_event_before_text():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.schemas.knowledge_base import ContextChunk

    mock_llm = MagicMock()
    mock_llm.provider = "mock"
    mock_llm.get_system_prompt.return_value = "System prompt"

    async def mock_stream(*args, **kwargs):
        yield "Ahoj"

    mock_llm.generate_stream = mock_stream

    mock_rag = MagicMock()
    mock_rag.is_ready.return_value = True
    mock_rag.search_with_metadata = AsyncMock(return_value=[
        ContextChunk(
            chunk_id="chunk-1",
            document_id="doc-1",
            filename="algebra.pdf",
            page=2,
            chunk_index=0,
            content="Diskriminant je b² - 4ac.",
            score=0.91,
        )
    ])

    with patch("app.api.chat.get_llm_service", new=AsyncMock(return_value=mock_llm)), \
         patch("app.api.chat.get_rag_service", new=AsyncMock(return_value=mock_rag)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/chat/stream",
                json={"message": "Čo je diskriminant?", "knowledge_base": "kb-stream-test"},
            )

    assert resp.status_code == 200
    events = [
        json.loads(line.removeprefix("data: "))
        for line in resp.text.splitlines()
        if line.startswith("data: ")
    ]
    assert events[0]["type"] == "context"
    assert events[0]["chunks"][0]["filename"] == "algebra.pdf"
    assert events[1]["type"] == "text"
    assert events[-1]["type"] == "done"
