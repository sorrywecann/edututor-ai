#!/bin/bash
set -e
echo "============================================"
echo "  EduTutor.AI GPU Benchmark — T4 A100 80GB"
echo "  $(date)"
echo "============================================"

echo "[1/7] Hardware detection..."
nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader
lscpu | head -5
free -h

echo "[2/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git python3-pip python3-venv ffmpeg jq

echo "[3/7] Setting up Python venv..."
python3 -m venv /opt/edututor_venv
source /opt/edututor_venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet httpx fastapi uvicorn 'torch==2.4.*' torchaudio faster-whisper librosa soundfile sentence-transformers chromadb 'transformers>=4.45' 'vllm>=0.6'

echo "[4/7] Installing Ollama..."
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &
sleep 8

echo "[5/7] Pulling full model pack (qwen2.5:7b + 14b + 32b + 72b-tagged-aliases)..."
ollama pull qwen2.5:7b
ollama pull qwen2.5:14b
ollama pull qwen2.5:32b
# 72b is ~145 GB GGUF, only attempt if disk allows. Otherwise stick to 32b for benchmark.

echo "[6/7] Installing k6..."
curl -sSL https://github.com/grafana/k6/releases/latest/download/k6-linux-amd64 -o /usr/local/bin/k6
chmod +x /usr/local/bin/k6

echo "[7/7] Ready — T4 A100 80GB provisioned (full pack)."
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
echo "VRAM: $(nvidia-smi --query-gpu=memory.total --format=csv,noheader)"
echo "Ollama models: $(ollama list 2>&1 | tail -5)"
echo "============================================"
