# Instalacna Prirucka - EduTutor.AI PB3

> ⚠️ **Scope / aktuálnosť (2026-05-27):** Táto príručka pokrýva **iba cloud/Docker
> backend+frontend** (Postgres/Redis, cloud alebo lokálny LLM) a **nenastavuje UE5
> MetaHuman avatara.** Niektoré detaily sú zo staršej architektúry (Docker compose,
> Mistral 7B, Weaviate); aktuálny lokálny stack používa **Ollama `gemma3:12b`**,
> **ChromaDB** a **SQLite**.
>
> 👉 Pre **plný lokálny avatar stack (Ollama + Pixel Streaming + Wilbur + UE5)** a
> postup **`git clone → bežiaci avatar`** použi **`docs/START_STACK.md`** — to je
> jediný zdroj pravdy pre spustenie s avatarom.

## Predpoklady

### Hardver

| Komponent | Minimalne | Odporucane |
|-----------|-----------|------------|
| CPU | 4 jadra | 8+ jadier |
| RAM | 8 GB | 16 GB |
| Storage | 20 GB SSD | 50 GB NVMe |
| GPU | Nepotrebne* | NVIDIA 8GB+ VRAM |

*GPU je potrebne iba pre lokalny Mistral LLM. Cloud provideri (OpenAI, Azure) funguju bez GPU.

### Softver

- **OS**: macOS, Linux, Windows (WSL2)
- **Python**: 3.11+
- **Node.js**: 20+
- **Docker**: 24+ s Docker Compose v2
- **pnpm**: 8+ (pre frontend)

## Krok 1: Priprava prostredia

### macOS

```bash
# Homebrew
brew install python@3.11 node pnpm docker

# Spustite Docker Desktop
open -a Docker
```

### Ubuntu/Debian

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm git curl

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# pnpm
npm install -g pnpm
```

### Windows

1. Naintalujte WSL2 s Ubuntu
2. Naintalujte Docker Desktop s WSL2 backend
3. Pokracujte podla Ubuntu instrukci v WSL2

## Krok 2: Spustenie infrastruktury

```bash
# Naklonujte projekt
git clone https://github.com/princeofwellness/edotutor.git
cd edotutor

# Spustite Docker sluzby
docker compose up -d

# Overte stav
docker compose ps

# Ocakavany vystup:
# NAME                    STATUS
# edututor-postgres       running (healthy)
# edututor-redis          running (healthy)
# edututor-backend        running (healthy)
# edututor-frontend       running
```

## Krok 3: Konfiguracia (.env)

```bash
# Skopirujte priklad
cp .env.example tutor-service/.env

# Upravte subor
nano tutor-service/.env
```

### Minimalna konfiguracia (cloud LLM)

```bash
# Staci jeden z tychto:
OPENAI_API_KEY=sk-your-openai-key

# ALEBO Azure:
AZURE_LLM_ENDPOINT=https://your-resource.openai.azure.com/openai/v1/
AZURE_LLM_API_KEY=your-azure-key
```

### Plna konfiguracia

Pozrite `.env.example` pre vsetky moznosti.

## Krok 4: Backend (tutor-service)

```bash
cd tutor-service

# Virtualny environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# alebo: venv\Scripts\activate  # Windows

# Instalacia zavislosti
pip install --upgrade pip
pip install -r requirements.txt

# Spustenie (tabulky sa vytvoria automaticky)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend: `http://localhost:8000`
API Docs: `http://localhost:8000/docs`

## Krok 5: Frontend (core)

V novom terminali:

```bash
cd core

# Instalacia
pnpm install

# Konfiguracia
cp .env.example .env.local

# Spustenie
pnpm dev
```

Frontend: `http://localhost:3000`

## Krok 6: Overenie instalacie

### Health Check

```bash
curl http://localhost:8000/api/v1/health
```

Ocakavany vystup:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "redis": "connected",
    "chroma": "active"
  }
}
```

### Overenie providerov

```bash
# LLM provideri
curl http://localhost:8000/api/v1/llm/models

# STT modely  
curl http://localhost:8000/api/v1/stt/models

# TTS hlasy
curl http://localhost:8000/api/v1/tts/voices
```

### Test konverzacie

1. Otvorte `http://localhost:3000`
2. Kliknite "Zacat konverzaciu"
3. Povolte mikrofon
4. Povedzte testovaciu frazu v slovencine

---

## Konfiguracia providerov

### LLM (Jazykovy model)

#### OpenAI (Odporucane)

