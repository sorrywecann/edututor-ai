#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  EduTutor.AI — Qwen3-14B-sk Vast.ai Deployment Script
#  Paste this into Vast.ai "On-Start Script" field
#  Target: RTX 4090 (24GB) or better
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

LOG="/root/qwen3_deploy.log"
exec > >(tee -a "$LOG") 2>&1

echo "══════════════════════════════════════════════════════"
echo " Qwen3-14B-sk Vast.ai Deployment"
echo " Started: $(date)"
echo " GPU: $(nvidia-smi -L 2>/dev/null || echo 'checking...')"
echo "══════════════════════════════════════════════════════"

# ── 1. System prep ──────────────────────────────────────────────────
echo "[1/5] Installing dependencies..."
apt-get update -qq && apt-get install -y -qq curl wget lsof 2>&1 | tail -1

# ── 2. Install Ollama ───────────────────────────────────────────────
echo "[2/5] Installing Ollama..."
if ! command -v ollama &>/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi

# Wait for Ollama service
sleep 3
for i in {1..20}; do
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
        echo "  ✓ Ollama running"
        break
    fi
    sleep 1
done

# ── 3. Pull Qwen3-14B-sk Q6_K GGUF ──────────────────────────────────
echo "[3/5] Downloading Qwen3-14B-sk (Q6_K, ~12.1 GB)..."

# Create Modelfile directly from HuggingFace
ollama create qwen3-14b-sk -f - <<'OLLAMA_MODEL'
FROM https://huggingface.co/tomg42/Qwen3-14B-sk-Q6_K.gguf/resolve/main/Qwen3-14B-sk-Q6_K.gguf

SYSTEM Si EduTutor, priateľský slovenský vzdelávací asistent. Tykaj študentom. JAZYK: Vždy odpovedaj po slovensky, správnou gramatikou s diakritikou. ŠTÝL: Krátko a jasne — maximálne 2-3 vety. Hovor plynulo, bez markdown, bez emoji, bez odrážok. Text je určený na hlasné čítanie.

PARAMETER temperature 0.2
PARAMETER top_p 0.7
PARAMETER top_k 40
PARAMETER repeat_penalty 1.15
PARAMETER num_ctx 8192
OLLAMA_MODEL

echo "  ✓ Model created"

# ── 4. Test model ───────────────────────────────────────────────────
echo "[4/5] Testing model..."
RESPONSE=$(ollama run qwen3-14b-sk "Ahoj, ako sa voláš a čo dokážeš?" 2>&1)
echo "  Test: $RESPONSE"

# ── 5. Expose Ollama API ───────────────────────────────────────────
echo "[5/5] Configuring remote access..."

# Allow external connections
systemctl stop ollama 2>/dev/null || true
sleep 1

# Set Ollama to listen on all interfaces
export OLLAMA_HOST=0.0.0.0:11434
export OLLAMA_ORIGINS="*"

# Restart with exposed host
ollama serve &
sleep 3

# Verify external access
PUBLIC_IP=$(curl -sf ifconfig.me 2>/dev/null || echo "unknown")
echo ""
echo "══════════════════════════════════════════════════════"
echo " ✅ Qwen3-14B-sk READY"
echo ""
echo "  API Endpoint:  http://${PUBLIC_IP}:11434/v1"
echo "  Model:         qwen3-14b-sk"
echo "  VRAM Used:     $(nvidia-smi --query-gpu=memory.used --format=csv,noheader 2>/dev/null || echo '~12GB')"
echo ""
echo "  Test locally:  curl http://localhost:11434/v1/chat/completions \\"
echo "                   -H 'Content-Type: application/json' \\"
echo "                   -d '{\"model\":\"qwen3-14b-sk\",\"messages\":[{\"role\":\"user\",\"content\":\"Ahoj\"}]}'"
echo ""
echo "  Connect from EduTutor backend:"
echo "    Add to .env:"
echo "    CUSTOM_LLM_QWEN3_URL=http://${PUBLIC_IP}:11434/v1"
echo "    CUSTOM_LLM_QWEN3_KEY=ollama"
echo "    CUSTOM_LLM_QWEN3_MODEL=qwen3-14b-sk"
echo ""
echo "  Note: Vast.ai port 11434 must be exposed (UDP+TCP)"
echo "        Or use SSH tunnel: ssh -L 11434:localhost:11434 root@${PUBLIC_IP}"
echo "══════════════════════════════════════════════════════"
echo " Log: $LOG"
echo " Finished: $(date)"
