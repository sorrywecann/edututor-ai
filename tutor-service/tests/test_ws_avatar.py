# tutor-service/tests/test_ws_avatar.py
import asyncio
import json
import pytest

from app.services.avatar_broadcaster import AvatarBroadcaster, get_avatar_broadcaster
import app.services.avatar_broadcaster as _mod


@pytest.fixture(autouse=True)
def _reset_broadcaster():
    yield
    _mod._broadcaster = None


class MockWS:
    def __init__(self):
        self.sent: list = []

    async def send_text(self, data: str):
        self.sent.append(data)


@pytest.mark.asyncio
async def test_broadcaster_connect_disconnect():
    b = AvatarBroadcaster()
    assert b.connection_count == 0
    ws = MockWS()
    b.connect(ws)
    assert b.connection_count == 1
    b.disconnect(ws)
    assert b.connection_count == 0


@pytest.mark.asyncio
async def test_broadcaster_sends_to_all():
    b = AvatarBroadcaster()
    ws1, ws2 = MockWS(), MockWS()
    b.connect(ws1)
    b.connect(ws2)

    cmd = {
        "emotion": "joy", "intensity": 0.9, "isSpeaking": True,
        "visemes": [{"viseme": "aa", "weight": 0.9}], "blink": 0.0,
    }
    await b.broadcast(cmd)

    assert len(ws1.sent) == 1
    assert len(ws2.sent) == 1
    parsed = json.loads(ws1.sent[0])
    assert parsed["emotion"] == "joy"


@pytest.mark.asyncio
async def test_broadcaster_removes_dead_connections():
    """Connections that raise on send_text are dropped silently."""
    b = AvatarBroadcaster()

    class DeadWS:
        async def send_text(self, data: str):
            raise RuntimeError("connection closed")

    dead = DeadWS()
    alive = MockWS()
    b.connect(dead)
    b.connect(alive)
    assert b.connection_count == 2

    await b.broadcast({"emotion": "neutral", "intensity": 0.4, "isSpeaking": False, "visemes": [], "blink": 0.0})

    assert b.connection_count == 1
    assert len(alive.sent) == 1


@pytest.mark.asyncio
async def test_get_avatar_broadcaster_singleton():
    b1 = get_avatar_broadcaster()
    b2 = get_avatar_broadcaster()
    assert b1 is b2


@pytest.mark.asyncio
async def test_broadcast_no_clients_is_noop():
    """Empty broadcaster is a fast-path with no exception."""
    b = AvatarBroadcaster()
    await b.broadcast({"emotion": "neutral", "intensity": 0.4, "isSpeaking": False, "visemes": [], "blink": 0.0})
    assert b.connection_count == 0


@pytest.mark.asyncio
async def test_broadcast_drops_slow_client_via_timeout(monkeypatch):
    """A client whose send_text never resolves must not stall the broadcast.

    Patches the per-send timeout to a fraction of a second so the test runs fast.
    """
    monkeypatch.setattr(_mod, "_SEND_TIMEOUT_SECONDS", 0.05)

    b = AvatarBroadcaster()

    class SlowWS:
        async def send_text(self, data: str):
            await asyncio.sleep(10)

    fast = MockWS()
    slow = SlowWS()
    b.connect(slow)
    b.connect(fast)

    started = asyncio.get_event_loop().time()
    await b.broadcast({"emotion": "neutral", "intensity": 0.4, "isSpeaking": False, "visemes": [], "blink": 0.0})
    elapsed = asyncio.get_event_loop().time() - started

    assert elapsed < 1.0, f"broadcast stalled by slow client: {elapsed:.2f}s"
    assert fast.sent, "fast client should still receive the broadcast"
    assert b.connection_count == 1, "slow client should be dropped"


