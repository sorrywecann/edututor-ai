"""
test_ue5_audio_stream.py — EDU_UE5_AUDIO streamed-audio protocol.

Pins the contract that `_speak_sentence`, when EDU_UE5_AUDIO is enabled, mirrors
the spoken MP3 to /ws/avatar as ``speech_start`` -> ``speech_chunk``* ->
``speech_end`` (so UE5 plays the audio itself and Wilbur captures audio+video as
one synchronized WebRTC stream), and that with the flag OFF the avatar path is
unchanged (no speech_* messages, legacy viseme broadcast only).

Full contract: docs/plans/ue5-audio-protocol.md.
"""
from __future__ import annotations

from typing import Any, Dict, List

import pytest

import app.api.chat as chat_mod
from app.api.chat import ChatRequest, _speak_sentence, _SPOKE_SENTINEL
from app.config.learning_modes import get_mode


class _CaptureBroadcaster:
    """Records every broadcast() payload; mimics the AvatarBroadcaster surface
    that _speak_sentence touches (connection_count, set_speaking, broadcast)."""

    def __init__(self) -> None:
        self.sent: List[Dict[str, Any]] = []
        self._speaking = False

    @property
    def connection_count(self) -> int:
        return 1

    def set_speaking(self, value: bool) -> None:
        self._speaking = bool(value)

    async def broadcast(self, command: dict) -> None:
        self.sent.append(command)


class _FakeTTS:
    """stream_chunks yields raw MP3-ish bytes. Sizes trip both the 3 KB first-
    chunk cap and the 24 KB subsequent cap -> a speech_start AND a speech_chunk."""

    def __init__(self, chunks: List[bytes]) -> None:
        self._chunks = chunks

    async def stream_chunks(self, text, *, provider=None, voice=None, word_boundaries=None, **_):
        for c in self._chunks:
            yield c


async def _never_disconnected() -> bool:
    return False


def _arrange(flag: bool, monkeypatch) -> _CaptureBroadcaster:
    cap = _CaptureBroadcaster()
    monkeypatch.setattr(chat_mod, "get_avatar_broadcaster", lambda: cap)
    monkeypatch.setattr(chat_mod, "_UE5_AUDIO_ENABLED", flag)

    # Isolate from the heavy audio-anchored lipsync builder (real MP3 probing).
    async def _fake_lipsync(text, audio_bytes=None, word_boundaries=None, emotion=None):
        return [{"viseme": "sil", "weight": 1.0, "start_ms": 0, "duration_ms": 80}], 120, None

    monkeypatch.setattr(chat_mod, "_build_lipsync", _fake_lipsync)
    return cap


async def _drain(tts) -> List[Any]:
    lines: List[Any] = []
    async for line in _speak_sentence(
        sentence="Ahoj, ako sa máš dnes?",
        sentence_idx=0,
        request=ChatRequest(message="x", mode_id="sk"),
        mode=get_mode("sk"),
        tts_svc=tts,
        is_disconnected=_never_disconnected,
        last_emotion_holder={"emotion": "neutral", "intensity": 0.4},
    ):
        lines.append(line)
    return lines


@pytest.mark.asyncio
async def test_speech_protocol_emitted_when_flag_on(monkeypatch):
    cap = _arrange(True, monkeypatch)
    tts = _FakeTTS([b"\x00" * 4000, b"\x11" * 30000])

    lines = [l for l in await _drain(tts) if l is not _SPOKE_SENTINEL]

    types = [m.get("type") for m in cap.sent]
    assert types[0] == "speech_start", f"first UE5 message must be speech_start, got {types}"
    assert "speech_chunk" in types, f"expected at least one speech_chunk, got {types}"
    assert types[-1] == "speech_end", f"last UE5 message must be speech_end, got {types}"

    start = cap.sent[0]
    assert start["audio_mp3_b64"], "speech_start must carry the first MP3 chunk (base64)"
    assert isinstance(start.get("viseme_timeline"), list) and start["viseme_timeline"], (
        "speech_start must carry the viseme timeline so UE5 starts mouth + audio together"
    )
    for field in ("total_duration_ms", "emotion", "intensity", "index"):
        assert field in start, f"speech_start missing required field {field!r}"

    for m in cap.sent:
        if m.get("type") == "speech_chunk":
            assert m.get("audio_mp3_b64"), "speech_chunk must carry audio"
            assert m.get("index") == 0, "speech_chunk must carry the sentence index"

    # The browser SSE audio path stays on as the documented fallback.
    assert any('"type": "audio_chunk"' in str(l) for l in lines), (
        "SSE audio_chunk (browser fallback) must still be emitted when UE5 audio is on"
    )


@pytest.mark.asyncio
async def test_no_speech_protocol_when_flag_off(monkeypatch):
    cap = _arrange(False, monkeypatch)
    tts = _FakeTTS([b"\x00" * 4000, b"\x11" * 30000])

    await _drain(tts)

    speech = [m.get("type") for m in cap.sent if str(m.get("type") or "").startswith("speech_")]
    assert speech == [], f"flag OFF must emit zero speech_* messages, got {speech}"


@pytest.mark.asyncio
async def test_speech_full_emitted_when_mode_full(monkeypatch):
    """EDU_UE5_AUDIO_MODE=full: one self-contained speech_full per sentence
    carrying the complete MP3 + audio-anchored viseme timeline + emotion.
    NO speech_start / speech_chunk / speech_end on the wire (different protocol)."""
    cap = _arrange(True, monkeypatch)
    monkeypatch.setattr(chat_mod, "_UE5_AUDIO_MODE", "full")
    tts = _FakeTTS([b"\x00" * 4000, b"\x11" * 30000])

    lines = [l for l in await _drain(tts) if l is not _SPOKE_SENTINEL]

    types = [m.get("type") for m in cap.sent]
    assert types == ["speech_full"], (
        f"full mode must emit a single speech_full per sentence, got {types}"
    )
    chunked_types = {"speech_start", "speech_chunk", "speech_end"}
    assert not chunked_types.intersection(types), (
        f"full mode must NOT emit chunked-protocol messages, got {types}"
    )

    msg = cap.sent[0]
    assert msg["audio_mp3_b64"], "speech_full must carry the complete MP3 (base64)"
    assert isinstance(msg.get("viseme_timeline"), list) and msg["viseme_timeline"], (
        "speech_full must carry the audio-anchored viseme timeline"
    )
    for field in ("type", "index", "text", "emotion", "intensity", "viseme_timeline",
                  "total_duration_ms", "audio_mp3_b64"):
        assert field in msg, f"speech_full missing required field {field!r}"

    # SSE audio_chunk path (browser fallback) must still flow in full mode too.
    assert any('"type": "audio_chunk"' in str(l) for l in lines), (
        "SSE audio_chunk (browser fallback) must still be emitted in full mode"
    )


@pytest.mark.asyncio
async def test_default_mode_is_chunked(monkeypatch):
    """When EDU_UE5_AUDIO_MODE isn't set explicitly, default is chunked (back-compat)."""
    cap = _arrange(True, monkeypatch)
    # Don't override _UE5_AUDIO_MODE — rely on the module default (chunked).
    tts = _FakeTTS([b"\x00" * 4000, b"\x11" * 30000])

    await _drain(tts)
    types = [m.get("type") for m in cap.sent]
    assert types[0] == "speech_start" and "speech_chunk" in types and types[-1] == "speech_end", (
        f"default mode must emit chunked protocol, got {types}"
    )
    assert "speech_full" not in types, "default mode must NOT emit speech_full"