```bash
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini  # alebo gpt-4o, gpt-4-turbo
```

Ziskajte kluc: https://platform.openai.com/api-keys

#### Azure OpenAI

```bash
AZURE_LLM_ENDPOINT=https://your-resource.openai.azure.com/openai/v1/
AZURE_LLM_API_KEY=your-key
AZURE_LLM_MODEL=gpt-4o-mini
```

Vytvorte resource: https://portal.azure.com → Azure OpenAI

#### Anthropic Claude

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-haiku-20240307  # alebo claude-3-sonnet, claude-3-opus
```

Ziskajte kluc: https://console.anthropic.com/

#### Lokalny Mistral 7B (GPU)

```bash
USE_LOCAL_LLM=true
```

Poziadavky:
- NVIDIA GPU s 8GB+ VRAM
- CUDA 12.2+
- Prve spustenie stiahne ~4GB model

Overenie GPU:
```bash
nvidia-smi
python -c "import torch; print(torch.cuda.is_available())"
```

---

### STT (Speech-to-Text)

#### Lokalny Whisper SK (Default)

```bash
USE_LOCAL_STT=true
WHISPER_MODEL_ID=erikbozik/whisper-small-sk
```

Dostupne modely:
| Model | Velkost | Rychlost (CPU) | Presnost |
|-------|---------|----------------|----------|
| `erikbozik/whisper-small-sk` | 244M | ~5-10s | Dobra |
| `erikbozik/whisper-large-v3-sk` | 1.5B | ~2+ min | Najlepsia |

#### OpenAI Whisper (Cloud)

```bash
USE_LOCAL_STT=false
# Pouziva OPENAI_API_KEY
```

Rychlejsie (~1-2s), vyzaduje OpenAI API kluc.

---

### TTS (Text-to-Speech)

#### Piper Local (Default)

Ziadna konfiguracia potrebna. Pouziva lokalne modely v `models/piper/`:
- `sk_SK-lili-medium` - Slovensky zensky hlas
- `cs_CZ-jirka-medium` - Cesky muzsky hlas
- `en_US-amy-medium` - Anglicky zensky hlas

#### Edge TTS (Free Cloud)

Ziadna konfiguracia potrebna. Microsoft Edge hlasy, dobra kvalita.

#### Azure Neural TTS

```bash
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=westeurope
```

Vytvorte resource: https://portal.azure.com → Speech Services

#### OpenAI TTS

```bash
# Pouziva OPENAI_API_KEY
```

#### Google Cloud TTS

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

Vytvorte service account: https://console.cloud.google.com/

---

## Riesenie problemov

### Docker kontajnery sa nespustaju

```bash
# Skontrolujte logy
docker-compose logs -f postgres
docker-compose logs -f weaviate

# Restartujte
docker-compose down
docker-compose up -d
```

### Backend nereaguje

```bash
# Skontrolujte ci bezi
curl http://localhost:8000/api/v1/health

# Skontrolujte logy
# (v terminali kde bezi uvicorn)
```

### STT je pomaly

Prepnite na mensi model alebo cloud:
```bash
# Mensi lokalny model
WHISPER_MODEL_ID=erikbozik/whisper-small-sk

# Alebo cloud (rychlejsie)
USE_LOCAL_STT=false
```

### LLM nefunguje

```bash
# Overte dostupne providery
curl http://localhost:8000/api/v1/llm/models

# Skontrolujte ci mate API kluc nastaveny
grep -E "OPENAI_API_KEY|AZURE_LLM" tutor-service/.env
```

### TTS nema zvuk

```bash
# Overte dostupne hlasy
curl http://localhost:8000/api/v1/tts/voices

# Skuste Edge TTS (nema zavislosti)
# V UI zvolte hlas s "[Edge Cloud Free]"
```

### ChromaDB integration error

```bash
# Restart backendu
docker compose restart tutor-service
# Pri pretrvávajúcich problémoch zmazať a reinicializovať
docker compose down -v && docker compose up -d
```

---

## Produkcne nasadenie

Pre produkcne prostredie:

1. Pouzite reverznu proxy (nginx, Caddy)
2. Nastavte HTTPS certifikaty
3. Zmente hesla v `.env`
4. Nastavte `APP_ENV=production`, `DEBUG=false`
5. Pouzite process manager (systemd, PM2)

```bash
# Priklad produkcie
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Kontakt

V pripade problemov:
- Email: support@edututor.ai
- Dokumentacia: https://docs.edututor.ai
