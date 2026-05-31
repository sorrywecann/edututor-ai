"""
test_avatar_broadcaster.py — Cancel-mute suppression window + connection tracking

Pins the contract that avatar_broadcaster.AvatarBroadcaster honours:
  * cancel_speech() opens a CANCEL_MUTE_WINDOW during which isSpeaking=True
    broadcasts are dropped — needed because in-flight TTS coroutines from
    a cancelled chat turn would otherwise re-open the avatar mouth.
  * clear_speech_mute() resets the window for the next chat turn.
  * connect/disconnect maintain accurate connection_count for /api/v1/avatar/status.
  * snapshot-safe broadcast iteration (no mutation-during-iteration crash).
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, List
from unittest.mock import AsyncMock

import pytest

from app.services.avatar_broadcaster import (
    AvatarBroadcaster,
    build_blink_payload,
    get_avatar_broadcaster,
)


class _FakeWebSocket:
    """Stand-in for starlette WebSocket. Records send_text payloads as JSON dicts.

    avatar_broadcaster.broadcast() serializes commands via json.dumps + ws.send_text,
    so the fake parses each send_text back into a dict for assertion convenience.
    """

    def __init__(self) -> None:
        self.sent: List[dict] = []
        self.should_raise: Exception | None = None

    async def send_text(self, payload: str) -> None:
        if self.should_raise is not None:
            raise self.should_raise
        import json as _json
        self.sent.append(_json.loads(payload))


class TestConnectionTracking:
    def test_connect_increments_count(self) -> None:
        b = AvatarBroadcaster()
        assert b.connection_count == 0
        b.connect(_FakeWebSocket())
        assert b.connection_count == 1
        b.connect(_FakeWebSocket())
        assert b.connection_count == 2

    def test_disconnect_decrements_count(self) -> None:
        b = AvatarBroadcaster()
        ws = _FakeWebSocket()
        b.connect(ws)
        b.disconnect(ws)
        assert b.connection_count == 0

    def test_disconnect_unknown_is_idempotent(self) -> None:
        b = AvatarBroadcaster()
        b.disconnect(_FakeWebSocket())
        assert b.connection_count == 0


class TestCancelMuteWindow:
    def test_cancel_speech_sets_speaking_false_immediately(self) -> None:
        b = AvatarBroadcaster()
        b.set_speaking(True)
        b.cancel_speech()
        assert b.is_speaking is False

    @pytest.mark.asyncio
    async def test_cancel_mute_suppresses_isSpeaking_true_broadcasts(self) -> None:
        b = AvatarBroadcaster()
        ws = _FakeWebSocket()
        b.connect(ws)
        b.cancel_speech()
        await b.broadcast({"isSpeaking": True, "viseme": "aa"})
        assert ws.sent == [], (
            "broadcast with isSpeaking=True must be suppressed during cancel mute window"
        )

    @pytest.mark.asyncio
    async def test_cancel_mute_does_not_suppress_isSpeaking_false(self) -> None:
        b = AvatarBroadcaster()
        ws = _FakeWebSocket()
        b.connect(ws)
        b.cancel_speech()
        await b.broadcast({"isSpeaking": False, "viseme": "sil"})
        assert len(ws.sent) == 1, "idle/silence frames must pass through cancel mute"

    @pytest.mark.asyncio
    async def test_clear_speech_mute_re_enables_broadcasts(self) -> None:
        b = AvatarBroadcaster()
        ws = _FakeWebSocket()
        b.connect(ws)
        b.cancel_speech()
        b.clear_speech_mute()
        await b.broadcast({"isSpeaking": True, "viseme": "aa"})
        assert len(ws.sent) == 1, "broadcasts must resume after clear_speech_mute()"


class TestSnapshotSafeBroadcast:
    @pytest.mark.asyncio
    async def test_concurrent_disconnect_during_broadcast_does_not_crash(self) -> None:
        b = AvatarBroadcaster()
        ws1 = _FakeWebSocket()
        ws2 = _FakeWebSocket()
        b.connect(ws1)
        b.connect(ws2)

        async def disconnect_mid_flight() -> None:
            await asyncio.sleep(0.001)
            b.disconnect(ws1)

        asyncio.create_task(disconnect_mid_flight())
        await b.broadcast({"isSpeaking": False, "viseme": "sil"})

    @pytest.mark.asyncio
    async def test_send_failure_drops_connection(self) -> None:
        b = AvatarBroadcaster()
        ws_bad = _FakeWebSocket()
        ws_bad.should_raise = RuntimeError("client gone")
        ws_good = _FakeWebSocket()
        b.connect(ws_bad)
        b.connect(ws_good)
        await b.broadcast({"isSpeaking": False, "viseme": "sil"})
        assert ws_bad not in [c for c in [ws_bad, ws_good] if c in b._connections], (
            "failed send must drop the offending connection"
        )
        assert b.connection_count == 1
        assert len(ws_good.sent) == 1


class TestSingletonAndPayloads:
    def test_get_avatar_broadcaster_returns_singleton(self) -> None:
        a = get_avatar_broadcaster()
        b = get_avatar_broadcaster()
        assert a is b, "broadcaster must be a process singleton"

    def test_build_blink_payload_shape(self) -> None:
        payload = build_blink_payload()
        assert isinstance(payload, dict)
        assert "blink" in payload, "blink heartbeat payload must carry a 'blink' field"
        weight: Any = payload["blink"]
        assert isinstance(weight, (int, float))
        assert 0.0 <= float(weight) <= 1.0, "blink weight must be in [0, 1]"
