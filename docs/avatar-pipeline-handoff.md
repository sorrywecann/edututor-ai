# EduTutor.AI — full pipeline handoff brief

**Audience:** an engineering partner (or their AI agent) picking up the avatar speaking + lipsync pipeline. Assumes Python/TypeScript familiarity, UE5 vocabulary, basic WebRTC awareness.

**Last verified:** 2026-05-17. All paths, ports, and file references are tested against the running system on this date.

---

## TL;DR

A FastAPI backend generates LLM text → synthesises audio → emits a per-phoneme viseme timeline → broadcasts that timeline over a WebSocket to a packaged UE5 MetaHuman build, while PixelStreaming delivers the rendered video back to a Next.js frontend over WebRTC. Seven independent processes co-operate; the data formats between them are the entire integration surface.

```
User speaks → STT → LLM → TTS → visemes ──WS──► UE5 (MetaHuman renders face)
                                                  │
                          Wilbur signalling ◄─────┤ PixelStreaming video
                                  │
                                  ▼
                       Browser <iframe> ◄── frontend renders chat + avatar
```

---

## 1. End-to-end flow (one user message)

```
                                    ┌────────────────────────────────────────┐
                                    │  FRONTEND (Next.js, :3000)             │
   User types/speaks    ───────────►│  - mic / text input                    │
                                    │  - POST /api/v1/chat/stream (SSE)      │
                                    │  - <iframe src="http://127.0.0.1/      │
                                    │     uiless.html"> = avatar video       │
                                    └────────┬───────────────────────────────┘
                                             │ SSE stream
                                             ▼
                                    ┌────────────────────────────────────────┐
                                    │  BACKEND (FastAPI, :8000)              │
                                    │                                        │
                                    │  1. RAG gate → maybe vector-search KB  │
                                    │  2. Compose system prompt + history    │
                                    │  3. LLM.generate() → token stream      │
                                    │  4. Per sentence:                      │
                                    │       a. TTS.stream_chunks → MP3       │
                                    │       b. build_timeline → visemes      │
                                    │       c. _broadcast_avatar_state →     │
                                    │            WebSocket /ws/avatar        │
                                    │       d. yield sentence_start/end SSE  │
                                    └────────┬─────────────────┬─────────────┘
                                             │ /ws/avatar       │ /api/v1/chat/stream SSE
                                             ▼ JSON visemes     ▼ text + audio chunks
                ┌──────────────────────────────────────┐    ┌───────────────────┐
                │  UE5 SlovakEdu.exe                   │    │  FRONTEND         │
                │  - BP_slovak_char Tick reads JSON    │    │  - renders text   │
                │  - sets ActiveViseme variable        │    │  - plays MP3      │
                │  - ABP_Face_PostProcess switches     │    │  - orb anims      │
                │    on viseme → applies 25+ CTRL      │    └───────────────────┘
                │    channels per preset               │
                │  - MetaHuman rig animates face       │
                └──────────────┬───────────────────────┘
                               │ WebRTC video (Wilbur signalling :80 + :8888)
                               ▼
                          back into the iframe ─────────► User sees avatar
```

---

## 2. Process inventory

| # | Process          | Port(s)  | Start command                                                                                | Code home                          |
|---|------------------|----------|----------------------------------------------------------------------------------------------|-------------------------------------|
| 1 | Backend          | 8000     | `cd tutor-service; uv run python run_dev.py`                                                  | `tutor-service/`                    |
| 2 | Frontend         | 3000     | `cd core; npm run dev`                                                                        | `core/`                             |
| 3 | Wilbur signal    | 80, 8888 | `cd edotutor-ue5/.../SignallingWebServer; node ./dist/index.js --serve --http_root=...\\www`  | `edotutor-ue5/EdutorUE/PixelStreaming/SignallingWebServer/` |
| 4 | UE5 packaged app | —        | `SlovakEdu.exe -PixelStreamingURL=ws://127.0.0.1:8888 -RenderOffscreen -ResX=1280 -ResY=720`  | `Downloads/Edutor<date>/`           |
| 5 | (frontend → backend)  WS        | 8000        | client connects to `ws://localhost:8000/ws/avatar`                                            | `tutor-service/app/api/ws_avatar.py` |

