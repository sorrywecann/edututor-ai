# EduTutor.AI — Avatar Communication Protocol: Deep Dive

**Analysis date:** 2026-05-21
**Scope:** Full JSON protocol, dataflow pipeline, error states, reconnect logic
**Sources:** Direct code inspection (17 files) + 4 explore agent audits

---

## 1. Architecture Overview

The avatar communication spans **3 layers** with **4 transport adapters**:

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Next.js     │────▶│  FastAPI      │────▶│  UE5          │
│  Frontend    │     │  Backend      │     │  MetaHuman    │
│              │     │              │     │              │
│ useUE5Bridge │     │ ws_avatar.py │     │ Blueprint     │
│ useVoiceSess.│     │ broadcaster  │     │ LiveLink      │
│ rAF loop     │     │ chat.py      │     │ ARKit rig     │
└─────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │  Web Browser       │                    │
       │  Widget (direct)   │                    │
       └────────────────────┘                    │
       │                                         │
       │  Pixel Streaming (WebRTC)               │
       └─────────────────────────────────────────┘
```

**Transport Adapters** (`core/src/lib/ue5-bridge/index.ts:11-22`):

| Adapter | Activation | Direction | Protocol |
|---|---|---|---|
| **Web Browser Widget** | `window.ue.interface` detected | Frontend → UE5 direct | `ue.interface.broadcast('avatarCommand', JSON)` |
| **Pixel Streaming** | `?ue5=URL` query param | Frontend → UE5 direct | WebRTC DataChannel `'avatarCommands'` |
| **WS Server** | `?ue5ws=URL` query param | Frontend → Backend → UE5 | WebSocket `/ws/avatar` |
| **Mock** | `NODE_ENV=development` (default) | No-op | Console.log |

**Auto-detection priority** (`index.ts:11-22`):
1. Web Browser Widget (in-engine)
2. WS Server (query param)
3. Pixel Streaming (query param or env var)
4. Mock (dev fallback)
5. None (production, no UE5 configured)

---

## 2. Complete JSON Protocol

### 2.1 AvatarCommand (Frontend/Backend → UE5)

**Defined at:** `core/src/lib/ue5-bridge/types.ts:47-65`

```typescript
interface AvatarCommand {
  emotion: UE5Emotion;          // 'neutral' | 'joy' | 'surprise' | 'sadness' |
                                // 'encouraging_mild' | 'proud' | 'patient' |
                                // 'curious' | 'thinking_deep'
  intensity: number;            // 0.0–1.0
  isSpeaking: boolean;
  visemes: Array<{
    viseme: SlovakViseme;       // 'PP'|'FF'|'TH'|'DD'|'kk'|'CH'|'SS'|
                                // 'nn'|'RR'|'aa'|'E'|'ih'|'oh'|'ou'|'ww'|'uw'|'sil'
    weight: number;             // 0.0–1.0
  }>;
  arkit?: ARKitChannels;        // Optional: full 52-channel blendshape dict
  blink?: number;               // 0.0–1.0 → eyeBlinkLeft + eyeBlinkRight
  eyebrowsUpDown?: number;      // -1.0–1.0 → Eyebrows_Up_Down
  eyebrowsSqueeze?: number;     // 0.0–1.0 → Eyebrows_Squeeze
  audioPositionMs?: number;     // v4.0: AudioContext.currentTime offset
  sentenceIdx?: number;         // v4.0: sentence index for UE5 lookup
}
```

**17 Slovak visemes** (`types.ts:3-6`): `PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou, ww, uw, sil`

**9 emotion states** (`types.ts:12-21`): Backend emotion detector outputs 9 internal labels which map to UE5 states via `EMOTION_TO_UE5` in `useUE5Bridge.ts:12-22`:
```
neutral          → neutral
celebrating      → joy
proud            → proud
encouraging_mild → encouraging_mild
correcting       → sadness
patient          → patient
curious          → curious
thinking_deep    → thinking_deep
surprise         → surprise
```

### 2.2 UE5Message (UE5 → Frontend/Backend)

**Defined at:** `core/src/lib/ue5-bridge/types.ts:74-77`

```typescript
interface UE5Message {
  type: 'avatar_ready' | 'speech_complete';
  capabilities?: string[];
}
```

Only 2 message types flow in the reverse direction:
- `avatar_ready` — UE5 Blueprint initialized, advertises capabilities
- `speech_complete` — UE5 finished playing the current viseme animation

### 2.3 Backend ↔ UE5 Handshake

**Defined at:** `tutor-service/app/api/ws_avatar.py:153-178`

```
UE5 → Backend:  {"type": "avatar_ready", "capabilities": ["viseme", "emotion", "state"]}
Backend → UE5:  {"type": "ready_ack", "version": "v2", "capabilities_accepted": [...]}
Backend → UE5:  {"type": "connected", "message": "EduTutor avatar bridge v2 ready"}
```

### 2.4 Backend Broadcast Payload (Backend → UE5)

**Built at:** `tutor-service/app/api/chat.py:139-155`

The backend adds **3 extra fields** beyond the `AvatarCommand` type:
```json
{
  "emotion": "joy",
  "intensity": 0.9,
  "isSpeaking": true,
  "visemes": [{"viseme": "aa", "weight": 0.9}],
  "blink": 0.0,
  "viseme_timeline": [
    {"viseme": "sil", "weight": 1.0, "start_ms": 0, "duration_ms": 80},
    {"viseme": "aa",  "weight": 0.9, "start_ms": 80, "duration_ms": 120}
  ],
  "total_duration_ms": 2400,
  "agentState": "speaking",          // v2.1, optional
  "arkit_frames": [...]              // optional, full ARKit frame array
}
```

### 2.5 Agent States (v2.1 protocol extension)

**Allowed values:** `idle | thinking | searching | writing | listening | speaking`

These are additive-safe — v2 clients that don't understand the field ignore it (`ws_avatar.py:130-132`). The idle heartbeat loop in `main.py` cycles through these states when no chat is active.

### 2.6 Audio Chunk Streaming (chat.py:166-170)

```json
{
  "type": "audio",
  "data": "<base64 mp3>",
  "sentence_idx": 0,
  "sentence_count": 3,
  "is_first": true,
  "duration_ms": 150
}
```

First chunk: max 3KB raw (≈4KB base64) for sub-50ms TTFB. Subsequent: up to 24KB to keep SSE event count manageable.

### 2.7 Sentence Start (chat.py)

```json
{
  "type": "sentence_start",
  "sentence_idx": 0,
  "viseme_timeline": [...],
  "total_duration_ms": 2400,
  "emotion": "joy",
  "intensity": 0.9,
  "arkit_frames": [...],          // optional
  "agent_state": "speaking"       // optional
}
```

---

## 3. End-to-End Data Flow Pipeline

### 3.1 TTS → Viseme Timeline (Backend)

```
TTS Engine (Azure/Edge/OmniVoice)
  ↓  audio bytes + optional phoneme timestamps
