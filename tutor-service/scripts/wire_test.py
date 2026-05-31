"""
wire_test.py — capture exactly what the backend emits on `/ws/avatar` (UE5) and
the SSE chat stream (browser) during a single chat turn. The reusable
verification "button" for the avatar contract.

Usage:
    cd tutor-service
    .\.venv\Scripts\python.exe scripts\wire_test.py
    .\.venv\Scripts\python.exe scripts\wire_test.py --msg "Ahoj, ako sa máš?"

What it tells you (auto-detects the active mode from what arrives):
- LEGACY   (EDU_UE5_AUDIO=0)               — avatarCommand with viseme_timeline; browser plays the audio over SSE.
- CHUNKED  (EDU_UE5_AUDIO=1, MODE=chunked) — speech_start + speech_chunk* + speech_end; UE5 streams via RAI.
- FULL     (EDU_UE5_AUDIO=1, MODE=full)    — one speech_full per sentence; UE5 plays via RAI ImportAudioFromBuffer.

The SSE audio_chunk to the browser is the documented fallback — it should
always flow regardless of which UE5 path is active.

Prints every relevant field on each message so you can verify visemes, emotion,
intensity, viseme_timeline shape, audio_mp3_b64 size, total_duration_ms etc.

Requires the backend up on :8000. Run the chat against the live LLM/TTS stack.
"""
from __future__ import annotations
import sys, argparse, asyncio, json, time, urllib.request

# Slovak / unicode-safe console
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

import websockets

BACKEND_HTTP = "http://localhost:8000"
WS_URL  = "ws://localhost:8000/ws/avatar"
SSE_URL = f"{BACKEND_HTTP}/api/v1/chat/stream"
DEFAULT_MSG = "Ahoj, povedz mi prosím krátku vetu po slovensky."


async def _ws_listener(events: list, ready: asyncio.Event) -> None:
    """Connect to /ws/avatar pretending to be UE5, send avatar_ready, record everything."""
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps(
            {"type": "avatar_ready",
             "capabilities": ["viseme", "emotion", "state", "speech_full"]}
        ))
        ready.set()
        try:
            async for msg in ws:
                events.append((time.time(), msg))
        except Exception:
            pass