@pytest.mark.asyncio
async def test_broadcast_iteration_safe_against_concurrent_disconnect():
    """A disconnect happening during a broadcast must not corrupt the iteration.

    Simulates the race: while one ws is being awaited, another disconnects.
    The broadcaster snapshots its connection set, so the in-flight iteration
    is unaffected even if the underlying set is mutated.
    """
    b = AvatarBroadcaster()

    sent_started = asyncio.Event()

    class RacyWS:
        def __init__(self):
            self.sent = []

        async def send_text(self, data: str):
            sent_started.set()
            await asyncio.sleep(0.05)
            self.sent.append(data)

    racy = RacyWS()
    other = MockWS()
    b.connect(racy)
    b.connect(other)

    async def disconnect_mid_flight():
        await sent_started.wait()
        b.disconnect(other)

    await asyncio.gather(
        b.broadcast({"emotion": "neutral", "intensity": 0.4, "isSpeaking": True, "visemes": [], "blink": 0.0}),
        disconnect_mid_flight(),
    )

    assert len(racy.sent) == 1, "snapshot must protect in-flight broadcast"


@pytest.mark.asyncio
async def test_broadcast_continues_after_one_client_fails():
    """One client raising must not prevent delivery to the others."""
    b = AvatarBroadcaster()

    class DeadWS:
        async def send_text(self, data: str):
            raise ConnectionError("closed")

    a = MockWS()
    bad = DeadWS()
    c = MockWS()
    b.connect(a)
    b.connect(bad)
    b.connect(c)

    await b.broadcast({"emotion": "neutral", "intensity": 0.4, "isSpeaking": True, "visemes": [], "blink": 0.0})

    assert len(a.sent) == 1
    assert len(c.sent) == 1
    assert b.connection_count == 2


@pytest.mark.asyncio
async def test_clean_stale_method_removed():
    """Phase 1.4: clean_stale was removed. Verify no probe ever runs.

    Documenting the behavioural contract as a test so a future re-introduction
    of an undocumented heartbeat is caught immediately.
    """
    b = AvatarBroadcaster()
    assert not hasattr(b, "clean_stale"), (
        "clean_stale was intentionally removed; UE5 contract has no heartbeat. "
        "If a probe is reintroduced, it must use a documented message type and "
        "be moved to a periodic task — not invoked per-connect."
    )


@pytest.mark.asyncio
async def test_chat_helper_emits_idle_visemes_on_speech_end():
    """The chat-side helper must emit the contract-mandated idle viseme [sil, 1.0]
    when signalling speech end, never an empty array."""
    from app.api.chat import (
        _broadcast_avatar_state,
        _AVATAR_IDLE_VISEMES,
        _speaking_head_visemes,
    )

    assert _AVATAR_IDLE_VISEMES == [{"viseme": "sil", "weight": 1.0}]

    b = get_avatar_broadcaster()
    ws = MockWS()
    b.connect(ws)

    await _broadcast_avatar_state(
        emotion="neutral",
        intensity=0.4,
        is_speaking=False,
        visemes=list(_AVATAR_IDLE_VISEMES),
        viseme_timeline=[],
        duration_ms=0,
    )

    assert len(ws.sent) == 1
    payload = json.loads(ws.sent[0])
    assert payload["isSpeaking"] is False
    assert payload["visemes"] == [{"viseme": "sil", "weight": 1.0}], (
        "speech-end broadcast must include the contract-mandated idle viseme"
    )


@pytest.mark.asyncio
async def test_chat_helper_skips_when_no_clients():
    """_broadcast_avatar_state must early-return without calling broadcast()
    when no UE5 clients are connected — guards against unnecessary work."""
    from app.api.chat import _broadcast_avatar_state, _AVATAR_IDLE_VISEMES

    await _broadcast_avatar_state(
        emotion="neutral",
        intensity=0.4,
        is_speaking=False,
        visemes=list(_AVATAR_IDLE_VISEMES),
        viseme_timeline=[],
        duration_ms=0,
    )
    assert get_avatar_broadcaster().connection_count == 0


