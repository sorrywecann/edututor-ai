# Implementation Guide — EduTutor.AI

**Project:** EduTutor.AI · `09I05-03-V04-00072`
**Output 3 obligation:** § 7.4 (per `docs/AUDIT_TECH_PIVOTY.md`)

This guide is the canonical install procedure. For deeper detail, see
`docs/INSTALLATION.md` and `docs/deployment_guide.md`.

---

## 1. Hardware and software requirements

### Minimum (development)

| Component | Requirement |
|---|---|
| OS | macOS 13+, Linux (any modern distro), Windows 10+ |
| RAM | 8 GB |
| Disk | 6 GB free (models + dependencies) |
| Python | 3.11+ |
| Node | 18+ |
| Package manager | pnpm 9+ (or npm with `--legacy-peer-deps`) |

### Recommended (production tutor)

| Component | Requirement |
|---|---|
| OS | macOS 14 (Apple Silicon) or Linux with NVIDIA GPU |
| RAM | 32 GB |
| GPU | Apple M-series MPS, or NVIDIA RTX 4090 (24 GB), or A100 |
| Disk | 30 GB (models + ChromaDB persistence) |

### Optional add-ons

| Component | Why |
|---|---|
| Ollama | Fully-offline local LLM (no API key needed) |
| Docker Desktop | Use the docker-compose stack instead of manual install |
| Unreal Engine 5.4+ | UE5 / MetaHuman avatar bridge |

---

## 2. Quick start (local, no Docker)

```bash
git clone https://github.com/<org>/edotutor.git
cd edotutor
./start.sh          # Mac / Linux
# start.bat        # Windows
```

Open <http://localhost:3000>. The Hardware Setup modal fires automatically
on first load and applies the optimal STT / LLM / TTS config in one click.

**No API key required** if Ollama is installed; the backend auto-detects
it. Pull a model:

```bash
ollama pull qwen2.5:7b   # 4.7 GB — best Slovak quality for 12 GB+ RAM
ollama pull gemma3:4b    # 2.5 GB — fallback for 8 GB machines
```

---

## 3. Quick start (Docker)

```bash
cp .env.example .env
# Add at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or pull Ollama
docker compose up --build
```

First run downloads ~500 MB of models. Subsequent starts are seconds.

---

## 4. Manual install (deepest detail)

### 4.1 Backend

```bash
cd tutor-service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend runs at <http://localhost:8000>. Swagger UI at
<http://localhost:8000/docs>.

### 4.2 Frontend

```bash
cd core
pnpm install         # the project-local .npmrc sets legacy-peer-deps=true
# or:  npm install --legacy-peer-deps
pnpm dev
```

Frontend runs at <http://localhost:3000>.

### 4.3 Optional: Ollama (offline LLM)

```bash
# Mac
brew install ollama && ollama serve
ollama pull qwen2.5:7b

# Linux / Windows
# Installer: https://ollama.com/download
```

The backend auto-detects Ollama at startup; no `.env` editing needed.

### 4.4 Optional: ARKit lipsync sidecar

The `audio2lipsync` provider needs the HuBERT encoder weights. They
auto-download on first use to `tutor-service/models/audio2lipsync/`.

To pre-warm:
```bash
curl -X POST http://localhost:8000/api/v1/lipsync/switch \
  -H "Content-Type: application/json" \
  -d '{"provider": "audio2lipsync"}'
```

GPU recommended (Apple MPS or CUDA); CPU works but is ~3× slower.

---

## 5. Environment variables

All variables are documented in `.env.example` (root) and `core/.env.example`.
Highlights:

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI cloud LLM / TTS / embeddings |
| `ANTHROPIC_API_KEY` | — | Anthropic Claude LLM |
| `GROQ_API_KEY` | — | Groq cloud LLM (free tier, lowest latency) |
| `OLLAMA_URL` | auto | Local Ollama base URL (auto-detected) |
| `STT_PROVIDER` | auto | `mlx-whisper-turbo`, `faster-whisper-sk-small`, etc. |
| `USE_EDGE_TTS` | `true` | Free Microsoft Edge TTS (no key) |
| `EDGE_TTS_VOICE` | `sk-SK-LukasNeural` | Default Slovak voice |
| `VECTOR_DB_BACKEND` | `chroma` | `chroma` (embedded) or `weaviate` |
| `RAG_CHUNK_SIZE` | `500` | Pinned baseline (per Phase 4 regression test) |
| `RAG_CHUNK_OVERLAP` | `80` | Pinned baseline |
| `RAG_SIMILARITY_THRESHOLD` | `0.65` | Pinned baseline |
| `EMOTION_BACKEND` | `regex` | `regex` (default) or `bert` |
| `LIPSYNC_PROVIDER` | `text` | `text`, `audio2lipsync`, or `hybrid` |
| `NEXTAUTH_SECRET` | dev fallback | Required in production |
| `DEMO_PASSWORD` | `edututor2026` | Matches the `/auth/signin` UI hint |

---

## 6. Smoke tests

### 6.1 Backend health
```bash
curl http://localhost:8000/api/v1/health
# {"status": "ok"}