One-command launch: **`Start-EduTutor-Dev.ps1`** in repo root (auto-picks newest `Edutor*` build under `Downloads/`). Full doc: `docs/dev-stack-startup.md`.

---

## 3. Backend — chat pipeline

### 3.1 Endpoints

- `POST /api/v1/chat/stream` — SSE streaming chat (main user path)
- `POST /api/v1/chat` — non-streaming (legacy)
- `GET  /api/v1/tts/voices` — voice catalogue
- `POST /api/v1/tts` — manual TTS
- `WS   /ws/avatar` — UE5 (and optionally browser) subscribes here for AvatarCommand JSON
- `GET  /api/v1/avatar/status` — `{"connected": bool, "clients": int}`
- `GET  /api/v1/modes` — list of LearningModes

### 3.2 LLM layer

- Service: `tutor-service/app/services/llm_service.py`
- Providers wired: `openai`, `anthropic`, `ollama`, `vllm` (and a `mock` for tests). Switched at runtime via `POST /api/v1/llm/switch` or per-request `provider` field.
- Per-request flow in `chat.py:_chat_stream_loop`:
  1. Load active `LearningMode` (default: `deeptutor`)
  2. RAG gate: `_should_use_rag(message)` — see §3.4
  3. Compose `system` message: mode prompt + (RAG context if any) + (user profile if any)
  4. Load conversation history from `memory_service`
  5. Append current user message
  6. `LLMService.generate_stream()` yields tokens → `buf += token` until sentence end detected → `_speak_sentence()`

### 3.3 System prompts (LearningMode)

8 modes in `app/config/learning_modes.py`, each with a `.md` prompt in `app/config/prompts/`:

| Mode id              | Label                                  | Default? | Purpose                                              |
|----------------------|----------------------------------------|----------|------------------------------------------------------|
| **deeptutor**        | Hĺbkový učiteľ                         | **yes**  | Socratic Slovak tutor, in-session memory, strict prose |
| sk                   | Po slovensky                           | —        | Older Slovak tutor (more philosophical)              |
| en                   | In English                             | —        | English tutor                                        |
| learn-en-from-sk     | Učím sa angličtinu                     | —        | Bilingual (Slovak instructions, English practice)    |
| assistant            | Research assistant                     | —        | Web search, bilingual                                |
| assistant_pro        | Assistant Pro                          | —        | Web search + cross-session memory                    |
| tutor_practice       | Slovenský tréner (kartičky)            | —        | FSRS flashcards                                      |
| tutor_practice_pro   | Slovenský tréner Pro (kartičky+pamäť) | —        | FSRS + cross-session memory                          |

**deeptutor prompt** (`app/config/prompts/deeptutor.md`, ~95 lines) enforces:
- Socratic questioning before answering ("Čo si o tom myslíš ty?")
- Length-matched: 1–2 sentences for short questions, 2–4 for mechanism, "as long as needed" for deep
- No markdown — `_strip_markdown()` in chat.py also defensively strips at TTS time
- Refers to prior turns explicitly ("Pred chvíľou si spomenul…")
- Slovak only (explicit anti-Czech-mixing clause)
- Educational greetings, never therapeutic

### 3.4 In-session memory

`app/services/memory_service.py`:
- Rolling deque keyed by `conversation_id`, capped at `MAX_TURNS = 20` (= 40 messages)
- Optional JSON disk persistence at `./data/memory/<id>.json`
- `get_history()` + `append_turn()` are the only public functions
- Disk persistence survives backend restarts (handy when iterating)

### 3.5 Smart RAG gating

When a knowledge base is selected by the user, RAG used to fire on every single message — including "ahoj" and "ďakujem" — which pulled document quotes into casual chat and broke the tutor persona.

Now `_should_use_rag(message)` in `chat.py` skips RAG when:
- Message exactly matches a known greeting/acknowledgment (~40 SK + EN entries)
- Message is ≤ 2 words AND has no `?`

