# tutor-service/app/services/avatar_broadcaster.py
"""
AvatarBroadcaster — manages all UE5 WebSocket connections.

UE5 Blueprints connect to /ws/avatar.
The chat pipeline calls broadcaster.broadcast() after each AI response.

Stale connections are detected lazily: a `send_text` failure during a real
broadcast is the signal that drops a dead connection. There is no separate
ping/heartbeat probe — UE5's documented protocol does not include one.
"""
import asyncio
import contextvars
import json
import logging
import random
import time
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

# v0.7.0 (W2): per-coroutine broadcast scope flag. ContextVar is asyncio-safe:
# each request handler gets its own value, set at entry, automatically isolated
# from other concurrent handlers (no global-flag race condition). Default
# True so any code path that doesn't explicitly opt out keeps current behavior.
_broadcast_scope: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "edututor.avatar.broadcast_scope", default=True
)

# After cancel(), suppress any new speaking broadcasts for this many seconds
# so in-flight TTS tasks from the cancelled turn can't re-open the avatar's
# mouth before they finish unwinding. Generous because Edge TTS streaming
# tasks can keep firing audio_chunk -> avatar broadcasts for up to ~2s
# after the originating chat/stream coroutine is cancelled.
_CANCEL_MUTE_WINDOW_S = 3.0

_SEND_TIMEOUT_SECONDS = 2.0
_HEARTBEAT_MIN_INTERVAL_S = 3.0
_HEARTBEAT_MAX_INTERVAL_S = 6.0
_BLINK_PULSE_WEIGHT = 0.85


class AvatarBroadcaster:
    def __init__(self) -> None:
        self._connections: Set[Any] = set()
        self._is_speaking: bool = False
        # When user cancels mid-speech we record a deadline; any isSpeaking=true
        # broadcast attempted before this deadline is suppressed.
        self._mute_speak_until: float = 0.0
        # v0.7.0 (W2): broadcast scope flag now lives on a module-level
        # ContextVar so concurrent request handlers don't race. See
        # ``set_broadcast_enabled`` below.

    def connect(self, websocket: Any) -> None:
        self._connections.add(websocket)
        logger.info("Avatar WS connected. Total: %d", len(self._connections))

    def disconnect(self, websocket: Any) -> None:
        self._connections.discard(websocket)
        logger.info("Avatar WS disconnected. Total: %d", len(self._connections))

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    @property
    def is_speaking(self) -> bool:
        return self._is_speaking

    def set_speaking(self, value: bool) -> None:
        self._is_speaking = bool(value)

    def cancel_speech(self, estimated_remaining_tts_seconds: float = 0.0) -> None:
        """Suppress isSpeaking=True broadcasts for the next CANCEL_MUTE_WINDOW seconds.

        Args:
            estimated_remaining_tts_seconds: Optional estimate of how long
                in-flight TTS coroutines might still emit broadcasts. The mute
                window is max(_CANCEL_MUTE_WINDOW_S, estimated * 1.5).

        Called by the /api/v1/avatar/stop endpoint. Without this, in-flight TTS
        coroutines from the cancelled chat turn can finish and emit one more
        sentence_start broadcast, re-opening the avatar's mouth right after we
        told it to close.
        """
        window = max(_CANCEL_MUTE_WINDOW_S, estimated_remaining_tts_seconds * 1.5)
        self._mute_speak_until = time.monotonic() + window
        self._is_speaking = False

    def clear_speech_mute(self) -> None:
        """Reset the suppression window. Called at the start of a new chat turn
        so the avatar can speak again."""
        self._mute_speak_until = 0.0

    def set_broadcast_enabled(self, value: bool) -> contextvars.Token:
        """v0.7.0 (W2): per-coroutine scope kill-switch via ContextVar.

        Returns the context Token; pass it to ``reset_broadcast_enabled()``
        to restore the prior scope. This is asyncio-safe — concurrent chat
        handlers each see their own flag without race conditions.

        Handlers that should NOT lipsync the avatar (KB endpoints sharing the
        chat-stream pipeline) wrap their body:

            tok = broadcaster.set_broadcast_enabled(False)
            try:
                ...
            finally:
                broadcaster.reset_broadcast_enabled(tok)
        """
        return _broadcast_scope.set(bool(value))

    def reset_broadcast_enabled(self, token: contextvars.Token) -> None:
        """Restore the prior broadcast scope (paired with set_broadcast_enabled)."""
        try:
            _broadcast_scope.reset(token)
        except ValueError:
            # token from a different context — pre-default to True
            _broadcast_scope.set(True)

    @property
    def broadcast_enabled(self) -> bool:
        return _broadcast_scope.get()

    async def broadcast(self, command: dict) -> None:
        """Send AvatarCommand JSON to all connected UE5 clients.

        Snapshots the connection set up-front so a concurrent disconnect
        handler cannot mutate the set mid-iteration. Each send is bounded
        by ``_SEND_TIMEOUT_SECONDS``; failures (timeout, connection closed,
        or any send-time exception) cause the connection to be dropped.
        """
        # Suppress speaking broadcasts that fire after a user cancel — in-flight
        # TTS coroutines can race past the cancel signal and would otherwise
        # re-open the avatar's mouth (or resume audio). Covers both the legacy
        # avatarCommand (isSpeaking) and the streamed-audio protocol
        # (speech_start / speech_chunk + the full-bundle speech_full).
        # speech_stop and speech_end are NEVER suppressed by the cancel-mute
        # window — they must always reach UE5 to silence the avatar after a
        # user cancel.
        # v0.7.0 (W2): per-coroutine scope gate via ContextVar. KB endpoints
        # flip this False for the duration of their chat-stream turn so the
        # avatar doesn't lipsync as if the user is in a chat conversation.
        # v0.7.1: the filter is SYMMETRIC — when scope is off, drop EVERY
        # event including speech_stop / speech_end. Reason: a turn whose
        # speech_start was filtered must not emit an orphaned speech_end,
        # because UE5 treats the end as authoritative state-clearing and
        # an end without a matching start desyncs the lipsync clock (the
        # regression symptom in v0.7.0: drift + 2 phantom audio sounds when
        # a leaked-False scope let only the end frames through to UE5).
        # The cancel-mute path (above) still uses asymmetric suppression
        # because that path is about quieting in-flight TTS after an
        # explicit user stop, not about per-turn scope gating.
        msg_type = command.get("type")
        if not _broadcast_scope.get():
            logger.debug("Avatar broadcast SKIPPED (scope disabled, type=%s)", msg_type)
            return
        is_speak_event = bool(command.get("isSpeaking")) or msg_type in ("speech_start", "speech_chunk", "speech_full")
        if is_speak_event and time.monotonic() < self._mute_speak_until:
            logger.info(
                "Avatar broadcast SUPPRESSED (speak-mute active for %.1fs more)",
                self._mute_speak_until - time.monotonic(),
            )
            return

        # Snapshot so concurrent disconnect handlers can't mutate during await.
        snapshot: List[Any] = list(self._connections)
        if not snapshot:
            logger.debug("Avatar broadcast skipped: no clients connected")
            return

        payload = json.dumps(command)
        dead: Set[Any] = set()
        sent = 0
        for ws in snapshot:
            try:
                await asyncio.wait_for(ws.send_text(payload), timeout=_SEND_TIMEOUT_SECONDS)
                sent += 1
            except asyncio.TimeoutError:
                logger.warning("Avatar WS send timed out after %.1fs, dropping client", _SEND_TIMEOUT_SECONDS)
                dead.add(ws)
            except Exception as exc:
                logger.warning("Avatar WS send failed, dropping client: %s", exc)
                dead.add(ws)

        for ws in dead:
            self._connections.discard(ws)

        # Surface deliveries at INFO so the UE5 integrator can correlate chat
        # turns with broadcasts in production logs without bumping log level.
        speaking = command.get("isSpeaking")
        emotion = command.get("emotion", "?")
        if dead:
            logger.info(
                "Avatar broadcast (type=%s, emotion=%s, speaking=%s): %d/%d delivered, %d dropped (remaining: %d)",
                msg_type or "avatarCommand", emotion, speaking, sent, len(snapshot), len(dead), len(self._connections),
            )
        elif sent:
            # speech_chunk fires many times per sentence — keep it at DEBUG so it
            # doesn't flood production logs; everything else stays at INFO.
            if msg_type == "speech_chunk":
                logger.debug("Avatar speech_chunk (idx=%s) delivered to %d client(s)", command.get("index"), sent)
            else:
                logger.info(
                    "Avatar broadcast (type=%s, emotion=%s, speaking=%s) delivered to %d client(s)",
                    msg_type or "avatarCommand", emotion, speaking, sent,
                )


