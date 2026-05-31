# EduTutor.AI — Full Stack Setup (Windows, native, with UE5 MetaHuman avatar)

**The complete, reproducible path to a fully functional EduTutor.AI** — backend +
frontend + the live Unreal Engine MetaHuman avatar with Slovak lip-sync.
**Verified end-to-end on a fresh Windows 11 machine on 2026-05-27.**

This is the portable, machine-agnostic guide. The older `START_STACK.md` and
`dev-stack-startup.md` describe the same pipeline but are hardcoded to one
developer's paths (`<repo-root>/...`) — use *this* doc for a clean setup.

> **TL;DR layering.** The web app (backend + frontend) runs on its own and shows
> a gradient **orb** avatar. The **MetaHuman** is a *separate* Unreal Engine app
> whose video is piped into the web page via Pixel Streaming. You can stop after
> Part A and have a working tutor; do Part B to get the 3D avatar.

---

## 0. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **git** | any | `gh auth login` if cloning a private repo |
| **Node.js** | 18+ (tested 22) | frontend + Pixel Streaming signalling |
| **uv** | latest | Python manager — auto-fetches Python **3.11** (system 3.10 is *not* enough). Install: `winget install astral-sh.uv` |
| **Ollama** *or* a cloud key | — | LLM brain. Ollama = free/local (`winget install Ollama`, then `ollama pull qwen2.5:7b`). Or set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY`. |
| **Unreal Engine** | **5.7** | only for Part B (the MetaHuman). Installed via Epic Games Launcher. UnrealEditor at `C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe`. |
| **RAM** | 16 GB+ | 32 GB recommended if running UE + Ollama together |

Repo layout used below (adjust to your paths):
- `<REPO>` = the repo on the `main` branch (backend + frontend), e.g. `C:\Users\you\edututor-ai-sandbox`
- `<UE>`   = the `EdutorUE` folder from the **`Edutor_UnrealEngine`** branch (the UE project), e.g. `C:\Users\you\edututor-ai-sandbox-ue\EdutorUE`

---

## Part A — Web stack (backend + frontend)

### A1. Backend — FastAPI on :8000

```powershell
# From <REPO>. uv fetches Python 3.11 and installs all deps into .venv
uv venv --python 3.11 tutor-service\.venv
uv pip install --python tutor-service\.venv\Scripts\python.exe -r tutor-service\requirements.txt
```

Create **`tutor-service\.env`** (the backend reads `.env` from the `tutor-service`
folder — NOT the repo root). Minimal local-Ollama config:

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:7b
STT_PROVIDER=                 # blank = auto (faster-whisper on Windows)
USE_EDGE_TTS=true
EDGE_TTS_VOICE=sk-SK-LukasNeural
VECTOR_DB_BACKEND=chroma
DATABASE_URL=                 # blank = SQLite at ./data/edututor.db
LIPSYNC_PROVIDER=hybrid
UE5_BROADCAST_DELAY_MS=180
```
To use OpenAI instead of Ollama, add `OPENAI_API_KEY=sk-...` and set
`LLM_PROVIDER=openai` (the app also auto-switches to OpenAI if a key is present).

Start it:
```powershell
cd <REPO>\tutor-service
.\.venv\Scripts\python.exe run_dev.py
```
**First start downloads a ~470 MB multilingual embedding model from HuggingFace**
(one-time) before it binds the port — wait for `Application startup complete`.

Health check (note the path — `/health` 404s, the real one is prefixed):
```powershell
curl http://localhost:8000/api/v1/health      # {"status":"ok", ...}
curl http://localhost:8000/api/v1/system/status
```

### A2. Frontend — Next.js on :3000

```powershell
cd <REPO>\core
npm install --legacy-peer-deps     # repo normally uses pnpm; npm works with this flag
npm run dev
```
No `.env` is required for dev — `NEXTAUTH_SECRET`, `DEMO_PASSWORD`, and the API URL
all have dev defaults, auth is **skipped** in development, and the avatar bridge
defaults to a **mock/orb** when no UE stream is configured.

Open **http://localhost:3000**. You now have a working tutor with the **orb** avatar.

---

## Part B — UE5 MetaHuman avatar

The web page never contains the MetaHuman — it embeds a **Pixel Streaming** video of
a separate Unreal Engine app in an `<iframe>`. Three things must be running:

```
[ UE5 game: SlovakEdu (-PixelStreamingURL=ws://127.0.0.1:8888) ]
   │  ├─ streams its viewport ── Pixel Streaming ──┐
   │  └─ Blueprint Edutor_AgentConnection ── ws://localhost:8000/ws/avatar ──> backend
   ▼                                               ▼
[ Signalling server :80 (player) + :8888 (streamer) ]
   │  <iframe src="http://127.0.0.1:80">
   ▼
[ Frontend :3000 ]  (NEXT_PUBLIC_UE5_STREAM_URL set → shows the iframe, not the orb)
```

### B1. Get the UE project on disk

The UE project (`SlovakEdu.uproject` + MetaHuman content + Wilbur, ~5 GB) lives on
the **`Edutor_UnrealEngine`** branch. There are two ways to have it:

**A) You're on the `Edutor_UnrealEngine` all-in-one branch** — `EdutorUE/` is
already in your checkout, next to `core/` and `tutor-service/`. Nothing to do;
`<UE>` = `<REPO>\EdutorUE`. (This branch bundles the current backend + frontend +
UE + Wilbur so a single clone has everything — that's its whole purpose.)

```powershell
git clone -b Edutor_UnrealEngine https://github.com/princeofwellness/edututor-ai-sandbox.git
```

**B) You're on `main`** (the lean app branch, no 5 GB of UE binaries) — materialize
the UE project in a sibling git worktree (shares the local object store, no
re-download):

```powershell
cd <REPO>
git worktree add --track -b Edutor_UnrealEngine ..\edututor-ai-sandbox-ue origin/Edutor_UnrealEngine
# → <UE> is now  ..\edututor-ai-sandbox-ue\EdutorUE
```

Either way, a clone/worktree with a warm `DerivedDataCache` launches UE much faster
than a cold one (first cold launch compiles shaders).

### B2. Start the Pixel Streaming signalling server (:80 + :8888)

```powershell
cd <UE>
.\RunPixelStreamingServer.bat
```
**First run builds the signalling monorepo** (downloads a bundled Node, builds the
Common/Signalling libraries + player frontend) — a few minutes. It then serves the
player page on **:80** and accepts streamers on **:8888**.

> If you already have the project **open in the UE 5.7 editor**, the editor hosts
> its own embedded signalling server on :80/:8888 — in that case you can skip this
> step (that's how this stack was first verified).

Confirm: `curl http://127.0.0.1:80/` returns HTTP 200 (the player page).

### B3. Launch the UE5 game as a Pixel Streaming streamer

> This runs the **project source** via the editor. The alternative is a packaged
> **`SlovakEdu.exe`** (cooked build, no editor needed). Both register on the
> signalling server identically — see [`UE5_RUN_MODES.md`](./UE5_RUN_MODES.md) for
> the exe variant and *why* both connect.

```powershell
& "C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe" `
  "<UE>\SlovakEdu.uproject" `
  -game -PixelStreamingURL=ws://127.0.0.1:8888 `
  -windowed -ResX=1280 -ResY=720 -AudioMixer `
  -ExecCmds="DisableAllScreenMessages"
```
- The default map is `/Game/Level/Main_MH` (the MetaHuman scene).
- `-PixelStreamingURL=ws://127.0.0.1:8888` is **mandatory** — without it the app
  never registers as a streamer.
- On `BeginPlay`, the Blueprint `Edutor_AgentConnection` connects to the backend
  at `ws://localhost:8000/ws/avatar` and starts receiving emotion/viseme commands.
- First launch from a cold clone compiles shaders (can be long); a clone with a
  warm `DerivedDataCache` starts in well under a minute.

For higher visual quality (from the original tuning), add:
```
-ResX=1920 -ResY=1080 `
-ExecCmds="r.BloomQuality 0, r.DepthOfFieldQuality 0, r.MotionBlurQuality 0, DisableAllScreenMessages, PixelStreaming.Encoder.MaxQP 18, PixelStreaming.WebRTC.MaxBitrate 100000000, PixelStreaming.WebRTC.Fps 60"
```

### B4. Point the frontend at the stream

Create / edit **`<REPO>\core\.env.local`**:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_UE5_STREAM_URL=http://127.0.0.1:80
```
Then **restart `npm run dev`** (Next.js inlines `NEXT_PUBLIC_*` at dev-server start).
Reload http://localhost:3000 → the **MetaHuman** now renders instead of the orb.
A small **Avatar / Orb** toggle appears top-right of the avatar zone.

---

## Verifying the full pipeline

```powershell
# UE Blueprint connected to the backend avatar channel? → clients:1
curl http://localhost:8000/api/v1/avatar/status        # {"connected":true,"clients":1}

# All four ports up
Get-NetTCPConnection -State Listen | ? { $_.LocalPort -in 80,8888,3000,8000 } |
  Select LocalPort,OwningProcess | Sort LocalPort

# Make the avatar speak (drives visemes to UE). Watch the MetaHuman lip-sync.
$b = @{ message="Ahoj! Predstav sa po slovensky."; mode_id="sk" } | ConvertTo-Json
Invoke-RestMethod http://localhost:8000/api/v1/chat -Method Post `
  -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($b))
