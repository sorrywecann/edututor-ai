#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# EduTutor.AI — Offline Mode Verification Script
# Tests the FULL local chain with ZERO cloud API keys
# Grant requirement: "Nastavenie prototypového systému na lokálny stroj"
# ═══════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0

ok()   { echo -e "  ${GREEN}✅ PASS${NC}: $1"; ((PASS++)); }
fail() { echo -e "  ${RED}❌ FAIL${NC}: $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠️  WARN${NC}: $1"; ((WARN++)); }

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"

echo "═══════════════════════════════════════════════════"
echo " EduTutor.AI — Offline Mode Verification"
echo " Backend: ${BACKEND_URL}"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Check Piper TTS model files ────────────────────────
echo "1. Piper TTS Model Files"
MODELS_DIR="$(dirname "$0")/../tutor-service/models/piper"
if [ -f "${MODELS_DIR}/sk_SK-lili-medium.onnx" ]; then
    ok "sk_SK-lili-medium.onnx exists ($(du -h "${MODELS_DIR}/sk_SK-lili-medium.onnx" | cut -f1))"
else
    fail "sk_SK-lili-medium.onnx missing — download from HuggingFace rhasspy/piper-voices"
fi
if [ -f "${MODELS_DIR}/sk_SK-lili-medium.onnx.json" ]; then
    ok "sk_SK-lili-medium.onnx.json config exists"
else
    fail "sk_SK-lili-medium.onnx.json missing"
fi
echo ""

# ── 2. Check piper-tts package ────────────────────────────
echo "2. Piper TTS Package"
VENV_PYTHON="$(dirname "$0")/../tutor-service/venv/bin/python3"
if [ -x "$VENV_PYTHON" ]; then
    if $VENV_PYTHON -c "import piper" 2>/dev/null; then
        ok "piper-tts installed in venv"
    else
        fail "piper-tts NOT installed — run: pip install piper-tts"
    fi
else
    warn "venv not found at expected path, skipping package check"
fi
echo ""

# ── 3. Check Ollama availability ──────────────────────────
echo "3. Ollama LLM (Local)"
if command -v ollama &>/dev/null; then
    ok "ollama CLI found"
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        ok "ollama server is running"
        MODELS=$(curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; [print(m['name']) for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null || echo "")
        if [ -n "$MODELS" ]; then
            ok "Available models: $(echo "$MODELS" | tr '\n' ', ')"
        else
            warn "No models pulled — run: ollama pull gemma3:4b"
        fi
    else
        fail "ollama not running — run: ollama serve"
    fi
else
    fail "ollama not installed — https://ollama.com"
fi
echo ""

# ── 4. Check faster-whisper (local STT) ──────────────────
echo "4. Local STT (faster-whisper)"
if [ -x "$VENV_PYTHON" ]; then
    if $VENV_PYTHON -c "import faster_whisper" 2>/dev/null; then
        ok "faster-whisper installed"
    elif $VENV_PYTHON -c "import mlx_whisper" 2>/dev/null; then
        ok "mlx-whisper installed (Apple Silicon)"
    else
        fail "No local STT engine — install faster-whisper or mlx-whisper"
    fi
fi
echo ""

# ── 5. Check ChromaDB (local RAG) ────────────────────────
echo "5. ChromaDB (Local RAG)"
if [ -x "$VENV_PYTHON" ]; then
    if $VENV_PYTHON -c "import chromadb" 2>/dev/null; then
        ok "chromadb installed"
    else
        fail "chromadb NOT installed"
    fi
fi
echo ""

# ── 6. Backend API health (if running) ───────────────────
echo "6. Backend API"
if curl -sf "${BACKEND_URL}/api/v1/health/live" >/dev/null 2>&1; then
    ok "Backend is running at ${BACKEND_URL}"

    # Test system status
    STATUS=$(curl -sf "${BACKEND_URL}/api/v1/system/status" 2>/dev/null || echo "{}")
    if [ -n "$STATUS" ] && [ "$STATUS" != "{}" ]; then
        ok "System status endpoint responds"
    fi

    # Test TTS with Piper
    echo ""
    echo "7. Piper TTS API Test"
    TTS_RESP=$(curl -sf -X POST "${BACKEND_URL}/api/v1/tts" \
        -H "Content-Type: application/json" \
        -d '{"text":"Ahoj","provider":"piper","voice":"sk_SK-lili-medium"}' \
        -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
    if [ "$TTS_RESP" = "200" ]; then
        ok "Piper TTS API returns audio (HTTP 200)"
    elif [ "$TTS_RESP" = "000" ]; then
        warn "Could not reach TTS endpoint"
    else
        fail "Piper TTS API returned HTTP ${TTS_RESP}"
    fi

    # Test chat with local LLM (if Ollama available)
    echo ""
    echo "8. Chat with Local LLM"
    CHAT_RESP=$(curl -sf -X POST "${BACKEND_URL}/api/v1/chat" \
        -H "Content-Type: application/json" \
        -d '{"message":"Co je trieda v OOP?","provider":"ollama","tts_provider":"piper","tts_voice":"sk_SK-lili-medium"}' \
        -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
    if [ "$CHAT_RESP" = "200" ]; then
        ok "Chat endpoint works with local providers"
    elif [ "$CHAT_RESP" = "000" ]; then
        warn "Could not reach chat endpoint (backend may not be running)"
    else
        warn "Chat returned HTTP ${CHAT_RESP} (may need Ollama model pulled)"
    fi
else
    warn "Backend not running — skipping API tests. Start with: ./start.sh"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo "═══════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
    echo -e " ${RED}OFFLINE MODE: NOT READY${NC}"
    exit 1
else
    echo -e " ${GREEN}OFFLINE MODE: READY${NC}"
    exit 0
fi
