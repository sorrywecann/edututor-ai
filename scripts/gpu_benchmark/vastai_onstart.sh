#!/bin/bash
set -e
echo "[onstart] $(date) — Installing deps..."
apt-get update -qq && apt-get install -y -qq curl git python3-pip python3-venv ffmpeg wget 2>&1 | tail -3
echo "[onstart] Python3..."
pip3 install --quiet httpx fastapi uvicorn torch torchaudio faster-whisper librosa soundfile 2>&1 | tail -3
echo "[onstart] Ollama..."
curl -fsSL https://ollama.ai/install.sh | sh 2>&1 | tail -3
echo "[onstart] k6..."
curl -sL https://github.com/grafana/k6/releases/latest/download/k6-linux-amd64 -o /usr/local/bin/k6 && chmod +x /usr/local/bin/k6
echo "[onstart] DONE — $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'no GPU')"
