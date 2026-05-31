# EduTutor — UE5 Avatar Integration Contract

**Version:** 4.0 — 2026-05-11 (additive over v3.0)
**For:** PM Vraník (UE5), UE5 Engineer Ivanič (3D), Adrián Putz (Rig)
**From:** Frontend team (EduTutor web app)

---

## Summary

The EduTutor web app sends avatar commands to UE5 via `window.ue.interface.broadcast()`
(Web Browser Widget mode) or a WebRTC data channel (Pixel Streaming mode).

Commands arrive as JSON. UE5 must parse and apply them each frame.

**Cumulative additive sections in this doc:**
- **v2.1** — optional `agentState` field (idle/thinking/searching/writing/listening). Field omitted when unset → v2 Blueprints see byte-identical traffic.
- **v3.0** — ARKit lipsync mode (52 blendshapes), WebSocket transport, `arkit`/`arkit_frames` fields, naming conventions, and Custom LiveLink Source guidance.
- **v4.0** — optional `audioPositionMs` + `sentenceIdx` per-frame audio-clock sync (drives Blueprint timeline lookup against the browser's real audio playhead, fixes drift on slow networks).

All extensions are additive and back-compat. The handshake `"version":"v2"` string in [`ws_avatar.py:111`](../tutor-service/app/api/ws_avatar.py#L111) is **intentionally pinned** as historical — older Blueprints pattern-match on it. Wire-protocol capability lives in the optional fields, not in this string.

---

## Receiving Commands — Web Browser Widget Mode

The React app (running inside UE5's Web Browser Widget) sends:

```javascript
window.ue.interface.broadcast('avatarCommand', JSON.stringify({
  emotion: 'joy',
  intensity: 0.7,
  isSpeaking: true,
  visemes: [{ viseme: 'aa', weight: 0.85 }],
  blink: 0.0
}));
```

In Blueprint, bind to `'avatarCommand'` channel in the Web Browser Widget.

---

## Receiving Commands — Pixel Streaming Mode

Over WebRTC data channel named `'avatarCommands'`, receives:

```json
{ "type": "avatarCommand", "payload": { ...same fields... } }
```

---

## Receiving Commands — WebSocket Mode

Blueprint opens a WebSocket client to `ws://localhost:8000/ws/avatar`. Backend pushes JSON frames via `avatar_broadcaster`. Best for dev, testing, and Pixel Streaming setups.

Handshake — send once on connect:
```json
{ "type": "avatar_ready", "capabilities": ["viseme", "emotion", "state"] }
```

Status check: `GET http://localhost:8000/api/v1/avatar/status`

---

## Lipsync Modes (v3.0)

Two lipsync paths. User selects in **Settings → Providers → Lipsync**. Both use the same transport.

| Mode | Data | GPU needed | Quality |
|---|---|---|---|
| **Text → Viseme** | 14 Slovak viseme labels + weight | No | Good (±25ms) |
| **Audio → ARKit** | 52 named float values @ 60fps | Yes (GPU/Apple Silicon) | Excellent (±5ms) |

**Detection:** if `arkit` field exists and is non-empty → ARKit mode. If absent → viseme mode.

ARKit mode uses a HuBERT neural net (`audio2lipsync_client.py`) that analyzes TTS audio and outputs 52 ARKit blendshape coefficients per frame. These map 1:1 to MetaHuman morph targets — no manual mapping needed.

---

## Command Fields

| Field | Type | Description |
|---|---|---|
| `emotion` | `string` | Emotion state name — see table below |
| `intensity` | `float 0–1` | Blend strength for emotion animation |
| `isSpeaking` | `bool` | `true` while lipsync is active |
| `visemes` | `array` | One viseme per frame — see table below |
| `blink` | `float 0–1` | Eye blink weight — requires `Blink_Both` blendshape |
| `eyebrowsUpDown` | `float -1–1` | Brow raise/lower — requires `Eyebrows_Up_Down` |
| `eyebrowsSqueeze` | `float 0–1` | Brow furrow — requires `Eyebrows_Squeeze` |
| `arkit` | `object` | **(v3.0)** 52 ARKit blendshape channels as `{name: float}`. Present only in ARKit lipsync mode. When present, ignore `visemes`. |

⚠️ `blink`, `eyebrowsUpDown`, `eyebrowsSqueeze` arrive in every command but map to blendshapes not yet built. Blueprint should silently ignore fields for missing blendshapes.

### ARKit mode example (v3.0)

When `arkit` is present, the command includes 52 named float channels:

```json
{
  "emotion": "neutral",
  "intensity": 0.4,
  "isSpeaking": true,
  "visemes": [{ "viseme": "sil", "weight": 1.0 }],
  "arkit": {
    "JawOpen": 0.31,
    "MouthFunnel": 0.12,
    "MouthSmileLeft": 0.08,
    "MouthLowerDownLeft": 0.24
  },
  "blink": 0.0
}
```

Only non-zero channels are sent (threshold > 0.005). Iterate all keys, apply each to the matching MetaHuman morph target.

### ARKit timeline (per-sentence pre-queued)

```json
{
  "arkit_frames": [
    { "start_ms": 0, "duration_ms": 16, "arkit": { "JawOpen": 0.02, "MouthClose": 0.15 } },
    { "start_ms": 16, "duration_ms": 16, "arkit": { "JawOpen": 0.18, "MouthFunnel": 0.12 } }
  ],
  "viseme_timeline": [...],
  "total_duration_ms": 2400
}
```

If `arkit_frames` is present, use it and ignore `viseme_timeline`. Schedule frames against audio clock. 60fps = one frame every ~16ms.

### ARKit channel naming convention

Our model outputs **PascalCase** names (matching the `constants.py` training data):

```
JawOpen, MouthFunnel, MouthSmileLeft, EyeBlinkLeft, BrowInnerUp, ...
```

MetaHuman's internal Control Rig curves use `CTRL_expressions_` prefix:

```
CTRL_expressions_jawOpen, CTRL_expressions_mouthSmileL, ...
```

**If using LiveLink** (recommended): MetaHuman's `mh_arkit_mapping_pose` Pose Asset handles the PascalCase → Control Rig mapping automatically. No manual remapping needed.

**If using direct `SetMorphTarget()`**: You need to map PascalCase → MetaHuman morph target names yourself. The ARKit naming is close but not identical (e.g., `MouthSmileLeft` → `mouthSmileLeft`).

---

## Emotion States (9 total)

The backend detects emotions via regex (`emotion_detector.py`) and the bridge maps them to UE5 names: `celebrating` → `joy`, `correcting` → `sadness`. All others pass through unchanged.

| `emotion` value | Default intensity | Expected avatar behavior | Blend time |
|---|---|---|---|
| `neutral` | 0.4 | Calm, attentive, natural micro-movement | 0.3s |
| `joy` | 0.9 | Full warm celebration — genuine smile, cheek lift, bright eyes. Triggered by "výborne!", "bravo!" | 0.3s |
| `encouraging_mild` | 0.62 | Soft open smile, warm eyes. Gentle "you're getting there." Triggered by "dobre", "správne" | 0.3s |
| `proud` | 0.8 | Warm genuine closed smile, eyes soften. "I knew you could." After mastering a concept | 0.3s |
| `sadness` | 0.72 | Concerned, empathetic. Inner brows raised, soft lip press. Triggered by "nie", "nesprávne" | 0.3s |
| `patient` | 0.58 | Calm, steady. Slower blink, relaxed brow. After repeated mistakes | 0.3s |
| `curious` | 0.68 | Head micro-tilt, one brow raised, alert. Unexpected student input | 0.25s |
| `thinking_deep` | 0.75 | Furrowed brow, slight squint, soft lip press. Complex question | 0.25s |
| `surprise` | 0.65 | Wider eyes, raised outer brows. Subtle, not theatrical | 0.2s |

`intensity` (0–1) controls the blend weight of the emotion animation layer. Values above are defaults — actual intensity varies per response.

---

## Session States (isSpeaking + context)

| Voice state | `isSpeaking` | `visemes` | Expected behavior |
|---|---|---|---|
| Idle | `false` | `[{sil, 1.0}]` | Neutral idle, natural blink, breathing |
| Listening | `false` | `[{sil, 1.0}]` | Attentive pose — **Idle_Listening animation needed** |
| Thinking | `false` | `[{sil, 1.0}]` | Thoughtful expression — **Idle_Thinking animation needed** |
| Speaking | `true` | active viseme | Lipsync active, emotion expression held |

---

## Agent States (v2.1 — optional, additive-safe)

The backend may emit an optional `agentState` string field alongside the
existing payload. UE5 clients that don't read the field continue to work
unchanged — this is a strict additive extension, no breaking changes.

| `agentState` | When the backend sends it | Recommended UE5 animation |
|---|---|---|
| _(field absent)_ | All v2 broadcasts — backwards compatible | Use existing `isSpeaking` logic |
| `"idle"` | Explicit idle (rare; usually field is absent) | Same as no field |
| `"thinking"` | LLM is generating a response | Subtle head tilt / eye movement; longer dwell |
| `"searching"` | Tool call (web search, memory recall) in progress | Looking-up gesture; slight forward lean |
| `"writing"` | Long-form generation (essay, code) | Pen-and-paper or typing visual cue |
| `"listening"` | STT actively transcribing user speech | Forward attentive pose |

**Reading the field in Blueprint:** The JSON message is parsed the same
way as v2. Add an optional `agentState` getter; if absent, default to
`"idle"`. Drive the avatar's animation state machine on this string.

**Backwards compatibility guarantee:** When the backend has no agent
context (the entirety of the Slovak tutor flow today), the field is
omitted entirely from the payload. v2 Blueprints that don't know about
it see byte-identical traffic to before this feature. Pinned by
`tests/test_ws_avatar.py::test_broadcast_omits_agent_state_when_none`.

---

## Audio-Clock Sync (v4.0 — optional, additive-safe)

**Problem this fixes:** In v2 / v2.1 / v3.0, UE5 received the
`viseme_timeline` once per sentence and self-timed playback against its
own engine clock from broadcast-receipt time. This created two visible
artifacts:

- **"Ghost lips"** — UE5 mouth opened ~150-200ms before any sound
  reached the user's ears, because the WebSocket broadcast arrived
  faster than the browser audio path (Edge TTS first chunk + MediaSource
  buffer fill).
- **Clock drift** — over a long sentence, UE5's engine clock and the
  browser's audio device clock diverged by ~10-50ms, with worst-case
  spikes of 500ms on Wi-Fi micro-stalls.

The v4.0 fix has **two parts**:

### Part 1 — Backend-side delayed broadcast (NO Blueprint change)

The backend now delays the `sentence_start` UE5 broadcast by
`UE5_BROADCAST_DELAY_MS` (default 180ms) so the avatar's mouth opens
**at the moment the user's audio actually starts**, not before. The
duplicate broadcast at `sentence_end` (the one that caused mid-sentence
viseme snap when audio2lipsync was enabled) is removed entirely.

This is fully transparent to v2 / v2.1 / v3.0 Blueprints. The payload
shape is unchanged. Only the wall-clock arrival time of the
`sentence_start` broadcast moved by +180ms. Tunable via the
`UE5_BROADCAST_DELAY_MS` env var (set to `0` to disable for
deployments where UE5 plays audio in-process).

### Part 2 — Per-frame `audioPositionMs` + `sentenceIdx` (REQUIRES v4.0 Blueprint)

The browser now reports its audio playback clock in every per-frame
WebSocket message during speech. v4.0 Blueprints can use this to look
up the active viseme by audio time instead of self-timing — eliminating
clock drift entirely.

| Field | Type | Present when | Description |
|---|---|---|---|
| `audioPositionMs` | `int` (ms) | `isSpeaking=true` only | Browser `AudioContext.currentTime` since lipsync start, in milliseconds |
| `sentenceIdx` | `int` | `isSpeaking=true` only | Which sentence's `viseme_timeline` to use for lookup |

Both fields are **omitted entirely** from idle / thinking / searching /
writing / listening / emotion-only frames. v2 / v2.1 / v3.0 Blueprints
that don't read them continue to work unchanged.

### Recommended Blueprint pattern (v4.0)

```
On AvatarCommand received:
  Parse JSON.
  Get "audioPositionMs" → int (default -1)
  Get "sentenceIdx"     → int (default -1)

  IF audioPositionMs >= 0  (v4.0 client):
    IF sentenceIdx changed since last frame:
      Save current viseme_timeline as the active timeline for this sentence
    frameStepMs = ActiveTimeline[1].start_ms - ActiveTimeline[0].start_ms  // dynamic; server default is 40ms but tunable via EDU_VISEME_FRAME_STEP_MS (PM 2026-05-12 feedback)
    idx = Clamp(Floor(audioPositionMs / frameStepMs), 0, Len(timeline)-1)
    activeFrame = timeline[idx]                                 // O(1) Get (Array)
    Apply viseme blendshape (80ms lerp to smooth between frames)

  ELSE  (v2/v2.1/v3 fallback):
    Use existing self-timing from total_duration_ms (your current logic)
```

**Blueprint nodes you need:**
1. `Get (Array)` with integer index — O(1) lookup, no loop
2. `Floor` + `Clamp` on the index
3. An integer variable to track last-seen `sentenceIdx`
4. An array variable to hold the active sentence's `viseme_timeline`

That's it. No binary search, no time accumulator, no lookahead buffer.

### Backwards compatibility guarantee

When `audioPositionMs` is absent (idle frames, v3 backends, or the
sub-180ms initial broadcast window), Blueprints fall back to existing
self-timing from `total_duration_ms`. v2 / v2.1 / v3.0 Blueprints that
don't read the new fields are byte-compatible — the JSON parser will
simply ignore them.

Pinned by:
- `tests/test_ue5_sync.py::test_sentence_end_does_not_broadcast_to_ue5`
- `tests/test_ue5_sync.py::test_sentence_start_broadcast_is_delayed`
- `tests/test_ue5_sync.py::test_default_broadcast_delay_is_180ms`

### Failure-mode behaviour

| Scenario | What happens |
|---|---|
| User backgrounds the browser tab | `AudioContext` suspends → `currentTime` freezes → `audioPositionMs` stops advancing → UE5 holds last viseme. Correct. |
| WebSocket drops mid-sentence | UE5 holds last received frame until next message arrives. With 60Hz rAF, next frame is ≤16ms away. |
| `sentenceIdx` changes mid-broadcast | Blueprint detects the change and swaps active timeline. No animation glitch. |
| `audioPositionMs` exceeds `total_duration_ms` | `Clamp` returns last frame index. Mouth holds final shape until `isSpeaking=false` arrives. |
| User clicks stop / mic-cancel | `stopLipsync()` fires → `isSpeaking=false` broadcast → Blueprint transitions to idle. |

---

## Idle Heartbeat (v2.2 — backend-driven blink pulses)

Between chat turns the backend now broadcasts periodic blink pulses so
the avatar doesn't visually freeze. Cadence: random 3-6 seconds while
no chat is actively speaking AND at least one UE5 client is connected.

**Heartbeat payload shape:**
```json
{
  "emotion": "neutral",
  "intensity": 0.3,
  "isSpeaking": false,
  "visemes": [{"viseme": "sil", "weight": 1.0}],
  "viseme_timeline": [],
  "total_duration_ms": 0,
  "blink": 0.85
}
```

**Blueprint behavior:** treat `blink` as an instantaneous pulse — UE5
should ramp Blink_Both 0 → 0.85 → 0 over ~150ms, then return to 0.
The heartbeat does NOT include `agentState` (field omitted).

**Suppression rules** (verified by tests):
- No clients connected → no heartbeat
- `is_speaking=true` (chat actively speaking) → no heartbeat (would clobber visemes)
- Heartbeat task cancelled cleanly on backend shutdown

Pinned by `tests/test_idle_heartbeat.py` (6 tests).

---

## Phase 7 Tool-Dispatch agentState Examples

When a `LearningMode` enables Skills (e.g. `assistant` mode with
`enabled_skills=["web_search"]`), the chat handler broadcasts a tool-
specific `agentState` BEFORE calling the tool, then `"thinking"` AFTER:

**Web search dispatch (`assistant` mode):**
```
broadcast 1: { "agentState": "searching", "isSpeaking": false, "emotion": "thinking_deep", "intensity": 0.5, ... }
                  ↓ tool runs (DDG search) ↓
broadcast 2: { "agentState": "thinking",  "isSpeaking": false, "emotion": "thinking_deep", "intensity": 0.4, ... }
                  ↓ LLM continues generating ↓
broadcast 3: { "isSpeaking": true, "viseme_timeline": [...], "total_duration_ms": 2400, ... } (no agentState)
```

**Spaced repetition dispatch (`tutor_practice` mode):**
```
broadcast 1: { "agentState": "writing",  "isSpeaking": false, ... }    ← add_card / review_card
broadcast 2: { "agentState": "thinking", "isSpeaking": false, ... }    ← after dispatch
broadcast 3: { "isSpeaking": true, ... }                                ← LLM final response
```

**`due_cards` is informational (read-only), not destructive:** broadcasts
`agentState=thinking` (not `writing`) — UE5 should pick a "browsing notes"
animation, not "actively writing".

---

## Dynamic Emotion Intensity (v2.2)

The backend now scales `intensity` based on signal strength of the LLM
response text:

| Response | emotion | intensity |
|---|---|---|
| `"výborne"` | celebrating | 0.9 (base) |
| `"výborne!"` | celebrating | 0.95 |
| `"VÝBORNE!!!"` | celebrating | 1.0 (clipped) |
| `"nie"` | correcting | 0.72 (base) |
| `"NIE!!!"` | correcting | 0.97 |

**Formula:** `intensity = base + min(! × 0.05, 0.15) + min(caps_ratio × 0.20, 0.10)`,
clipped to `[0.0, 1.0]`.

**Blueprint impact:** drive emotion blendshape weights directly from
`intensity` — a strong "VÝBORNE!!!" should look visibly more expressive
than a quiet "výborne". No new fields, just denser intensity range usage.

Pinned by `tests/test_emotion_intensity_scaling.py` (5 tests).

---

## Viseme Blendshapes (14 Slovak Mouth Shapes)

The backend (`viseme_timeline.py`) maps all 46 Slovak graphemes (including digraphs ch, dz, dž) to exactly 14 visemes. Long vowels (á, é, í, ó, ú, ý) use the same shape but with 1.8x duration.

| Blendshape name | Phonemes | Example Slovak words |
|---|---|---|
| `Viseme_PP` | p, b, m | **p**omoc, **b**ravo, **m**ama |
| `Viseme_FF` | f, v, w | **f**arba, **v**oda, **w**eb |
| `Viseme_DD` | d, t, ď, ť | **d**obre, **ď**akujem, **ť**ažký |
| `Viseme_kk` | k, g, h, ch | **k**de, **h**lava, **ch**yba |
| `Viseme_CH` | š, ž, č, dž | **š**kolák, **ž**iak, **č**o |
| `Viseme_SS` | s, z, c, dz | **s**právne, **z**nova, **c**esta |
| `Viseme_nn` | n, ň | **n**ie, ko**ň**a |
| `Viseme_RR` | r, l, ľ, ĺ, ŕ | **r**iadok, **ľ**ahko |
| `Viseme_aa` | a, á, ä | **a**hoj, m**á**š, v**ä**čší |
| `Viseme_E`  | e, é | t**e**n, sp**e**vák |
| `Viseme_ih` | i, í, y, ý, j | n**i**e, v**í**no |
| `Viseme_oh` | o, ó, ô | **o**kno, m**ô**že |
| `Viseme_ou` | u, ú | **u**čiť, r**ú**ka |
| `Viseme_sil` | silence, pause | (rest position) |

Note: The TypeScript types (`types.ts`) define 17 shapes for forward compatibility (including TH, ww, uw) but the backend only ever sends these 14. UE5 should handle unknown viseme names gracefully by falling back to `Viseme_sil`.

**Lerp requirement:** Always lerp blendshape weights, never hard-set. 80–100ms transition between visemes. Snapping looks mechanical.

---

## Missing Blendshapes (priority order — build these next)

| Blendshape | Priority | Why |
|---|---|---|
| `Blink_Both` | CRITICAL | Without auto-blink, avatar looks dead. Web app already sends `blink` field every frame. |
| `Emotion_Encouraging_Intensity` | HIGH | New emotion — soft smile for mild encouragement ("dobre", "správne"). |
| `Emotion_Proud_Intensity` | HIGH | New emotion — warm genuine smile when student masters a concept. |
| `Emotion_Patient_Intensity` | HIGH | New emotion — calm steady expression after repeated mistakes. |
| `Emotion_Curious_Intensity` | HIGH | New emotion — head micro-tilt, one brow raised. |
| `Emotion_Thinking_Intensity` | HIGH | Active concentration — furrowed brow, slight squint. Distinct from idle thinking. |
| `EyeLook_Up / Down / Left / Right` | HIGH | Subtle gaze variety. Prevents robotic stare. |
| `Breath_Chest_Up` | MEDIUM | Subtle chest rise in idle. Adds life. |

---

## Sending Back (UE5 → EduTutor)

```javascript
// When avatar finishes loading — fire once on startup
window.postMessage(JSON.stringify({ type: 'avatar_ready', capabilities: ['viseme', 'emotion', 'state'] }), '*');

// When speaking animation completes (optional)
window.postMessage(JSON.stringify({ type: 'speech_complete' }), '*');
```

---

## Integration Test Checklist

- [ ] Open EduTutor in UE5 Web Browser Widget
- [ ] Console shows no JavaScript errors
- [ ] Start a voice session — avatar transitions to listening expression
- [ ] Speak — avatar shows thinking state, then speaking with lipsync
- [ ] Positive AI response (`Výborne!`) — avatar shows `joy` (celebrating)
- [ ] Mild positive (`Dobre, pokračuj`) — avatar shows `encouraging_mild`
- [ ] Student masters concept — avatar shows `proud`
- [ ] Corrective AI response (`Nie, skúste znova`) — avatar shows `sadness` (correcting)
- [ ] Repeated mistakes — avatar shows `patient`
- [ ] Unexpected student input — avatar shows `curious`
- [ ] Complex question — avatar shows `thinking_deep`
- [ ] Surprise answer — avatar shows `surprise`
- [ ] 14 viseme blendshapes fire at correct timing (±50ms of audio)
- [ ] Unknown viseme names fall back to `Viseme_sil` without errors
- [ ] `avatar_ready` message received by EduTutor (appears in browser console: `[AvatarContainer] UE5 avatar ready`)

---

## Fallback Behavior

- Unknown `emotion` value → stay in current emotion state, log warning
- Malformed JSON → ignore, do not crash Blueprint
- Missing `viseme` field → apply `Viseme_sil` (silence pose)
- Unknown `viseme` name → apply `Viseme_sil`
- Missing `arkit` field → use viseme mode (text-based lipsync)
- Unknown ARKit channel name → silently skip, do not crash
- WebSocket disconnect → reconnect automatically

---

## Recommended Integration: Custom LiveLink Source (v3.0)

The recommended approach for feeding WebSocket ARKit data into MetaHuman is a **Custom LiveLink Source** — not direct `SetMorphTarget()` calls.

### Why LiveLink over direct morph targets

| | Custom LiveLink Source | Direct SetMorphTarget |
|---|---|---|
| Head rotation | ✅ Handled natively | ❌ Manual bone transform |
| Curve mapping | ✅ Automatic via Pose Asset | ❌ Manual name lookup |
| Animation blending | ✅ Full AnimBP support | ❌ Overwrites other layers |
| Recording | ✅ Take Recorder compatible | ❌ Not recordable |
| Setup effort | Medium (C++ class) | Low (Blueprint only) |

### Implementation path

1. Create C++ class inheriting `ILiveLinkSource`
2. Implement WebSocket receiver in `RequestSourceShutdown()` / custom tick
3. On each WebSocket message, push ARKit values as a `FLiveLinkAnimationFrameData`
4. Register as LiveLink source with subject name (e.g., `"EduTutorFace"`)
5. In MetaHuman's Face AnimBP, add a Live Link Pose node pointing to `"EduTutorFace"`
6. Connect through `mh_arkit_mapping_pose` → Final Animation Pose

This approach lets MetaHuman's built-in animation system handle all curve mapping, blending, and head rotation automatically.

### Fallback: Blueprint-only approach

If C++ is not available, use a Blueprint WebSocket plugin and `SetMorphTarget()` directly. This works but requires manual PascalCase → morph target name mapping and loses animation blending support.

---

## MetaHuman Swapping (v3.0)

All MetaHumans (free presets, custom-sculpted, Mesh-to-MetaHuman) ship with the same 52 ARKit blendshapes and the same Control Rig structure. Swapping MetaHumans requires:

1. Import new MetaHuman into UE5 project
2. Verify 52 ARKit blendshapes respond (Morph Target Previewer)
3. Point the Custom LiveLink Source (or WebSocket receiver) at the new face mesh
4. No backend or frontend changes needed — same `AvatarCommand` format

The web app is MetaHuman-agnostic. It sends the same JSON regardless of which MetaHuman receives it.