viseme_timeline.py:build_timeline()
  ↓  Azure phoneme path: ARPAbet → viseme via PHONEME_VISEME dict (60 entries)
  ↓  Text-only fallback: Slovak grapheme → viseme (46 graphemes, includes digraphs)
  ↓  Coarticulation blend (c06e9ff): ramps between adjacent viseme frames
  ↓  Frame step: 80ms default, env-tunable (EDU_VISEME_FRAME_STEP_MS)
VisemeFrame[] output: [{viseme, weight, start_ms, duration_ms}, ...]
  ↓
chat.py: _broadcast_avatar_state()
  ↓  JSON → avatar_broadcaster.broadcast()
  ↓  WebSocket → UE5 AND SSE → Frontend
  │
  ├─→ UE5: full viseme_timeline + total_duration_ms
  │       BP self-times: `floor(elapsed_ms / frame_step)`
  │
  └─→ Frontend: sentence_start SSE event
          useVoiceSession.ts processes it
          → useUE5Bridge.startLipsync()
          → rAF loop sends per-frame AvatarCommand
```

### 3.2 Audio2Lipsync → ARKit (Backend, optional)

```
TTS audio bytes
  ↓
audio2lipsync_client.py
  ↓  HuBERT/Wav2Vec2 feature extraction
  ↓  MLP model predicts 52 ARKit blendshape channels
  ↓  Non-mouth channels zeroed (text2face drives those additively)
