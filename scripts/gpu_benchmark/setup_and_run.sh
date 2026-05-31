#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  EduTutor.AI — GPU Benchmark: FULL STACK (setup + run)
#  Deploy on Vast.ai / RunPod / bare-metal CUDA instance via scp + bash.
#  Self-contained: installs deps, downloads models, runs benchmarks, captures.
#
#  Usage:
#    export TIER=t2          # t0|t1|t2|t3|t4  (default: auto-detect)
#    bash setup_and_run.sh
#
#  Tiers:
#    t0  → Mac M2 Pro (local only — skip Ollama install)
#    t1  → RTX 4060 Ti 16 GB   qwen2.5:7b
#    t2  → RTX 4090 24 GB      qwen3-14b-sk  (or qwen2.5:14b fallback)
#    t3  → A40 / A100 40-48 GB  qwen2.5:32b
#    t4  → A6000 / A100 80 GB   qwen2.5:32b + extended load
#
#  Output:  results-{TIER}.tar.gz  (download via scp)
#  Log:     setup_and_run.log  (full transcript)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Globals ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="${REPO_ROOT}/results"
LOG_FILE="${REPO_ROOT}/setup_and_run.log"
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
EXIT_CODE=0

# Redirect everything to log + stdout
exec > >(tee -a "$LOG_FILE") 2>&1

# ── Tier detection & configuration ───────────────────────────────────────────
detect_tier() {
    if [[ -n "${TIER:-}" ]]; then
        echo "$TIER"
        return
    fi

    # Auto-detect: check nvidia-smi VRAM
    if command -v nvidia-smi &>/dev/null; then
        local vram_mb
        vram_mb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
        vram_mb=${vram_mb:-0}

        if   (( vram_mb >= 75000 )); then echo "t4"
        elif (( vram_mb >= 40000 )); then echo "t3"
        elif (( vram_mb >= 22000 )); then echo "t2"
        elif (( vram_mb >= 14000 )); then echo "t1"
        else                              echo "t1"  # conservative fallback
        fi
    elif [[ "$(uname -s)" == "Darwin" ]]; then
        echo "t0"
    else
        echo "t1"  # CPU-only or unknown → minimum
    fi
}

TIER=$(detect_tier)

# ── Per-tier configuration ───────────────────────────────────────────────────
declare -A TIER_CONFIG

# t0: Mac M2 Pro (MPS) — local dev, skip Ollama install
TIER_CONFIG["t0,llm_model"]="qwen2.5:7b"
TIER_CONFIG["t0,stt_model"]="erikbozik/whisper-small-sk"
TIER_CONFIG["t0,stt_provider"]="faster-whisper"   # mlx-whisper-turbo on Mac
TIER_CONFIG["t0,tts_provider"]="edge"
TIER_CONFIG["t0,vector_db"]="chroma"
TIER_CONFIG["t0,k6_scenarios"]="s1 s2 s5"
TIER_CONFIG["t0,description"]="Mac M2 Pro 16GB (MPS)"

# t1: RTX 4060 Ti 16GB
TIER_CONFIG["t1,llm_model"]="qwen2.5:7b"
TIER_CONFIG["t1,stt_model"]="NaiveNeuron/slopal-whisper-large-v3-sk"
TIER_CONFIG["t1,stt_provider"]="faster-whisper"
TIER_CONFIG["t1,tts_provider"]="edge"
TIER_CONFIG["t1,vector_db"]="chroma"
TIER_CONFIG["t1,k6_scenarios"]="s1 s2 s3 s4"
TIER_CONFIG["t1,description"]="RTX 4060 Ti 16GB (CUDA)"

# t2: RTX 4090 24GB
TIER_CONFIG["t2,llm_model"]="qwen2.5:14b"
TIER_CONFIG["t2,stt_model"]="NaiveNeuron/slopal-whisper-large-v3-sk"
TIER_CONFIG["t2,stt_provider"]="faster-whisper"
TIER_CONFIG["t2,tts_provider"]="edge"
TIER_CONFIG["t2,vector_db"]="chroma"
TIER_CONFIG["t2,k6_scenarios"]="s1 s2 s3 s4 s5 s6"
TIER_CONFIG["t2,description"]="RTX 4090 24GB (CUDA)"