Otherwise RAG runs as before:
- Vector search via `app/services/rag/` (ChromaDB + sentence-transformers)
- `top_k=5`, `similarity_threshold=0.65` by default (both env-tunable + per-request)
- Retrieved chunks appended to system prompt with **soft** label: *"Tu sú úryvky z dokumentov ktoré študent nahral. Použi ich len ak priamo pomáhajú s odpoveďou. Inak ich ignoruj a odpovedz prirodzene ako tutor"*

### 3.6 TTS layer

`app/services/tts_service.py` exposes a unified `TTSService` with per-provider methods. Providers:

| Provider     | Audio quality | Viseme metadata                              | Cost          |
|--------------|---------------|----------------------------------------------|---------------|
| **edge**     | Same SK neural model as Azure | WordBoundary events (~5 ms word-level) | Free |
| **azure**    | Same SK neural model | **Per-phoneme** offsets via `viseme_received` callback (gold standard) | Pay-per-char (~$16 / 1M) |
| openai       | Different voices | None (text-based estimate only) | Pay-per-char |
| google       | Chirp3 HD     | None (text-based estimate)                  | Pay-per-char  |
| piper        | Local         | None                                         | Free          |
| omnivoice    | Local clone   | None                                         | Free          |
| kokoro       | Premium EN    | None                                         | Free          |

Selection priority (in `TTSService.initialize`): `USE_EDGE_TTS=true` → edge; else `OPENAI_API_KEY` → openai; else `AZURE_SPEECH_KEY` → azure; else `mock`. Per-request override via `_resolve_tts_voice()` and explicit `provider`/`voice` in the user picker.

Streaming method: `stream_chunks(text, provider, voice, word_boundaries=None)` — yields raw MP3 bytes. Edge populates the side-channel `word_boundaries` list as a side effect; other providers yield a single full-audio chunk.

### 3.7 Voice picker (frontend bar)

`GET /api/v1/tts/voices` returns the union of voices whose provider is reachable (Azure entries appear only if `AZURE_SPEECH_KEY` is set; Google only if credentials.json exists; Kokoro only if the package imports; etc.). Each voice is `{id, name, lang, provider}`.

Same voice id can appear under two providers (e.g. `sk-SK-LukasNeural` exists as both Edge and Azure — same neural model, different metadata). The picker uses `(provider + id)` as the selection key so both rows are independently highlightable.

---

## 4. Viseme generation

`tutor-service/app/services/viseme_timeline.py` is the most carefully tuned file in the repo. Three pipelines, ranked by accuracy:

| Tier | Function                  | Inputs                                | Accuracy        | When used                                  |
|------|---------------------------|---------------------------------------|-----------------|---------------------------------------------|
| 1    | `from_azure_phonemes()`   | Azure viseme callbacks (100ns offsets) | ±5 ms exact     | Azure TTS active                            |
| 2    | `from_word_boundaries()`  | Edge TTS WordBoundary (word offsets) | ±5 ms per-word, phoneme-within-word estimated | Edge TTS active |
| 3    | `build_timeline()`        | Plain text                            | ±25 ms drift    | All other providers (no audio anchor)       |

### 4.1 The 14-viseme set (SK-aware)

Backend tokenises Slovak text → phonetic tokens → maps to a 14-viseme inventory. Each viseme has a default weight + duration; many are env-tunable (`EDU_VISEME_FRAME_STEP_MS`, `EDU_VISEME_RAMP_MS`, etc.).

```
PP   = /p/ /b/ /m/             bilabials, lips closed
FF   = /f/ /v/                  labiodentals
CH   = /ʃ/ /ʒ/ /tʃ/ /dʒ/        postalveolars (š, ž, č, dž)
DD   = /t/ /d/ /ť/ /ď/ /n/      alveolars (ť mapped DD, not TH)
SS   = /s/ /z/ /c/ /dz/         sibilants + affricates
aa   = /a/ /á/                  open vowel
E    = /e/ /é/                  mid vowel
ih   = /i/ /í/ /y/ /ý/          close vowel
oh   = /o/ /ó/                  mid-back vowel
ou   = /u/ /ú/ + diphthongs (uo, ou) lip-rounded
kk   = /k/ /g/ /h/ /x/          velars
nn   = /n/ /ň/                  nasals (alternate of DD for certain contexts)
RR   = /r/ /l/                  liquids
sil  = silence / pause
```

