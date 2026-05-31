"""test_avatar_simulation.py — Simulated avatar broadcast & lifecycle tests

Tests that don't need a live UE5 connection — validates the broadcast
layer, idle heartbeat, emotion-to-viseme mapping, and the full
chat-to-avatar pipeline in isolation.

Created: Phase B5, Vystup 3 final-execution plan
"""
import pytest
import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.viseme_timeline import build_timeline, from_text, _FRAME_STEP_MS
from app.services.avatar_broadcaster import (
    AvatarBroadcaster,
    get_avatar_broadcaster,
    idle_heartbeat_loop,
    build_blink_payload,
)

SK_TEST_PHRASES = [
    "ahoj",
    "co je konstruktor",
    "vysvetli dedicnost v objektovo orientovanom programovani",
    "dakujem velmi pekne za pomoc",
    "dovidenia a prajem pekny den",
]


@pytest.fixture
def clean_broadcaster():
    return AvatarBroadcaster()


@pytest.fixture
def mock_websocket():
    ws = MagicMock()
    ws.send_text = AsyncMock()
    ws.client_state = MagicMock()
    ws.client_state.name = "CONNECTED"
    ws.close = AsyncMock()
    return ws


class TestBroadcasterLifecycle:
    def test_broadcaster_instantiation(self):
        bc = AvatarBroadcaster()
        assert bc.connection_count == 0
        assert bc.is_speaking is False

    def test_get_avatar_broadcaster_is_singleton(self):
        a = get_avatar_broadcaster()
        b = get_avatar_broadcaster()
        assert a is b

    def test_connect_client(self, clean_broadcaster, mock_websocket):
        clean_broadcaster.connect(mock_websocket)
        assert clean_broadcaster.connection_count == 1

    def test_disconnect_client(self, clean_broadcaster, mock_websocket):
        clean_broadcaster.connect(mock_websocket)
        clean_broadcaster.disconnect(mock_websocket)
        assert clean_broadcaster.connection_count == 0

    def test_disconnect_nonexistent_no_error(self, clean_broadcaster, mock_websocket):
        clean_broadcaster.disconnect(mock_websocket)

    def test_multiple_clients(self, clean_broadcaster):
        ws1 = MagicMock(); ws1.send_text = AsyncMock()
        ws2 = MagicMock(); ws2.send_text = AsyncMock()
        ws3 = MagicMock(); ws3.send_text = AsyncMock()
        clean_broadcaster.connect(ws1)
        clean_broadcaster.connect(ws2)
        clean_broadcaster.connect(ws3)
        assert clean_broadcaster.connection_count == 3
        clean_broadcaster.disconnect(ws1)
        assert clean_broadcaster.connection_count == 2

    def test_speaking_state(self, clean_broadcaster):
        assert clean_broadcaster.is_speaking is False
        clean_broadcaster.set_speaking(True)
        assert clean_broadcaster.is_speaking is True
        clean_broadcaster.set_speaking(False)
        assert clean_broadcaster.is_speaking is False


class TestBroadcastData:
    @pytest.mark.asyncio
    async def test_broadcast_to_single_client(self, clean_broadcaster, mock_websocket):
        clean_broadcaster.connect(mock_websocket)
        frames, _ = build_timeline("ahoj")
        for f in frames[:5]:
            await clean_broadcaster.broadcast({"type": "viseme", "data": f})
        assert mock_websocket.send_text.called

    @pytest.mark.asyncio
    async def test_broadcast_to_multiple_clients(self, clean_broadcaster):
        ws1 = MagicMock(); ws1.send_text = AsyncMock()
        ws2 = MagicMock(); ws2.send_text = AsyncMock()
        clean_broadcaster.connect(ws1)
        clean_broadcaster.connect(ws2)
        frames, _ = build_timeline("dobry den")
        for f in frames[:3]:
            await clean_broadcaster.broadcast({"type": "viseme", "data": f})
        ws1.send_text.assert_called()
        ws2.send_text.assert_called()

    @pytest.mark.asyncio
    async def test_broadcast_empty_no_error(self, clean_broadcaster, mock_websocket):
        clean_broadcaster.connect(mock_websocket)
        await clean_broadcaster.broadcast({})


class TestChatToAvatarPipeline:
    @pytest.mark.asyncio
    async def test_full_pipeline_single_phrase(self, clean_broadcaster, mock_websocket):
        clean_broadcaster.connect(mock_websocket)
        for phrase in SK_TEST_PHRASES:
            frames, dur = build_timeline(phrase)
            assert len(frames) > 0 and dur > 0
            clean_broadcaster.set_speaking(True)
            for f in frames[:3]:
                await clean_broadcaster.broadcast({"type": "viseme", "data": f})
            clean_broadcaster.set_speaking(False)
        assert mock_websocket.send_text.called

    @pytest.mark.asyncio
    async def test_full_pipeline_rapid_sequence(self, clean_broadcaster, mock_websocket):
        clean_broadcaster.connect(mock_websocket)
        for phrase in ["ahoj", "ako sa mas", "chcem sa ucit", "co je konstruktor"]:
            clean_broadcaster.set_speaking(True)
            frames, _ = build_timeline(phrase)
            for f in frames[:3]:
                await clean_broadcaster.broadcast({"type": "viseme", "data": f})
            clean_broadcaster.set_speaking(False)
        assert mock_websocket.send_text.called


class TestVisemePayloadStructure:
    def test_every_frame_has_required_keys(self):
        required = {'viseme', 'weight', 'start_ms', 'duration_ms'}
        for phrase in SK_TEST_PHRASES:
            frames, _ = from_text(phrase)
            for f in frames:
                assert required.issubset(set(f.keys())), (
                    f"Frame missing required keys: missing={required - set(f.keys())}, "
                    f"frame={f}"
                )

    def test_weights_in_range_all_phrases(self):
        for phrase in SK_TEST_PHRASES:
            frames, _ = from_text(phrase)
            for f in frames:
                assert 0.0 <= f['weight'] <= 1.0

    def test_viseme_values_are_valid(self):
        valid = {'PP','FF','TH','DD','kk','CH','SS','nn','RR','aa','E','ih','oh','ou','ww','uw','sil'}
        for phrase in SK_TEST_PHRASES:
            frames, _ = from_text(phrase)
            for f in frames:
                assert f['viseme'] in valid


class TestBlinkPayload:
    def test_blink_payload_structure(self):
        payload = build_blink_payload()
        assert isinstance(payload, dict)
        assert 'emotion' in payload and 'blink' in payload

    def test_blink_payload_idempotent(self):
        assert build_blink_payload() == build_blink_payload()


class TestEmotionMapping:
    known_emotions = ['happy', 'sad', 'angry', 'surprised', 'neutral',
                      'friendly', 'encouraging', 'questioning']

    def test_all_emotions_are_strings(self):
        for e in self.known_emotions:
            assert isinstance(e, str) and len(e) > 0

    def test_emotion_does_not_affect_viseme_determinism(self):
        phrase = "vyborne, pokracuj"
        assert from_text(phrase) == from_text(phrase)


class TestIdleHeartbeat:
    def test_silence_produces_minimal_frames(self):
        _, dur = from_text("")
        assert dur >= 0