# t3: A40 / A100 40-48GB
TIER_CONFIG["t3,llm_model"]="qwen2.5:32b"
TIER_CONFIG["t3,stt_model"]="NaiveNeuron/slopal-whisper-large-v3-sk"
TIER_CONFIG["t3,stt_provider"]="faster-whisper"
TIER_CONFIG["t3,tts_provider"]="edge"
TIER_CONFIG["t3,vector_db"]="chroma"
TIER_CONFIG["t3,k6_scenarios"]="s1 s2 s3 s4 s5 s6"
TIER_CONFIG["t3,description"]="A40/A100 40-48GB (CUDA)"

# t4: A6000 / A100 80GB
TIER_CONFIG["t4,llm_model"]="qwen2.5:32b"
TIER_CONFIG["t4,stt_model"]="NaiveNeuron/slopal-whisper-large-v3-sk"
TIER_CONFIG["t4,stt_provider"]="faster-whisper"
TIER_CONFIG["t4,tts_provider"]="edge"
TIER_CONFIG["t4,vector_db"]="chroma"
TIER_CONFIG["t4,k6_scenarios"]="s1 s2 s3 s4 s5 s6"
TIER_CONFIG["t4,description"]="A6000/A100 80GB (CUDA)"

get_tier_config() { echo "${TIER_CONFIG[${TIER},${1}]:-}"; }

LLM_MODEL=$(get_tier_config llm_model)
STT_MODEL_ID=$(get_tier_config stt_model)
STT_PROVIDER=$(get_tier_config stt_provider)
TTS_PROVIDER=$(get_tier_config tts_provider)
VECTOR_DB=$(get_tier_config vector_db)
K6_SCENARIOS=$(get_tier_config k6_scenarios)
TIER_DESC=$(get_tier_config description)

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  EduTutor.AI — GPU Benchmark Suite v1.0                          ║"
echo "║  Tier: ${TIER}  |  ${TIER_DESC}"
echo "║  LLM:  ${LLM_MODEL}"
echo "║  STT:  ${STT_PROVIDER} (${STT_MODEL_ID})"
echo "║  TTS:  ${TTS_PROVIDER}"
echo "║  Started: $(date)"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── Ensure results directory ────────────────────────────────────────────────
mkdir -p "${RESULTS_DIR}/per_module"
mkdir -p "${RESULTS_DIR}/load_tests"
mkdir -p "${RESULTS_DIR}/a2l"
mkdir -p "${RESULTS_DIR}/raw"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 1 — Hardware Detection
# ═══════════════════════════════════════════════════════════════════════════════
echo "[PHASE 1/7] $(date +%H:%M:%S) — Hardware Detection"
echo "──────────────────────────────────────────────────────────────────────"

{
    echo "=== GPU Info (nvidia-smi) ==="
    if command -v nvidia-smi &>/dev/null; then
        nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader
        nvidia-smi -L
    else
        echo "No NVIDIA GPU detected (or nvidia-smi not found)"
    fi

    echo ""
    echo "=== CPU Info ==="
    if command -v lscpu &>/dev/null; then
        lscpu | head -15
    elif [[ "$(uname -s)" == "Darwin" ]]; then
        sysctl -n machdep.cpu.brand_string
        sysctl -n hw.ncpu
        sysctl -n hw.memsize
    else
        cat /proc/cpuinfo | head -10
    fi

    echo ""
    echo "=== RAM ==="
    if command -v free &>/dev/null; then
        free -h
    elif [[ "$(uname -s)" == "Darwin" ]]; then
        vm_stat
    fi

    echo ""
    echo "=== OS ==="
    uname -a
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release && echo "${PRETTY_NAME:-unknown}"
    fi

    echo ""
    echo "=== CUDA (if available) ==="
    nvcc --version 2>/dev/null || echo "nvcc not found"
    python3 -c "import torch; print(f'PyTorch {torch.__version__}, CUDA available: {torch.cuda.is_available()}')" 2>/dev/null || echo "torch not installed yet"

} > "${RESULTS_DIR}/hw_info.txt"