ARKitFrame[] output: [{start_ms, duration_ms, arkit: {channel: weight, ...}}, ...]
  ↓
chat.py: included in sentence_start SSE + avatar broadcast
```

**52 ARKit channels** (`audio2lipsync/constants.py:23-57`):
- Eyes (0-13): Blink, Look, Squint, Wide
- Jaw (14-17): Forward, Right, Left, Open
- Mouth (18-40): 23 channels (close, funnel, pucker, smile, frown, dimple, stretch, roll, shrug, press, lower down, upper up)
- Brows (41-45): Down, Inner Up, Outer Up
- Cheeks (46-48): Puff, Squint
- Nose (49-50): Sneer
- Tongue (51): TongueOut
- Head rotation (52-54): Yaw, Pitch, Roll (NOT predicted)
- Eye rotation (55-60): 6 channels (NOT predicted)

**Loss weighting** (`constants.py:66+`): Only mouth/jaw channels weighted in training. Upper face channels are zeroed at inference — Text2Face drives brows/eyes/cheeks additively via `expression_presets.py`.

### 3.3 Frontend rAF Lipsync Loop

**Defined at:** `core/src/hooks/useUE5Bridge.ts:81-130`

```
startLipsync(timeline, totalDurationMs, emotion, intensity, sentenceIdx)
  ↓
  Creates AudioContext (if needed)
  Records startTime = ctx.currentTime
  ↓
  requestAnimationFrame(tick):
    currentMs = (ctx.currentTime - startTime) * 1000
    idx = min(floor(currentMs / frameStepMs), timeline.length - 1)
    activeFrame = timeline[idx]
    blink = autoBlink.getCurrentWeight(ctx.currentTime)
    ↓
    ue5Bridge.sendCommand({
      emotion, intensity, isSpeaking: true,
      visemes: [{viseme: activeFrame.viseme, weight: activeFrame.weight}],
      blink, audioPositionMs, sentenceIdx
    })
    ↓
    if currentMs < totalDurationMs → next rAF tick
    else → stopLipsync()
```

**Frame sync accuracy:** Uses `AudioContext.currentTime` (locked to audio device hardware clock) for <50ms sync. Frame index is O(1) via `Math.floor(currentMs / frameStepMs)`.

### 3.4 ARKit Lipsync Loop (frontend, 52-channel path)

**Defined at:** `core/src/hooks/useUE5Bridge.ts:132-175`

Same rAF loop, but uses `arkitFrames.find()` (linear search) instead of index math. Includes the full 52-channel `arkit` dict in each frame.

### 3.5 Auto-Blink System

**Defined at:** `core/src/lib/ue5-bridge/autoBlink.ts`

- Random intervals: 3–6 seconds between blinks
- Duration: 150ms per blink
- Shape: triangle wave (0→1→0)
- Reset on each new sentence (prevents mid-speech blink artifacts)

### 3.6 Expression Presets (Text2Face additively)

**Defined at:** `tutor-service/app/services/expression_presets.py:31-100+`

9 emotion presets drive upper-face channels additively (do NOT override audio2lipsync mouth/jaw):
- `neutral`: empty preset (natural idle)
- `joy`: EyeSquint 0.35, BrowInnerUp 0.15
- `proud`: EyeSquint 0.30, BrowDown 0.10
- `encouraging_mild`: EyeSquint 0.15, BrowInnerUp 0.10
- `sadness`: BrowInnerUp 0.45, BrowDown 0.15, EyeSquint 0.10
- `patient`: BrowInnerUp 0.25, EyeSquint 0.10
- `curious`: BrowInnerUp 0.20, BrowOuterUp 0.25, EyeWide 0.15
- `thinking_deep`: BrowDown 0.30, EyeSquint 0.15, BrowInnerUp 0.10
- `surprise`: BrowInnerUp 0.40, BrowOuterUp 0.35, EyeWide 0.30, JawOpen 0.25

---

## 4. Error States & Handling

### 4.1 Connection State Machine (WS Server Adapter)

**Defined at:** `core/src/lib/ue5-bridge/WebSocketServerAdapter.ts:17`

```
disconnected → connecting → connected → reconnecting → disconnected
                                       ↓ (heartbeat timeout)
                                    reconnecting
                                       ↓ (success)
                                    connected
