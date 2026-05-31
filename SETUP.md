# EduTutor.AI — Setup Reference

## Prerequisites

Install these once per machine. `start.sh` can auto-install Python and Node on Mac/Linux, but installing all prerequisites up front is the most reliable path.

### Windows
- Python 3.11+: `winget install Python.Python.3.11`
- Node.js LTS: `winget install OpenJS.NodeJS.LTS`
- pnpm: `npm i -g pnpm`
- uv (Python package manager): `winget install astral-sh.uv` (or `pip install uv`)
- Git: `winget install Git.Git`

### Mac
- Python 3.11+: `brew install python@3.11`
- Node.js LTS: `brew install node`
- pnpm: `npm i -g pnpm`
- uv: `brew install uv`

### Linux (Ubuntu/Debian)
- Python 3.11+: `sudo apt install python3.11 python3.11-venv`
- Node.js LTS: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs`
- pnpm: `npm i -g pnpm`
- uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`

### Verify install

```bash
python --version  # should print Python 3.11.x
node --version    # should print v20.x.x or v22.x.x
pnpm --version    # should print 9.x or 10.x
uv --version      # should print uv 0.x
```

---

## One-command start

```bash
git clone https://github.com/princeofwellness/edututor-ai-sandbox.git
cd edututor-ai-sandbox
./start.sh
```

**That's it.** `start.sh` handles everything automatically:

1. Installs Python 3.11+ if missing (`brew` on Mac, `apt` on Linux)
2. Installs Node.js 20+ if missing
3. Creates Python `.venv` + installs all packages
4. Creates `.env` from `.env.example`
5. Installs Node packages (`pnpm` preferred, falls back to `npm --legacy-peer-deps`)
6. Starts backend (port 8000) + frontend (port 3000)
7. Opens browser at `http://localhost:3000`

The Hardware Setup modal appears automatically — paste an API key or use local Ollama. **No `.env` editing required.**

---

## What you need (pre-installed or auto-installed)

| | Minimum | Auto-install |
|---|---|---|
| macOS | — | `brew` auto-installs Python + Node |
| Linux | `sudo` access | `apt` auto-installs Python + Node |
| Windows | — | Run `start.bat` (manual Python/Node install) |
| RAM | 8 GB | 16 GB recommended |

No Docker required. No API key required (Ollama fallback is free and local).

---

## Adding API keys

Paste directly in the Hardware Setup modal after the app opens — keys are saved to `.env` automatically via atomic write. No file editing, no restart needed.

Supported keys:
```env
OPENAI_API_KEY=sk-...          # gpt-4o-mini, best quality
ANTHROPIC_API_KEY=sk-ant-...   # claude-haiku
GROQ_API_KEY=gsk_...           # llama-3.3-70b, free tier
```

---

## Verifying

```bash
curl http://localhost:8000/api/v1/health

# UE5 avatar connection status
curl http://localhost:8000/api/v1/avatar/status

# What's currently active
curl http://localhost:8000/api/v1/system/status
```

---

## Avatar mode

For the full UE5 MetaHuman avatar stack (backend + frontend + Wilbur + UE5):

```powershell
.\start.ps1 -Avatar                    # auto-downloads UE5 + Wilbur on first run
.\start.ps1 -Avatar -UseSiblingClone   # use a local Edutor_UnrealEngine clone
.\start.ps1 -Avatar -SkipDownload      # offline / reuse cache
```

Full walkthrough, gotchas, and per-component debugging:
[`docs/guides/START_STACK.md`](./docs/guides/START_STACK.md).

---

## Docker (production)

```bash
cp .env.example .env
docker compose up --build
```

Services: PostgreSQL, Redis, tutor-service, Next.js frontend.

---

## Troubleshooting

**Port 8000 already in use**
→ `start.sh` detects this and uses the existing backend. To restart: `pkill -f uvicorn`

**UE5 WebSocket disconnects immediately (code 1008)**
→ Fixed May 8. UE5 clients on any localhost port are now allowed. If still failing, check the backend logs for the rejected origin and add it to `WS_ALLOWED_ORIGINS` in `.env`.

**Ollama models not showing**
→ Make sure `ollama serve` is running. Pull a model first: `ollama pull gemma3:4b`

**Backend starts but chat returns errors after Ollama restart**
→ Fixed May 8. Ollama client auto-reconnects on first connection error — no backend restart needed.

**LLM switching has no effect**
→ `POST /api/v1/llm/switch` is functional, but if you switch between providers of different types (e.g. Ollama → OpenAI), ensure the target provider's API key is set in `.env` or via the Hardware Setup modal.