echo "  ✓ HW info saved → ${RESULTS_DIR}/hw_info.txt"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 2 — Install Dependencies
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "[PHASE 2/7] $(date +%H:%M:%S) — Installing Dependencies"
echo "──────────────────────────────────────────────────────────────────────"

# 2a. System packages
echo "  [2a] System packages..."
if command -v apt-get &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq \
        python3 python3-pip python3-venv \
        curl wget git lsof build-essential \
        libsndfile1 ffmpeg 2>&1 | tail -3 || true
elif command -v brew &>/dev/null; then
    brew install ffmpeg 2>&1 | tail -1 || true
fi

# 2b. Python venv + pip packages
echo "  [2b] Python environment..."
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${REPO_ROOT}/.venv_bench"

if [[ ! -d "$VENV_DIR" ]]; then
    $PYTHON_BIN -m venv "$VENV_DIR"
fi
# shellcheck source=/dev/null
source "${VENV_DIR}/bin/activate"
pip install --upgrade pip setuptools wheel 2>&1 | tail -1 || true

# Install from requirements.txt (from tutor-service/)
REQ_FILE="${REPO_ROOT}/tutor-service/requirements.txt"
if [[ -f "$REQ_FILE" ]]; then
    pip install -r "$REQ_FILE" 2>&1 | tail -5 || true
else
    # Fallback: minimal install
    pip install httpx fastapi uvicorn pytest pytest-asyncio \
        faster-whisper torch torchaudio librosa soundfile \
        edge-tts huggingface_hub \
        chromadb sentence-transformers transformers 2>&1 | tail -3 || true
fi

# Install omnivoice specifically (may fail on some platforms → non-fatal)
pip install omnivoice 2>&1 | tail -1 || echo "  ⚠ omnivoice install failed (will skip TTS voice-clone benchmark)"

# 2c. Ollama
echo "  [2c] Ollama..."
if [[ "$TIER" != "t0" ]]; then
    if ! command -v ollama &>/dev/null; then
        curl -fsSL https://ollama.com/install.sh | sh 2>&1 | tail -3 || {
            echo "  ⚠ Ollama install failed — LLM benchmarks will be skipped"
        }
    fi
    # Start Ollama service
    export OLLAMA_HOST=127.0.0.1:11434
    ollama serve &>/tmp/ollama_serve.log &
    OLLAMA_PID=$!
    echo "  Ollama PID: ${OLLAMA_PID}"
    sleep 2
    # Wait for Ollama to be ready
    for i in $(seq 1 20); do
        if curl -sf http://127.0.0.1:11434/api/tags &>/dev/null; then
            echo "  ✓ Ollama running (took ${i}s)"
            break
        fi
        sleep 1
    done
else
    echo "  ⚠ t0 (Mac) — skipping Ollama install (assuming local ollama serve)"
    # Mac: assume ollama is already running
    if ! curl -sf http://127.0.0.1:11434/api/tags &>/dev/null; then
        echo "  ⚠ Ollama not reachable on Mac — starting..."
        ollama serve &>/tmp/ollama_serve.log &
        sleep 3
    fi
fi

# 2d. k6 (load testing tool)
echo "  [2d] k6..."
K6_BIN="/tmp/k6"
if ! command -v k6 &>/dev/null && [[ ! -x "$K6_BIN" ]]; then
    K6_URL="https://github.com/grafana/k6/releases/download/v0.57.0/k6-v0.57.0-linux-amd64.tar.gz"
    if [[ "$(uname -s)" == "Darwin" ]]; then
        K6_URL="https://github.com/grafana/k6/releases/download/v0.57.0/k6-v0.57.0-macos-arm64.zip"
    fi
    curl -fsSL "$K6_URL" -o /tmp/k6_archive 2>&1 || true
    if [[ "$K6_URL" == *.tar.gz ]]; then
        tar xzf /tmp/k6_archive -C /tmp/ k6 2>/dev/null || true
    else
        unzip -o /tmp/k6_archive -d /tmp/ 2>/dev/null || true
        mv /tmp/k6-v0.57.0-macos-arm64 2>/dev/null || mv /tmp/k6 /tmp/k6_dl 2>/dev/null || true
        [[ -f /tmp/k6_dl ]] && mv /tmp/k6_dl /tmp/k6
    fi
    chmod +x /tmp/k6 2>/dev/null || true