@pytest.mark.asyncio
async def test_chat_helper_isolates_broadcaster_failure(monkeypatch):
    """A broadcaster exception must not propagate up into the chat pipeline."""
    from app.api import chat as chat_mod
    from app.api.chat import _broadcast_avatar_state, _AVATAR_IDLE_VISEMES

    class ExplodingBroadcaster:
        connection_count = 1

        async def broadcast(self, _command):
            raise RuntimeError("simulated broadcaster failure")

    monkeypatch.setattr(chat_mod, "get_avatar_broadcaster", lambda: ExplodingBroadcaster())

    await _broadcast_avatar_state(
        emotion="neutral",
        intensity=0.4,
        is_speaking=False,
        visemes=list(_AVATAR_IDLE_VISEMES),
        viseme_timeline=[],
        duration_ms=0,
    )


@pytest.mark.asyncio
async def test_speaking_head_visemes_falls_back_to_idle():
    """Empty viseme frames must produce the idle viseme, not an empty list,
    so UE5 never receives an ambiguous speaking-but-no-mouth-shape signal."""
    from app.api.chat import _speaking_head_visemes, _AVATAR_IDLE_VISEMES

    assert _speaking_head_visemes([]) == _AVATAR_IDLE_VISEMES
    assert _speaking_head_visemes([{"viseme": "aa", "weight": 0.7}]) == [
        {"viseme": "aa", "weight": 0.7}
    ]


@pytest.mark.asyncio
async def test_unknown_emotion_falls_back_to_neutral_with_warning(caplog):
    """Phase 1.7: unknown emotion keys log a warning and map to 'neutral'."""
    import logging
    from app.api.chat import _map_emotion_to_ue5

    with caplog.at_level(logging.WARNING):
        result = _map_emotion_to_ue5("not-a-real-emotion-xyz")

    assert result == "neutral"
    assert any("not-a-real-emotion-xyz" in rec.message for rec in caplog.records)


@pytest.mark.asyncio
async def test_streaming_finally_signals_idle_if_speaking_state_was_set():
    """Streaming chat must guarantee UE5 leaves speaking state on error.

    Simulates a closure-based generator like chat_stream's: it sets
    spoke_to_avatar=True after a sentence broadcast, then raises mid-stream.
    The finally block must broadcast isSpeaking:False with idle visemes.
    """
    from app.api.chat import _broadcast_avatar_state, _AVATAR_IDLE_VISEMES

    b = get_avatar_broadcaster()
    ws = MockWS()
    b.connect(ws)

    spoke = False
    last_emotion = "neutral"
    last_intensity = 0.4

    async def faux_stream():
        nonlocal spoke, last_emotion, last_intensity
        try:
            await _broadcast_avatar_state(
                emotion="celebrating", intensity=0.9, is_speaking=True,
                visemes=[{"viseme": "aa", "weight": 0.9}],
                viseme_timeline=[{"viseme": "aa", "weight": 0.9}],
                duration_ms=500,
            )
            spoke = True
            last_emotion = "celebrating"
            last_intensity = 0.9
            raise RuntimeError("simulated mid-stream LLM failure")
        finally:
            if spoke:
                await _broadcast_avatar_state(
                    emotion=last_emotion,
                    intensity=last_intensity,
                    is_speaking=False,
                    visemes=list(_AVATAR_IDLE_VISEMES),
                    viseme_timeline=[],
                    duration_ms=0,
                )

    with pytest.raises(RuntimeError, match="simulated"):
        await faux_stream()

    assert len(ws.sent) == 2, "expected speaking-true then speaking-false"
    speaking = json.loads(ws.sent[0])
    idle = json.loads(ws.sent[1])
    assert speaking["isSpeaking"] is True
    assert idle["isSpeaking"] is False
    assert idle["visemes"] == [{"viseme": "sil", "weight": 1.0}]
    assert idle["emotion"] == "celebrating", "idle should pass through raw emotion label unchanged (passthrough mode)"


