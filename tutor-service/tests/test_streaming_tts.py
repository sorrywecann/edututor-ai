"""Pin the streaming-TTS SSE protocol so the avatar can speak before full
synthesis completes (commit TBD).

Before this change /chat/stream emitted a single ``sentence`` event per
detected sentence that contained the *complete* MP3 audio. Edge TTS takes
~800ms to synthesize a full sentence, so the UE5 avatar would emote and
move the mouth roughly 800ms behind text generation.

After this change the endpoint emits three events per sentence:

1. ``sentence_start`` — fires at sentence-boundary detection; carries text,
   emotion, intensity, and a text-derived viseme timeline. UE5 broadcast
   uses this so the avatar starts emoting at t≈0ms.
2. ``audio_chunk`` — base64 MP3 fragments as they stream from the provider
   (Edge TTS yields the first chunk in ~150ms). Frontends without
   MediaSource buffer chunks and play the concatenation on sentence_end.
3. ``sentence_end`` — final viseme/duration after the full audio is
   available, plus a backwards-compatible ``audio`` field carrying the
   concatenated audio bytes so legacy clients keep working.

These tests pin the contract so future refactors cannot silently regress
the latency win or break the backwards-compat path.
"""
import json
from typing import AsyncGenerator, List

import pytest
from httpx import AsyncClient, ASGITransport

from app.deps import llm_service_dep
from app.services.llm_service import LLMService


class _StreamingLLM(LLMService):
    """Yields the canned response one word at a time so multi-sentence chunking
    can be exercised deterministically."""

    def __init__(self, response: str) -> None:
        super().__init__()
        self._provider = "mock"
        self._available_providers = {"mock": True}
        self._fake_response = response

    async def generate(self, messages, max_tokens=None, temperature=None, top_k=None, stream=False) -> str:
        return self._fake_response

    async def generate_stream(self, messages, max_tokens=None, temperature=None) -> AsyncGenerator[str, None]:
        for word in self._fake_response.split(" "):
            yield word + " "


async def _collect_stream_events(client: AsyncClient, message: str) -> List[dict]:
    events: List[dict] = []
    async with client.stream(
        "POST",
        "/api/v1/chat/stream",
        json={"message": message, "language": "sk", "mode_id": "sk", "tts_provider": "mock"},
    ) as resp:
        assert resp.status_code == 200
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            payload = line[6:].strip()
            if not payload:
                continue
            try:
                events.append(json.loads(payload))
            except json.JSONDecodeError:
                continue
    return events


@pytest.mark.asyncio
async def test_stream_emits_sentence_start_before_audio_chunks():
    """sentence_start MUST fire before any audio_chunk so the avatar can start
    emoting at sentence-boundary time (t≈0ms) instead of waiting for the first
    TTS chunk (~150ms on Edge, ~800ms on slower providers)."""
    from app.main import app
    fake = _StreamingLLM("Ahoj, ako sa máš dnes? Som veľmi rád že ťa vidím.")
    app.dependency_overrides[llm_service_dep] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            events = await _collect_stream_events(c, "Skús ma pozdraviť.")
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    starts = [e for e in events if e.get("type") == "sentence_start"]
    chunks = [e for e in events if e.get("type") == "audio_chunk"]
    ends = [e for e in events if e.get("type") == "sentence_end"]

    assert starts, "stream must emit at least one sentence_start event"
    assert ends, "stream must emit at least one sentence_end event"
    assert len(starts) == len(ends), (
        "sentence_start and sentence_end counts must match (every started "
        "sentence must produce an end event, or the frontend buffer leaks)"
    )

    first_start_idx = next(i for i, e in enumerate(events) if e.get("type") == "sentence_start")
    first_chunk_idx = next((i for i, e in enumerate(events) if e.get("type") == "audio_chunk"), None)
    first_end_idx = next(i for i, e in enumerate(events) if e.get("type") == "sentence_end")

    assert first_start_idx < first_end_idx, "sentence_start must precede sentence_end"
    if first_chunk_idx is not None:
        assert first_start_idx < first_chunk_idx, (
            "sentence_start must precede the first audio_chunk so the avatar "
            "starts emoting before audio arrives (the whole point of this feature)"
        )