```

**States tracked:** `connecting | connected | reconnecting | disconnected`

### 4.2 Reconnect Strategy

| Parameter | Value | Location |
|---|---|---|
| Initial backoff | 500ms | `WebSocketServerAdapter.ts:19` |
| Max backoff | 30s | `WebSocketServerAdapter.ts:20` |
| Multiplier | 2.0x | `WebSocketServerAdapter.ts:21` |
| Jitter | ±20% | `WebSocketServerAdapter.ts:22` |
| Heartbeat timeout | 15s | `WebSocketServerAdapter.ts:23` |
| Clean close (code 1000) | No reconnect | `WebSocketServerAdapter.ts:85-87` |
| Abnormal close | Reconnect with backoff | `WebSocketServerAdapter.ts:77-84` |

### 4.3 Message Queue (WS Server Adapter)

**Defined at:** `WebSocketServerAdapter.ts:29, 142-148`

- Messages buffered in `this.queue: string[]` when not connected
- Flushed on `onopen` (`WebSocketServerAdapter.ts:61-64`)
- **No max size** — unbounded memory growth possible
- Cleared on `disconnect()` (`WebSocketServerAdapter.ts:160`)

### 4.4 Heartbeat Detection (WS Server Adapter)

**Defined at:** `WebSocketServerAdapter.ts:95-117`

- Server sends periodic blink pulses every 3-6 seconds
- Client tracks `lastServerMessage` timestamp
- If 15s passes with no message → triggers reconnect
- `PONG` messages reset the timer without being processed as JSON

### 4.5 Backend Broadcast Error Handling

**Defined at:** `tutor-service/app/services/avatar_broadcaster.py:77-130`

| Error | Handling |
|---|---|
| Send timeout (2s) | Client dropped, logged |
| Connection closed mid-send | Client dropped, logged |
| Any send exception | Client dropped, logged |
| No clients connected | Early return, debug log |
| Cancel mute active | Broadcast suppressed, info log |

**Connection snapshot** (`broadcaster.py:96`): `list(self._connections)` before iteration prevents concurrent modification.

### 4.6 Backend Cancel Speech (3-step burst)

**Defined at:** `tutor-service/app/api/ws_avatar.py:48-115`

When user clicks orb to interrupt:
1. `broadcaster.cancel_speech()` — sets 3s mute window
2. Send 80ms silence animation → overwrites in-progress UE5 timeline
3. 100ms later: send final isSpeaking=false / agentState=idle

### 4.7 Chat Pipeline Error Isolation

**Defined at:** `tutor-service/app/api/chat.py:153-155`

```python
try:
    await broadcaster.broadcast(payload)
except Exception as exc:
    logger.warning("Avatar broadcast failed (continuing): %s", exc)
