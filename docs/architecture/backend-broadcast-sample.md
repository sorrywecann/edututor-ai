# Backend → UE5 broadcast — live captured sample

**Captured:** 2026-05-16 from `POST /api/v1/chat/stream` with text *"Mama varí kávu, pizza je dobrá."*
**Purpose:** Concrete JSON shape both Blueprint dev and artists can refer to, instead of
working from the abstract spec.

The chat endpoint emits Server-Sent Events. UE5 receives the equivalent payload via the
`/ws/avatar` WebSocket — same field shape, different transport. Each event is one line of
the form `data: {...}\n\n`.

---

## Event types in one chat turn

| Event | Frequency | Audience | Purpose |
|---|---|---|---|
| `context` | 1 | browser only | RAG document chunks |
| `text` | N (one per LLM token) | browser only | Streaming text deltas |
| `sentence_start` | one per sentence | browser **+ UE5** | Avatar begins speaking — text-based viseme timeline |
| `audio_chunk` | several per sentence | browser only | Base64 MP3 fragments |
| `sentence_end` | one per sentence | browser only | Final audio-anchored viseme timeline + ARKit frames |
| `done` | 1 | browser only | LLM finished, total stats |

The UE5 broadcast (over `/ws/avatar`) carries the same `sentence_start` payload but
omits the `audio` base64 (UE5 doesn't play audio — the browser does).

---

## sentence_start (UE5 receives this)

```jsonc
{
  "type": "sentence_start",
  "index": 0,                                // sentence number within this turn
  "text": "To je pekné!",
  "emotion": "neutral",                      // one of 9: neutral, celebrating, encouraging_mild,
                                             //          proud, correcting, patient, curious,
                                             //          thinking_deep, surprise
  "intensity": 0.4,                          // 0.0 – 1.0
  "duration_ms": 1520,                       // estimated total speech length
  "viseme_timeline": [
    { "viseme": "sil", "weight": 1.0, "start_ms":   0, "duration_ms": 80 },  // mouth closed (rest)
    { "viseme": "DD",  "weight": 0.45, "start_ms":  80, "duration_ms": 80 }, // 't' — light tongue
    { "viseme": "oh",  "weight": 1.0, "start_ms": 160, "duration_ms": 80 },  // 'o' — full mouth-open
    { "viseme": "sil", "weight": 1.0, "start_ms": 240, "duration_ms": 80 },  // gap (space between words)
    { "viseme": "ih",  "weight": 0.45, "start_ms": 320, "duration_ms": 80 }, // 'j' — narrow
    // ...14 more frames truncated...
  ]
}
```

### Key fields

- **`viseme`** — one of 14 active shapes: `sil PP FF DD kk CH SS nn RR aa E ih oh ou`
  (plus `TH` for English loanwords; not used in pure Slovak)
- **`weight`** — 0.0–1.0 intensity for that viseme this frame
  - `1.0` = vowel nucleus (mouth fully forms shape)
  - `0.7` = visible consonant (PP, FF — lips MUST close/touch for these)
  - `0.45` = brief consonant gesture (mouth doesn't fully form)
  - `< 0.5` = anticipation / coarticulation
- **`start_ms`** — when this frame becomes active, relative to sentence start
- **`duration_ms`** — how long this frame holds (typically 80 ms = our grid)
- **`duration_ms` total** — sum of frame durations, ≈ audio length

### Coarticulation (newly added 2026-05-16, optional)

When a frame is within 40 ms of the next phoneme boundary AND the next phoneme is a
different viseme, the frame carries **both** visemes in a `visemes` array:

```jsonc
{
  "viseme": "PP",          // primary (legacy single-viseme field still set for compat)
  "weight": 0.7,
  "visemes": [             // NEW — multi-viseme blend
    { "viseme": "PP", "weight": 0.7 },     // still pressing for 'm'
    { "viseme": "aa", "weight": 0.34 }     // mouth already opening for upcoming 'a'
  ],
  "start_ms": 320,
  "duration_ms": 80
}
```

**Legacy reader** (singular `viseme` field) ignores the `visemes` array — no regression.
**New reader** (parses `visemes`) drives both blendshape channels simultaneously — produces
the natural mouth-anticipates-next-sound look of real speech.

---

## sentence_end (UE5 receives this too if `audio2lipsync` provider active)

Same `viseme_timeline` shape as `sentence_start` (refined with actual audio word-boundary
timing) plus the audio-aligned ARKit frames:

```jsonc
{
  "type": "sentence_end",
  "index": 0,
  "duration_ms": 2300,                       // ACTUAL audio length (vs the estimate above)
  "emotion": "neutral",
  "intensity": 0.4,
  "viseme_timeline": [ /* same shape as above, refined timing */ ],

  // ↓↓↓ Audio2Lipsync ARKit frames — 60 fps, 52 channels per frame ↓↓↓
  "arkit_frames": [
    {
      "start_ms": 0,
      "duration_ms": 16,
      "arkit": {
        "EyeBlinkLeft": 0.044,
        "EyeLookDownLeft": 0.069,
        "EyeLookInLeft": 0.086,
        "EyeLookOutLeft": 0.048,
        "EyeLookUpLeft": 0.115,
        "EyeSquintLeft": 0.169,
        // ...41 more channels: JawOpen, MouthClose, MouthFunnel, etc...
      }
    },
    { "start_ms": 16, "duration_ms": 16, "arkit": { /* ... */ } },
    // ...106 more frames at 16ms intervals truncated...
  ]
}
```

ARKit field name → MetaHuman blendshape mapping is 1:1 (Epic followed Apple's naming).
The 52 channels cover all 27 mouth/jaw + 25 eye/brow/cheek/nose/tongue parameters.

---

## What this means for implementation

- **Blueprint (Dominik)** — primary parse target is `sentence_start.viseme_timeline`. You
  step through frames by `start_ms`, apply each `viseme`'s blendshape combo at `weight`,
  hold for `duration_ms`. Optional upgrade: also parse `visemes` array for coarticulation.
- **Blueprint (advanced)** — when `arkit_frames` is present (Mode 2, audio2lipsync), you
  can ignore `viseme_timeline` entirely and just drive the 52 ARKit channels frame-by-frame.
  Perfect audio sync (~5ms), no viseme→shape translation needed.
- **Artists** — every viseme name above maps to ONE ARKit blendshape **combo** (see
  `viseme-to-arkit-mapping.csv` for the literal mapping table). Your only job for lipsync
  is to make sure those ARKit channels deform cleanly on the customized `slovak_char` mesh.