_broadcaster: Optional[AvatarBroadcaster] = None


def get_avatar_broadcaster() -> AvatarBroadcaster:
    global _broadcaster
    if _broadcaster is None:
        _broadcaster = AvatarBroadcaster()
    return _broadcaster


def build_blink_payload() -> Dict[str, Any]:
    return {
        "emotion": "neutral",
        "intensity": 0.3,
        "isSpeaking": False,
        "visemes": [{"viseme": "sil", "weight": 1.0}],
        "viseme_timeline": [],
        "total_duration_ms": 0,
        "blink": _BLINK_PULSE_WEIGHT,
    }


async def _emit_idle_heartbeat(broadcaster: AvatarBroadcaster) -> None:
    if broadcaster.connection_count == 0:
        return
    if broadcaster.is_speaking:
        return
    await broadcaster.broadcast(build_blink_payload())


async def idle_heartbeat_loop(broadcaster: AvatarBroadcaster) -> None:
    """Long-running task: emit blink pulses at randomized intervals.

    Scheduled in main.py's lifespan context. Cancellation (on shutdown)
    is propagated via asyncio.CancelledError — the loop returns cleanly
    so the lifespan teardown can complete.
    """
    try:
        while True:
            interval = random.uniform(_HEARTBEAT_MIN_INTERVAL_S, _HEARTBEAT_MAX_INTERVAL_S)
            await asyncio.sleep(interval)
            try:
                await _emit_idle_heartbeat(broadcaster)
            except Exception as exc:  # noqa: BLE001 — heartbeat must never crash the loop
                logger.warning("idle heartbeat emit failed (continuing): %s", exc)
    except asyncio.CancelledError:
        logger.info("Idle heartbeat loop cancelled cleanly")
        raise