```

Broadcaster failure **never crashes the chat response**. If UE5 is disconnected, chat continues with audio only.

### 4.8 Error Handling by Adapter

| Adapter | Error Detection | Send Failure | Message Validation | Reconnect |
|---|---|---|---|---|
| **WS Server** | ✅ Heartbeat, onclose, onerror | ✅ Queue + reconnect | ⚠️ JSON.parse only | ✅ Exponential backoff |
| **Web Browser Widget** | ❌ None | ❌ Silent | ⚠️ JSON.parse only | ❌ None |
| **Pixel Streaming** | ❌ Minimal | ⚠️ Queue (no flush if never opens) | ⚠️ JSON.parse only | ❌ None |
| **Mock** | N/A | ❌ Silent | ❌ None | N/A |

### 4.9 Frontend Silent Failures

| Location | Issue |
|---|---|
| `UEWebBrowserAdapter.ts:16-21` | `sendCommand()` silently no-ops if `ue.interface` undefined |
| `PixelStreamingAdapter.ts:36-43` | `sendCommand()` queues but never warns if channel never opens |
| `WebSocketServerAdapter.ts:90-93` | `onerror` only logs warn, relies on `onclose` for recovery |
| `WebSocketServerAdapter.ts:116` | Malformed JSON silently dropped (empty catch) |
| `useUE5Bridge.ts:91-93` | AudioContext creation has no error handling |
| `useUE5Bridge.ts:122` | rAF tick has no try/catch — uncaught error kills loop silently |

---

## 5. Critical Vulnerabilities & Gaps

### 🔴 CRITICAL

| # | Issue | Impact | Fix |
|---|---|---|---|
| **C1** | **Unbounded message queue** — `WS Server Adapter:29,147` queues messages with no max size. During extended UE5 outage, memory grows without bound. | OOM crash after prolonged disconnect | Add max queue size (e.g., 100) with FIFO eviction |
| **C2** | **Web Browser Widget has zero error detection** — no heartbeat, no reconnect, no degraded UX. If UE5 crashes in-engine, frontend keeps sending commands into void forever. | Silent lip-sync failure, user confused | Add periodic ping + visible "Avatar disconnected" indicator |
| **C3** | **rAF loop has no try/catch** — `useUE5Bridge.ts:101-127`. If `ue5Bridge.sendCommand()` throws, the rAF loop dies silently. Visemes stop updating mid-speech. | Avatar mouth freezes mid-sentence | Wrap `tick()` body in try/catch |
| **C4** | **No max message size check on frontend WS** — backend enforces 16KB limit (`ws_avatar.py:118`) but frontend `WebSocketServerAdapter` has no size check on outgoing messages. ARKit frames could exceed this. | Messages silently dropped by backend | Add client-side size check before send |

### 🟠 HIGH

| # | Issue | Impact | Fix |
|---|---|---|---|
| **H1** | **No schema validation anywhere** — messages are `JSON.parse()` + type assertion only. Invalid `viseme` strings, NaN `intensity`, missing required fields all pass through. | UE5 Blueprint receives garbage | Add Zod/JSON Schema validation on send path |
| **H2** | **AudioContext creation not resilient** — `useUE5Bridge.ts:92` creates `new AudioContext()` unconditionally. If browser blocks autoplay, no fallback. | Lipsync silently fails on some browsers | Check `ctx.state === 'suspended'` and attempt `ctx.resume()` or show user prompt |
| **H3** | **No degraded UX when avatar unavailable** — UE5 disconnect is completely invisible to user. Audio plays, but there's no visual indicator the avatar is missing. | User doesn't know avatar is broken | Add `useUE5Bridge.isConnected` to UI; show "Avatar disconnected" banner or fallback avatar |
| **H4** | **Emotion map has no validation** — `EMOTION_TO_UE5` uses `?? 'neutral'` fallback silently. If a new emotion label arrives from backend, it maps to neutral without warning. | Wrong emotion displayed, no error logged | Add unknown emotion logging |

### 🟡 MEDIUM

| # | Issue | Impact | Fix |
|---|---|---|---|
| **M1** | **Pixel Streaming: no reconnection** — DataChannel has no onclose handler. If WebRTC ICE disconnects, channel stays dead. | No recovery from network blips | Add `onclose` → reconnect logic |
| **M2** | **Heartbeat is one-sided** — only frontend tracks heartbeat. Backend doesn't know if UE5 is alive between broadcasts. | Dead UE5 connections persist until next chat turn | Add backend-originated heartbeat ping every 5s |
| **M3** | **Cancel mute window fixed at 3s** — `broadcaster.py:26`. If TTS generates audio for >3s after cancel (rare with Edge TTS streaming), mouth could re-open. | Brief avatar mouth glitch after cancel | Dynamic window: `max(3.0, estimated_remaining_tts_time * 1.5)` |
| **M4** | **isConnected property not reactive** — `ue5Bridge.isConnected` is a snapshot property, not a hook. Frontend components can't subscribe to connection state changes. | UI can't show real-time connection status | Expose as React state via `useUE5Bridge` hook |

### 🟢 LOW

| # | Issue | Impact | Fix |
|---|---|---|---|
| **L1** | **Linear search in ARKit lipsync** — `useUE5Bridge.ts:151-153` uses `arkitFrames.find()` per frame. If frames are dense (8ms step), this is O(n*m). | Slight CPU overhead on long sentences | Use same index math as viseme path |
| **L2** | **No monitoring/metrics** — no counters for broadcasts sent/dropped/failed, connection churn, queue depth | Can't observe degradation in production | Add Prometheus counters + `/health/ready` integration |
| **L3** | **frameStepMs from timeline** — computed dynamically at `useUE5Bridge.ts:97-99`. If timeline is malformed (single frame or non-monotonic), step is 40ms fallback — may desync. | Slight timing drift | Validate timeline monotonicity |
| **L4** | **Mock adapter simulates avatar_ready immediately** — but real UE5 takes seconds to initialize. Tests that assume instant readiness will pass but production may not. | Test/production gap | Mock should simulate realistic delay (2-5s) |

---

## 6. JSON Message Flow Diagram

### 6.1 Normal Chat Turn (WS Server mode)

```
User speaks → STT → text → LLM → TTS
                                    ↓
  chat.py: _broadcast_avatar_state()
    │
    ├─ SSE → Frontend: sentence_start
    │   {viseme_timeline, total_duration_ms, emotion, intensity, arkit_frames?}
    │     ↓
    │   useVoiceSession.ts: onSentenceStart()
    │     → useUE5Bridge.startLipsync(timeline, duration, emotion, intensity)
    │     → rAF loop: 80ms frames:
    │       {"emotion":"joy","intensity":0.9,"isSpeaking":true,
    │        "visemes":[{"viseme":"aa","weight":0.9}],
    │        "blink":0.34,"audioPositionMs":560,"sentenceIdx":0}
    │
    ├─ WS → UE5: sentence_start (full timeline)
    │   {"emotion":"joy","intensity":0.9,"isSpeaking":true,
    │    "visemes":[...], "viseme_timeline":[...],
    │    "total_duration_ms":2400, "agentState":"speaking"}
    │     ↓
    │   UE5 BP: self-times viseme playback
    │   UE5 BP: on playback complete → {"type":"speech_complete"}
    │
    └─ SSE → Frontend: audio chunks (base64 mp3)
        → AudioContext.decodeAudioData() → play
        → AudioContext.currentTime drives rAF viseme index