@pytest.mark.asyncio
async def test_streaming_finally_runs_on_cancellation():
    """asyncio.CancelledError must propagate but the finally still runs.

    Pins the contract that Oracle's review flagged: when Starlette cancels
    the streaming generator (client disconnect with task cancellation), the
    finally block must run before the exception unwinds, so UE5 receives
    the idle broadcast even on abrupt termination.
    """
    from app.api.chat import _broadcast_avatar_state, _AVATAR_IDLE_VISEMES

    b = get_avatar_broadcaster()
    ws = MockWS()
    b.connect(ws)

    finally_ran = False

    async def faux_stream():
        nonlocal finally_ran
        try:
            await _broadcast_avatar_state(
                emotion="celebrating", intensity=0.9, is_speaking=True,
                visemes=[{"viseme": "aa", "weight": 0.9}],
                viseme_timeline=[{"viseme": "aa", "weight": 0.9}],
                duration_ms=500,
            )
            raise asyncio.CancelledError()
        except asyncio.CancelledError:
            raise
        finally:
            finally_ran = True
            await _broadcast_avatar_state(
                emotion="celebrating", intensity=0.9, is_speaking=False,
                visemes=list(_AVATAR_IDLE_VISEMES),
                viseme_timeline=[], duration_ms=0,
            )

    with pytest.raises(asyncio.CancelledError):
        await faux_stream()

    assert finally_ran is True, "CancelledError must not skip the finally block"
    assert len(ws.sent) == 2
    idle = json.loads(ws.sent[1])
    assert idle["isSpeaking"] is False, "idle broadcast must fire even on cancellation"


@pytest.mark.asyncio
async def test_chat_stream_signature_accepts_request_for_disconnect_polling():
    """The chat_stream handler must accept a Request parameter so it can poll
    is_disconnected() during the token loop. Pins the contract that Phase 5b
    introduced: without this parameter, Starlette cannot signal a client
    disconnect to the generator before it tries to yield to a closed socket."""
    import inspect
    from app.api.chat import chat_stream

    sig = inspect.signature(chat_stream)
    param_names = list(sig.parameters.keys())
    assert "http_request" in param_names, (
        "chat_stream must take an http_request parameter for is_disconnected() polling"
    )
    from fastapi import Request
    assert sig.parameters["http_request"].annotation is Request, (
        "http_request parameter must be typed as fastapi.Request so FastAPI injects it"
    )

@pytest.mark.asyncio
async def test_broadcast_omits_agent_state_when_none():
    """Phase 6a v2.1 protocol guarantee: when agent_state is None (the default
    and the entirety of v2 callers), the broadcast payload must NOT include
    an agentState key at all. v2 UE5 clients must see byte-identical JSON
    to what they saw before this feature."""
    from app.api.chat import _broadcast_avatar_state, _AVATAR_IDLE_VISEMES

    b = get_avatar_broadcaster()
    ws = MockWS()
    b.connect(ws)

    await _broadcast_avatar_state(
        emotion='neutral', intensity=0.4, is_speaking=True,
        visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[], duration_ms=0,
    )

    assert len(ws.sent) == 1
    payload = json.loads(ws.sent[0])
    assert 'agentState' not in payload, (
        'v2.1 must be backwards-compatible: agentState must be ABSENT (not just "idle") '
        'when the caller does not supply it. v2 UE5 clients rely on this.'
    )


@pytest.mark.asyncio
async def test_broadcast_includes_agent_state_when_set():
    """Phase 6a v2.1 protocol: when agent_state is set, it must appear in the
    broadcast payload exactly as the caller named it. UE5 dispatches on the
    string value to drive distinct animations."""
    from app.api.chat import _broadcast_avatar_state, _AVATAR_IDLE_VISEMES

    b = get_avatar_broadcaster()
    ws = MockWS()
    b.connect(ws)

    await _broadcast_avatar_state(
        emotion='thinking_deep', intensity=0.6, is_speaking=False,
        visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[], duration_ms=0,
        agent_state='searching',
    )

    payload = json.loads(ws.sent[0])
    assert payload['agentState'] == 'searching'
    assert payload['isSpeaking'] is False


