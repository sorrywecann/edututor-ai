# tutor-service/app/api/ws_avatar.py
"""
/ws/avatar — WebSocket endpoint for UE5 Blueprints.

Blueprint side:
  Create WebSocket → Connect to ws://localhost:8000/ws/avatar
  Bind OnMessage → Parse JSON → Apply emotion/viseme blendshapes

Message format (server → UE5):
  {
    "emotion": "joy",
    "intensity": 0.9,
    "isSpeaking": true,
    "visemes": [{"viseme": "aa", "weight": 0.9}],
    "blink": 0.0,
    "viseme_timeline": [...],
    "total_duration_ms": 2400,
    "agentState": "idle" | "thinking" | "searching" | "writing" | "listening"  // v2.1, optional
  }

Streamed-audio protocol (server → UE5), ONLY when EDU_UE5_AUDIO=1 — the avatar
plays the MP3 itself so Wilbur captures audio+video as one synced WebRTC stream.
Full contract + RAI mapping: docs/plans/ue5-audio-protocol.md.
  {"type":"speech_start","index":0,"emotion":"joy","intensity":0.9,
   "viseme_timeline":[...],"total_duration_ms":2400,"audio_mp3_b64":"<MP3 b64>"}
  {"type":"speech_chunk","index":0,"audio_mp3_b64":"<MP3 b64>"}
  {"type":"speech_end","index":0}
  {"type":"speech_stop"}          // barge-in: stop audio + visemes now

Message format (UE5 → server):
  {"type": "avatar_ready", "capabilities": ["viseme", "emotion", "state"]}
  {"type": "speech_complete"}
"""
import json
import logging
import os
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.deps import avatar_broadcaster_dep
from app.services.avatar_broadcaster import AvatarBroadcaster, get_avatar_broadcaster

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/v1/avatar/status")
async def avatar_status(broadcaster: AvatarBroadcaster = Depends(avatar_broadcaster_dep)):
    """Report active UE5 avatar WebSocket connections.

    Broadcaster injected via Depends — eager-safe because AvatarBroadcaster
    is an in-memory connection set with no init failure mode.
    """
    return {"connected": broadcaster.connection_count > 0, "clients": broadcaster.connection_count}


@router.post("/api/v1/avatar/stop")
async def avatar_stop(broadcaster: AvatarBroadcaster = Depends(avatar_broadcaster_dep)):
    """Immediately tell UE5 avatar to stop speaking — forcefully.

    Called by the frontend when the user clicks the orb to interrupt mid-speech.

    UE5's Blueprint plays viseme animations based on the ``total_duration_ms``
    it received with the last sentence_start broadcast. A single isSpeaking=false
    message doesn't reliably interrupt that animation — the Blueprint can keep
    moving the mouth until the duration timer expires.

    Defence: three-step burst:
      1. Mute the broadcaster so in-flight TTS broadcasts can't override us.
      2. Send a NEW animation command with ``total_duration_ms=80`` of silence.
         This OVERWRITES whatever animation UE5 is currently playing — UE5
         restarts on every broadcast — so the avatar's mouth shuts within ~80ms.
      3. Send a final isSpeaking=false / agentState=idle command 100ms later
         so any client that drives state via isSpeaking transitions sees the
         change too.
    """
    import asyncio as _asyncio

    if hasattr(broadcaster, "cancel_speech"):
        broadcaster.cancel_speech()
    elif hasattr(broadcaster, "set_speaking"):
        broadcaster.set_speaking(False)
    if broadcaster.connection_count == 0:
        return {"stopped": True, "clients": 0}

    silence_frame = {"viseme": "sil", "weight": 1.0, "start_ms": 0}
    # Step 2: tiny silence animation that overwrites the in-progress timeline.
    payload_short = {
        "emotion": "neutral",
        "intensity": 0.3,
        "isSpeaking": False,
        "visemes": [{"viseme": "sil", "weight": 1.0}],
        "blink": 0.0,
        "viseme_timeline": [silence_frame],
        "total_duration_ms": 80,
        "agentState": "idle",
    }
    # Step 3: final idle state with zero duration.
    payload_final = {
        "emotion": "neutral",
        "intensity": 0.3,
        "isSpeaking": False,
        "visemes": [{"viseme": "sil", "weight": 1.0}],
        "blink": 0.0,
        "viseme_timeline": [],
        "total_duration_ms": 0,
        "agentState": "idle",
    }

    # First: stop UE5's own audio (Runtime Audio Importer) when streamed-audio
    # mode (EDU_UE5_AUDIO) is active. The silence-viseme bursts below only shut
    # the mouth — they don't stop audio the avatar is already playing. Harmless
    # if the Blueprint doesn't handle it (unknown types are ignored). Never
    # suppressed by the speak-mute window (it's a stop, not a speak).
    try:
        await broadcaster.broadcast({"type": "speech_stop"})
    except Exception as exc:
        logger.warning("Avatar speech_stop failed: %s", exc)

    try:
        await broadcaster.broadcast(payload_short)
    except Exception as exc:
        logger.warning("Avatar stop burst 1 failed: %s", exc)

    async def _delayed_final():
        await _asyncio.sleep(0.1)
        try:
            await broadcaster.broadcast(payload_final)
        except Exception as exc:
            logger.warning("Avatar stop burst 2 failed: %s", exc)

    _asyncio.create_task(_delayed_final())

    return {"stopped": True, "clients": broadcaster.connection_count}