@pytest.mark.asyncio
async def test_stream_sentence_start_carries_text_and_visemes():
    """sentence_start must carry text + viseme_timeline + emotion + intensity
    so UE5 can start the lipsync/emote animation immediately. Without these
    fields the avatar would have to wait for sentence_end."""
    from app.main import app
    fake = _StreamingLLM("Ahoj svetik. Ako sa máš dnes?")
    app.dependency_overrides[llm_service_dep] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            events = await _collect_stream_events(c, "Pozdrav.")
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    starts = [e for e in events if e.get("type") == "sentence_start"]
    assert starts, "expected at least one sentence_start"
    s = starts[0]
    assert "text" in s and s["text"], "sentence_start must include the sentence text"
    assert "viseme_timeline" in s, "sentence_start must include a text-based viseme timeline"
    assert "emotion" in s, "sentence_start must include emotion"
    assert "intensity" in s, "sentence_start must include intensity"
    assert "index" in s, "sentence_start must include sentence index for per-sentence buffering"


@pytest.mark.asyncio
async def test_stream_sentence_end_carries_backwards_compat_audio():
    """sentence_end MUST carry the full concatenated MP3 audio in the ``audio``
    field so legacy clients that ignored audio_chunk events still receive
    playable audio. Removing this field would break every deployed frontend
    that hasn't shipped the streaming handler yet."""
    from app.main import app
    fake = _StreamingLLM("Toto je testovacia veta pre audio overenie.")
    app.dependency_overrides[llm_service_dep] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            events = await _collect_stream_events(c, "Pozdrav.")
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    ends = [e for e in events if e.get("type") == "sentence_end"]
    assert ends, "expected at least one sentence_end"
    end = ends[0]
    assert "audio" in end, "sentence_end must include the backwards-compat audio field"
    assert "viseme_timeline" in end, "sentence_end must include the final viseme_timeline"
    assert "duration_ms" in end, "sentence_end must include duration_ms"
    assert "emotion" in end, "sentence_end must include emotion for queue replay"
    assert "intensity" in end, "sentence_end must include intensity for queue replay"


@pytest.mark.asyncio
async def test_stream_sentence_start_indices_match_sentence_end_indices():
    """Each sentence_start carries an ``index`` that MUST match the
    corresponding sentence_end. The frontend uses this to key the per-sentence
    chunk buffer — mismatched indices would orphan buffers and leak memory."""
    from app.main import app
    fake = _StreamingLLM("Prvá veta. Druhá veta. Tretia veta tu je.")
    app.dependency_overrides[llm_service_dep] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            events = await _collect_stream_events(c, "Hovor.")
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    start_indices = [e["index"] for e in events if e.get("type") == "sentence_start"]
    end_indices = [e["index"] for e in events if e.get("type") == "sentence_end"]
    assert start_indices == end_indices, (
        f"start indices {start_indices} must equal end indices {end_indices} "
        "in order — frontend buffer keying depends on this contract"
    )


@pytest.mark.asyncio
async def test_stream_context_event_still_fires_first():
    """The Phase 4 fragile-contracts test pins that context MUST be the first
    typed event. The new sentence_start/audio_chunk/sentence_end protocol must
    not bump context out of first position — pin again here to catch regressions
    that touch only the streaming path."""
    from app.main import app
    fake = _StreamingLLM("Ahoj svetik.")
    app.dependency_overrides[llm_service_dep] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            events = await _collect_stream_events(c, "Skús.")
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    typed = [e for e in events if "type" in e]
    assert typed, "stream must emit at least one typed event"
    assert typed[0]["type"] == "context", (
        f"first typed event must be 'context', got '{typed[0].get('type')}'. "
        "The frontend KB-panel hydration depends on this ordering."
    )