def _sse_fire(events: list, msg: str, mode_id: str) -> None:
    """POST to /chat/stream and parse SSE events."""
    body = json.dumps({"message": msg, "mode_id": mode_id}).encode("utf-8")
    req = urllib.request.Request(
        SSE_URL, data=body,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            try:
                events.append((time.time(), json.loads(line[5:].strip())))
            except Exception:
                continue


def _ascii_safe(s: str, n: int = 60) -> str:
    return (s or "").encode("ascii", "replace").decode("ascii")[:n]


async def run(msg: str, mode_id: str) -> int:
    ws_events: list = []
    sse_events: list = []
    ready = asyncio.Event()
    listener = asyncio.create_task(_ws_listener(ws_events, ready))
    await ready.wait()
    await asyncio.sleep(0.3)  # let the connect-handshake settle
    t0 = time.time()

    print(f"\n→ fire chat: {msg!r}\n", flush=True)
    await asyncio.get_event_loop().run_in_executor(None, _sse_fire, sse_events, msg, mode_id)
    await asyncio.sleep(1.2)  # catch trailing broadcasts (idle close, etc.)
    listener.cancel()
    try:
        await listener
    except (asyncio.CancelledError, Exception):
        pass

    # ── SSE side (backend → browser) ───────────────────────────────────────
    print("=== SSE  (backend → BROWSER) ===")
    chunk_count = start_count = end_count = 0
    sse_total_b64 = 0
    for t, e in sse_events:
        rel = int((t - t0) * 1000)
        typ = e.get("type", "?")
        if typ == "audio_chunk":
            n = len(e.get("audio", "") or "")
            chunk_count += 1
            sse_total_b64 += n
            if chunk_count <= 2:
                print(f"{rel:6d} ms  audio_chunk  #{chunk_count} base64_len={n}")
        elif typ == "sentence_start":
            start_count += 1
            print(f"{rel:6d} ms  sentence_start  emotion={e.get('emotion')!r} "
                  f"intensity={e.get('intensity')} visemes={len(e.get('viseme_timeline', []) or [])} "
                  f"dur={e.get('duration_ms')}ms text={_ascii_safe(e.get('text'))!r}")
        elif typ == "sentence_end":
            end_count += 1
            ab = len(e.get("audio", "") or "")
            print(f"{rel:6d} ms  sentence_end    emotion={e.get('emotion')!r} "
                  f"visemes={len(e.get('viseme_timeline', []) or [])} "
                  f"dur={e.get('duration_ms')}ms audio_b64_final={ab}")
    print(f"  → SSE totals: {chunk_count} audio_chunk(s) ({sse_total_b64} b64 bytes ≈ "
          f"{sse_total_b64 * 0.75 / 1024:.1f} KB MP3), "
          f"{start_count} sentence_start, {end_count} sentence_end")

    # ── WS side (backend → UE5) ────────────────────────────────────────────
    print("\n=== WS /ws/avatar  (backend → UE5) ===")
    counts: dict[str, int] = {}
    blink_count = avcmd_count = 0
    for t, raw in ws_events:
        rel = int((t - t0) * 1000)
        try:
            e = json.loads(raw)
        except Exception:
            continue
        typ = e.get("type")

        if typ == "speech_full":
            counts["speech_full"] = counts.get("speech_full", 0) + 1
            ab = len(e.get("audio_mp3_b64", "") or "")
            print(f"{rel:6d} ms  speech_full  idx={e.get('index')} "
                  f"emotion={e.get('emotion')!r} intensity={e.get('intensity')} "
                  f"visemes={len(e.get('viseme_timeline', []) or [])} "
                  f"dur={e.get('total_duration_ms')}ms audio_b64_bytes={ab}")
            print(f"                text(ascii-safe)={_ascii_safe(e.get('text'))!r}")
            print(f"                fields={sorted(e.keys())}")

        elif typ in ("speech_start", "speech_chunk", "speech_end", "speech_stop"):
            counts[typ] = counts.get(typ, 0) + 1
            ab = len(e.get("audio_mp3_b64", "") or "")
            extra = ""
            if typ == "speech_start":
                extra = (f" emotion={e.get('emotion')!r} intensity={e.get('intensity')} "
                         f"visemes={len(e.get('viseme_timeline', []) or [])} "
                         f"dur={e.get('total_duration_ms')}ms")
            print(f"{rel:6d} ms  {typ}  idx={e.get('index')} audio_b64={ab}{extra}")

        elif typ in ("connected", "ready_ack"):
            counts[typ] = counts.get(typ, 0) + 1
            print(f"{rel:6d} ms  {typ}")

        elif "visemes" in e or "emotion" in e:
            speaking = e.get("isSpeaking")
            blink = e.get("blink", 0) or 0
            timeline_n = len(e.get("viseme_timeline", []) or [])
            if blink > 0.5 and not speaking and timeline_n == 0:
                blink_count += 1
                # Print only the first blink to avoid clutter
                if blink_count == 1:
                    print(f"{rel:6d} ms  idle blink heartbeat  (further blinks suppressed)")
            else:
                avcmd_count += 1
                v0 = (e.get("visemes") or [{}])[0]
                print(f"{rel:6d} ms  avatarCommand  speaking={speaking} "
                      f"emotion={e.get('emotion')!r} intensity={e.get('intensity')} "
                      f"head_viseme={v0.get('viseme')}@{v0.get('weight')} "
                      f"timeline_frames={timeline_n} dur={e.get('total_duration_ms')}ms "
                      f"agent={e.get('agentState')}")
    counts["avatarCommand"] = avcmd_count
    counts["idle_blink"] = blink_count
    print(f"\n  → WS message counts: {counts}")

    # ── Verdict ────────────────────────────────────────────────────────────
    print("\n=== VERDICT ===")
    if counts.get("speech_full", 0) > 0:
        print(f"  Mode: FULL  ({counts['speech_full']} speech_full message(s))")
        print(f"    EDU_UE5_AUDIO=1 + EDU_UE5_AUDIO_MODE=full")
        print(f"    → UE5 imports audio via RAI ImportAudioFromBuffer + plays atomically.")
    elif counts.get("speech_start", 0) > 0:
        print(f"  Mode: CHUNKED  ({counts['speech_start']} start, "
              f"{counts.get('speech_chunk', 0)} chunks, {counts.get('speech_end', 0)} end)")
        print(f"    EDU_UE5_AUDIO=1 + EDU_UE5_AUDIO_MODE=chunked (default)")
        print(f"    → UE5 streams via RAI Append Audio Data From Encoded.")
    elif avcmd_count > 0:
        print(f"  Mode: LEGACY  ({avcmd_count} avatarCommand(s))")
        print(f"    EDU_UE5_AUDIO=0  (or unset)")
        print(f"    → Backend sends visemes+emotion to UE5; browser plays the audio over SSE.")
    else:
        print(f"  Mode: UNKNOWN  — no avatar broadcasts seen.")
        print(f"    Backend up? Anything connected to /ws/avatar? (Our debug client did.)")

    # Sanity: SSE fallback must always flow when there's audio
    if chunk_count == 0 and end_count > 0:
        print(f"  ⚠  No SSE audio_chunks seen — browser fallback might be broken.")

    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--msg", default=DEFAULT_MSG, help="The message to send")
    p.add_argument("--mode-id", default="sk", help="Learning mode id (default: sk)")
    args = p.parse_args()
    raise SystemExit(asyncio.run(run(args.msg, args.mode_id)))