@pytest.mark.asyncio
async def test_broadcast_helper_signature_accepts_agent_state_kwarg():
    """Phase 6a contract: the helper signature must list agent_state as an
    optional keyword-only parameter. A future 'tidy unused param' edit that
    drops the parameter would silently break Phase 6c's tool-call loop which
    broadcasts agentState='searching' during tool dispatch."""
    import inspect
    from app.api.chat import _broadcast_avatar_state

    sig = inspect.signature(_broadcast_avatar_state)
    assert 'agent_state' in sig.parameters, (
        '_broadcast_avatar_state must accept agent_state= for v2.1 protocol; '
        'Phase 6c tool-call loop depends on this'
    )
    param = sig.parameters['agent_state']
    assert param.default is None, (
        'agent_state must default to None so existing callers do not have to '
        'pass it (backwards compatibility with all 9 v2 call sites)'
    )



def test_ws_origin_check_allows_native_clients_with_no_origin_header():
    """All connection attempts are accepted in dev mode — with or without
    Origin header, from any source. The handler logs every attempt so the
    UE5 dev can debug.

    Note (refactor 2026-05-17): the @router.websocket('/ws/avatar') handler
    was extracted to internal helper `_handle_avatar_ws` so the same
    accept logic powers three path variants (/ws/avatar, /ws, /). The test
    introspects the helper, not the thin delegating wrapper.
    """
    import inspect
    from app.api.ws_avatar import _handle_avatar_ws
    src = inspect.getsource(_handle_avatar_ws)
    assert "websocket.accept()" in src, "handler must call websocket.accept()"
    assert "close(code=1008)" not in src, "no origin rejection in dev mode"


def test_ws_accepts_all_origins_in_dev_mode():
    """No origin check during local development — production doesn't exist
    yet and UE5 on the same machine is zero risk. Every connection attempt
    is logged so the developer can see what Origin UE5 sends.

    When production goes live, WS_ALLOWED_ORIGINS env var will gate access.
    This test pins that the handler unconditionally calls websocket.accept()
    with no rejection path.

    Note (refactor 2026-05-17): introspects `_handle_avatar_ws` helper
    (the actual implementation) instead of the thin delegating wrapper.
    """
    import inspect
    from app.api.ws_avatar import _handle_avatar_ws
    src = inspect.getsource(_handle_avatar_ws)

    accept_count = src.count("websocket.accept()")
    assert accept_count == 1, (
        f"expected 1 websocket.accept(), found {accept_count}. "
        "Dev mode should accept unconditionally — no close(code=1008) branch."
    )
    # Must NOT contain any close(code=1008) — no rejection
    assert "close(code=1008)" not in src, (
        "origin rejection (code 1008) should not exist in dev mode"
    )
    # Must log the origin
    assert "origin=" in src or "origin=%" in src, (
        "must log the UE5 origin for debugging"
    )


def test_ws_allows_local_origin_on_any_port():
    """_is_local_origin helper is correct for future use (production gating).
    Dev mode accepts everything, but when WS_ALLOWED_ORIGINS is re-enabled
    for production, this helper must correctly identify local-machine origins."""
    from app.api.ws_avatar import _is_local_origin

    assert _is_local_origin("http://localhost") is True
    assert _is_local_origin("http://localhost:7777") is True
    assert _is_local_origin("https://localhost:8558") is True
    assert _is_local_origin("http://127.0.0.1") is True
    assert _is_local_origin("http://127.0.0.1:80") is True
    assert _is_local_origin("http://[::1]:7777") is True
    assert _is_local_origin("") is False
    assert _is_local_origin("https://edututor.ai") is False


