"""Pin the UE5 audio/avatar sync contract (Increment 2 of the streaming-TTS
sync workstream).

Background — the four sync gaps the streaming-TTS pipeline shipped with:
  Gap A — clock skew between browser AudioContext and UE5 engine clock
  Gap B — timeline snap mid-sentence when sentence_end re-broadcasts a refined
          viseme_timeline and UE5 restarts viseme playback from frame 0
  Gap C — "ghost lips": UE5 mouth opens ~150-200ms before any sound reaches
          the user's ears because the WebSocket broadcast races the browser
          audio path (Edge TTS first chunk ~150ms + MSE buffer fill ~30ms)
  Gap D — was a non-gap: stopLipsync() already sends isSpeaking=false when
          browser audio ends, so UE5 never animates into silence

This file pins Increment 2's two contract changes:

  1. The sentence_start UE5 WebSocket broadcast is DELAYED by
     ``UE5_BROADCAST_DELAY_MS`` (default 180ms) so the avatar's mouth opens
     when the user's audio actually starts, not before. The SSE event still
     fires immediately because the browser needs it to set up MediaSource.
     Fixes Gap C.

  2. The sentence_end UE5 broadcast is REMOVED. The first broadcast (delayed
     sentence_start) already started UE5's mouth at the correct time;
     rebroadcasting at sentence_end forces UE5 to restart viseme playback
     from frame 0 mid-sentence, causing a visible mouth-shape "snap".
     Fixes Gap B.

A future refactor could trivially re-introduce either bug. These tests catch
that. Increment 3 (audioPositionMs per-frame passthrough) is pinned in
test_streaming_tts.py and on the frontend.
"""
import asyncio
import json
from typing import AsyncGenerator, List
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.deps import llm_service_dep
from app.services.llm_service import LLMService


class _ScriptedLLM(LLMService):
    """Yields a fixed multi-sentence response one word at a time so the
    sentence-detection + multi-broadcast paths exercise deterministically."""

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


async def _drain_stream(client: AsyncClient, message: str) -> List[dict]:
    """Drain the SSE stream so all sentence_start / sentence_end events fire
    and any backgrounded broadcast tasks have a chance to run."""
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
async def test_sentence_end_does_not_broadcast_to_ue5():
    """The sentence_end SSE event MUST NOT trigger a second UE5 WebSocket
    broadcast. Only the (delayed) sentence_start broadcast fires per sentence.

    Removing the sentence_end broadcast is what fixes Gap B (mid-sentence
    viseme snap). A future contributor noticing the asymmetry between
    sentence_start (broadcasts) and sentence_end (does NOT broadcast) might
    "fix" it by adding a broadcast back — silently re-introducing the snap.
    This test catches that regression.

    Counts broadcasts indirectly via _broadcast_avatar_state being called.
    Disables the broadcast delay so we don't have to wait 180ms x N
    sentences for the test to finish.
    """
    from app.main import app
    fake = _ScriptedLLM("Krátka veta. Druhá veta tu je. Tretia veta na konci.")
    app.dependency_overrides[llm_service_dep] = lambda: fake

    broadcast_calls: List[dict] = []

    async def _capture(**kwargs):
        broadcast_calls.append(kwargs)

    try:
        with patch("app.api.chat._UE5_BROADCAST_DELAY_MS", 0.0), \
             patch("app.api.chat._broadcast_avatar_state", side_effect=_capture):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await _drain_stream(c, "Hovor.")
            await asyncio.sleep(0.1)
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    speaking = [c for c in broadcast_calls if c.get("is_speaking") is True]
    assert len(speaking) >= 3, (
        f"expected >=3 sentence_start broadcasts (one per sentence), got {len(speaking)}"
    )
    assert len(speaking) <= 4, (
        f"expected at most 4 speaking broadcasts (3 sentences + 1 remainder), "
        f"got {len(speaking)}. A second broadcast at sentence_end would push "
        f"this to 6+. Did someone re-add the sentence_end broadcast?"
    )