fi
if command -v k6 &>/dev/null; then
    K6_BIN="k6"
elif [[ -x /tmp/k6 ]]; then
    K6_BIN="/tmp/k6"
else
    echo "  ⚠ k6 not available — load tests will be skipped"
    K6_BIN=""
fi
echo "  ✓ k6: ${K6_BIN:-'not found'}"
"${K6_BIN:-true}" version 2>/dev/null || true

echo "  ✓ Phase 2 complete"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 3 — Download Models
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "[PHASE 3/7] $(date +%H:%M:%S) — Downloading Models"
echo "──────────────────────────────────────────────────────────────────────"

# 3a. Ollama LLM model
echo "  [3a] Ollama model: ${LLM_MODEL}..."
if command -v ollama &>/dev/null && curl -sf http://127.0.0.1:11434/api/tags &>/dev/null; then
    # Check if already pulled
    if ollama list 2>/dev/null | grep -q "${LLM_MODEL%%:*}"; then
        echo "  ✓ Model ${LLM_MODEL} already present"
    else
        echo "  Pulling ${LLM_MODEL} (this may take 5-15 min)..."
        ollama pull "$LLM_MODEL" 2>&1 | tail -5 || {
            echo "  ⚠ Failed to pull ${LLM_MODEL} — trying fallback qwen2.5:7b"
            ollama pull qwen2.5:7b 2>&1 | tail -3 || true
            LLM_MODEL="qwen2.5:7b"
        }
        echo "  ✓ Model pulled: ${LLM_MODEL}"
    fi
    # Log model list
    ollama list > "${RESULTS_DIR}/models_loaded.txt"
else
    echo "  ⚠ Ollama not available — skipping LLM model download"
    echo "(no ollama)" > "${RESULTS_DIR}/models_loaded.txt"
fi

# 3b. STT model (faster-whisper via HuggingFace)
echo "  [3b] STT model: ${STT_MODEL_ID}..."
python3 << PYEOF
import os
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
try:
    from faster_whisper import WhisperModel
    model_id = os.getenv("STT_MODEL_ID", "${STT_MODEL_ID}")
    device = "cuda" if __import__("torch").cuda.is_available() else "cpu"
    compute = "float16" if device == "cuda" else "int8"
    print(f"  Loading {model_id} on {device}/{compute}...")
    _ = WhisperModel(model_id, device=device, compute_type=compute)
    print(f"  ✓ STT model loaded ({device}/{compute})")
except Exception as e:
    print(f"  ⚠ STT model download failed (will use API-based STT): {e}")
PYEOF
echo "  ✓ STT model ready"

# 3c. Audio2Lipsync model (pre-download to avoid cold-start during benchmark)
echo "  [3c] Audio2Lipsync model..."
python3 << 'PYEOF'
import os, sys
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
try:
    from huggingface_hub import hf_hub_download
    model_dir = os.path.join(os.path.dirname(__file__) if '__file__' in dir() else "/tmp",
                             "models", "audio2lipsync")
    os.makedirs(model_dir, exist_ok=True)
    hf_hub_download("fotonlabs/unreal-audio2lipsync", "best.pt",
                    local_dir=model_dir)
    print(f"  ✓ Audio2Lipsync model cached → {model_dir}")
except Exception as e:
    print(f"  ⚠ Audio2Lipsync download failed (will skip A2L benchmark): {e}")
PYEOF
echo "  ✓ Phase 3 complete"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 4 — Start Backend
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "[PHASE 4/7] $(date +%H:%M:%S) — Starting Backend"
echo "──────────────────────────────────────────────────────────────────────"

# Generate .env for benchmark run
ENV_FILE="${REPO_ROOT}/tutor-service/.env.bench"
cat > "$ENV_FILE" << ENVEOF
# Auto-generated by setup_and_run.sh — $(date)
# Tier: ${TIER} (${TIER_DESC})

DATABASE_URL=
REDIS_URL=redis://localhost:6379
WEAVIATE_URL=http://localhost:8080

# STT
STT_PROVIDER=${STT_PROVIDER}
USE_LOCAL_STT=true
WHISPER_MODEL_ID=${STT_MODEL_ID}

