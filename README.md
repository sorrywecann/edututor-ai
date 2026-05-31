# EduTutor.AI

Slovak AI language tutor with voice, RAG knowledge base, 4-mode Knowledge Base
platform (Chat / Study / Voice / Ask), podcast generation, OmniVoice voice
cloning (600+ languages incl. Slovak), cross-session memory and 3D MetaHuman
avatar with proprietary slovak lipsync engine + 52-channel ARKit mode.

**Grant project** · SORRYWECAN s.r.o. · `09I05-03-V04-00072` · v5.0 (máj 2026)

---

## 📦 Install on Windows · one-click `.exe`

**The whole stack** — backend, frontend, Pixel Streaming signalling, cooked UE5
avatar — in a single double-click. No `git clone`, no Python, no Node, no Docker.

### 1 · Download

**v1.0 release: coming soon** — the public installer will live at
`sorrywecann/edututor-ai/releases` once cut. In the meantime, see
[`docs/guides/FULL_STACK_SETUP.md`](./docs/guides/FULL_STACK_SETUP.md)
for the current dev setup (clone + run from source). The signed
`EduTutor-Setup-X.exe` (~600 MB) ships with the v1.0 cut.

The installer is much smaller than previous releases because the 3D
MetaHuman avatar engine (~1.5 GB) is now shipped as a separate asset
(`ue5-engine-0.4.4.zip`) and fetched on first launch. The all-in-one
installer outgrew both the NSIS 2 GB mmap cliff and GitHub's 2 GiB
asset cap, so v0.4.4 ships as two assets — see *First launch* below.

### 2 · Install

Double-click the `.exe`. Windows SmartScreen will warn (unsigned, we don't
ship a code-signing cert yet) → click *More info* → *Run anyway*. Per-user
install; you choose the folder.

Then launch **EduTutor.AI** from Desktop or Start Menu.

### 3 · First launch — internet required (one-time)

The first launch needs an internet connection for two one-time downloads:

| Download | Size | Where it lands | When |
|---|---|---|---|
| **UE5 avatar engine** (`ue5-engine-0.4.4.zip`) | ~1.5 GB | `%APPDATA%\edututor-desktop\ue5\` | Splash shows *"Sťahujem avatar engine (1.5 GB, jednorazovo)"* with a progress bar; resumes via `Content-Range` if interrupted, SHA-256 verified, then extracted. |
| **Local LLM** (Ollama `gemma3:4b`) | ~3 GB | `%APPDATA%\edututor-desktop\ollama-models\` | First-run setup pulls it via the existing progress UI. Skippable if you paste a cloud API key (OpenAI / Anthropic / Groq) instead. |

After both downloads complete, **the app is fully local** — no further
internet needed for chat, voice input (faster-whisper bundled), avatar
or RAG. The only runtime cloud dependency is Edge TTS (Microsoft's free
Slovak voice, no key); a bundled Piper for offline TTS is on the v0.5
roadmap.

The app stores its version in `.bundle-version` inside the UE5 dir, so
the engine is re-downloaded only when it actually changes between
releases.

### 4 · After the downloads (~15–30 s per launch)

A cinematic splash opens — warm amber breathing orb, English words cycling
(*Waking up · Breathing · Studying · Thinking · Listening · Vibing · Flowing
· Jamming*), tiny status line showing each service coming up. When the
stack is ready the splash cross-fades into the app, straight into the
**Chamber** onboarding:

| Step | |
|---|---|
| **Vitaj** | Welcome — particle-constellation orb, *"Tichá miestnosť na učenie."* |
| **Krok 1 · Meno** | Tells the tutor what to call you |
| **Krok 2 · Charakter** | Pick a tone — Vážny / Praktický / Pohodový |
| **Krok 3 · Pripravený** | Confirmation → *Vstúpiť do miestnosti →* |

Then the conversation page opens — click the orb to start a voice session.
When the tutor speaks the constellation **pulsates live with the audio**.

### What you'll need

| | Required |
|---|---|
| **OS** | Windows 10 (1803+) or Windows 11, x64 |
| **Disk** | ~5 GB free (installer ~600 MB + ~1.5 GB UE5 engine fetched on first launch + ~3 GB local LLM + user data) |
| **LLM** | **Bundled** — Ollama ships in the `.exe`. First launch pulls `gemma3:4b` (~3 GB, ~5–10 min). *Optionally* paste a cloud API key (OpenAI / Anthropic / Groq) in the first-run screen for higher-quality answers + to skip the local pull. |
| **STT (voice input)** | **Bundled** — `faster-whisper` in the lean Python. First mic click downloads a ~145 MB whisper-base model once; afterwards instant + offline. No cloud key required. |
| **TTS (voice output)** | Edge TTS — Microsoft's free cloud Slovak voice. No key, but **needs internet** at runtime. (Future v0.5.0 will bundle Piper for offline TTS.) |
| **GPU** | Any modern GPU for the 3D MetaHuman avatar. CPU-only still shows the orb. |
| **Mic** | For voice — Windows prompts for permission on first use |
| **Internet** | For Edge TTS (cloud, free) and any cloud LLM. Fully offline = Ollama + local model only. |

### Switching the design

The default is the **Chamber** (pure black + particle orb). To flip to the
warmer **atmosphere** variant, click the **A** pill at the bottom of the
sidebar — one click swaps the whole app and persists.

### If something doesn't work

Logs land in `%APPDATA%\edututor-desktop\logs\`:

| File | What's in it |
|---|---|
| `launcher.log` | orchestrator events (service start / stop / restart) |
| `backend.log` | FastAPI + uvicorn (model load errors, port conflicts) |
| `frontend.log` | Next dev server output |
| `ue5.log` | UE5 game logs |

Common gotchas:

- **Splash stuck on "thinking…"** → Ollama isn't running and no cloud key yet. Either install Ollama + pull `gemma3:12b`, or click through to the first-run screen and paste an API key.
- **"Internal server error" in the window** → `:8000` or `:30000` held by an orphan from a previous session. Close Electron, end stray `python.exe` / `SlovakEdu.exe` in Task Manager, relaunch.
- **Avatar blank / black** → UE5 needs DirectX 12 + recent GPU driver. The orb-only fallback still works.

---

## What's inside (latest features)

- **Atmospheric 2026 UI** — dark glass design system (radial hero gradient,
  glass surfaces, micro-labels), avatar-first chat shell with collapsible
  right-side conversation drawer, ElevenLabs-style Voice Lab (tabs:
  Generate / My voices / Create), NotebookLM-style 3-column Knowledge
  workspace (Sources / Chat / Studio rail with 8 study actions)
- **OmniVoice voice cloning** — 600+ languages incl. Slovak, ~1.2 GB model, lazy-loaded
- **Knowledge Base — 3-column NotebookLM grammar** + Chat (conversational Q&A) ·
  Study (review flashcards + study notes) · Voice (hands-free) · **Ask** (one-shot
  deep query, 15 sources) modes; Studio rail with Zhrnutie, Kľúčové body, Kartičky,
  Otázky, Jednoducho, Analýza, Akčné body, Podcast
- **Podcast generation** — multi-speaker audio podcasts from KB documents (FFmpeg concat)
- **Cross-session memory (Phase 8b)** — user_profile + episodic memory + auto-summarizer
- **3D MetaHuman avatar** — 14 Slovak visemes + 52-channel ARKit blendshapes + 9 emotions + text2face presets
- **Conversational viseme timing** — env-tunable 60/100/45 ms phoneme durations
- **WebSocket reconnect** — exponential backoff + connection state UX
- **4 UE5 transport adapters** — Web Browser Widget · Pixel Streaming · WS Server · Mock
- **7 LLM providers · 5 STT backends · 7 TTS providers (+3 via explicit dispatch)** — all runtime-switchable
- **One-bundle Windows installer** (`EduTutor-Setup-X.exe`, ~1.9 GB) — backend
  (lean self-contained CPython 3.11) + frontend (Next.js standalone) + Pixel
  Streaming signalling + cooked UE5 avatar in a single double-click; per-user
  writable data dir, no Python/Node/Docker/repo required on the target. See
  [`desktop/BUNDLE.md`](./desktop/BUNDLE.md).
- **Two design variants — toggle in the sidebar** — `chamber` (default,
  pure-black private-mentor chamber with particle-constellation orb and
  Geist + Instrument Serif italic accents) and `atmosphere` (warm "Living
  Room"). A/C pill at the bottom of the sidebar flips between them.
- **595+ backend tests** (62 files) · k6 load testing · 354-question golden dataset

---

## For developers

| | |
|---|---|
| **Run from source with UE5 avatar** (one command, auto-downloads UE5 + Wilbur) | `.\start.ps1 -Avatar` — see [`docs/guides/START_STACK.md`](./docs/guides/START_STACK.md) |
| **Run from source, team member with sibling UE5 clone** | `.\start.ps1 -Avatar -UseSiblingClone` |
| **Build the installer from source** (cook UE5 + stage resources + electron-builder) | [`desktop/BUNDLE.md`](./desktop/BUNDLE.md) |
| **Just the web stack on Windows** (no UE5 avatar) | `start.bat` (or `start.ps1`) |

## Quick Start — klikni a spusti (Docker)

> **Predpoklady:** [Docker Desktop](https://www.docker.com/products/docker-desktop) (Mac / Windows / Linux). Nič iné.

1. **Stiahni / klonuj** tento repozitár.
2. **Otvor priečinok** v Finder (Mac) alebo Explorer (Windows).
3. **Dvojklik** na launcher pre tvoj OS:

| OS | Súbor | Stop |
|---|---|---|
| macOS | `./start.sh` | Ctrl+C v termináli |
| Windows | `start.bat` (or `start.ps1`) | Ctrl+C v termináli |
| Linux | `./start.sh` v termináli | Ctrl+C v termináli |

Launcher si overí Docker, vyrobí `.env` z `.env.example`, postaví kontajnery a sám otvorí prehliadač na **http://localhost:3000**. Prvé spustenie môže trvať 5–10 minút (sťahuje sa ~2 GB modelov a obrazov). Ďalšie spustenia sú sekundové.

---

## Quick Start — manuálne (bez Docker, pre vývoj)

> **Requires:** Python 3.11+, Node.js 18+, pnpm (or npm)

```bash
# 1. Clone
git clone https://github.com/princeofwellness/edututor-ai-sandbox.git
cd edututor-ai-sandbox

