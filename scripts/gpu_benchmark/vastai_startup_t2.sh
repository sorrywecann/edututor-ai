#!/bin/bash
set -e
echo "============================================"
echo "  EduTutor.AI GPU Benchmark — T2 RTX 4090 24GB"
echo "  $(date)"
echo "============================================"

echo "[1/6] Hardware detection..."
nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader
lscpu | head -5
free -h

echo "[2/6] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git python3-pip python3-venv ffmpeg jq

echo "[3/6] Setting up Python venv..."
python3 -m venv /opt/edututor_venv
source /opt/edututor_venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet httpx fastapi uvicorn 'torch==2.4.*' torchaudio faster-whisper librosa soundfile sentence-transformers chromadb 'transformers>=4.45'

echo "[4/6] Installing Ollama..."
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &
sleep 8
ollama pull qwen2.5:7b
ollama pull qwen2.5:14b

echo "[5/6] Installing k6..."
curl -sSL https://github.com/grafana/k6/releases/latest/download/k6-linux-amd64 -o /usr/local/bin/k6
chmod +x /usr/local/bin/k6

echo "[6/6] Ready — T2 RTX 4090 provisioned."
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
echo "VRAM: $(nvidia-smi --query-gpu=memory.total --format=csv,noheader)"
echo "Ollama models: $(ollama list 2>&1 | tail -3)"
echo "============================================"
