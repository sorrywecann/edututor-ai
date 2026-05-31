# Starting the EduTutor.AI Avatar Stack (local dev)

The confirmed, working way to bring up the full avatar pipeline. Last verified
end-to-end **2026-05-25** (avatar streaming + lipsync + `/ws/avatar` handshake).

**New machine?** Do **§0 (first-time setup)** once, then bring up the **5 runtime
pieces (§1–5)** in this order. The all-in-one launcher scripts in older clones have
**stale hardcoded paths** — bring it up with these commands.

> This file is the single source of truth for `git clone → working avatar`.
> `docs/INSTALLATION.md` covers only the cloud/Docker backend+frontend (no avatar).

## Quickstart: backend + frontend only
If you don't need the avatar (just web-app dev) and you want the processes to
**survive killing your terminal or any background-task harness**, use the
persistent launcher in the repo root:

```powershell
& .\Start-Stack-Persistent.ps1   # spins up backend + frontend via WMI
& .\Stop-Stack-Persistent.ps1    # stops them when you're done
```

Logs land in `tutor-service/backend-stack.log` and `core/frontend-stack.log`.
PIDs are recorded in `.stack-pids.json` for the stop script. The processes
are owned by `svchost`, not your shell — they survive terminal close, harness
reaping, anything short of reboot. Use this in any Claude-Code session.

For the full avatar pipeline, continue with §1–5 below.

## Quickstart: with avatar (UE5 MetaHuman)

The single entry point for the full avatar stack is **`.\start.ps1 -Avatar`**
from the repo root. It orchestrates backend, frontend, Wilbur, and UE5 in the
correct order — no separate scripts to run.

```powershell
# Fresh contributor — auto-download UE5 + Wilbur (~1.77 GB, one-time)
.\start.ps1 -Avatar

# Team member with a sibling UE5 clone — skip download, use local source.
# The UE5 source repo is managed separately from this sandbox.
# For access: see CONTRIBUTING.md "Avatar work" section, or open a GitHub
# issue tagged 'avatar-access' on princeofwellness/edututor-ai-sandbox.
#
# Once you have access:
git clone -b Edutor_UnrealEngine <UE5_REPO_URL> ..\edotutor-ue5-latest
.\start.ps1 -Avatar -UseSiblingClone

# Offline / reuse existing cache
.\start.ps1 -Avatar -SkipDownload
```

Auto-downloaded assets land in `%LOCALAPPDATA%\edututor\avatar\`. Subsequent
launches are instant (cache hit).

> `start-avatar.ps1` is a **deprecated forwarder** — it just calls
> `start.ps1 -Avatar` and will be removed in a future release. Don't invoke it
> directly in new docs/scripts.

The manual §1–5 walkthrough below is preserved as the *reference* (what
`start.ps1 -Avatar` does under the hood) and for debugging individual pieces.

## Working directories (separate clones — be precise)
| Piece | Directory |
|---|---|
| Backend + Frontend | `<repo-root>/edututor-ai-sandbox-test` (this repo; `main`) |
| UE5 project | `<repo-root>/edututor-ai-sandbox-ue5-latest\EdutorUE` (branch `Edutor_UnrealEngine`) |
| Wilbur (Pixel Streaming signalling) | `<repo-root>/edututor-ai-sandbox-ue5-latest\EdutorUE\PixelStreaming\SignallingWebServer` (**vendored prebuilt bundle** — comes with the clone) |
| UE 5.7 engine | `D:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe` |

## 0. First-time setup (from a fresh clone)
Do this **once per machine**. If your environment is already set up, skip to §1.

**Clone the repo twice** (`main` for backend+frontend, the `Edutor_UnrealEngine`
branch for the UE5 project + its `.uasset` assets — both live in the same repo):
```powershell
git clone https://github.com/princeofwellness/edututor-ai-sandbox.git edututor-ai-sandbox-test
git clone -b Edutor_UnrealEngine https://github.com/princeofwellness/edututor-ai-sandbox.git edututor-ai-sandbox-ue5-latest
```

**Backend deps** (Python 3.11+):
```powershell
cd edututor-ai-sandbox-test\tutor-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env        # add one LLM key, OR rely on local Ollama (below)
```

**Frontend deps** (Node 20+, pnpm 8+):
```powershell
cd edututor-ai-sandbox-test\core
pnpm install
Copy-Item .env.example .env.local  # ships with the correct NEXT_PUBLIC_UE5_STREAM_URL
```

**Ollama + the Slovak model** — install from https://ollama.com/download, then:
```powershell
ollama pull gemma3:12b
```

**UE 5.7 engine** — install via the Epic Games Launcher (or source build). The
first launch of the project compiles shaders (several minutes — this is normal).

**Wilbur (Pixel Streaming signalling)** — ✅ now **vendored prebuilt** in the
`Edutor_UnrealEngine` branch as a single self-contained `wilbur.bundle.cjs` + `www/`
(under `EdutorUE/PixelStreaming/SignallingWebServer/`). It comes with the clone —
**no `npm install`, no build**, just needs Node.js installed. See §4 to run it.

## 1. Ollama (LLM) — port 11434
Must be running with `gemma3:12b` pulled.
```powershell
Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" -ArgumentList "serve" -WindowStyle Hidden
# verify: Invoke-RestMethod http://localhost:11434/api/tags
```

## 2. Backend — port 8000 (+ UE5 health proxy 30000)
```powershell
cd <repo-root>/edututor-ai-sandbox-test\tutor-service
.\.venv\Scripts\python.exe run_dev.py
```
Wait for `Application startup complete`. Loads ChromaDB + Audio2Lipsync + Edge TTS
(sk-SK-LukasNeural) + OmniVoice. UE5 avatar WebSocket endpoint: `ws://localhost:8000/ws/avatar`.