# 2. Start everything
./scripts/start.sh   # Mac / Linux (dev mode, no Docker)
```

> **Manual frontend install?** Run `pnpm install` from `core/` (a project-local
> `.npmrc` already sets `legacy-peer-deps=true` — required for the next@15 +
> next-auth@4 combination). With plain npm, use `npm install --legacy-peer-deps`.

Open **http://localhost:3000**

**Demo login** (pre-filled — just click *Sign in*):

| Field | Value |
|---|---|
| Email | `demo@edututor.sk` |
| Password | `edututor2026` |

Override the password via `DEMO_PASSWORD=…` in `core/.env` if needed. Real authentication (magic-link / OAuth) is Phase 9 — out of scope for the grant prototype.

The **Hardware Setup** modal fires automatically on first load — it detects your machine,
shows live status for every service, and applies the optimal STT / LLM / TTS config in one
click. No `.env` editing required.

**No API key needed** if you have [Ollama](https://ollama.com) installed — it's detected
automatically (no `.env` editing required). Pull a model based on your RAM:

```bash
ollama pull gemma3:4b      # 2.5 GB — 8GB+ RAM, decent Slovak
ollama pull qwen2.5:7b     # 4.7 GB — 12GB+ RAM, much better Slovak ← recommended
ollama pull gemma3:12b     # 8.1 GB — 16GB+ RAM, best local Slovak
```

---

## Quick Start — Docker

> **Requires:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
cp .env.example .env
# Edit .env → add at least OPENAI_API_KEY or ANTHROPIC_API_KEY

docker compose up --build
```

