#!/bin/bash
# EduTutor.AI GPU Benchmark — Vast.ai T1 Startup (RTX 4060 Ti 16GB)
set -e
echo "============================================"
echo "  EduTutor.AI GPU Benchmark — T1 RTX 4060 Ti"
echo "  $(date)"
echo "============================================"

# Hardware detection
echo ""
echo "[1/6] Hardware detection..."
nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader
lscpu | head -5
free -h

# System deps
echo ""
echo "[2/6] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git python3-pip python3-venv ffmpeg

# Python
echo ""
echo "[3/6] Setting up Python..."
python3 -m venv /opt/edututor_venv
source /opt/edututor_venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet httpx fastapi uvicorn torch torchaudio faster-whisper librosa soundfile sentence-transformers chromadb

# Ollama
echo ""
echo "[4/6] Installing Ollama..."
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &
sleep 5
ollama pull qwen2.5:7b

# k6
echo ""
echo "[5/6] Installing k6..."
curl -sSL https://github.com/grafana/k6/releases/latest/download/k6-linux-amd64 -o /usr/local/bin/k6
chmod +x /usr/local/bin/k6

echo ""
echo "[6/6] Ready. T1 instance provisioned."
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
echo "Ollama: $(ollama list)"
echo "============================================"