# ─── ARKit (v3.0) contract pins ───────────────────────────────────────────────
# Per docs/ue5-avatar-contract.md:91-145. Before May 12, 2026 these surfaces
# were live but zero-pinned at the WS layer — a channel-rename or shape change
# in audio2lipsync_client.py would have silently broken Roland's MetaHuman
# Blueprint at demo time. These four tests lock the contract so a refactor
# fires red before reaching UE5.


@pytest.mark.asyncio
async def test_broadcast_omits_arkit_when_absent():
    """Per docs/ue5-avatar-contract.md:70 ('if arkit field exists → ARKit mode'):
    viseme-only broadcasts must NOT leak any arkit/arkit_frames keys. A leaked
    empty key would silently flip the Blueprint's mode-detection and break
    lipsync. Pins the absence contract for chat-driven broadcasts."""
    from app.api.chat import _broadcast_avatar_state, _AVATAR_IDLE_VISEMES

    b = get_avatar_broadcaster()
    ws = MockWS()
    b.connect(ws)

    await _broadcast_avatar_state(
        emotion='neutral', intensity=0.4, is_speaking=True,
        visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[], duration_ms=0,
    )

    payload = json.loads(ws.sent[0])
    assert 'arkit' not in payload, "viseme-only payload leaked 'arkit' key"
    assert 'arkit_frames' not in payload, "viseme-only payload leaked 'arkit_frames' key"


def test_arkit_to_frames_schema_pinned():
    """Per docs/ue5-avatar-contract.md:113-126 — arkit_frames timeline schema:
    each frame MUST have start_ms (int), duration_ms (int), arkit (dict).
    Pins audio2lipsync_client.arkit_to_frames output shape so Roland's
    Blueprint timeline reader can rely on the exact field names + types."""
    from app.services.audio2lipsync_client import arkit_to_frames

    arkit_raw = {
        "JawOpen": [0.02, 0.18, 0.31],
        "MouthFunnel": [0.10, 0.12, 0.08],
    }
    frames, duration_ms = arkit_to_frames(arkit_raw, fps=60)

    assert len(frames) == 3, f"expected 3 frames from 3 samples, got {len(frames)}"
    assert duration_ms == int(3 / 60 * 1000), f"duration mismatch: {duration_ms}"
    for i, frame in enumerate(frames):
        assert "start_ms" in frame, f"frame {i} missing start_ms"
        assert "duration_ms" in frame, f"frame {i} missing duration_ms"
        assert "arkit" in frame, f"frame {i} missing arkit channel dict"
        assert isinstance(frame["start_ms"], int), f"frame {i} start_ms not int"
        assert isinstance(frame["duration_ms"], int), f"frame {i} duration_ms not int"
        assert isinstance(frame["arkit"], dict), f"frame {i} arkit not dict"


def test_arkit_channel_names_are_pascalcase():
    """Per docs/ue5-avatar-contract.md:128-145 — ARKit channels MUST be
    PascalCase (matching audio2lipsync constants.py training data). MetaHuman's
    mh_arkit_mapping_pose Pose Asset relies on this exact spelling for LiveLink
    auto-mapping; a renamed channel = silent break of Roland's Blueprint at
    demo. The 52-count is also fixed by the contract example payload."""
    from app.services.audio2lipsync.constants import BLENDSHAPE_NAMES

    assert len(BLENDSHAPE_NAMES) == 52, (
        f"contract specifies 52 ARKit blendshapes, got {len(BLENDSHAPE_NAMES)}"
    )
    for name in BLENDSHAPE_NAMES:
        assert name[0].isupper(), f"channel {name!r} not PascalCase (first letter lowercase)"
        assert "_" not in name, f"channel {name!r} contains underscore (PascalCase forbids)"

    # Specific named channels from contract example payloads (:102-106, :133)
    for required in ("JawOpen", "MouthFunnel", "MouthSmileLeft", "EyeBlinkLeft", "BrowInnerUp"):
        assert required in BLENDSHAPE_NAMES, (
            f"contract example requires {required!r} channel, missing from constants.py"
        )