Open **http://localhost:3000**

First run downloads ~500MB of checked-in models (~1.2 GB OmniVoice model downloads on first use via lazy-load). Subsequent starts are fast.

---

## What works without an API key

| Component | Default | Notes |
|-----------|---------|-------|
| STT | mlx-whisper-turbo (Apple Silicon) / faster-whisper (others) | Fully local, no API key |
| TTS | Edge TTS — sk-SK-LukasNeural | Free Microsoft cloud, no key |
| RAG | ChromaDB embedded | No Docker, no separate service |
| Database | SQLite | No PostgreSQL needed for dev |
| LLM | **Ollama (local, free)** or any cloud key | Hardware modal auto-detects |

### Free fully-offline option (Ollama)

```bash
# Mac
brew install ollama && ollama serve

# Windows / Linux — download installer at https://ollama.com/download
```

Pull a model (Ollama is auto-detected at startup — no `.env` needed):
```bash
ollama pull qwen2.5:7b   # best Slovak quality that fits in 12GB RAM
ollama pull gemma3:4b    # fallback for 8GB machines (2.5 GB)
```

The app detects Ollama automatically on startup and picks the best model you have installed.

---

## LLM options

| Provider | Key needed | Latency | Cost | Slovak quality | Best for |
|----------|-----------|---------|------|----------------|---------|
| OpenAI gpt-4o-mini | Yes | ~4s | ~$0.01/session | ★★★★★ | Easiest start |
| Anthropic Claude Haiku | Yes | ~3s | ~$0.01/session | ★★★★★ | Alternative cloud |
| Groq llama-3.3-70b | Yes (free tier) | ~0.5s | Free | ★★★★☆ | Fastest free cloud |
| Ollama gemma3:4b | No | ~3s | Free | ★★★☆☆ | 8GB RAM, offline |
| Ollama qwen2.5:7b | No | ~4s | Free | ★★★★☆ | 12GB RAM — best free mid-range |
| Ollama gemma3:12b | No | ~10s | Free | ★★★★☆ | 16GB RAM, best local |
| vLLM + Qwen2.5-32B | No | ~0.5s | Free | ★★★★★ | RTX 4090 / power tier |

---

## Hardware-adaptive setup

EduTutor detects your hardware on first login and recommends the optimal config:

| Tier | RAM / GPU | STT | LLM | TTS |
|------|-----------|-----|-----|-----|
| Minimal | <10 GB | faster-whisper-small | openai | edge |
| Standard | 16 GB / Apple Silicon | mlx-whisper-turbo | openai | edge |
| Performance | 32–64 GB / M3 Max | mlx-whisper-large-v3 | ollama/gemma3:27b | piper |
| Power | RTX 4090 24GB | faster-whisper-large (CUDA) | vLLM/Qwen2.5-32B | edge |
| Server | A100 / H100 | faster-whisper-large (CUDA) | vLLM/Llama-3.3-70B | edge |

Click **Apply** in the modal — all three services switch instantly, no restart.

---

## Development

```
edututor-ai-sandbox/
├── core/                  Next.js 15 frontend
│   └── src/
│       ├── app/           Pages
│       ├── components/    UI components (shell, voice, chat)
│       └── hooks/         useVoiceSession, useProviderSettings
├── tutor-service/         FastAPI backend
│   └── app/
│       ├── api/           Endpoints (chat, stt, tts, llm, knowledge_bases, system)
│       ├── services/      STT, TTS, LLM, RAG, memory services
│       └── config/        LLM system prompt, RAG config
├── docker-compose.yml     Production-ready Docker stack
├── scripts/start.sh       Local dev one-command start
└── .env.example           All config options documented
```

