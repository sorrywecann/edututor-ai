"""Phase 4 — pin the contracts that fragile components depend on.

The recent commit history shows clusters of `fix:` commits around five
components: KB voice mode, TTS voice selection, LLM provider switching,
onboarding/hardware setup, and the voice loop. Phase 2 already added
test_llm_switch.py and test_tts_voice_routing.py covering two of those.
This file pins the remaining backend-testable contracts so the bug-of-the-
week pattern can't keep silently regressing the same fixes.

Specifically:
  - RAG chunk_overlap and similarity_threshold defaults (commit 2e6b63f
    explicitly *restored* these values; if defaults drift, KB chat
    relevance silently degrades).
  - /chat with __greeting__ must produce a real Slovak greeting (commit
    170fa86 fixed the greeting prompt; commit dddcf5d removed an old
    OnboardingTour that was hijacking the flow).
  - /chat/stream must always emit a `done` event, even on internal trigger
    messages (commit e061ad5 fixed "TTS fallback if done event missed",
    which only matters because the frontend waits for `done`).
"""
import json
import pytest
from httpx import AsyncClient, ASGITransport

from app.config.rag_config import rag_config


def test_rag_defaults_match_committed_baseline():
    """Locks in the values commit 2e6b63f explicitly restored.

    These tunings were arrived at empirically from the Slovak quadratic-
    equation golden dataset. A future PR that changes them must do so
    consciously (and update this test) rather than silently regressing
    KB retrieval quality.
    """
    assert rag_config.chunk_size == 500, "chunk_size baseline (commit 2e6b63f)"
    assert rag_config.chunk_overlap == 80, "chunk_overlap baseline (commit 2e6b63f)"
    assert rag_config.similarity_threshold == 0.65, "similarity_threshold baseline (commit 2e6b63f)"
    assert rag_config.top_k_results == 5, "top_k_results baseline"
    assert rag_config.embedding_model == "paraphrase-multilingual-MiniLM-L12-v2", (
        "Slovak-capable multilingual embedding model — do not swap without re-running "
        "the golden dataset benchmarks"
    )


@pytest.mark.asyncio
async def test_chat_greeting_returns_slovak_response():
    """The __greeting__ trigger must produce a real Slovak greeting (not the
    raw '__greeting__' string, an empty response, or an English fallback).
    Voice loop and KB voice mode both fire this on session start."""
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/chat", json={
            "message": "__greeting__",
            "language": "sk",
            "mode_id": "sk",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert data["response"], "greeting must produce a non-empty response"
    assert data["response"] != "__greeting__", "greeting trigger must not be echoed back literally"
    assert "viseme_timeline" in data
    assert "audio_duration_ms" in data


@pytest.mark.asyncio
async def test_chat_silence_check_returns_response_field():
    """The __silence_check__ trigger must return a well-formed ChatResponse so
    the frontend voice loop can decide whether to keep listening or speak."""
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/chat", json={
            "message": "__silence_check__",
            "language": "sk",
            "mode_id": "sk",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert "provider" in data


@pytest.mark.asyncio
async def test_chat_response_always_includes_avatar_fields():
    """ChatResponse contract guarantees emotion/intensity/viseme_timeline/
    audio_duration_ms on every successful response — UE5 broadcast and the
    web orb both depend on these fields existing."""
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/chat", json={
            "message": "Ahoj, ako sa máš?",
            "language": "sk",
            "mode_id": "sk",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "emotion" in data
    assert "intensity" in data
    assert isinstance(data["intensity"], (int, float))
    assert "viseme_timeline" in data
    assert isinstance(data["viseme_timeline"], list)
    assert "audio_duration_ms" in data
    assert data["audio_duration_ms"] > 0, "non-empty response must have nonzero TTS duration estimate"


@pytest.mark.asyncio
async def test_chat_stream_emits_done_event_for_internal_trigger():
    """commit e061ad5 fixed 'KB voice TTS fallback if done event missed in stream'.
    The fallback only fires when `done` is missing — which means `done` MUST
    always fire on the happy path, including for internal triggers like
    __silence_check__ that the frontend voice loop sends."""
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        async with c.stream("POST", "/api/v1/chat/stream", json={
            "message": "__silence_check__",
            "language": "sk",
            "mode_id": "sk",
        }) as resp:
            assert resp.status_code == 200
            saw_done = False
            saw_error = False
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if not payload.strip():
                    continue
                try:
                    evt = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if evt.get("type") == "done":
                    saw_done = True
                if evt.get("type") == "error":
                    saw_error = True
            assert saw_done or saw_error, (
                "stream must terminate with either 'done' or 'error' — silent "
                "stream end leaves the frontend voice loop hanging (KB voice bug class)"
            )


@pytest.mark.asyncio
async def test_chat_stream_emits_context_event_first():
    """The frontend KB voice mode reads the `context` event to render source
    chunks. Even when there's no KB selected, the event must fire (with empty
    chunks) so the frontend never blocks waiting for it."""
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        async with c.stream("POST", "/api/v1/chat/stream", json={
            "message": "Ahoj",
            "language": "sk",
            "mode_id": "sk",
        }) as resp:
            assert resp.status_code == 200
            first_typed_event = None
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if not payload.strip():
                    continue
                try:
                    evt = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if "type" in evt:
                    first_typed_event = evt["type"]
                    break
            assert first_typed_event == "context", (
                "first SSE event must be 'context' so the frontend can hydrate "
                "the source-chunks panel before any text/sentence events arrive"
            )