_WS_MAX_MESSAGE_BYTES = 16_384


def _is_local_origin(origin: str) -> bool:
    """True if origin points at the local machine (any scheme, any port).

    Matches:
      http://localhost       http://localhost:7777    https://localhost:8558
      http://127.0.0.1       http://127.0.0.1:80      https://127.0.0.1:443
      http://[::1]           http://[::1]:7777

    Uses urlparse so we check the hostname, not the whole string — this
    handles port-less origins and IPv6 that simple startswith() misses.
    """
    if not origin:
        return False
    try:
        host = urlparse(origin).hostname
    except (ValueError, AttributeError):
        return False
    return host in ("localhost", "127.0.0.1", "::1")


async def _handle_avatar_ws(websocket: WebSocket, path: str) -> None:
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    logger.info(
        "WS %s connect — origin=%r (all origins accepted in dev mode)",
        path, origin or "<none>",
    )

    broadcaster = get_avatar_broadcaster()
    await websocket.accept()
    broadcaster.connect(websocket)

    try:
        await websocket.send_text(
            '{"type":"connected","message":"EduTutor avatar bridge v2 ready"}'
        )
        logger.info("UE5 avatar client connected (total: %d)", broadcaster.connection_count)
        while True:
            data = await websocket.receive_text()
            if len(data) > _WS_MAX_MESSAGE_BYTES:
                await websocket.close(code=1009)
                break

            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                logger.warning("UE5 sent non-JSON: %s", data[:200])
                continue

            msg_type = msg.get("type", "")

            if msg_type == "avatar_ready":
                caps = msg.get("capabilities", [])
                logger.info("UE5 → avatar_ready received (capabilities=%s) → sending ready_ack", caps)
                await websocket.send_text(json.dumps({
                    "type": "ready_ack",
                    "version": "v2",
                    "capabilities_accepted": caps,
                }))
            elif msg_type == "speech_complete":
                logger.info("UE5 → speech_complete")
            else:
                logger.info("UE5 → unknown message type '%s' (full payload: %s)", msg_type, data[:200])

    except WebSocketDisconnect:
        broadcaster.disconnect(websocket)
        logger.info("UE5 avatar client disconnected (total: %d)", broadcaster.connection_count)
    except Exception as exc:
        broadcaster.disconnect(websocket)
        logger.error("Avatar WS error: %s", exc)


@router.websocket("/ws/avatar")
async def avatar_websocket(websocket: WebSocket) -> None:
    await _handle_avatar_ws(websocket, "/ws/avatar")


@router.websocket("/ws")
async def avatar_websocket_ws(websocket: WebSocket) -> None:
    await _handle_avatar_ws(websocket, "/ws")


# v0.6.4: removed the catch-all WebSocket on '/' — it hijacked the HTTP root
# (any WS upgrade to '/' was treated as an avatar client). UE5 BP connects
# to '/ws/avatar' explicitly and '/ws' is kept as a legacy alias. If a future
# client needs root-WS support, route it through a distinct path.