**Backend API docs:** http://localhost:8000/docs (Swagger UI, auto-generated)

---

### Architecture map (high-leverage entry points for contributors)

| File | What it is |
|---|---|
| `tutor-service/app/api/chat.py` | The hot path. Streaming chat, tool-call loop, UE5 broadcast, Depends-injected LLM. Read this first. |
| `tutor-service/app/skills/` | Skill ABC + `SkillRegistry` — the modular agent platform. Drop a `Skill` subclass here and it auto-registers. |
| `tutor-service/app/deps.py` | FastAPI Depends providers for service injection. Test with `app.dependency_overrides`. |
| `tutor-service/app/services/avatar_broadcaster.py` | Snapshot-safe WebSocket fan-out to UE5 clients. v2.1 protocol. |
| `tutor-service/app/config/learning_modes.py` | Persona system. `enabled_skills` + `agent_type` wire skills to modes. |
| `core/src/lib/config.ts` | Single source of truth for `API_BASE` and `WS_BASE`. Never hardcode `process.env.NEXT_PUBLIC_API_URL` again. |
| `core/src/components/ErrorBoundary.tsx` | Mounted at shell layout — one component crash cannot blank the whole app. |
| `docs/architecture/ue5-avatar-contract.md` | Wire format for the UE5 Blueprint dev. v2.1 with optional `agentState` field. |
| `core/src/components/atmosphere/` | Atmospheric design system primitives (`GlassCard`, `Button`, `MicroLabel`, `AtmosphereModal`, `PageHeader`, etc.). Shared across every shell page — start here when building new UI surfaces. |
| `core/src/app/globals.css` | Atmospheric design tokens — `--atm-hero` radial gradient, `--atm-glass-*` translucent surfaces, micro-label typography, global form styling. |
| `core/src/app/(shell)/page.tsx` | Main chat shell. Avatar locked large; conversation lives in collapsible right-side `ChatDrawer` defined in the same file. |
| `core/src/app/(shell)/voice-lab/page.tsx` | Voice Lab — ElevenLabs-style 3-tab UI (Generovať reč / Moje hlasy / Vytvoriť hlas) with workspace + right-rail settings on the Generate tab. |
| `core/src/components/kb/KBWorkspace.tsx` + `KBStudio.tsx` | NotebookLM-style 3-column Knowledge layout. `STUDY_TOOLS` is the single source of truth in `core/src/lib/kb/studyTools.ts`. |
| `core/src/stores/useKBStore.ts` | Zustand store for KB state. `removeDocument` action enables optimistic delete (avoids 404 surfaces after stale state). |

### Slovak STT models (pick one in Hardware Setup)

| Model ID | WER on CV21 | Speed | When to pick |
|---|---|---|---|
| `mlx-whisper-turbo` | ~32% | 0.5s on M2 | Daily driver, Apple Silicon |
| `slopal-whisper-large-v3-turbo-sk` ⭐ | **~13%** | 0.8s on GPU, 3s CPU | **Best balance** — production Slovak |
| `slopal-whisper-large-v3-sk` | **~12%** | 1.2s on GPU | Maximum accuracy, prefer GPU |
| `slopal-whisper-small-sk` | ~25% | 2s CPU | Lightweight CPU fallback |

SloPal fine-tunes (NaiveNeuron, EMNLP 2025, CC-BY-4.0) deliver 65–70%
WER reduction over base Whisper on Slovak. Drop-in via the existing
`faster-whisper` backend.

### Phase 6 platform spine (current architecture state)

EduTutor.AI is no longer a "Slovak chat tutor" — it's an **agent
platform with a UE5 avatar presence layer**. Four foundations landed
in Phase 6:

- **`agentState` v2.1 protocol** — UE5 broadcast carries optional
  `agentState: idle | thinking | searching | writing | listening`.
  Backwards-compatible: omitted from payload when unset, so v2 Blueprints
  see byte-identical traffic.
