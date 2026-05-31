# EduTutor.AI — Technická dokumentácia

**Výstup č. 3 — Grant 09I05-03-V04-00072**
**Verzia:** 7.0 | **Dátum:** Máj 2026
**Spoločnosť:** SORRYWECAN s.r.o.
**Jazyk:** Slovenčina

---

## Abstrakt

EduTutor.AI je hlasovo ovládaná AI tutorská platforma pre slovenský
jazyk, vyvinutá ako prototyp novej generácie vzdelávacieho softvéru.
Systém kombinuje najmodernejšie technológie spracovania reči (STT/TTS),
veľké jazykové modely (LLM), retrieval-augmented generation (RAG)
a realistickú animáciu 3D MetaHuman avatara s lipsync synchronizáciou
do jedného koherentného riešenia.

Platforma podporuje 7 LLM providerov, 5 STT backendov (10 modelov
vrátane 3 SloPal SK fine-tunov), 10 TTS providerov a 2 vektorové
databázové backendy — všetky s runtime prepínaním bez reštartu.
Kľúčovou inováciou je vlastný slovenský lipsync systém (14 vizémov +
52-kanálový ARKit blendshape režim), fonetický pravidlový engine pre
slovenčinu, a Knowledge Base platforma inšpirovaná NotebookLM.

**Kľúčové čísla (aktuálny stav `main`):**
- 17 backend API routerov, 82+ endpointov
- 15+ servisných modulov
- 600 automatizovaných testov v 62 súboroch (CI / plný embedding
  stack; 512 na hostoch bez `torchcodec`/ffmpeg kompatibility)
- 354 golden dataset otázok z 5 predmetov
- 52 ARKit blendshape kanálov pre lipsync animáciu
- E2E latencia: 3–9 s (perceived: ~1 s vďaka streaming)

**Scope note:** Grantový deliverable je slovenský voice tutor spine
(avatar / TTS / STT / RAG / UE5 Blueprint). Phase 7+ Skill platforma,
Phase 8a anonymná identita a Phase 8b cross-session pamäť sú aditívna
infraštruktúra — dodávajú sa v repozitári, ale nie sú súčasťou §7.x
obligácií. `sk` Slovak tutor LearningMode neaktivuje žiadnu Phase 7/8
funkcionalitu — jeho flow je byte-identický s pre-Phase-6 baseline.

---

## Obsah