@pytest.mark.asyncio
async def test_sentence_start_broadcast_is_delayed():
    """The sentence_start UE5 broadcast MUST be scheduled via asyncio.sleep
    (not awaited inline) so it doesn't block the SSE generator. The delay
    aligns the avatar's mouth-open with the moment the user's audio starts.

    Verifies the contract by patching _UE5_BROADCAST_DELAY_MS to a measurable
    100ms and confirming the broadcast fires AFTER the SSE stream completes
    (because the SSE stream itself takes <100ms in test mode with mock TTS).
    """
    from app.main import app
    fake = _ScriptedLLM("Jedna krátka veta tu.")
    app.dependency_overrides[llm_service_dep] = lambda: fake

    broadcast_times: List[float] = []
    loop = asyncio.get_event_loop()

    async def _capture(**kwargs):
        if kwargs.get("is_speaking"):
            broadcast_times.append(loop.time())

    stream_finish_time: List[float] = []
    try:
        with patch("app.api.chat._UE5_BROADCAST_DELAY_MS", 100.0), \
             patch("app.api.chat._broadcast_avatar_state", side_effect=_capture):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await _drain_stream(c, "Pozdrav.")
                stream_finish_time.append(loop.time())
            await asyncio.sleep(0.2)
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    assert broadcast_times, "expected at least one speaking broadcast"
    assert stream_finish_time, "stream should have completed"
    delay_ms = (broadcast_times[0] - stream_finish_time[0]) * 1000
    assert delay_ms > -50, (
        f"sentence_start broadcast fired {delay_ms:.0f}ms relative to "
        "stream-end (negative = before stream ended). The 100ms patched "
        "delay must defer the broadcast — if it fires synchronously inside "
        "the SSE generator, this test sees a large negative value."
    )


@pytest.mark.asyncio
async def test_zero_delay_disables_the_sleep_path():
    """UE5_BROADCAST_DELAY_MS=0 MUST disable the asyncio.sleep entirely
    (legacy/immediate broadcast). This is the documented escape hatch for
    deployments that prefer the original immediate-broadcast behaviour, e.g.
    when the avatar runs in the same process as the audio and there's no MSE
    buffer fill to compensate for.
    """
    from app.main import app
    fake = _ScriptedLLM("Toto je dostatočne dlhá veta na detekciu.")
    app.dependency_overrides[llm_service_dep] = lambda: fake

    broadcast_calls: List[dict] = []

    async def _capture(**kwargs):
        broadcast_calls.append(kwargs)

    try:
        with patch("app.api.chat._UE5_BROADCAST_DELAY_MS", 0.0), \
             patch("app.api.chat._broadcast_avatar_state", side_effect=_capture):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await _drain_stream(c, "Pozdrav ma jednou dlhšou vetou.")
            await asyncio.sleep(0.1)
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)

    speaking = [c for c in broadcast_calls if c.get("is_speaking") is True]
    assert len(speaking) >= 1, (
        "expected at least one speaking broadcast even with delay=0; "
        "delay=0 must disable the sleep, not the broadcast"
    )


def test_ue5_broadcast_delay_constant_is_env_overridable(monkeypatch):
    """The UE5_BROADCAST_DELAY_MS env var must control the module-level
    constant at import time. Pinned because the env-var pattern is the
    documented per-deployment tuning knob — if a refactor moves the value
    into a hardcoded literal, deployments lose the ability to tune.
    """
    monkeypatch.setenv("UE5_BROADCAST_DELAY_MS", "250")
    import importlib
    import app.api.chat as chat_mod
    importlib.reload(chat_mod)
    try:
        assert chat_mod._UE5_BROADCAST_DELAY_MS == 250.0, (
            f"expected 250.0 from env, got {chat_mod._UE5_BROADCAST_DELAY_MS}"
        )
    finally:
        monkeypatch.delenv("UE5_BROADCAST_DELAY_MS", raising=False)
        importlib.reload(chat_mod)


def test_default_broadcast_delay_is_180ms():
    """The default delay is 180ms — calibrated to median MSE buffer-fill
    time (Edge TTS first chunk ~150ms + MediaSource sourceopen ~30ms).
    Pinned so a casual edit can't silently change the perceptual sync
    behaviour on every default deployment.
    """
    import os
    if "UE5_BROADCAST_DELAY_MS" in os.environ:
        pytest.skip("env var overrides default; skip pin in this environment")
    from app.api.chat import _UE5_BROADCAST_DELAY_MS
    assert _UE5_BROADCAST_DELAY_MS == 180.0, (
        f"default delay must be 180ms (calibrated to MSE buffer fill), "
        f"got {_UE5_BROADCAST_DELAY_MS}"
    )