- **Skill ABC + `SkillRegistry`** — drop a `Skill` subclass into
  `tutor-service/app/skills/<name>/skill.py` with a `tools()` method
  returning OpenAI function-calling schemas. The chat tool-call loop
  dispatches automatically.
- **Tool-call loop in `chat.py`** — prompt-based (works with every
  provider: Ollama, OpenAI, Anthropic, vLLM, custom). Bypassed when
  `enabled_skills` is empty (current Slovak tutor flow), so the existing
  experience is unaffected.
- **`LearningMode` extension** — `enabled_skills: list[str]` and
  `agent_type` fields wire personas to skill subsets. Same avatar, same
  voice, different tool inventory per mode.

595+ tests collected (62 files), zero deprecation warnings in core path.

### Phase 8a + 8b identity + cross-session memory

EduTutor identifies users by a per-browser anonymous UUID — no login
screen, no passwords, no email. Resolution priority on every API
request: `X-EduTutor-User-Id` header (frontend localStorage key
`edututor_user_id`) → `edu_uid` cookie (server-issued backup) →
generate new UUID + set cookie.

What this enables today:
- Two browsers = two separate flashcard decks (no data bleed)
- Existing Phase 7 single-deck users keep their cards (transparently
  reassigned to a synthetic legacy user, ID persisted to
  `data/legacy_user_id.txt`)
- The Slovak tutor flow is byte-identical (no per-user state visible
  in the chat path because `sk` mode bypasses tools)

What's deferred to Phase 9:
- Real authentication (magic link / OAuth)
- Multi-device account claiming
- The `User` model already has nullable `email` + `is_anonymous`
  flag, so Phase 9 only adds the claim flow on top

**Phase 8b adds cross-session memory** on top of the identity foundation. Memory only activates in `assistant_pro` and `tutor_practice_pro` modes — the Slovak tutor stays session-amnesiac by design. Profile data is structured (SQLite `user_profile` table); episodic recall is semantic (per-user ChromaDB collection `edu_memory_<uid>`). After each conversation ends, a background task summarizes the session via LLM and persists it into episodic memory, so the next session can recall it. Real auth (magic-link / OAuth) is out of scope for the grant prototype. The full identity contract is documented in [`docs/adrs/004-anonymous-by-default-identity.md`](./docs/adrs/004-anonymous-by-default-identity.md).

### Switching providers at runtime

```bash
# Switch STT
curl -X POST http://localhost:8000/api/v1/stt/switch \
  -H "Content-Type: application/json" -d '{"model_id": "faster-whisper-sk-small"}'

# Switch LLM
curl -X POST http://localhost:8000/api/v1/llm/switch \
  -H "Content-Type: application/json" -d '{"provider": "ollama:gemma3:12b"}'

# Auto-apply optimal config for detected hardware
curl -X POST http://localhost:8000/api/v1/system/apply \
  -H "Content-Type: application/json" -d '{}'

# What is currently running
curl http://localhost:8000/api/v1/system/status

# Save an API key without restarting
curl -X POST http://localhost:8000/api/v1/system/config \
  -H "Content-Type: application/json" -d '{"openai_api_key": "sk-..."}'
```

---

## Contributing

This project welcomes contributions. Read the entry points below before
opening a PR.

| Audience | Start here |
|---|---|
| **First-time contributor** | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| **Architectural decisions** | [`docs/adrs/`](./docs/adrs/) — one ADR per invariant |
| **Workflows** (new skill, new provider, new mode) | [`docs/workflows/`](./docs/workflows/) |
| **Filing a bug or feature** | [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) |
| **Security disclosures** | [`SECURITY.md`](./SECURITY.md) (do NOT file public issues) |
| **Code of Conduct** | [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) |
| **Changelog** | [`CHANGELOG.md`](./CHANGELOG.md) |

One-click dev environments via [`.devcontainer/`](./.devcontainer/) —
compatible with VS Code Dev Containers and GitHub Codespaces.

---

## License

MIT · SORRYWECAN s.r.o.