1. [Systémový diagram](#1-systémový-diagram)
2. [Architektonický prehľad](#2-architektonický-prehľad)
3. [Avatar Pipeline](#3-avatar-pipeline)
4. [TTS — Text-to-Speech](#4-tts--text-to-speech)
5. [STT — Speech-to-Text](#5-stt--speech-to-text)
6. [LLM — Language Model](#6-llm--language-model)
7. [RAG — Retrieval-Augmented Generation](#7-rag--retrieval-augmented-generation)
8. [Emotion Detector](#8-emotion-detector)
9. [Skill Platform](#9-skill-platform)
10. [Identita — Phase 8a](#10-identita--phase-8a)
11. [Pamäť — Phase 8b](#11-pamäť--phase-8b)
12. [Knowledge Base](#12-knowledge-base)
13. [Voice Cloning](#13-voice-cloning)
14. [Frontend](#14-frontend)
15. [Dátový tok — hlasová konverzácia](#15-dátový-tok--hlasová-konverzácia)
16. [Databázový model](#16-databázový-model)
17. [Nasadenie](#17-nasadenie)
18. [Testovanie a kvalita](#18-testovanie-a-kvalita)
19. [Kľúčové technologické rozhodnutia](#19-kľúčové-technologické-rozhodnutia)
20. [Výkonnostné metriky](#20-výkonnostné-metriky)
21. [Repozitár — inventár](#21-repozitár--inventár)

---

## 1. Systémový diagram

```
POUŽÍVATEĽ
  │  prehliadač · mikrofón · reproduktory
  ▼
┌──────────────────────────────────────────────────────────┐
│  FRONTEND  Next.js 15 · React 19 · TypeScript            │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ useVoice     │  │ AvatarOrb    │  │ Hardware     │  │
│  │ Session      │  │ + UE5 Bridge │  │ Setup Modal  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └─────────────────┴─────────────────┘           │
│                    HTTP · SSE · WebSocket                │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  BACKEND  FastAPI · Python 3.11                          │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐              │
│  │ chat.py │  │ws_avatar │  │ middleware │              │
│  │ (hot   │  │  .py     │  │ /user_id   │              │
│  │  path) │  │          │  │ entity.py  │              │
│  └────┬────┘  └────┬─────┘  └─────┬──────┘              │
│       │            │              │                      │
│  ┌────▼────────────▼──────────────▼───────┐              │
│  │              SLUŽBY                    │              │
│  │                                        │              │
│  │  ┌──────────┐ ┌───────┐ ┌───────────┐ │              │
│  │  │ LLM      │ │ TTS   │ │ STT       │ │              │
│  │  │ 7 prov.  │ │10 prov│ │ 5 backend │ │              │
│  │  └──────────┘ └───┬───┘ └───────────┘ │              │
│  │                   │                    │              │
│  │  ┌──────────┐ ┌───▼────┐ ┌───────────┐│              │
│  │  │ Emotion  │ │Avatar  │ │ RAG       ││              │
│  │  │ Detector │ │Pipe-   │ │ Chroma /  ││              │
│  │  │          │ │line    │ │ Weaviate  ││              │
│  │  └──────────┘ └────────┘ └───────────┘│              │
│  │                                        │              │
│  │  ┌──────────┐ ┌───────┐ ┌───────────┐ │              │
│  │  │ Skills   │ │Memory │ │ Voice     │ │              │
│  │  │ Platform │ │       │ │ Clone     │ │              │
│  │  └──────────┘ └───────┘ └───────────┘ │              │
│  └────────────────────────────────────────┘              │
│                                                          │
│  SQLite · ChromaDB · Redis (voliteľne)                   │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Architektonický prehľad

### 2.1 Hot path

```
Frontend (core/src)
 └─ používateľ píše alebo hovorí (useVoiceSession)
 └─ POST /api/v1/chat alebo /chat/stream
 └─ chat.py: chat / chat_stream ← HOT PATH
 ├─ Depends-injected llm: LLMService
 ├─ Lazy: rag = await get_rag_service (graceful degradation)
 ├─ Lazy: tts_svc = await get_tts_service
 ├─ _run_tool_loop ← prompt-based tool dispatch (Phase 6c)
 │ └─ SkillRegistry.dispatch(tool_name, args)
 ├─ build_timeline / _build_lipsync ← visemes + ARKit
 └─ _broadcast_avatar_state ← UE5 WS payload
 └─ AvatarBroadcaster.broadcast
 └─ všetci pripojení /ws/avatar klienti (UE5 MetaHuman)
```

### 2.2 Architektonické piliere

**Multi-provider abstrakcia (TTS/LLM/STT/RAG):** Každá služba používa
dict-dispatch tabuľku kľúčovanú na provider ID. Pridať nový provider =
jeden riadok v tabuľke + inferenčná funkcia. **Nikdy** `if/elif` reťazec.

**Asymetrické DI (FastAPI Depends):** LLM je eager-injected — jeho init
je robustný (fallback na mock ak všetci provideri zlyhajú). RAG a TTS
zostávajú lazy v tele endpointu — ich init môže legitímne zlyhať
a handler musí degradovať graceful (bez RAG → bez kontextu; bez TTS →
text-only). Toto je asymetrické DI — pozri [`docs/adrs/001-asymmetric-DI.md`](./adrs/001-asymmetric-DI.md).

**UE5 avatar protokol (v4.0):** WebSocket `/ws/avatar`. Payload obsahuje
`emotion`, `intensity`, `isSpeaking`, `visemes`, `viseme_timeline`,
`total_duration_ms`, `blink`, a voliteľné `agentState` (v2.1), `arkit`
(v3.0), `audioPositionMs`/`sentenceIdx` (v4.0). Všetky rozšírenia sú
spätne kompatibilné — pole sa vynecháva keď nie je nastavené.

**Skill ABC + tool-call loop:** Modulárna platforma agentov. `Skill` ABC,
`ToolDef` dataclass, `SkillRegistry` singleton. Prompt-based tool
dispatch — funguje s každým LLM providerom.

**Persona systém (LearningMode):** Každý režim bundluje system prompt,
TTS hlas, STT jazyk, enabled skills, a agent type. Tutor vs. asistent
vs. researcher = ten istý avatar, iný LearningMode.

---

## 3. Avatar Pipeline

Celý reťazec od textovej odpovede LLM až po animáciu MetaHuman tváre
v Unreal Engine 5. Štyri moduly, dve lipsync cesty, jeden transport.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Vstup** | text (odpoveď LLM) alebo audio (TTS výstup) |
| **Výstup** | WebSocket broadcast → UE5 Blueprint |
| **Lipsync režimy** | Text → Viseme (14 SK vizém) · Audio → ARKit (52 blendshapes) · Hybrid |
| **Vizémový krok** | 40 ms (laditeľný cez `EDU_VISEME_FRAME_STEP_MS`) |
| **Transport** | `/ws/avatar` (FastAPI WebSocket) |
| **Kontrakt** | `docs/ue5-avatar-contract.md` v4.0 |
| **Testy** | 29 (`test_ws_avatar.py`) |
| **ADR** | `005-ue5-protocol-v21.md` |

### Architektúra

```
[ chat.py ]
     │
     ├──► [ viseme_timeline.py ]  (404 riadkov)
     │         text → 46 SK grafém → 14 vizém
     │         koartikulačné vyhladzovanie → 40ms mikro-rámce
     │         │
     │         └──► _broadcast_avatar_state()
     │                    │
     │                    ▼
     │              [ avatar_broadcaster.py ]  (144 riadkov)
     │                    fan-out na všetkých UE5 klientov
     │                    snapshot-safe · 2.0s timeout
     │                    │
     │                    ▼
     │              [ ws_avatar.py ]  (124 riadkov)
     │                    /ws/avatar endpoint
     │                    │
     │                    ▼
     │               UE5 Blueprint → MetaHuman
     │
     └──► [ audio2lipsync_client.py ]  (206 riadkov, voliteľné)
              HuBERT + Transformer → 52 ARKit kanálov @ 60 fps
              GPU/MPS/CPU · fail-safe → prepne na textovú cestu
```

**Dve cesty — jeden transport:**

| Cesta | Modul | Latencia | Presnosť | Hardvér |
|---|---|---|---|---|
| Text → Viseme | `viseme_timeline.py` | ~4 ms | ±25 ms | CPU |
| Audio → ARKit | `audio2lipsync_client.py` | ~150–400 ms | ±5 ms | GPU / MPS |
| Hybrid | oba | adaptívna | adaptívna | adaptívny |

Obe cesty idú cez ten istý `avatar_broadcaster`. UE5 Blueprint
rozpozná cestu podľa prítomnosti poľa `arkit` v payloade.

### Modul 1 — viseme_timeline.py

```
"Výborne, správna odpoveď!"
  → build_timeline(text)
  → fonetický odhad (46 SK grafém + digrafov ch/dz/dž)
  → koartikulačné vyhladzovanie
  → dense 40 ms mikro-rámce
  → [{viseme:"PP", weight:0.9, start_ms:0, duration_ms:40}, ...]
```

- **46 slovenských grafém** mapovaných na **14 vizém** (PP, FF, TH,
  DD, nn, kk, SS, CH, RR, aa, ih, E, oh, ou, sil)
- **Dlhé samohlásky** — 1.8× dlhšia durácia pre slovenskú prozódiu
- **40 ms krok** — ladené podľa Rolandovej spätnej väzby (8 ms bolo
  prirýchle na MetaHuman rig)
- **Azure phoneme timing** (±5 ms) ak je dostupný, inak textový
  odhad (±25 ms)

Konfigurácia: `EDU_VISEME_FRAME_STEP_MS=40`, `EDU_VISEME_RAMP_MS=40`.

### Modul 2 — audio2lipsync_client.py

| Vlastnosť | Hodnota |
|---|---|
| Architektúra | HuBERT enkóder → Transformer hlava |
| Vstup | 16 kHz mono WAV |
| Výstup | 52 ARKit kanálov @ 60 fps |
| Váhy | `fotonlabs/unreal-audio2lipsync` (HuggingFace, MIT) |
| Zariadenia | MPS (Apple Silicon) · CUDA · CPU |

Životný cyklus: `_download_checkpoint()` → `ensure_model()` →
`generate_from_audio()` (ffmpeg resample → inferencia → gain=1.5 →
smooth_window=3) → `arkit_to_frames()`.

Fail-safe: ak model nie je dostupný, vráti `None` → volajúci prepne
na textovú cestu. **Žiadna výnimka neprejde do chat pipeline.**

### Modul 3 — avatar_broadcaster.py

Spravuje všetky WebSocket pripojenia. Invarianty:

- **Snapshot-safe iterácia** — `list(self._connections)` pred `await`
- **2.0s timeout na send** — `asyncio.wait_for`, mŕtvi klienti drop
- **Idle heartbeat** — blink pulsy každých 3–6s, dodržuje kontrakt
  idle visému `[{sil,1.0}]`

Broadcast payload obsahuje `emotion`, `intensity`, `isSpeaking`,
`visemes`, `blink`, `viseme_timeline`, `total_duration_ms`,
a voliteľne `agentState`. `agentState` sa **vynecháva** keď je
`None` — v2 Blueprinty vidia byte-identický traffic.

### Modul 4 — ws_avatar.py

Handshake:
```
UE5 → server:  {"type":"avatar_ready","capabilities":["viseme","emotion","state"]}
Server → UE5:  {"type":"ready_ack","version":"v2","capabilities_accepted":[...]}
```

`"version":"v2"` je historicky zamknuté — staršie Blueprinty na ňom
pattern-matchujú. Reálna verzia protokolu je v4.0. Origin gating:
localhost (akýkoľvek port) + 127.0.0.1 + ::1 vždy povolené.

### Ako rozšíriť

**Nový lipsync režim:** Implementovať generátor → pridať do
`_VALID_PROVIDERS` → pridať vetvu v `_broadcast_avatar_state` →
pripnúť testom.

**Nové pole v payloadi:** Editovať `_broadcast_avatar_state` —
pridať pole iba ak je nastavené (back-compat) → aktualizovať
kontrakt → pridať test → notifikovať Rolanda.

### Čo ju stráži

| Test súbor | Testov | Čo pinuje |
|---|---|---|
| `test_ws_avatar.py` | 29 | Snapshot-safe broadcast, timeout, idle viseme, agentState v2.1 back-compat, finally-on-cancel, ARKit pruning, dev broadcast |
| `test_viseme_timeline.py` | 10 | Graféma → vizém, digrafy, dlhé samohlásky |
| `test_viseme_timeline_deep.py` | 31 | Hĺbkové vizém testy |
| `test_phonetic_rules.py` | 32 | Fonetické pravidlá pre slovenčinu |

### Prevádzka

```bash
curl http://localhost:8000/api/v1/avatar/status
# → {"connected": true, "clients": 1}

curl http://localhost:8000/api/v1/lipsync/status
# → {"active": "text", "providers": {...}}

python scripts/smoke_avatar_ws.py  # smoke test bez UE5
```

Logy: `INFO Avatar WS connected. Total: 1` · `INFO Avatar broadcast
(emotion=joy, speaking=True) delivered to 1 client(s)` · `WARN Avatar
WS send timed out after 2.0s, dropping client`.

| Problém | Riešenie |
|---|---|
| Chýba `ready_ack` v logoch | Skontrolovať Blueprint OnMessage handler |
| `Total: 3+` v logoch | `docker compose restart tutor-service` |
| Broadcast timeout | Klient je mŕtvy — auto-drop |
| Model sa nenačítal | Prepne na textovú cestu |

---

## 4. TTS — Text-to-Speech

Desať providerov, dve dispatch tabuľky, jeden `TTSService`.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Provideri** | 10 (edge, openai, azure, google, piper, coqui, kokoro, xtts_clone, chatterbox, mock) |
| **Dispatch** | dict-dispatch — nikdy `if/elif` (ADR-002) |
| **Predvolený** | Edge TTS (zadarmo, bez API kľúča) |
| **Predvolený SK hlas** | `sk-SK-ViktoriaNeural` |
| **Streaming** | Edge TTS chunkuje každých ~50–100 ms |
| **Viseme dáta** | Áno (Edge + Azure `WordBoundary` eventy) |
| **Testy** | 16 (`test_tts_voice_routing.py`) |

### Architektúra

```
[ chat.py ]
     │
     ▼
[ TTSService.synthesize(text) ]
     │
     ├── provider == "azure" → _synthesize_azure(...)
     │
     └── _default_dispatch()[provider](text)
              edge → _synthesize_edge (Microsoft, free)
              openai → _synthesize_openai (tts-1/tts-1-hd)
              xtts_clone → _synthesize_xtts_clone (lokálny)
              mock → _synthesize_mock (testy)
```

**Explicitné volanie** (`synthesize_with_options`):
`_explicit_dispatch()` — edge, openai, azure, google, piper, coqui,
kokoro. Klony (xtts_clone, chatterbox) idú cez `_synthesize_clone()`
— nájde referenčné WAV, pri chybe fallback na Edge.

### Dispatch tabuľky

**_default_dispatch (synthesize):**

| Provider | Handler | API kľúč |
|---|---|---|
| edge | `_synthesize_edge` | nie, zadarmo |
| openai | `_synthesize_openai` | áno |
| xtts_clone | `_synthesize_xtts_clone` | nie, lokálny |
| mock | `_synthesize_mock` | nie, testy |

**_explicit_dispatch (synthesize_with_options):**

| Provider | Handler | API kľúč |
|---|---|---|
| edge | `_synthesize_edge` | nie |
| openai | `_synthesize_openai` | áno |
| azure | `_synthesize_azure_voice` | áno |
| google | `_synthesize_google` | áno |
| piper | `_synthesize_piper` | nie, lokálny |
| coqui | `_synthesize_coqui` | nie, lokálny |
| kokoro | `_synthesize_kokoro` | nie, lokálny |

### Kľúčové rozhodnutia

**XTTS používa češtinu pre slovenčinu:** XTTS-v2 nepodporuje `sk`.
Najbližší ekvivalent je `cs`. Override: `XTTS_LANGUAGE=sk`.
Dokumentované v `KNOWN_ISSUES.md`.

**Streaming — len Edge TTS:** Edge vracia chunky hneď ako prídu.
Ostatní provideri vracajú jeden blok.

**Asymetrické DI:** TTS sa nikdy neinjectuje eager. Ak init zlyhá,
handler pokračuje bez TTS (text-only).

### Konfigurácia

```
TTS_PROVIDER=edge · TTS_VOICE=sk-SK-ViktoriaNeural · XTTS_LANGUAGE=cs
AZURE_SPEECH_KEY=... · AZURE_SPEECH_REGION=westeurope
OPENAI_API_KEY=... · GOOGLE_APPLICATION_CREDENTIALS=...
```

### Ako pridať providera

1. `async def _synthesize_NOVY(self, text, ...) -> TTSResult`
2. Riadok do `_default_dispatch()` alebo `_explicit_dispatch()`
3. Env var do `.env.example`
4. Test do `test_tts_voice_routing.py`
5. **Nikdy** `elif self._provider == "novy"`

### Prevádzka

```bash
curl http://localhost:8000/api/v1/tts/voices?provider=edge
curl -X POST http://localhost:8000/api/v1/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Ahoj","provider":"edge","voice":"sk-SK-ViktoriaNeural"}'
```

---

## 5. STT — Speech-to-Text

Päť backendov, desať modelov, tri SloPal Slovak fine-tuny.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Backendy** | 5 (mlx, faster-whisper, openai, groq, mock) |
| **Modely** | 10 |
| **SloPal SK** | 3 (NaiveNeuron, EMNLP 2025, CC-BY-4.0) |
| **Predvolený (Apple Silicon)** | `mlx-whisper-turbo` (~0.5s) |
| **Predvolený (CPU)** | `faster-whisper-large-v3` (~4s) |
| **Audio preprocessing** | PyAV → 16 kHz mono float32 |
| **GPU serializácia** | `asyncio.Semaphore(1)` pre MLX |
| **Testy** | 6 (`test_slopal_registry.py`) |

### Architektúra

```
[ prehliadač ] → MediaRecorder → audio blob
     │
     ▼
[ decode_audio() ] → PyAV resample 16kHz mono float32
     │
     ▼
[ STTService.transcribe(audio, model_id) ]
     │  lookup v AVAILABLE_STT_MODELS podľa "backend"
     ├── mlx → _transcribe_mlx()
     ├── faster-whisper → _transcribe_faster_whisper()
     ├── openai → _transcribe_openai()
     ├── groq → _transcribe_groq()
     └── mock → _transcribe_mock()
```

### SloPal — Slovenské fine-tuny

Tri modely od NaiveNeuron:

| ID | HF model | WER na CV21 | Parametre |
|---|---|---|---|
| `slopal-whisper-small-sk` | `NaiveNeuron/whisper-small-sk` | ~25% (baseline 58%) | 244M |
| `slopal-whisper-large-v3-turbo-sk` | `NaiveNeuron/whisper-large-v3-turbo-sk` | ~13% (baseline 32%) | 809M |
| `slopal-whisper-large-v3-sk` | `NaiveNeuron/whisper-large-v3-sk` | ~12% (baseline 21%) | 1.55B |

**Non-negotiable:** HF model ID sú zamknuté testom — typo =
tichý fallback na base Whisper.

### Backendy

| Backend | Knižnica | Hardvér | Rýchlosť (M2) |
|---|---|---|---|
| mlx | mlx-whisper | Apple Neural Engine | ~0.5 s |
| faster-whisper | CTranslate2 | CPU / CUDA | ~3 s |
| openai | OpenAI API | cloud | ~0.5 s |
| groq | Groq API | cloud | ~0.1 s |
| mock | — | — | 0 s |

### Konfigurácia

```
STT_PROVIDER=mlx-whisper-turbo · STT_LANGUAGE=sk
OPENAI_API_KEY=... · GROQ_API_KEY=...
```

### Ako pridať model

1. Záznam do `AVAILABLE_STT_MODELS` (id, backend, model_id)
2. Ak SloPal: **presná zhoda s NaiveNeuron repom**
3. Test do `test_slopal_registry.py`

### Prevádzka

```bash
curl http://localhost:8000/api/v1/stt/models
curl -X POST http://localhost:8000/api/v1/stt/switch \
  -d '{"model_id":"slopal-whisper-large-v3-turbo-sk"}'
```

---

## 6. LLM — Language Model

Sedem providerov, runtime switching, prompt-based tool-call dispatch.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Provideri** | 7 (openai, anthropic, azure, ollama, vllm, custom, mock) |
| **Predvolený** | openai (API kľúč) alebo Ollama (auto-detekcia) |
| **Streaming** | Áno — SSE |
| **Tool calling** | Prompt-based — funguje so všetkými |
| **Fallback** | Ollama auto-detect → mock |
| **Testy** | 7 (`test_llm_switch.py`) |

### Architektúra

```
[ LLMService.chat(messages, tools?, stream=True) ]
     │
     ├── openai → _chat_openai()
     ├── anthropic → _chat_anthropic()
     ├── azure → _chat_azure()
     ├── ollama → _chat_ollama()
     ├── vllm → _chat_vllm()
     ├── custom → _chat_custom_registry()
     └── mock → _chat_mock()
```

### Provideri

| Provider | Knižnica | API kľúč | Streaming |
|---|---|---|---|
| openai | openai SDK | áno | áno |
| anthropic | anthropic SDK | áno | áno |
| azure | openai SDK (Azure) | áno | áno |
| ollama | HTTP REST | nie | áno |
| vllm | OpenAI-kompatibilné | nie | áno |
| custom | register | podľa configu | áno |
| mock | — | nie | áno |

**Ollama auto-detekcia:** Skúša `localhost:11434/api/tags` +
`host.docker.internal:11434/api/tags`. Priorita modelov:
`gemma3:27b` > `qwen2.5:14b` > `mistral-nemo` > …

### Tool calling (Phase 6c)

Prompt-based — funguje s každým providerom. LLM emituje:

```xml
<tool_call>{"tool":"search_web","args":{"query":"počasie"}}</tool_call>
```

`_run_tool_loop` parsuje, dispatchuje cez `SkillRegistry`,
feeduje výsledok späť. Max 5 iterácií.

### Konfigurácia

```
LLM_PROVIDER=openai · OPENAI_API_KEY=sk-... · ANTHROPIC_API_KEY=...
AZURE_OPENAI_API_KEY=... · AZURE_OPENAI_ENDPOINT=...
OLLAMA_BASE_URL=http://localhost:11434
VLLM_BASE_URL=http://localhost:8001
LLM_MODEL=gpt-4o · LLM_MAX_TOKENS=4096 · LLM_TEMPERATURE=0.7
```

### Ako pridať providera

1. `_chat_NOVY()` metóda
2. Vetva v `LLMService.chat()`
3. Inicializácia v `LLMService.initialize()`
4. Test v `test_llm_switch.py`

### Prevádzka

```bash
curl http://localhost:8000/api/v1/llm/status
curl -X POST http://localhost:8000/api/v1/llm/switch \
  -d '{"provider":"ollama","model":"qwen2.5:7b"}'
```

---

## 7. RAG — Retrieval-Augmented Generation

Dva vektorové backendy, jeden interface, zero-Docker predvolená hodnota.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Backendy** | ChromaDB (embedded) · Weaviate (Docker/cloud) |
| **Predvolený** | ChromaDB embedded — žiadny Docker |
| **Embedding** | `intfloat/multilingual-e5-large` (1024 dims) |
| **Chunking** | 512 tokenov, 128 overlap |
| **Golden dataset** | 354 otázok z 5 predmetov |
| **Testy** | 6 (`test_fragile_contracts.py`) |

### Architektúra

```
[ chat.py ]
     │  await get_rag_service()
     ▼
[ rag_service.py ] — factory
     ├── VECTOR_DB_BACKEND=chroma → ChromaRAGService
     └── VECTOR_DB_BACKEND=weaviate → WeaviateRAGService
              │  search(query, top_k=5)
              ▼  relevantné chunky → system prompt LLM
```

**ChromaDB:** Beží v procese FastAPI. Perzistencia `data/chroma/`.
Lazy init. **Žiadny Docker.**

**Weaviate:** Alternatíva pre produkciu. `docker compose up weaviate`.

### Ingestcia

PDF/TXT/MD → `chunk_text(512 tok, 128 overlap)` → embedder.encode()
→ collection.add() → pripravené.

### Kľúčové rozhodnutia

**Asymetrické DI:** RAG lazy v tele endpointu. Ak init zlyhá, chat
pokračuje bez RAG kontextu — žiadna 500.

**Graceful degradation:** Každá operácia má `try/except` s fallbackom
na prázdny výsledok.

### Konfigurácia

```
VECTOR_DB_BACKEND=chroma · WEAVIATE_URL=http://localhost:8080
EMBEDDING_MODEL=intfloat/multilingual-e5-large
RAG_TOP_K=5 · CHROMA_PERSIST_PATH=data/chroma
```

### Ako rozšíriť

Nový backend: implementovať `initialize()`, `search()`,
`add_documents()`, `delete_document()` → pridať do factory.

### Čo ju stráži

| Test súbor | Testov | Čo pinuje |
|---|---|---|
| `test_fragile_contracts.py` | 6 | RAG defaults, /chat greeting, SSE |
| `test_rag_pipeline.py` | 13 | Vyhľadávanie, relevance |
| `test_rag_edge_cases.py` | 18 | Edge cases |
| `test_chat_rag.py` | 8 | Chat + RAG integrácia |

### Prevádzka

```bash
curl http://localhost:8000/api/v1/rag/status
curl -X POST http://localhost:8000/api/v1/kb/upload -F "file=@ucebnica.pdf"
curl http://localhost:8000/api/v1/rag/search?query=Pytagorova+veta
```

---

## 8. Emotion Detector

Deväť emočných stavov, dva backendy.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Emócie** | 9 (celebrating, proud, encouraging_mild, correcting, patient, curious, thinking_deep, surprise, neutral) |
| **Backendy** | regex (predvolený, <1 ms) · BERT (voliteľný, ~30–80 ms) |
| **Jazyk** | Slovenčina |
| **Testy** | 4 |

### Architektúra

```
[ chat.py ] → text odpovede
     │
     ▼
[ get_detector(EMOTION_BACKEND) ]
     ├── regex → 9 kompilovaných patternov + _intensity_bonus()
     └── bert → distilbert-base-uncased, fine-tuned 1500 SK viet
              │  89–91% presnosť
              ▼
         EmotionResult(emotion, intensity) → _map_emotion_to_ue5()
              │  9 backend emócií → 3 UE5 stavy (joy, surprise, neutral)
              ▼
         _broadcast_avatar_state(emotion=..., intensity=...)
```

### Deväť emócií

| Emócia | Spúšťače (SK) | UE5 |
|---|---|---|
| celebrating | "výborne", "skvelé", "perfektné" | joy |
| proud | "som hrdý", "pokrok" | joy |
| encouraging_mild | "dobre", "takmer" | neutral |
| correcting | "nie", "chyba" | neutral |
| patient | "nevadí", "pokojne" | neutral |
| curious | "zaujímavé", "prečo?" | neutral |
| thinking_deep | "ťažká otázka", "premýšľam" | neutral |
| surprise | "wow", "prekvapivé" | surprise |
| neutral | všetko ostatné | neutral |

### Konfigurácia

```
EMOTION_BACKEND=regex    # regex (predvolený) alebo bert
```

---

## 9. Skill Platform

Modulárna platforma pre LLM agentov. ABC + Registry + tool-call loop.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Abstrakcia** | `Skill` (ABC) + `ToolDef` (dataclass) |
| **Registrácia** | `SkillRegistry` singleton |
| **Dispatch** | Prompt-based (Phase 6c) |
| **Aktívne skilly** | WebSearch, SpacedRepetition, Memory |
| **Gating** | `LearningMode.enabled_skills` |
| **Max iterácií** | 5 |
| **Testy** | 10 + 10 |

### Architektúra

```
[ LearningMode.enabled_skills ]
     │
     ▼
[ SkillRegistry.get_tools_for_mode(mode) ]
     │  OpenAI function schemas
     ▼
[ _run_tool_loop ]
     │  for i in range(5):
     │    response = llm.chat(messages)
     │    if "<tool_call>" not in response: return
     │    result = registry.dispatch(tool, args, user_id=uid)
     │    messages.append(result)
     │
     └── _agent_state_for_tool(tool) → broadcast agentState
```

### Skill ABC

```python
class Skill(ABC):
    name: str = ""        # unikátny, musí sa zhodovať s enabled_skills
    description: str = "" # popis pre LLM system prompt
    @abstractmethod
    def tools(self) -> List[ToolDef]: ...

@dataclass(frozen=True)
class ToolDef:
    name: str          # globálne unikátny
    description: str
    parameters: Dict   # JSON Schema (OpenAI formát)
    handler: Callable  # async (args) → str
```

### Existujúce skilly

| Skill | Nástroje | LearningMode |
|---|---|---|
| WebSearch | `search_web`, `fetch_url` | `assistant` |
| SpacedRepetition | `add_flashcard`, `review_flashcard`, `list_due_flashcards` | `tutor_practice` |
| Memory | `recall_memory`, `update_profile` | `assistant_pro`, `tutor_practice_pro` |

### AgentState mapovanie

| Tool | agentState |
|---|---|
| search_web, fetch_url | searching |
| add_card, review_card, update_profile | writing |
| due_cards, recall_memory | thinking |
| ostatné | thinking (default) |

### Gating

Slovak tutor (`sk`) má `enabled_skills: []` — **žiadny skill nie je
aktívny.** Tool loop sa preskočí. Flow je byte-identický s pre-Phase-6
baseline. Len režimy s explicitne povolenými skillmi aktivujú platformu.

### Ako pridať skill

1. `app/skills/NOVY/skill.py` — subclass `Skill`, implement `tools()`
2. Registrovať v `app/skills/startup.py`
3. Pridať do `LearningMode.enabled_skills`
4. Voliteľne: `_TOOL_NAME_TO_AGENT_STATE`
5. Test

---

## 10. Identita — Phase 8a

Anonymný-by-default používateľský middleware. Žiadne prihlasovanie.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Typ** | Starlette `BaseHTTPMiddleware` |
| **Výstup** | `request.state.user_id` — vždy UUID |
| **Priorita** | 1. `X-EduTutor-User-Id` header · 2. `edu_uid` cookie · 3. nové UUID |
| **Cookie** | 10 rokov max-age |
| **Testy** | 24 |

### Architektúra

```
[ HTTP Request ]
     │
     ▼
[ UserIdentityMiddleware.dispatch() ]
     ├── 1. X-EduTutor-User-Id header? → valid UUID → resolved
     ├── 2. edu_uid cookie? → valid UUID → resolved
     └── 3. Nič → generate UUID → create User row → set cookie
     │
     ▼
[ request.state.user_id = resolved_id ]
```

### Kľúčové rozhodnutia

**Header-first:** `getPersistentUserId()` v `core/src/lib/api.ts`
ukladá UUID do localStorage a posiela ako header. Táto cesta je
prioritná — chráni pre-Phase-8 používateľov pred stratou dát.

**Anonymný-by-default:** `User.is_anonymous = True`. Phase 9 pridá
magic link / OAuth ako aditívnu vrstvu.

**Graceful degradation:** Ak DB nie je dostupná, middleware nastaví
UUID bez DB riadka a pokračuje.

### Čo ju stráži

| Test súbor | Testov | Čo pinuje |
|---|---|---|
| `test_user_identity.py` | 5 | Header > cookie, nové UUID |
| `test_user_me_endpoint.py` | 2 | `/user/me` |
| `test_chat_user_identity.py` | 3 | user_id do tool loopu |
| `test_skill_dispatch_user_id.py` | 3 | dispatch forwarduje user_id |
| `test_flashcard_migration.py` | 2 | Phase 7 → 8 migrácia |

---

## 11. Pamäť — Phase 8b

Dva pamäťové povrchy: profil (SQLite) + epizodická (ChromaDB).

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Profil** | SQLite `user_profile` — 6 nullable polí |
| **Epizodická** | ChromaDB `edu_memory_<uid>` — per-user |
| **Nástroje** | `recall_memory(query)`, `update_profile(field, value)` |
| **Sumarizér** | `BackgroundTask` po `end_conversation` |
| **Gating** | Len `assistant_pro` a `tutor_practice_pro` |
| **Privacy** | `user_id` nie je v profile výstupe ani system prompte |
| **Testy** | 27 |

### Architektúra

```
[ chat.py ] — memory v enabled_skills?
     ├── ÁNO → inject <PROFILE> blok do system promptu
     │         → MemorySkill nástroje v tool loop-e
     └── NIE  → sk tutor — session-amnesic
```

**Štruktúrovaný profil:** `user_profile` tabuľka. 5 zapisovateľných
polí (whitelist). `last_summary` zapisuje len sumarizér.

**Epizodická pamäť:** `edu_memory_<uid>` ChromaDB kolekcia.
`remember()` — idempotentný upsert. `recall()` — sémantické
vyhľadávanie. Prázdna kolekcia → `[]`.

**Sumarizér:** `end_conversation` → `BackgroundTask` → LLM sumarizuje
→ `remember()`. Beží po odoslaní odpovede.

### Kľúčové rozhodnutia

**Privacy invariant:** `user_id` nikdy v texte, ktorý vidí LLM.

**Gating:** Slovenský tutor nikdy neaktivuje pamäť.

**Graceful degradation:** Každá operácia má fallback.

### Čo ju stráži

| Test súbor | Testov | Čo pinuje |
|---|---|---|
| `test_user_profile.py` | 5 | user_id NIE JE vo výstupe |
| `test_memory_recall.py` | 5 | recall, remember, izolácia |
| `test_conversation_summary.py` | 4 | Sumarizér |
| `test_memory_skill.py` | 6 | Skill metadata, whitelist |
| `test_chat_memory_injection.py` | 5 | `<PROFILE>` blok, user_id nie v prompte |

---

## 12. Knowledge Base

Štyri režimy, FTS5 full-text search, AI transformácie.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Režimy** | Chat, Study, Voice, Ask |
| **Full-text search** | SQLite FTS5 — < 10 ms |
| **Upload** | PDF, TXT, Markdown |
| **AI transformácie** | Summarize, Explain, Quiz |
| **Testy** | 22 |

### Štyri režimy

| Režim | Popis |
|---|---|
| **Chat** | Konverzácia s LLM nad materiálmi |
| **Study** | Čítanie + poznámky (TipTap) |
| **Voice** | Hlasová konverzácia |
| **Ask** | Jednorazová otázka |

### AI Transformácie

| Transformácia | Vstup | Výstup |
|---|---|---|
| Summarize | Vybrané chunky | Krátke zhrnutie |
| Explain | Vybraný chunk | Detailné vysvetlenie |
| Quiz | Vybrané chunky | 5 otázok s odpoveďami |

---

## 13. Voice Cloning

XTTS-v2 + Chatterbox.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Enginy** | XTTS-v2 · Chatterbox |
| **Referencie** | `.wav` v `models/{xtts,chatterbox}/references/` |
| **Jazyky XTTS** | 17 (cs fallback pre sk) |
| **Fallback** | Edge TTS |

### Architektúra

```
[ VoiceClonePanel ] → POST /api/v1/tts/clone
     │
     ▼
[ _synthesize_clone(provider, voice) ]
     ├── xtts_clone → nájdi .wav → _synthesize_xtts_clone()
     └── chatterbox → nájdi ref → _synthesize_chatterbox()
              │  pri chybe → fallback na Edge TTS
```

**XTTS-v2:** 17 jazykov, `sk` nie je podporované → `cs` fallback.
Override: `XTTS_LANGUAGE=sk`.

---

## 14. Frontend

Next.js 15 · React 19 · TypeScript · Tailwind CSS.

### Na prvý pohľad

| Vlastnosť | Hodnota |
|---|---|
| **Framework** | Next.js 15 (App Router) |
| **Jazyk** | TypeScript (strict) |
| **Štýlovanie** | Tailwind CSS + Radix UI + framer-motion |
| **State** | Zustand (3 stores) |
| **Konfigurácia** | `core/src/lib/config.ts` — single source of truth |
| **Logger** | `core/src/lib/logger.ts` — tagovaný |
| **Error boundaries** | 3: main, sidebar, onboarding |
| **Build** | 13 routes, tsc clean, build exit 0 |

### Hlavné komponenty

**useVoiceSession:** Hlavný hlasový hook. Životný cyklus:
`idle → listening (STT) → thinking (LLM) → speaking (TTS) → idle`.
MediaRecorder → STT transcribe → SSE stream → AudioContext fronta.

**UE5 Bridge — 3 adaptéry:**

| Adaptér | Použitie |
|---|---|
| `WebSocketServerAdapter` | `/ws/avatar` — lokálny vývoj |
| `PixelStreamingAdapter` | WebRTC — Pixel Streaming |
| `UEWebBrowserAdapter` | `window.ue.interface.broadcast()` |

**AvatarOrb:** 5 stavov, animované (framer-motion). Klik = session.

**Hardware Setup Modal:** Auto-detekcia OS/hardvéru/Ollama/STT/TTS.
Jeden klik = optimálna konfigurácia.

### Konvencie

- **`config.ts`:** `API_BASE` + `WS_BASE`. Nikdy `process.env` priamo.
- **`logger.ts`:** Nahrádza 30+ silent `catch {}` blokov.
- **Error Boundaries:** Jeden crash ≠ celá appka dole.

### Debug — `/avatar-debug`

Live log WS payloadov, Inject panel (presety), Simulátor (Blueprint
referencia), agentState pill.

### Build

```bash
cd core
pnpm tsc --noEmit && pnpm build && pnpm lint
```

---

## 15. Dátový tok — hlasová konverzácia

```
1. STT                            2. LLM + RAG
   používateľ hovorí                 text → sémantické vyhľadávanie
   MediaRecorder → audio blob        chunky → system prompt
   → transcribe → text (SK)          → LLM generuje odpoveď

3. Emotion + Viseme               4. TTS
   text → emócia (regex/BERT)       text → audio (MP3)
   text → viseme timeline           → streaming chunky
   → UE5 broadcast                  → prehliadač prehráva

5. Avatar                          6. Pamäť (ak enabled)
   UE5 Blueprint prijíma:           recall_memory → kontext
   emotion·visemes·agentState       end_conversation → summarizér
   → MetaHuman animácia
```

---

## 16. Databázový model

SQLite embedded. 6 modelov:

| Model | Tabuľka | Fáza |
|---|---|---|
| User | users | Phase 8a |
| UserProfile | user_profile | Phase 8b |
| Conversation | conversations | Chat história |
| Message | messages | Správy |
| Flashcard | flashcards | Phase 7 |
| KnowledgeBase | kb_documents + FTS5 | Dokumenty |

---

## 17. Nasadenie

### Lokálne

```bash
git clone https://github.com/<org>/edututor.git && cd edututor
./start.sh  # Mac/Linux — auto-inštalácia
```

`http://localhost:3000`. Demo: `demo@edututor.sk` / `edututor2026`.
Bez API kľúča: Ollama + Edge TTS + ChromaDB = plne offline.

### Docker

```bash
cp .env.example .env
docker compose up --build  # --build je POVINNÉ (COPY, nie volume)
```

### Hardvér

| Komponent | Minimum | Odporúčané |
|---|---|---|
| OS | macOS 13+, Linux, Win 10+ | macOS 14 (AS) / Linux + GPU |
| RAM | 8 GB | 32 GB |
| Disk | 6 GB | 30 GB |
| Python | 3.11+ | 3.11+ |
| Node | 18+ | 20+ |

---

## 18. Testovanie a kvalita

**600 testov v 62 súboroch** (CI). 568 passing na hostoch bez torchcodec (3 pre-existing failures, 7 xfailed, 11 skipped, 11 require torchcodec).

```
╔══════════════════════════════════════╦═════════╦═══════════════════════╗
║  Test súbor                          ║  Počet  ║  Oblasť               ║
╠══════════════════════════════════════╬═════════╬═══════════════════════╣
║  test_ws_avatar.py                   ║   29    ║  UE5 broadcaster      ║
║  test_tts_voice_routing.py           ║   16    ║  TTS provider routing  ║
║  test_slopal_registry.py             ║    6    ║  NaiveNeuron SK STT    ║
║  test_chat_dependency_injection.py   ║    7    ║  Asymmetric DI         ║
║  test_skill_registry.py              ║   10    ║  Skill platform        ║
║  test_tool_loop.py                   ║   10    ║  Tool dispatch         ║
║  test_learning_modes.py              ║   11    ║  LearningMode          ║
║  test_llm_switch.py                  ║    7    ║  LLM provider switch   ║
║  test_emotion_backend_switch.py      ║    4    ║  Emotion backend       ║
║  test_fragile_contracts.py           ║    6    ║  RAG/SSE/greeting      ║
║  test_config_pydantic_v2.py          ║    4    ║  Pydantic v2           ║
║  test_viseme_timeline.py             ║   10    ║  Vizém generovanie     ║
║  test_viseme_timeline_deep.py        ║   31    ║  Hĺbkové vizém testy   ║
║  test_phonetic_rules.py              ║   32    ║  Fonetické pravidlá    ║
║  test_knowledge_base_api.py          ║   22    ║  KB API                ║
║  test_rag_pipeline.py                ║   13    ║  RAG search            ║
║  test_rag_edge_cases.py              ║   18    ║  RAG edge cases        ║
║  test_chat_rag.py                    ║    8    ║  Chat + RAG            ║
║  test_user_identity.py               ║    5    ║  Header > cookie       ║
║  test_user_profile.py                ║    5    ║  Profil, privacy       ║
║  test_memory_recall.py               ║    5    ║  Epizodická pamäť      ║
║  test_conversation_summary.py        ║    4    ║  Sumarizér             ║
║  test_memory_skill.py                ║    6    ║  MemorySkill           ║
║  test_chat_memory_injection.py       ║    5    ║  Chat injection        ║
║  + ~32 ďalších súborov               ║  ~229   ║  Rôzne                 ║
╠══════════════════════════════════════╬═════════╬═══════════════════════╣
║  CELKOM                              ║   600   ║  62 test súborov       ║
╚══════════════════════════════════════╩═════════╩═══════════════════════╝
```

### Golden Dataset

354 otázok z 5 predmetov. `test-files/golden_dataset/`.

```bash
python tests/benchmark_rag.py      # RAG benchmark
python tests/benchmark_pipeline.py # Pipeline benchmark
```

---

## 19. Kľúčové technologické rozhodnutia

### Integračná inovácia

Grant definuje projekt ako **integračnú inováciu** — kombináciu
existujúcich komponentov. Žiadny vlastný LLM/TTS engine.

### Päť invariantov (docs/adrs/)

| ADR | Invariant |
|---|---|
| 001 | Asymetrické DI — LLM eager, RAG/TTS lazy |
| 002 | Dict-dispatch — nikdy `if/elif` |
| 003 | NaiveNeuron HF IDs — CC-BY-4.0 |
| 004 | Anonymný-by-default — header > cookie |
| 005 | UE5 v2.1+ — agentState sa vynecháva |

### Technologické pivoty

| Komponent | Pôvodný | Aktuálny |
|---|---|---|
| LLM | Gemma 9B | 7 providerov |
| TTS | Coqui | 10 providerov |
| STT | Whisper | 5 backendov + SloPal |
| Vektorová DB | Pinecone | ChromaDB (Weaviate voliteľne) |
| Lipsync | — | Textová + ARKit |

---

## 20. Výkonnostné metriky

Apple M4 Max, mlx-whisper-turbo, Edge TTS, ChromaDB. 26.4.2026.

| Fáza | p50 | p95 |
|---|---|---|
| STT | 480 ms | 720 ms |
| LLM (Ollama qwen2.5:7b) | 3.4 s | 5.1 s |
| RAG | 110 ms | 180 ms |
| Emotion + Viseme | < 5 ms | < 10 ms |
| TTS (Edge) | 1.1 s | 1.9 s |
| WS → UE5 | < 2 ms | < 2 ms |

Detail: `docs/benchmark_report.md`.

---

## 21. Repozitár — inventár

```
edotutor/
├── core/                    Next.js 15 frontend (13 routes)
│   └── src/
│       ├── app/             12 stránok
│       ├── components/      40+ komponentov
│       ├── hooks/           5 hookov
│       ├── lib/             config.ts, logger.ts, api.ts, ue5-bridge/
│       └── stores/          3 Zustand stores
│
├── tutor-service/           FastAPI backend (82+ endpointov)
│   └── app/
│       ├── api/             17 routerov
│       ├── services/        17 modulov
│       ├── skills/          Skill platforma
│       ├── models/          6 SQLAlchemy modelov
│       └── middleware/      UserIdentityMiddleware
│
├── docs/
│   ├── TECHNICKA_DOKUMENTACIA.md  ← tento súbor (v7.0)
│   ├── output3/                   ← grantové artefakty
│   ├── adrs/                      ← 5 ADR
│   └── ue5-avatar-contract.md     ← UE5 protokol v4.0
│
├── scripts/                 smoke testy
├── docker-compose.yml
├── start.sh / start.bat
└── .env.example
```

### Súčasťou repozitára

```
✓ Backend — FastAPI, 17 modulov, 82+ endpointov
✓ Frontend — Next.js 15, React 19, TypeScript, 13 routes
✓ Docker Compose — dev + prod
✓ Viseme Timeline — SK lipsync (14 vizémov + fonetika)
✓ Audio2Lipsync — 52 ARKit kanálov (HuBERT + Transformer)
✓ Voice Cloning — XTTS-v2 + Chatterbox
✓ Emotion Detector — regex (9 emócií) + BERT
✓ Knowledge Base — Notes, Transformations, FTS5, 4 režimy
✓ Skill Platform — ABC + Registry + tool-loop
✓ Identity + Memory — anonymný-by-default, per-user pamäť
✓ Testy — 62 súborov, 600 testov
✓ Golden Dataset — 354 otázok
✓ Dokumentácia — kompletná technická špecifikácia
✓ Start skripty — start.sh, start.bat
✓ Licencia — MIT
```

### Nie je súčasťou

```
✗ API kľúče (.env)
✗ UE5 projekt (~10 GB)
✗ Automaticky sťahované modely (Piper, Whisper, Audio2Lipsync)
```

---

## Krížové odkazy

- `docs/adrs/` — 5 Architecture Decision Records (architektonické invarianty)
- `docs/output3/README.md` — grantové artefakty
- `docs/ue5-avatar-contract.md` — UE5 ↔ backend protokol v4.0
- `docs/KNOWN_ISSUES.md` — známe kompromisy a dlh
- `docs/benchmark_report.md` — výkonnostné merania

---

## 12. Optimalizované parametre modulov

Táto kapitola zhromažďuje všetky laditeľné parametre naprieč modulmi.
Každý parameter je zdokumentovaný s predvolenou hodnotou, rozsahom
a odôvodnením výberu. Všetky hodnoty sú konfigurovateľné cez
environment premenné bez zmeny kódu.

### 12.1 Viseme / Lipsync

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `EDU_VISEME_FRAME_STEP_MS` | `viseme_timeline.py` | `40` ms | 4–200 ms | 8 ms spôsobovalo trhané prechody na MetaHuman rigi. 40 ms = ~25 fps, dostatočne hrubé pre snap-style aj lerp-style Blueprint. |
| `EDU_VISEME_RAMP_MS` | `viseme_timeline.py` | `40` ms | FRAME_STEP–200 | Koartikulačný ramp medzi susednými visemami. Rovnaký ako krok mriežky = plynulý prechod bez oneskorenia. |
| `EDU_VISEME_SHORT_VOWEL_MS` | `viseme_timeline.py` | `60` ms | 20–300 | Znížené z 90 ms (školské tempo) na 60 ms (konverzačné). Zodpovedá priemernej dĺžke krátkej samohlásky v hovorovej slovenčine. |
| `EDU_VISEME_LONG_VOWEL_MS` | `viseme_timeline.py` | `100` ms | 30–400 | Pomer 100/60 ≈ 1,67 zachováva fonologický kontrast dĺžky (distinktívny v slovenčine). |
| `EDU_VISEME_CONSONANT_MS` | `viseme_timeline.py` | `45` ms | 15–200 | Blízko priemernej dĺžky okluzívy v hovorovej slovenčine (~40–50 ms). |
| `UE5_BROADCAST_DELAY_MS` | `chat.py` | `180` ms | 0–∞ | Kalibrované na mediánový čas naplnenia MSE buffra (~150 ms) + `sourceopen` (~30 ms). Zabraňuje "ghost lips" (ústa sa hýbu pred zvukom). Na LAN možno znížiť na 80–100 ms. |
| `LIPSYNC_PROVIDER` | `chat.py` | `hybrid` | `hybrid` / `text` / `audio2lipsync` | Hybrid automaticky volí najkvalitnejší zdroj: ARKit 52 kanálov → WordBoundary eventy → textová estimácia. |

### 12.2 TTS

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `TTS_PROVIDER` | `tts_config.py` | `edge` | `edge` / `azure` / `openai` / `piper` / `kokoro` / `elevenlabs` / `omnivoice` | Edge TTS je zadarmo, podporuje slovenčinu (Lukáš/Viktória), ~0.6 s latencia. Azure pridáva viseme časovanie ±5 ms. |
| `EDGE_TTS_VOICE` | `tts_service.py` | `sk-SK-Lukáš` | ľubovoľný Edge voice ID | Mužský hlas pre tutor rolu. Viktoria pre ženský. |
| `AZURE_SPEECH_REGION` | `tts_service.py` | `westeurope` | Azure región | Najnižšia latencia pre SK/EÚ. |
| `PIPER_MODEL` | `tts_service.py` | `sk_SK-lili-medium` | Piper model ID | Lili — jediný verejne dostupný SK Piper model. Medium kvalita, ~0.3 s na CPU. Offline-ready. |
| `TTS_STREAM_CHUNK_SIZE` | `tts_service.py` | `4096` bajtov | 1024–16384 | 4 KB = ~50–100 ms audio chunku. Menšie = nižšia latencia, väčšie = menej SSE eventov. |

### 12.3 STT

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `STT_PROVIDER` | `stt_config.py` | auto-detect | `faster-whisper` / `mlx-whisper` / `groq` / `whisper-api` | Auto-detekcia: Apple Silicon → `mlx-whisper-turbo` (~0.5 s), ostatné → `faster-whisper-small-sk` (~1 s). |
| `STT_MODEL` | `stt_service.py` | `small-sk` | `tiny` / `small-sk` / `large-v3` | Small-sk = SloPal fine-tune, najlepší pomer presnosť/rýchlosť pre slovenčinu. Large-v3 = najpresnejší, potrebuje 4+ GB RAM. |
| `STT_SILENCE_THRESHOLD_MS` | `stt_service.py` | `800` ms | 200–3000 | 800 ms ticha = koniec vety. Kratšie = agresívnejšie delenie, dlhšie = dlhšie čakanie. |
| `STT_VAD_THRESHOLD` | `stt_service.py` | `0.5` | 0.0–1.0 | Silero VAD prah. 0.5 = štandard. Zvýšiť pre hlučné prostredie. |

### 12.4 LLM

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `LLM_PROVIDER` | `llm_config.py` | `openai` | `openai` / `anthropic` / `groq` / `ollama` / `vllm` / `openrouter` / `custom` | OpenAI = najjednoduchší štart (API kľúč). Ollama = offline. Groq = najrýchlejší cloud. |
| `OPENAI_MODEL` | `llm_service.py` | `gpt-4o-mini` | model ID | Najlacnejší model s native SK podporou. $0.15/1M vstupných tokenov. |
| `ANTHROPIC_MODEL` | `llm_service.py` | `claude-haiku-4-5` | model ID | Najrýchlejší Claude, dobrá slovenčina. |
| `OLLAMA_MODEL` | `llm_service.py` | `qwen2.5:7b` | Ollama model tag | Qwen 2.5 = najlepšia SK kvalita z open-source modelov. 4.7 GB. |
| `LLM_MAX_TOKENS` | `chat.py` | `512` | 1–4096 | Dostatok na 2–4 vetnú odpoveď v slovenčine. |
| `LLM_TEMPERATURE` | `chat.py` | `0.7` | 0.0–2.0 | Vyvážená kreativita pre tutoring. |
| `LLM_TIMEOUT` | `llm_service.py` | `60` s | 5–300 | 60 s = dosť aj pre pomalšie modely (Ollama na CPU). |

### 12.5 RAG / Knowledge Base

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `VECTOR_DB_BACKEND` | `rag_config.py` | `chroma` | `chroma` / `qdrant` | ChromaDB = embedded, žiadna infraštruktúra. Qdrant = produkčný scale. |
| `RAG_TOP_K` | `rag_service.py` | `6` | 1–20 | 6 chunkov = ~3000 tokenov kontextu. Dosť na presnú odpoveď, nie príliš na preťaženie LLM. |
| `RAG_CHUNK_SIZE` | `rag_service.py` | `500` znakov | 100–2000 | 500 znakov = ~2–3 vety. Optimálne pre sémantické vyhľadávanie. |
| `RAG_CHUNK_OVERLAP` | `rag_service.py` | `50` znakov | 0–500 | 10% overlap = kontinuita medzi chunkmi bez duplicity. |
| `RAG_SIMILARITY_THRESHOLD` | `rag_service.py` | `0.35` | 0.0–1.0 | 0.35 = dostatočne nízko pre slovenčinu (embeddings sú menej presné ako EN). |
| `CHROMA_PERSIST_DIRECTORY` | `rag_service.py` | `data/chroma` | filesystem path | Perzistentné embeddings — prežije reštart. |
| `EMBEDDING_MODEL` | `rag_service.py` | `intfloat/multilingual-e5-large` | HuggingFace model ID | Najlepší multilingual embedding model (50+ jazykov vrátane SK). 1024 dimenzií. |

### 12.6 Systém

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `APP_ENV` | `main.py` | `development` | `development` / `production` | Production = CORS tightened, debug off, rate limiting on. |
| `LOG_LEVEL` | `main.py` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` | INFO = dostatok pre monitoring, nie príliš verbose. |
| `EDU_DEV_MODE` | `main.py` | `1` | `0` / `1` | 1 = `/api/v1/avatar/dev/broadcast` + `?ue5ws=` povolené. 0 = production lock. |
| `CORS_ORIGINS` | `main.py` | `*` (dev) | CSV URL zoznam | Production: nastaviť na konkrétne domény. |
| `RATE_LIMIT_REQUESTS` | `main.py` | `100` | 1–10000 | 100 req/min na endpoint. Dostatočné pre tutoring. |
| `WS_MAX_CONNECTIONS` | `avatar_broadcaster.py` | `100` | 1–10000 | 100 = dosť pre školskú triedu (30 študentov + rezerva). |
| `PORT` | `main.py` | `8000` | 1024–65535 | Štandardný FastAPI port. |
| `HUGGINGFACE_TOKEN` | `env` | (prázdny) | HF token | Potrebný pre gated modely (niektoré Whisper/Sentiment). |

### 12.7 Memory

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `MEMORY_EPISODIC_TTL_DAYS` | `memory_service.py` | `90` | 1–365 | 90 dní = jeden semester. Staršie konverzácie sa archivujú. |
| `MEMORY_SUMMARIZER_TRIGGER_MSGS` | `conversation_summarizer.py` | `10` | 3–50 | Po 10 správach v konverzácii = spustiť sumarizáciu. |
| `MEMORY_PROFILE_UPDATE_FREQ` | `memory_service.py` | `5` | 1–20 | Každých 5 konverzácií = aktualizovať user profil (záujmy, úroveň). |
| `MEMORY_BACKEND` | `memory_service.py` | `chroma` | `chroma` / `sqlite` | Chroma pre sémantické vyhľadávanie epizód, SQLite pre profil. |

### 12.8 UE5 / Avatar

| Parameter | Modul | Default | Rozsah | Prečo |
|---|---|---|---|---|
| `AVATAR_BLINK_INTERVAL_MIN_S` | `avatar_broadcaster.py` | `3.0` s | 1.0–10.0 | Minimálny interval medzi žmurknutiami. |
| `AVATAR_BLINK_INTERVAL_MAX_S` | `avatar_broadcaster.py` | `6.0` s | 2.0–15.0 | Maximálny interval. Randomizované pre prirodzenosť. |
| `AVATAR_IDLE_HEARTBEAT_S` | `avatar_broadcaster.py` | `0.5` s | 0.1–2.0 | Ako často posielať idle pulse (blink) keď avatar nerozpráva. |

---

*Všetky parametre sú ladené cez environment premenné.*
*Produkčné nasadenie by malo prejsť vlastnou kalibráciou podľa hardvéru a latencie siete.*