## 3. Frontend — port 3000
```powershell
cd <repo-root>/edututor-ai-sandbox-test\core
pnpm dev
```
Needs `core/.env.local` (gitignored). The avatar iframe URL must include the
streamer id, which **must match the ID UE5 registers on Wilbur** — that's
`DefaultStreamer` (the `-PixelStreamingID` launch arg is NOT honored in UE 5.7,
so it falls back to the default):
`NEXT_PUBLIC_UE5_STREAM_URL=http://127.0.0.1:80/uiless.html?StreamerId=DefaultStreamer`.

## 4. Wilbur (Pixel Streaming signalling) — ports 80 + 8888
Prebuilt self-contained bundle, vendored in the UE repo (no build needed):
```powershell
cd <repo-root>/edututor-ai-sandbox-ue5-latest\EdutorUE\PixelStreaming\SignallingWebServer
node wilbur.bundle.cjs --serve --console_messages verbose `
  --http_root="<repo-root>/edututor-ai-sandbox-ue5-latest/EdutorUE/PixelStreaming/SignallingWebServer/www"
```
**Always pass `--http_root`** (absolute path to the vendored `www`). Default ports:
web/player **80**, streamer **8888**, SFU **8889** — UE connects to the streamer (8888).

## 5. UE5 — Standalone Game with Pixel Streaming
> There are **two interchangeable ways** to run this piece — the editor command
> below (development) or a packaged `SlovakEdu.exe` (sharing/release). They differ
> *only* in this step and both register on Wilbur identically. See
> [`UE5_RUN_MODES.md`](./UE5_RUN_MODES.md) for the why and the exe variant.

Launch **exactly one** instance (duplicates pile up and register a stray second
streamer). This is the full quality + clean launch:
```powershell
& "D:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe" `
  "<repo-root>/edututor-ai-sandbox-ue5-latest\EdutorUE\SlovakEdu.uproject" `
  -game -PixelStreamingURL=ws://127.0.0.1:8888 `
  -windowed -ResX=1920 -ResY=1080 -AudioMixer `
  -ExecCmds="r.BloomQuality 0, r.DepthOfFieldQuality 0, r.MotionBlurQuality 0, DisableAllScreenMessages, PixelStreaming.Encoder.MaxQP 18, PixelStreaming.WebRTC.MaxBitrate 100000000, PixelStreaming.WebRTC.Fps 60"
```
First launch compiles shaders (minutes); later launches are fast.

What each part does:
- **No `-PixelStreamingID`** — UE 5.7 ignores it and registers as `DefaultStreamer`;
  the frontend `.env.local` subscribes to exactly that ID (§3). Don't re-add it, or
  you'll get an ID mismatch and a blank avatar.
- **`-ResX=1920 -ResY=1080`** — render/stream at 1080p. 720p looked soft in the
  browser; the UE render was always sharp. Bump to `2560 1440` for even crisper on
  large monitors (an RTX 5090 handles it trivially).
- **`r.BloomQuality 0` / `DepthOfFieldQuality 0` / `MotionBlurQuality 0`** — kill the
  post-process effects that produced a soft glow/aura around the head (confirmed
  2026-05-26: the "aura" was UE bloom, not a frontend effect).
- **`DisableAllScreenMessages`** — hides on-screen `Print String` debug text (viseme/
  timeline/duration) the Blueprint prints onto the stream.
- **`PixelStreaming.Encoder.MaxQP 18` + `WebRTC.MaxBitrate 100000000` (100 Mbps) +
  `WebRTC.Fps 60`** — near-lossless quality on localhost so the stream matches the
  UE render. Lower bitrate/higher QP is what made it look like low-res 720p.

## Verify it's all connected
```powershell
# avatar WS client connected to backend?
Invoke-RestMethod http://localhost:8000/api/v1/avatar/status   # → { connected: true, clients: 1 }
```
Backend log should show: `UE5 → avatar_ready received … → sending ready_ack` then
`Avatar broadcast (… ) delivered to 1 client(s)`. Then open `http://localhost:3000`.

## Gotchas learned the hard way
- **Restarting the backend drops the avatar's `/ws/avatar` connection** and UE5 does
  **not** auto-reconnect — you must relaunch the UE5 game to reconnect.
- **Only one UE5 instance.** Kill strays: `Get-Process UnrealEditor | Stop-Process -Force`.
- **Viseme frame step = 80ms — do not lower it.** 40ms felt "too yappy" and desynced
  (the Blueprint hardcodes 80ms playback). See `avatar-emotion-blueprint-handoff.md`.
- Browser shows a black avatar → page loaded before the UE5 streamer was ready;
  hard-refresh (Ctrl+Shift+R).