Recent corrections (commit `baacef1`):
- `ť` was wrongly mapped to TH (English interdental) — corrected to `DD`
- `c`/`dz` were single-frame — now split into `DD 30ms + SS 60ms` two-frame affricates
- `ch` weight bumped from `0.45` to `0.27` (was too prominent for a fricative)
- `h` weight reduced to `0.15` (was overpowering)
- Diphthongs `ia/ie/iu/uo` total duration `90ms → 145ms` (35+110)

### 4.2 Coarticulation (commit `c06e9ff`)

Within `EDU_VISEME_COARTICULATION_MS` (default 40 ms) of a phoneme boundary, frames carry **both** current and upcoming viseme:

```json
{
  "viseme": "PP", "weight": 0.7,
  "visemes": [
    {"viseme": "PP", "weight": 0.7},
    {"viseme": "aa", "weight": 0.32}
  ],
  "start_ms": 280, "duration_ms": 40
}
```

The singular `viseme` field is the legacy contract (UE5 Blueprints reading only that field see no regression). Multi-blendshape Blueprints can read `visemes[]` and drive both channels with smooth lerps.

### 4.3 Trailing-silence pad

Real audio (MP3) has slight trailing silence; the viseme timeline must hold the mouth closed during it. After TTS finishes, `_apply_trailing_silence_pad()` measures the actual MP3 length via `mutagen`, then either:
- Pads the timeline with `sil` frames (if timeline shorter than audio)
- Linearly scales every frame's `start_ms`+`duration_ms` (if timeline longer)