curl http://localhost:8000/api/v1/system/status
# {... full system + provider status ...}
```

### 6.2 Chat (Slovak)
```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Ahoj, ako sa máš?","language":"sk","mode_id":"sk"}' | jq '.response'
```

### 6.3 Streaming chat (SSE)
```bash
curl -N -X POST http://localhost:8000/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Vysvetli mi Pythagorovu vetu.","language":"sk","mode_id":"sk"}'
# Should emit: data: {"type":"context",...}, data: {"type":"sentence",...},
#              data: {"type":"sentence",...}, ..., data: {"type":"done",...}
```

### 6.4 RAG pipeline
```bash
# 1. Create a knowledge base
curl -X POST http://localhost:8000/api/v1/knowledge-bases \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-test","description":"smoke"}'

# 2. Upload a document (any .txt or .pdf)
curl -X POST http://localhost:8000/api/v1/knowledge-bases/smoke-test/documents \
  -F "file=@docs/INSTALLATION.md"

# 3. Query
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Ako nainštalujem EduTutor?","knowledge_base":"smoke-test","language":"sk","mode_id":"sk"}' | jq '.rag_sources'
```

### 6.5 UE5 avatar bridge
```bash
# Backend status
curl http://localhost:8000/api/v1/avatar/status
# {"connected": false, "clients": 0}

# Then connect from UE5 per docs/UE5-INTEGRATION-GUIDE.md.
# After connect:
curl http://localhost:8000/api/v1/avatar/status
# {"connected": true, "clients": 1}

# A chat turn now broadcasts viseme + emotion data to UE5 in real time.
```

### 6.6 Test suites

```bash
cd tutor-service && python -m pytest tests/ -q
# Expected: ~290+ passed (some tests require optional backends like libavutil
# for torchcodec; those are environmental and not project regressions).

cd core && pnpm tsc --noEmit
# Expected: clean (exit 0).
```

---

## 7. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails on peer-deps | next@15 + next-auth@4 conflict | Use `pnpm install` (project default) or `npm install --legacy-peer-deps` |
| Sign-in rejected with "Invalid credentials" | Default password drifted from UI hint | Default is `edututor2026`; override via `DEMO_PASSWORD` env var |
| Hardware Setup modal blocks UI | localStorage flag missing | The modal sets `edututor_unified_onboarding_done` on first dismiss; clear browser storage to re-trigger |
| "Piper model not found: sk-SK-..." | TTS routed wrong | Voice IDs auto-route via `_infer_provider`; if you see this, check Phase 2 regression tests |
| `libtorchcodec_core4.dylib` not loaded (macOS) | Missing `ffmpeg` | `brew install ffmpeg@4` (or `ffmpeg` if 5+ works for your env) |
| RAG queries return nothing | Wrong similarity threshold | Default is `0.65`; set `RAG_SIMILARITY_THRESHOLD=0.5` for fuzzier match |
| UE5 avatar stuck speaking | Pre-Phase-1 backend | Update past commit `89b8d82` — fixes streaming finally + non-streaming speech-end |

---

## 8. Verifying a fresh install

If you just stood the system up and want a single confidence check:

```bash
# Backend
curl -s http://localhost:8000/api/v1/health | grep -q '"status":"ok"' && echo "backend OK"

# Frontend
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
# Should print 200 (or 302 to /auth/signin, both are healthy)

# Slovak chat smoke
curl -s -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Ahoj","language":"sk","mode_id":"sk"}' \
  | jq -e '.response | length > 0' && echo "chat OK"
```

If all three print "OK", the install is complete.