# LLM
OLLAMA_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=${LLM_MODEL}

# TTS
TTS_PROVIDER=edge
EDGE_TTS_VOICE=sk-SK-LukasNeural

# RAG
VECTOR_DB_BACKEND=${VECTOR_DB}
CHROMA_PERSIST_PATH=./chroma_data_bench

# Lipsync
LIPSYNC_PROVIDER=audio2lipsync

# Misc
LOG_LEVEL=INFO
ENVEOF
export DOTENV_PATH="$ENV_FILE"

echo "  .env written → ${ENV_FILE}"

# Kill any lingering uvicorn
pkill -f "uvicorn app.main" 2>/dev/null || true
sleep 1

# Start backend
echo "  Starting uvicorn on :8000..."
cd "${REPO_ROOT}/tutor-service"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info &
UVICORN_PID=$!
echo "  uvicorn PID: ${UVICORN_PID}"
cd "${REPO_ROOT}"

# Wait for health endpoint (max 60s)
echo "  Waiting for backend health..."
HEALTH_OK=false
for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:8000/api/v1/health &>/dev/null; then
        HEALTH_OK=true
        echo "  ✓ Backend healthy (took ${i}s)"
        break
    fi
    sleep 1
done

if ! $HEALTH_OK; then
    echo "  ❌ Backend failed to start within 60s — aborting"
    echo "  Last 30 lines of uvicorn output:"
    tail -30 /tmp/uvicorn_output.log 2>/dev/null || true
    exit 1
fi

# Quick health probe detail
curl -sS http://127.0.0.1:8000/api/v1/health 2>/dev/null | python3 -m json.tool 2>/dev/null || true
echo "  ✓ Phase 4 complete"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 5 — Benchmarks
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "[PHASE 5/7] $(date +%H:%M:%S) — Running Benchmarks"
echo "──────────────────────────────────────────────────────────────────────"

BENCH_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 5a. Warmup (3 quick chat requests — times ignored)
echo "  [5a] Warmup (3 requests)..."
for i in 1 2 3; do
    curl -sS -X POST http://127.0.0.1:8000/api/v1/chat \
        -H "Content-Type: application/json" \
        -H "X-EduTutor-User-Id: bench-warmup" \
        -d '{"message":"Ahoj","stream":false}' \
        -o /dev/null -w "    warmup ${i}: %{http_code} (%{time_total}s)\n" 2>/dev/null || true
    sleep 0.5
done
echo "  ✓ Warmup complete"

# 5b. Python benchmark pipeline
echo "  [5b] Python benchmark pipeline..."
PIPELINE_SCRIPT="${REPO_ROOT}/tests/benchmark_pipeline.py"
if [[ -f "$PIPELINE_SCRIPT" ]]; then
    cd "${REPO_ROOT}/tutor-service"
    API_BASE="http://127.0.0.1:8000" \
        python3 "$PIPELINE_SCRIPT" 2>&1 | tee "${RESULTS_DIR}/per_module/pipeline_output.txt" || {
        echo "  ⚠ benchmark_pipeline.py exited with errors (continuing...)"
    }
    cd "${REPO_ROOT}"

    # Copy the benchmark_results.json if it was written to docs/
    if [[ -f "${REPO_ROOT}/docs/benchmark_results.json" ]]; then
        cp "${REPO_ROOT}/docs/benchmark_results.json" "${RESULTS_DIR}/per_module/"
        echo "  ✓ Pipeline results saved"
    fi
else
    echo "  ⚠ benchmark_pipeline.py not found — skipping"
fi

# 5c. k6 load tests
echo "  [5c] k6 load tests..."
K6_SCENARIO_DIR="${REPO_ROOT}/tests/k6/scenarios"