Safety tail: `EDU_AVATAR_PAD_SAFETY_TAIL_MS = 500` (extra closed-mouth hold so the avatar doesn't cut visually before audio fully fades).

### 4.4 What we emit per sentence

Two SSE events per sentence, both with timelines:

- `sentence_start` — fired immediately, carries `text` + text-only timeline (avatar can start moving while TTS is still rendering audio)
- `sentence_end` — after TTS completes, carries `audio` (base64 MP3) + audio-anchored timeline (refined) + optional `arkit_frames` (52 ARKit channels @ 60 fps, only when audio2lipsync provider active)

---

## 5. Broadcast to UE5

### 5.1 WebSocket `/ws/avatar`

`app/api/ws_avatar.py` defines a FastAPI WebSocket route. `app/services/avatar_broadcaster.py` keeps a `Set[WebSocket]` of connected clients. UE5 (or the browser bridge) opens this WS on startup, receives JSON messages whenever the backend calls `broadcaster.broadcast(payload)`.

Sanity probes:
```
GET /api/v1/avatar/status  → {"connected": bool, "clients": N}
```

UE5 connection survives normal traffic but DROPS when backend restarts — UE5 then needs a relaunch to reconnect (it doesn't auto-reconnect). One-command relaunch wired into `Stop-EduTutor-Dev.ps1` + `Start-EduTutor-Dev.ps1`.

### 5.2 AvatarCommand JSON shape

```jsonc
{
  "type": "avatarCommand",
  "emotion": "neutral",           // 9-state enum: neutral|joy|proud|encouraging_mild|sadness|patient|curious|thinking_deep|surprise
  "intensity": 0.6,               // 0..1
  "isSpeaking": true,
  "agentState": "writing",        // optional v2.1: idle|thinking|searching|writing|listening
  "visemes": [                    // current-frame visemes (legacy single-viseme clients use [0])
    {"viseme": "aa", "weight": 0.85}
  ],
  "viseme_timeline": [            // full per-sentence timeline, ~80 ms frames
    {"viseme": "PP", "weight": 0.7, "start_ms": 0,   "duration_ms": 80,
     "visemes": [{"viseme":"PP","weight":0.7},{"viseme":"aa","weight":0.32}]},
    {"viseme": "aa", "weight": 0.9, "start_ms": 80,  "duration_ms": 160},
    {"viseme": "sil","weight": 1.0, "start_ms": 240, "duration_ms": 500}
    // ...
  ],
  "duration_ms": 1480,
  "arkit_frames": [               // OPTIONAL — only when audio2lipsync lipsync provider active
    {"t_ms": 0,   "arkit": {"JawOpen": 0.4, "MouthFunnel": 0.2, ...}},
    {"t_ms": 16,  "arkit": {"JawOpen": 0.45, ...}}
    // ... 52 channels per frame @ 60 fps
  ]
}
```

Field stability: `visemes`, `viseme_timeline`, `emotion`, `intensity`, `isSpeaking`, `duration_ms` are stable contract. `agentState` and `arkit_frames` are additive-safe (v2 clients ignore them). Detailed contract: `docs/ue5-avatar-contract.md`.

### 5.3 Idle broadcast

Between user turns, backend emits `{visemes: [{viseme:"sil", weight:1.0}], isSpeaking: false, ...}` so the avatar holds mouth-closed pose. No "ghost lips" issue.

---

## 6. UE5 — what's inside SlovakEdu.exe

Source project: `C:\Users\kindl\edotutor-ue5\EdutorUE\SlovakEdu.uproject` (UE 5.7).

### 6.1 Asset map

| Asset                                            | Role                                              |
|--------------------------------------------------|---------------------------------------------------|
| `Content/Level/Main_MH.umap`                     | Loaded level                                      |
| `Content/MetaHumans/slovak_char/BP_slovak_char`  | Character actor (component tree, face + body)     |
| `Content/MetaHumans/slovak_char/Face/SKM_slovak_char_FaceMesh` | Face skeletal mesh                |
| `Content/MetaHumans/Common/Face/ABP_Face_PostProcess` | **AnimBP with all viseme logic** (Dominik's edits) |
| `Content/MetaHumans/Common/Animation/ABP_MH_LiveLink` | Default MetaHuman LiveLink AnimBP             |
| `Content/Blueprints/Edutor_AgentConnection`      | WebSocket client connecting to `/ws/avatar`        |
| `Content/Blueprints/Edutor_MetaHuman_Base`       | Older intermediate AnimBP (FacePose with JawAlpha+Teeth only — superseded) |
| `Content/Blueprints/VisemeEnum`                  | UEnum with 14 entries (NewEnumerator0..13)        |
| `Content/Blueprints/Viseme`                      | UStruct: `viseme: VisemeEnum, weight: float`     |
| `Content/Blueprints/VisemeTask`                  | UStruct: `viseme, weight, start_ms, duration_ms`  |
| `Content/Blueprints/FacePose`                    | UStruct: `JawAlpha, Teeth` (the older 2-field version) |

### 6.2 The real lipsync architecture (in ABP_Face_PostProcess)

Verified by direct `.uasset` binary inspection, 2026-05-17. Variables present:

```
ActiveViseme              — current viseme name (driven by WS message)
HeadControlSwitch         — bool, enable/disable face control
VisemePose                — current pose snapshot
VisemeWeights, VisemeWeights_Value
VisemePP,  VisemePP_Value   — preset values for each of the 14 visemes
VisemeFF,  VisemeFF_Value
VisemeCH,  VisemeCH_Value
VisemeDD,  VisemeDD_Value
VisemeSS,  VisemeSS_Value
VisemeAA,  VisemeAA_Value
VisemeE,   VisemeE_Value
VisemeIH,  VisemeIH_Value
VisemeOH,  VisemeOH_Value
VisemeOU,  VisemeOU_Value
VisemeKK,  VisemeKK_Value
VisemeNN,  VisemeNN_Value
VisemeRR,  VisemeRR_Value
```

Each `Viseme*_Value` is a struct holding target values for ~25 MetaHuman ControlRig channels:

```
ctrl_expressions_jawopen, jawback, jawchinraisel, jawchinraiser
ctrl_expressions_mouthcornerpulll/r          (smile corners)
ctrl_expressions_mouthfunneldl/dr/ul/ur      (4-channel lip funnel — for o, u)
ctrl_expressions_mouthlipspursedl/dr/ul/ur   (4-channel pursed lips)
ctrl_expressions_mouthlipstowardsdl/dr/ul/ur (4-channel lip closure — for p, b, m)
ctrl_expressions_mouthlowerlipdepressl/r     (lower lip drop — for f, v)
ctrl_expressions_mouthpressdl/dr/ul/ur       (4-channel mouth press)
ctrl_expressions_mouthstretchl/r             (mouth stretch — for i, e)
ctrl_expressions_mouthupperlipraisel/r       (upper lip raise)
ctrl_expressions_tongueup
```

On Tick, AnimGraph:
1. Reads `ActiveViseme` (set by `Edutor_AgentConnection` on WS message)
2. Switch case → picks the matching `Viseme*_Value` struct
3. Reads the weight scalar from the WS message
4. Sets each CTRL channel = (preset value × weight) using LerpNode for smoothing
5. ControlRig drives the actual face mesh blendshapes underneath

### 6.3 Current limitation (open issue)

**Wiring is complete. Values need tuning.** Dominik admits: *"určite by sa mali ešte prispôsobiť aby sa líbili"*. Visually all 14 visemes still look like "jaw opens by varying amounts" because the per-viseme preset values are too uniform — e.g. PP's `mouthlipstowards*` may be 0.2 instead of 0.8; OU's `mouthfunnel*` may be 0.1 instead of 0.6.

Audit needed:
1. Open `ABP_Face_PostProcess` in UE Editor
2. For each of the 14 `Viseme*_Value` variables, screenshot the Default Value struct
3. Compare with the recommended mapping in `docs/viseme-to-arkit-mapping.csv`
4. Replace any low/zero values with the recommended ones; re-test in-engine via Morph Target Previewer

ETA when Dominik does this: 1–2 days. **No backend changes needed** — the data format is already correct.

---

## 7. PixelStreaming (video out)

UE5 SlovakEdu.exe launched with `-PixelStreamingURL=ws://127.0.0.1:8888` registers as a streamer with **Wilbur** (UE5.7 reference signalling server, source in `edotutor-ue5/EdutorUE/PixelStreaming/SignallingWebServer/`). Wilbur serves:

- Player page at `http://127.0.0.1:80/uiless.html` (modified — `object-fit: cover` CSS removes the iframe's letterbox bars around the avatar)
- WebSocket at `:8888` for streamer registration + browser SDP signalling

Browser inside `iframe` (rendered by `AvatarContainer.tsx`) negotiates WebRTC with the UE5 streamer through Wilbur, then receives video directly P2P. No backend involvement in the video path — backend only handles the AvatarCommand data channel.

**Important Wilbur gotcha:** the shipped `config.json` has `http_root` pointing at `D:\PixelStreamingInfrastructure\...` (a path from another machine). Wilbur silently 404s `uiless.html` until you override with `--http_root=<local-www>`. `Start-EduTutor-Dev.ps1` does this automatically.

---

## 8. Dev startup (one command)

```powershell
# From the repo root:
.\Start-EduTutor-Dev.ps1     # or double-click Start-EduTutor-Dev.bat
.\Stop-EduTutor-Dev.ps1
```

Starts all 7 services in the correct order, with port checks between each step. Idempotent (skips services already bound). Auto-picks newest packaged UE5 build from `C:\Users\kindl\Downloads\Edutor*\SlovakEdu.exe`.

Full doc: `docs/dev-stack-startup.md`.

**Hot-reload behaviour:**
- Backend Python edits → `uvicorn` auto-reloads, next request uses new code
- Frontend TS/TSX edits → Next.js HMR
- UE5 build → manual; drop new `Edutor<date>` folder in `Downloads/`, run `Stop` + `Start`
- After **any backend restart**, UE5 must be relaunched (it doesn't auto-reconnect to `/ws/avatar`)

---

## 9. Key configuration knobs

Backend env (in `tutor-service/.env`, gitignored):

```ini
# LLM
LLM_PROVIDER=openai                  # openai | anthropic | ollama | vllm
OPENAI_API_KEY=sk-...                # if openai
ANTHROPIC_API_KEY=...                # if anthropic
OLLAMA_BASE_URL=http://localhost:11434

# STT
STT_PROVIDER=                        # blank → auto-detect best for hardware

# TTS — exactly one path
USE_EDGE_TTS=true                    # free, Microsoft Edge neural; default if true
# or
AZURE_SPEECH_KEY=...                 # paid; audio-anchored visemes
AZURE_SPEECH_REGION=germanywestcentral  # MUST match your Azure Speech resource location

# Viseme tuning
EDU_VISEME_FRAME_STEP_MS=80
EDU_VISEME_RAMP_MS=80
EDU_VISEME_COARTICULATION_MS=40
EDU_VISEME_COARTICULATION_PEAK=0.45
EDU_AVATAR_PAD_SAFETY_TAIL_MS=500

# Memory
MEMORY_PERSIST_PATH=./data/memory
```

Frontend env (in `core/.env.local`):

```ini
NEXT_PUBLIC_UE5_STREAM_URL=http://127.0.0.1:80/uiless.html
```

---

## 10. Tests

- `tutor-service/tests/test_viseme_timeline*.py` — 41+ tests for the viseme pipeline. Run: `uv run pytest tests/test_viseme_timeline -v`
- `tutor-service/tests/test_chat_rag.py` — 14 tests for RAG retrieval + injection
- `tutor-service/tests/test_knowledge_base_api.py` — 16 tests for KB CRUD + document filters
- `tutor-service/tests/test_ws_avatar.py` — 29 tests for the avatar broadcaster (timeout, idle, snapshot-safe, ARKit pruning)
- `core/` — Vitest (limited coverage; mainly `cleanMarkdown`)

200 backend tests pass as of 2026-05-17. 4 known pre-existing failures in `test_viseme_timeline_deep` are intentional consequences of the Slovak phoneme corrections (`ť→DD` not TH, `c`/`dz` two-frame affricates).

---

## 11. Known open work

1. **UE5 viseme preset value tuning** — see §6.3. Dominik's task, 1–2 days. The bottleneck for visual lipsync quality.
2. **Custom LiveLink C++ source** for Mode 2 ARKit (52-channel HuBERT-driven lipsync) — Section 09.5 of the v3.0 BP brief. Not blocking the demo. 1–2 weeks of UE5 C++ work.
3. **RAG as a tool call** — model decides when to query the KB, instead of unconditional retrieval. Tier 3 redesign in the conversation-quality plan. Cleaner separation but bigger refactor.
4. **In-session summarization** — when conversation > 20 turns, compress older history into a prepended "what we discussed" block. Currently the 20-turn cap just drops the oldest turns.

---

## 12. Quick-reference paths

```
Backend root         tutor-service/
LLM service          tutor-service/app/services/llm_service.py
TTS service          tutor-service/app/services/tts_service.py
Viseme generator     tutor-service/app/services/viseme_timeline.py
Chat endpoint        tutor-service/app/api/chat.py
WS avatar endpoint   tutor-service/app/api/ws_avatar.py
Avatar broadcaster   tutor-service/app/services/avatar_broadcaster.py
Memory service       tutor-service/app/services/memory_service.py
Mode definitions     tutor-service/app/config/learning_modes.py
Mode prompts         tutor-service/app/config/prompts/*.md

Frontend root        core/
Chat UI              core/src/app/(shell)/page.tsx
Voice picker         core/src/components/voice/ProviderSettings.tsx
Avatar embed         core/src/components/voice/AvatarContainer.tsx
UE5 bridge           core/src/lib/ue5-bridge/

UE5 project          C:\Users\kindl\edotutor-ue5\EdutorUE\SlovakEdu.uproject
PixelStreaming srv   C:\Users\kindl\edotutor-ue5\EdutorUE\PixelStreaming\SignallingWebServer\
Packaged builds      C:\Users\kindl\Downloads\Edutor<date>\SlovakEdu.exe

UE5 avatar contract  docs/ue5-avatar-contract.md
UE5 blueprint brief  docs/ue5-blueprint-brief.html
UE5 artist brief     docs/ue5-artist-brief.html
Dev stack doc        docs/dev-stack-startup.md
Tech doc (Slovak)    docs/TECHNICKA_DOKUMENTACIA.md
Team rebrief         docs/team-rebrief-2026-05-16.md
This brief           docs/avatar-pipeline-handoff.md
```