@pytest.mark.asyncio
async def test_stream_done_event_still_fires_last():
    """The Phase 4 fragile-contracts test pins that ``done`` MUST fire for the
    frontend voice loop to advance. Repeat the pin here so a regression in the
    new streaming path is caught by a test owned by this feature."""
    from app.main import app
    fake = _StreamingLLM("Ahoj svetik. Druhá veta.")
    app.dependency_overrides[llm_service_dep] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            events = await _collect_stream_events(c, "Skús.")
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    types = [e.get("type") for e in events if "type" in e]
    assert "done" in types, "stream must terminate with a 'done' event"
    assert types[-1] == "done", (
        f"'done' must be the last typed event, got {types[-3:]} at the tail. "
        "Frontend voice loop only resumes listening after 'done'."
    )


def test_split_sentences_first_phrase_break_speeds_up_first_audio():
    """When ``allow_first_phrase_break=True``, _split_sentences accepts a
    comma/colon/dash as a speakable boundary (first chunk only). This shaves
    ~500ms off time-to-first-audio because the avatar can start talking at
    the first natural pause instead of waiting for the first sentence-ending
    period — a measurable conversational responsiveness win.

    Pinned because future "tidy up the regex" refactors could easily revert
    this to sentence-only and silently regress the latency win.
    """
    from app.api.chat import _split_sentences

    early = "Fotosyntéza je proces, ktorý"
    sentences, remainder = _split_sentences(early, allow_first_phrase_break=True)
    assert sentences == ["Fotosyntéza je proces,"], (
        f"first-phrase mode must speak at the comma, got sentences={sentences} "
        f"remainder={remainder!r}"
    )
    assert remainder.strip() == "ktorý"

    sentences, remainder = _split_sentences(early, allow_first_phrase_break=False)
    assert sentences == [], (
        "default (subsequent-chunk) mode must NOT break at commas — full "
        f"sentence prosody required, got {sentences}"
    )
    assert remainder == early


def test_split_sentences_first_phrase_skips_short_fragments():
    """The first-phrase break must respect a minimum-length floor so we don't
    speak 5-character fragments like "Áno," that produce robotic stuttering."""
    from app.api.chat import _split_sentences

    sentences, remainder = _split_sentences("Áno, ale", allow_first_phrase_break=True)
    assert sentences == [], (
        f"comma after very short prefix must NOT trigger speech, got {sentences}"
    )


def test_split_sentences_first_phrase_prefers_sentence_end_when_available():
    """When a sentence-ending period exists BEFORE the first comma, the period
    wins (natural prosody). The phrase-break is a fallback for long preambles."""
    from app.api.chat import _split_sentences

    sentences, remainder = _split_sentences(
        "Krátka veta. Druhá, dlhšia veta", allow_first_phrase_break=True
    )
    assert sentences == ["Krátka veta."], (
        f"sentence-end before phrase-break must take precedence, got {sentences}"
    )


@pytest.mark.asyncio
async def test_stream_chunks_method_falls_back_for_non_edge_providers(monkeypatch):
    """The TTSService.stream_chunks() helper must yield a single chunk (the full
    audio) for non-Edge providers so any provider works with the streaming
    protocol without provider-specific frontend code. A fake non-edge dispatch
    is monkey-patched in so we don't reach any real network/synthesis path."""
    from app.services.tts_service import TTSService, TTSResult

    svc = TTSService()

    async def fake_synth(text, provider, voice):
        return TTSResult(
            audio_data=b"\xff\xfb\x00" * 100,
            audio_format="audio/mp3",
            duration_ms=300,
            visemes=[],
        )

    monkeypatch.setattr(svc, "synthesize_with_options", fake_synth)

    chunks = []
    async for chunk in svc.stream_chunks("Testovacia veta.", provider="openai", voice="alloy"):
        chunks.append(chunk)

    assert chunks, "non-edge providers must yield at least one chunk via fallback"
    assert len(chunks) == 1, (
        "non-edge fallback must emit exactly one chunk (the full audio) — "
        "more than one would mean the helper is silently splitting which the "
        "frontend audio_chunk decoder is not designed to handle for non-edge"
    )
    assert all(isinstance(c, (bytes, bytearray)) for c in chunks), (
        "stream_chunks must yield raw bytes (not str, not base64) — frontends "
        "and the chat.py audio_chunk encoder both assume bytes input"
    )