if [[ -n "${K6_BIN:-}" ]] && [[ -d "$K6_SCENARIO_DIR" ]]; then
    for scenario in $K6_SCENARIOS; do
        s_file="${K6_SCENARIO_DIR}/${scenario}.js"
        if [[ ! -f "$s_file" ]]; then
            echo "    ⚠ Scenario ${scenario} not found — skipping"
            continue
        fi
        echo "    Running scenario: ${scenario}..."
        "${K6_BIN}" run \
            --env BASE_URL=http://127.0.0.1:8000 \
            --out json="${RESULTS_DIR}/load_tests/${scenario}_k6.json" \
            --summary-export="${RESULTS_DIR}/load_tests/${scenario}_summary.json" \
            "$s_file" 2>&1 | tail -20 || {
            echo "    ⚠ k6 scenario ${scenario} failed (continuing...)"
        }
    done
    echo "  ✓ k6 load tests complete"
else
    echo "  ⚠ k6 not available or scenarios missing — skipping load tests"
fi

# 5d. Audio2Lipsync benchmark
echo "  [5d] Audio2Lipsync benchmark..."
if python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    python3 << 'PYEOF'
import time, json, os, sys

API = os.getenv("API_BASE", "http://127.0.0.1:8000")
RESULTS_FILE = os.getenv("RESULTS_FILE", "results/a2l/a2l_benchmark.json")

try:
    import httpx
    import asyncio

    async def bench_a2l():
        results = []
        async with httpx.AsyncClient(timeout=60) as client:
            # Check lipsync status
            r = await client.get(f"{API}/api/v1/lipsync/status")
            status = r.json()
            print(f"  Lipsync status: active={status.get('active')}, "
                  f"audio2lipsync={status.get('providers',{}).get('audio2lipsync',{}).get('available')}")

            # Simple chat request that triggers A2L via viseme_timeline
            test_messages = [
                "Ahoj, ako sa máš?",
                "Vysvetli mi, čo je to konštruktor v Pythone.",
                "Dedičnosť je základný koncept OOP.",
            ]

            for i, msg in enumerate(test_messages):
                t0 = time.perf_counter()
                r = await client.post(
                    f"{API}/api/v1/chat",
                    json={"message": msg, "stream": False,
                          "tts_provider": "edge", "tts_voice": "sk-SK-LukasNeural"},
                    headers={"X-EduTutor-User-Id": f"bench-a2l-{i}"}
                )
                elapsed = time.perf_counter() - t0
                data = r.json()
                viseme_count = len(data.get("viseme_timeline", []))
                results.append({
                    "message": msg[:60],
                    "latency_s": round(elapsed, 3),
                    "viseme_count": viseme_count,
                    "emotion": data.get("emotion", "?"),
                    "status": r.status_code,
                })
                print(f"    msg {i+1}: {elapsed:.2f}s | {viseme_count} visemes | {data.get('emotion', '?')}")

        os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
        with open(RESULTS_FILE, "w") as f:
            json.dump(results, f, indent=2)
        print(f"  ✓ A2L benchmark saved → {RESULTS_FILE}")

    asyncio.run(bench_a2l())
except Exception as e:
    print(f"  ⚠ A2L benchmark error: {e}")
PYEOF
else
    echo "  ⚠ No CUDA — skipping A2L benchmark"
fi

BENCH_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "  ✓ Phase 5 complete"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 6 — Capture Results
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "[PHASE 6/7] $(date +%H:%M:%S) — Capturing Results"
echo "──────────────────────────────────────────────────────────────────────"

END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 6a. Run metadata
python3 << PYEOF
import json, os, datetime

meta = {
    "tier": "${TIER}",
    "description": "${TIER_DESC}",
    "start_time": "${START_TIME}",
    "end_time": "${END_TIME}",
    "benchmark_start": "${BENCH_START}",
    "benchmark_end": "${BENCH_END}",
    "exit_code": ${EXIT_CODE},
    "llm_model": "${LLM_MODEL}",
    "stt_model": "${STT_MODEL_ID}",
    "stt_provider": "${STT_PROVIDER}",
    "tts_provider": "${TTS_PROVIDER}",
    "vector_db": "${VECTOR_DB}",
    "k6_scenarios": "${K6_SCENARIOS}",
    "hostname": "$(hostname 2>/dev/null || echo unknown)",
    "uname": "$(uname -a 2>/dev/null || echo unknown)",
}

with open("${RESULTS_DIR}/run_metadata.json", "w") as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)
print("  ✓ run_metadata.json saved")
PYEOF

