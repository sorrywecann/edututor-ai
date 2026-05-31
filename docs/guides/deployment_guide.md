# Deployment Guide — EduTutor.AI
## Complete Setup for All Environments

## 1. Local Development (No Docker)

```bash
git clone https://github.com/princeofwellness/edotutor.git
cd edotutor
./start.sh          # Mac/Linux
# start.bat         # Windows
```

Open http://localhost:3000 — hardware setup modal configures everything automatically.

### Requirements
- Python 3.11+
- Node.js 18+ with pnpm
- Ollama (optional, for local LLM)

## 2. Docker Deployment

```bash
cp .env.example .env
# Edit .env — add API keys if desired
docker compose up --build
```

### Services
| Service | Port | Purpose |
|---------|------|---------|
| core (Next.js) | 3000 | Frontend |
| tutor-service (FastAPI) | 8000 | Backend API |
| postgres | 5432 | Database |
| redis | 6379 | Cache |

## 3. Production Deployment (Nginx + Monitoring)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Additional Services
| Service | Port | Purpose |
|---------|------|---------|
| nginx | 80 | Reverse proxy, security headers |
| prometheus | 9090 | Metrics collection |
| grafana | 3001 | Metrics dashboard |

## 4. Fully Offline Deployment

For environments without internet access (grant requirement: "lokalny stroj"):

### Prerequisites
```bash
# Install Ollama and pull model BEFORE going offline
brew install ollama    # or download from ollama.com
ollama pull gemma3:4b

# Piper model is included in the repository:
# tutor-service/models/piper/sk_SK-lili-medium.onnx (63MB)
```

### Configuration
```env
# .env for offline mode
OLLAMA_URL=http://localhost:11434/v1
OLLAMA_MODEL=gemma3:4b
TTS_PROVIDER=piper
TTS_VOICE=sk_SK-lili-medium
VECTOR_DB_BACKEND=chroma
EMOTION_BACKEND=regex
# Leave all API keys empty
```

### Verification
```bash
./scripts/test_offline_mode.sh
```

## 5. Cloud-Enhanced Deployment

For best quality with cloud APIs:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
USE_EDGE_TTS=true
EDGE_TTS_VOICE=sk-SK-LukasNeural
# Optional for viseme lip-sync:
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=westeurope
```

## 6. Hardware Tiers

The system auto-detects hardware and recommends optimal configuration:

| Tier | RAM/GPU | STT | LLM | TTS |
|------|---------|-----|-----|-----|
| Minimal | <10GB | faster-whisper-small | openai | edge |
| Standard | 16GB / Apple Silicon | mlx-whisper-turbo | openai | edge |
| Performance | 32-64GB / M3 Max | mlx-whisper-large-v3 | ollama/gemma3:27b | piper |
| Power | RTX 4090 24GB | faster-whisper-large (CUDA) | vLLM/Qwen2.5-32B | edge |

## 7. Configuration Reference

All environment variables are documented in `.env.example`.

### Key Variables
| Variable | Default | Description |
|----------|---------|-------------|
| OPENAI_API_KEY | (empty) | OpenAI API key |
| OLLAMA_URL | http://localhost:11434/v1 | Ollama server |
| OLLAMA_MODEL | gemma3:4b | Local LLM model |
| USE_EDGE_TTS | true | Use free Edge TTS |
| EDGE_TTS_VOICE | sk-SK-LukasNeural | Slovak voice |
| VECTOR_DB_BACKEND | chroma | chroma or weaviate |
| EMOTION_BACKEND | regex | regex or bert |
| DATABASE_URL | (empty=SQLite) | PostgreSQL URL |

## 8. Troubleshooting

**Backend won't start**: Check Python 3.11+ and `pip install -r requirements.txt`
**No audio**: Verify TTS provider is configured and API key is set (or use Edge/Piper)
**Slow responses**: Switch to faster LLM (GPT-4o-mini) or ensure Ollama model is loaded
**Offline mode fails**: Run `scripts/test_offline_mode.sh` to diagnose which component is missing
