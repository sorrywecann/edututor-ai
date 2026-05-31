"""Pin the idle heartbeat contract: while no chat is speaking, the broadcaster
emits periodic blink pulses so the UE5 avatar doesn't visually freeze between
turns. Without this, the avatar is "frozen as a statue" between sentences —
the single most embarrassing visual gap for a demo.

Contract pinned:
1. Broadcaster tracks an is_speaking flag (set by chat handler around speaking
   broadcasts). Heartbeat task suppresses itself while flag is True.
2. Heartbeat task emits AvatarCommand with isSpeaking=False and a non-zero
   blink pulse value at random 3-6s intervals.
3. Heartbeat task does nothing when no UE5 clients are connected (no wasted
   broadcasts).
4. Broadcaster's set_speaking() is idempotent — calling twice with True
   doesn't double-suppress.
"""
from __future__ import annotations

import asyncio
import pytest

from app.services.avatar_broadcaster import AvatarBroadcaster, build_blink_payload


class _CapturingWS:
    """Stand-in WebSocket that records every payload sent to it."""

    def __init__(self) -> None:
        self.payloads: list = []

    async def send_text(self, data: str) -> None:
        import json
        self.payloads.append(json.loads(data))


def test_broadcaster_tracks_speaking_state():
    """is_speaking flag defaults to False and toggles via set_speaking().
    The chat handler owns this state — heartbeat task only reads it."""
    b = AvatarBroadcaster()
    assert b.is_speaking is False
    b.set_speaking(True)
    assert b.is_speaking is True
    b.set_speaking(False)
    assert b.is_speaking is False


def test_set_speaking_is_idempotent():
    """Calling set_speaking(True) twice in a row is safe — no double-state.
    Real chat handlers may inadvertently call it twice across nested awaits."""
    b = AvatarBroadcaster()
    b.set_speaking(True)
    b.set_speaking(True)
    assert b.is_speaking is True


def test_build_blink_payload_has_non_zero_blink_and_idle_state():
    """Idle heartbeat payload must:
    - have isSpeaking=False (we're not speaking)
    - have blink > 0 (the actual pulse)
    - have neutral emotion at low intensity (not jarring)
    - omit agentState (v2.1 — None signals 'no change' to UE5)
    """
    payload = build_blink_payload()
    assert payload["isSpeaking"] is False
    assert payload["blink"] > 0.0, "blink heartbeat must have non-zero blink weight"
    assert payload["emotion"] == "neutral"
    assert 0.0 <= payload["intensity"] <= 0.5, "idle intensity should be subtle"
    assert "agentState" not in payload, "agentState omitted in idle heartbeat (v2.1 backwards-compat)"
    assert payload["visemes"] == [{"viseme": "sil", "weight": 1.0}], (
        "idle viseme must be the documented [{sil, 1.0}] per docs/ue5-avatar-contract.md"
    )


@pytest.mark.asyncio
async def test_heartbeat_skipped_when_no_clients():
    """Heartbeat task does nothing when broadcaster has zero connections.
    Avoids wasted log noise and broadcaster cycles in CI/dev environments
    where no UE5 client is attached."""
    from app.services.avatar_broadcaster import _emit_idle_heartbeat
    b = AvatarBroadcaster()
    assert b.connection_count == 0
    await _emit_idle_heartbeat(b)
    # No assertion on side effects beyond "did not raise" — broadcaster.broadcast
    # itself is also no-op when connections=0, so this is a redundancy check.


@pytest.mark.asyncio
async def test_heartbeat_emits_blink_when_clients_connected_and_not_speaking():
    """When clients are connected AND is_speaking=False, the heartbeat emits
    one blink payload. This is the happy-path that proves the avatar gets
    a periodic 'i'm alive' signal during silence."""
    from app.services.avatar_broadcaster import _emit_idle_heartbeat
    b = AvatarBroadcaster()
    ws = _CapturingWS()
    b.connect(ws)
    assert b.is_speaking is False

    await _emit_idle_heartbeat(b)

    assert len(ws.payloads) == 1, f"expected 1 heartbeat payload, got {len(ws.payloads)}"
    p = ws.payloads[0]
    assert p["isSpeaking"] is False
    assert p["blink"] > 0.0


@pytest.mark.asyncio
async def test_heartbeat_skipped_when_speaking():
    """When chat is actively speaking (is_speaking=True), heartbeat suppresses
    itself — sending a blink mid-speech would override the speaking-state
    visemes and look broken."""
    from app.services.avatar_broadcaster import _emit_idle_heartbeat
    b = AvatarBroadcaster()
    ws = _CapturingWS()
    b.connect(ws)
    b.set_speaking(True)

    await _emit_idle_heartbeat(b)

    assert len(ws.payloads) == 0, (
        "heartbeat must NOT broadcast while is_speaking=True — would clobber "
        "the active speaking visemes/timeline"
    )