# 6b. System / prometheus metrics
echo "  [6b] System status..."
curl -sS http://127.0.0.1:8000/api/v1/system/status 2>/dev/null | python3 -m json.tool > "${RESULTS_DIR}/system_status.json" 2>/dev/null || {
    echo '{"error": "system/status endpoint unreachable"}' > "${RESULTS_DIR}/system_status.json"
}
curl -sS http://127.0.0.1:8000/api/v1/system/hardware 2>/dev/null | python3 -m json.tool > "${RESULTS_DIR}/system_hardware.json" 2>/dev/null || true

# 6c. GPU snapshot (peak VRAM during benchmark)
echo "  [6c] GPU snapshot..."
if command -v nvidia-smi &>/dev/null; then
    nvidia-smi --query-gpu=timestamp,name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw \
        --format=csv > "${RESULTS_DIR}/gpu_snapshot.csv" 2>/dev/null || true
fi

# 6d. Tarball everything
echo "  [6d] Archiving results..."
TARBALL="results-${TIER}-${TIMESTAMP}.tar.gz"
tar czf "${REPO_ROOT}/${TARBALL}" -C "${REPO_ROOT}" results/ 2>/dev/null || true
echo "  ✓ Results archived → ${REPO_ROOT}/${TARBALL}"
TARBALL_SIZE=$(du -h "${REPO_ROOT}/${TARBALL}" 2>/dev/null | cut -f1 || echo "?")

# 6e. Print ASCII summary table
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                     BENCHMARK SUMMARY                            ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  %-20s │ %-40s ║\n" "Field" "Value"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  %-20s │ %-40s ║\n" "Tier" "${TIER} (${TIER_DESC})"
printf "║  %-20s │ %-40s ║\n" "LLM Model" "${LLM_MODEL}"
printf "║  %-20s │ %-40s ║\n" "STT Provider" "${STT_PROVIDER}"
printf "║  %-20s │ %-40s ║\n" "TTS Provider" "${TTS_PROVIDER}"
printf "║  %-20s │ %-40s ║\n" "Vector DB" "${VECTOR_DB}"
printf "║  %-20s │ %-40s ║\n" "K6 Scenarios" "${K6_SCENARIOS}"
printf "║  %-20s │ %-40s ║\n" "Start" "${START_TIME}"
printf "║  %-20s │ %-40s ║\n" "End" "${END_TIME}"
printf "║  %-20s │ %-40s ║\n" "Tarball" "${TARBALL} (${TARBALL_SIZE})"
echo "╠══════════════════════════════════════════════════════════════════╣"

# Print per-module summary if available
if [[ -f "${RESULTS_DIR}/per_module/pipeline_output.txt" ]]; then
    echo "║  Pipeline (last 15 lines):"
    tail -15 "${RESULTS_DIR}/per_module/pipeline_output.txt" | while IFS= read -r line; do
        printf "║  %s\n" "$line"
    done
fi

echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

echo "  ✓ Phase 6 complete"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 7 — Cleanup
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "[PHASE 7/7] $(date +%H:%M:%S) — Cleanup"
echo "──────────────────────────────────────────────────────────────────────"

# Stop uvicorn
if [[ -n "${UVICORN_PID:-}" ]]; then
    kill "${UVICORN_PID}" 2>/dev/null || true
    echo "  ✓ uvicorn stopped (PID ${UVICORN_PID})"
fi

# Stop ollama (optional — keep running for inspection)
if [[ "${STOP_OLLAMA:-false}" == "true" ]]; then
    if [[ -n "${OLLAMA_PID:-}" ]]; then
        kill "${OLLAMA_PID}" 2>/dev/null || true
        echo "  ✓ ollama stopped (PID ${OLLAMA_PID})"
    fi
fi

# Deactivate venv
deactivate 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  BENCHMARK COMPLETE                                              ║"
echo "║  Tier: ${TIER}  |  ${TIER_DESC}"
echo "║  Results: ${REPO_ROOT}/${TARBALL}"
echo "║  Log:     ${LOG_FILE}"
echo "║  Exit:    ${EXIT_CODE}"
echo "║  Download: scp user@host:${REPO_ROOT}/${TARBALL} ."
echo "╚══════════════════════════════════════════════════════════════════╝"

exit ${EXIT_CODE}