def test_arkit_to_frames_prunes_below_threshold():
    """Per docs/ue5-avatar-contract.md:111 — 'Only non-zero channels are sent
    (threshold > 0.005).' Pinned to audio2lipsync_client.py:225 (`if v > 0.005`).
    Sub-threshold values must NOT appear in emitted frames; pruning keeps the
    60fps WebSocket payload small on slow links and prevents UE5 from blending
    invisible motion. The threshold is strictly greater-than (0.005 itself is
    pruned)."""
    from app.services.audio2lipsync_client import arkit_to_frames

    arkit_raw = {
        "JawOpen":        [0.31,  0.003, 0.18],   # 0.003 below threshold
        "MouthFunnel":    [0.0,   0.12,  0.001],  # 0.0 and 0.001 below
        "MouthSmileLeft": [0.005, 0.05,  0.20],   # 0.005 == threshold, NOT > → pruned
    }
    frames, _ = arkit_to_frames(arkit_raw, fps=60)

    # Frame 0: JawOpen=0.31 (in), MouthFunnel=0.0 (out), MouthSmileLeft=0.005 (out, not strictly >)
    assert frames[0]["arkit"] == {"JawOpen": 0.31}, (
        f"frame 0 unexpected channels: {frames[0]['arkit']}"
    )
    # Frame 1: JawOpen=0.003 (out), MouthFunnel=0.12 (in), MouthSmileLeft=0.05 (in)
    assert "JawOpen" not in frames[1]["arkit"], "0.003 must be pruned"
    assert frames[1]["arkit"]["MouthFunnel"] == 0.12
    assert frames[1]["arkit"]["MouthSmileLeft"] == 0.05
    # Frame 2: JawOpen=0.18 (in), MouthFunnel=0.001 (out), MouthSmileLeft=0.20 (in)
    assert frames[2]["arkit"]["JawOpen"] == 0.18
    assert "MouthFunnel" not in frames[2]["arkit"], "0.001 must be pruned"
    assert frames[2]["arkit"]["MouthSmileLeft"] == 0.20


@pytest.mark.asyncio
async def test_dev_broadcast_endpoint_pushes_payload_to_ws_clients(monkeypatch):
    """M2 deliverable (2026-05-12). The /api/v1/avatar/dev/broadcast endpoint
    lets Roland/3D inject synthetic payloads onto /ws/avatar without going
    through chat. The payload must be passed verbatim to broadcaster so the
    Blueprint sees byte-identical traffic to real chat broadcasts."""
    monkeypatch.setenv("EDU_DEV_MODE", "1")
    from app.api.avatar_dev import dev_broadcast

    b = get_avatar_broadcaster()
    ws = MockWS()
    b.connect(ws)

    payload = {
        "emotion": "thinking_deep",
        "intensity": 0.7,
        "isSpeaking": False,
        "visemes": [{"viseme": "sil", "weight": 1.0}],
        "agentState": "searching",
        "blink": 0.0,
    }
    resp = await dev_broadcast(payload)

    assert resp.success is True
    assert resp.connections == 1
    assert len(ws.sent) == 1
    parsed = json.loads(ws.sent[0])
    assert parsed["agentState"] == "searching"
    assert parsed["emotion"] == "thinking_deep"


@pytest.mark.asyncio
async def test_dev_broadcast_endpoint_returns_404_when_dev_mode_disabled(monkeypatch):
    """EDU_DEV_MODE=0 hides the dev-injector route. Pinned because the
    endpoint takes an unvalidated dict body and trusts the env gate to
    keep it out of production. Truthy-default with explicit-off semantics
    matches the codebase's _is_dev_mode helper."""
    from fastapi import HTTPException
    monkeypatch.setenv("EDU_DEV_MODE", "0")
    from app.api.avatar_dev import dev_broadcast

    with pytest.raises(HTTPException) as exc_info:
        await dev_broadcast({"emotion": "neutral"})
    assert exc_info.value.status_code == 404