```

### 6.2 Stop/Cancel Flow

```
User clicks orb → POST /api/v1/avatar/stop
  ↓
ws_avatar.py: avatar_stop()
  1. broadcaster.cancel_speech()  — 3s mute window
  2. Broadcast 80ms silence animation  — overwrites UE5 timeline
  3. Broadcast final idle 100ms later  — clean state transition
  ↓
SSE → Frontend: stop event
  → useVoiceSession.ts: endSession()
  → useUE5Bridge.stopLipsync()  — cancel rAF, send isSpeaking=false
```

### 6.3 Idle Heartbeat Loop

```
main.py: lifespan → asyncio.create_task(_idle_heartbeat_loop())
  ↓
Every 3-6s (random):
  sends {"emotion":"neutral","intensity":0.4,"isSpeaking":false,
         "visemes":[{"viseme":"sil","weight":1.0}],
         "agentState":"idle","blink":0.85}  // blink pulse
  ↓
Frontend WS adapter: heartbeat detection
  lastServerMessage = Date.now()  // resets 15s timeout
```

---

## 7. Configuration & Tuning

| Parameter | Default | Env Var | Location |
|---|---|---|---|
| Viseme frame step | 80ms (code) / 40ms (Docker) | `EDU_VISEME_FRAME_STEP_MS` | `viseme_timeline.py:21-23` |
| Coarticulation ramp | = frame step | `EDU_VISEME_RAMP_MS` | `viseme_timeline.py:24-26` |
| Broadcast send timeout | 2.0s | (hardcoded) | `avatar_broadcaster.py:28` |
| Cancel mute window | 3.0s | (hardcoded) | `avatar_broadcaster.py:26` |
| Heartbeat pulse weight | 0.85 | (hardcoded) | `avatar_broadcaster.py:31` |
| Heartbeat interval | 3-6s random | (hardcoded) | `avatar_broadcaster.py:29-30` |
| WS reconnect backoff start | 500ms | (hardcoded) | `WebSocketServerAdapter.ts:19` |
| WS reconnect backoff max | 30s | (hardcoded) | `WebSocketServerAdapter.ts:20` |
| WS heartbeat timeout | 15s | (hardcoded) | `WebSocketServerAdapter.ts:23` |
| Max WS message size | 16KB | (hardcoded) | `ws_avatar.py:118` |
| Auto-blink interval | 3-6s | (hardcoded) | `autoBlink.ts:21` |
| Auto-blink duration | 150ms | (hardcoded) | `autoBlink.ts:6` |

---

## 8. File Index

### Frontend (core/)
| File | Lines | Role |
|---|---|---|
| `core/src/lib/ue5-bridge/types.ts` | 83 | All TypeScript interfaces |
| `core/src/lib/ue5-bridge/index.ts` | 80 | Adapter factory + singleton |
| `core/src/lib/ue5-bridge/WebSocketServerAdapter.ts` | 163 | WS adapter with reconnect |
| `core/src/lib/ue5-bridge/UEWebBrowserAdapter.ts` | 44 | In-engine adapter |
| `core/src/lib/ue5-bridge/PixelStreamingAdapter.ts` | 57 | WebRTC adapter |
| `core/src/lib/ue5-bridge/MockAdapter.ts` | 30 | Dev mock |
| `core/src/lib/ue5-bridge/autoBlink.ts` | 41 | Natural blinking |
| `core/src/hooks/useUE5Bridge.ts` | 200 | rAF lipsync loop + emotion mapping |
| `core/src/hooks/useVoiceSession.ts` | 839 | Voice session orchestration |

### Backend (tutor-service/)
| File | Lines | Role |
|---|---|---|
| `tutor-service/app/api/ws_avatar.py` | 204 | WS endpoint + handshake + stop |
| `tutor-service/app/api/chat.py` | 1435 | Chat SSE + avatar broadcast |
| `tutor-service/app/api/avatar_dev.py` | 53 | Dev broadcast endpoint |
| `tutor-service/app/services/avatar_broadcaster.py` | 130+ | Connection manager + broadcast |
| `tutor-service/app/services/viseme_timeline.py` | 200+ | Phoneme→viseme + grapheme→viseme |
| `tutor-service/app/services/expression_presets.py` | 100+ | 9 emotion face presets |
| `tutor-service/app/services/audio2lipsync/constants.py` | 100+ | 61 ARKit channels + loss weights |

### Tests
| File | Purpose |
|---|---|
| `test_ws_avatar.py` (29 tests) | WS contract + ARKit schema |
| `test_avatar_broadcaster.py` | Broadcaster cancel + mute + connection tracking |
| `test_ue5_sync.py` | Audio-viseme synchronization |
| `test_idle_heartbeat.py` | Heartbeat loop |
| `test_avatar_simulation.py` (20 tests) | E2E pipeline without UE5 |
| `test_lipsync_accuracy.py` (17 tests) | Viseme accuracy contract |

---

## 9. Summary Assessment

**Strengths:**
- Clean adapter pattern — 4 transports, same interface
- Exponential backoff reconnect with jitter (WS Server adapter)
- Cancel speech has 3-step burst for reliable interruption
- Chat pipeline isolated from broadcaster failures
- Auto-blink natural and tunable
- Audio-viseme sync via `AudioContext.currentTime` (<50ms accuracy)
- V2.1 protocol additive-safe (new fields don't break old Blueprints)

**Weaknesses:**
- Web Browser Widget adapter has zero resilience
- No message schema validation anywhere in the chain
- Frontend rAF loop has no error recovery
- Connection state not surfaced to UI (user can't see avatar is broken)
- Unbounded message queue in WS adapter
- Heartbeat is client-side only; backend doesn't know if UE5 died
- No metrics/monitoring for production observability

**Recommendation priority:**
1. Fix C3 (rAF loop try/catch) — 1 line, prevents silent freeze
2. Fix C1 (queue max size) — 2 lines, prevents OOM
3. Add H3 (degraded UX) — 5 lines, solves user confusion
4. Add H1 (schema validation) — ~50 lines with Zod, prevents garbage reaching UE5