# → response has ~100+ viseme_timeline frames; UE log shows visemes aa/E/ih/PP/... (not just "sil")
```

---

## Stopping everything

```powershell
# Frontend / backend (by port)
foreach($p in 3000,8000){ (Get-NetTCPConnection -State Listen -LocalPort $p -EA SilentlyContinue).OwningProcess |
  Select -Unique | % { taskkill /PID $_ /T /F } }
# UE game + signalling
Get-Process UnrealEditor -EA SilentlyContinue | Stop-Process -Force
Get-Process node -EA SilentlyContinue | ? { $_.Path -like '*SignallingWebServer*' } | Stop-Process -Force
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **Avatar shows the orb, not the MetaHuman** | `NEXT_PUBLIC_UE5_STREAM_URL` not set, or frontend not restarted after setting it. The orb is the intended fallback, not an error. |
| **Black avatar frame** | Player connected before the UE streamer was ready, or multiple players renegotiated. Hard-refresh the page (**Ctrl+Shift+R**). |
| **`avatar/status` shows clients:0** | The UE game isn't *playing* (editor open ≠ streaming) or wasn't launched with `-game`. The Blueprint connects on `BeginPlay`. |
| **Restarting the backend drops the avatar** | UE does **not** auto-reconnect `/ws/avatar` — relaunch the UE game after a backend restart. |
| **`Unsupported message 'layerPreference'`** in UE log | Benign signalling/streamer version mismatch chatter — ignore. |
| **`Failed to set remote description ... state: stable`** | Multiple simultaneous players renegotiating. Close extra player tabs; keep just the `:3000` page. |
| **Backend `/health` returns 404** | Correct path is `/api/v1/health`. |
| **Backend slow on first start** | One-time ~470 MB HuggingFace embedding-model download; it blocks the port until done. |
| **`ModuleNotFoundError` / Python errors** | Ensure the venv is **Python 3.11** (`uv venv --python 3.11`), not the system 3.10. |
| **LLM: which provider is active?** | `curl /api/v1/system/status`. Switch at runtime: `POST /api/v1/llm/switch {"provider":"ollama:qwen2.5:7b"}` — the target provider's key must be set for cloud providers. |
| **Two UE instances** | One UE editor can host signalling while a separate `-game` instance is the streamer — that's fine. For a clean repro, run `RunPixelStreamingServer.bat` for signalling and one `-game` instance as the streamer. |

---

## One-command launchers

Two portable launchers in the repo root (path-agnostic via `$PSScriptRoot`):

- **`Start-EduTutor-Web.ps1`** — Part A (backend + frontend; prefers `uv` for
  Python 3.11, runs `npm run dev`). Works on any branch.
- **`Start-EduTutor-Avatar.ps1`** — Part B (Pixel Streaming signalling + the UE5
  game, and ensures `core\.env.local` points at the stream). Intended for the
  all-in-one `Edutor_UnrealEngine` branch, where `EdutorUE/` is present; on `main`
  it tells you how to add the worktree first.

Typical flow on the all-in-one branch:
```powershell
.\Start-EduTutor-Web.ps1      # backend :8000 + frontend :3000
.\Start-EduTutor-Avatar.ps1   # signalling + UE5 MetaHuman, then it streams into :3000
```
