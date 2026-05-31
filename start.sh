#!/usr/bin/env bash
# EduTutor.AI launcher (Mac/Linux)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Starting EduTutor.AI dev stack from: $ROOT"
echo

# ---------------------------------------------------------------------------
# Preflight: verify required tools are present before touching any services.
# ---------------------------------------------------------------------------
MISSING=0

# --- Python 3.11+ --------------------------------------------------------
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "ERROR: Python 3.11+ required. Install: brew install python@3.11 (Mac) or apt install python3.11 (Linux)"
  MISSING=1
else
  PY_VERSION="$("$PYTHON_BIN" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "0.0")"
  PY_MAJOR="${PY_VERSION%%.*}"
  PY_MINOR="${PY_VERSION##*.}"
  if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 11 ]; }; then
    echo "ERROR: Python 3.11+ required (found $PY_VERSION). Install: brew install python@3.11 (Mac) or apt install python3.11 (Linux)"
    MISSING=1
  else
    echo "  python: $PYTHON_BIN ($PY_VERSION)"
  fi
fi

# --- Node 20+ ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node 20+ required. Install: brew install node OR https://nodejs.org"
  MISSING=1
else
  echo "  node:   $(node --version)"
fi

# --- pnpm ----------------------------------------------------------------
if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm required. Install: npm i -g pnpm"
  MISSING=1
else
  echo "  pnpm:   $(pnpm --version)"
fi

# --- uv (optional, warn only) -------------------------------------------
USE_UV=0
if command -v uv >/dev/null 2>&1; then
  echo "  uv:     $(uv --version 2>/dev/null | awk '{print $2}')"
  USE_UV=1
else
  echo "  uv:     not found — falling back to '$PYTHON_BIN' directly (install: https://docs.astral.sh/uv/)"
fi

if [ "$MISSING" -ne 0 ]; then
  echo
  echo "Preflight failed — install the tools listed above and re-run ./start.sh"
  exit 1
fi

# --- Backend .env --------------------------------------------------------
ENV_FILE="$ROOT/tutor-service/.env"
ENV_EXAMPLE="$ROOT/tutor-service/.env.example"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "WARNING: Backend started with default .env — add OPENAI_API_KEY to enable LLM"
  else
    echo "WARNING: tutor-service/.env missing and no .env.example to copy from — backend may fail to start"
  fi
fi

echo
# ---------------------------------------------------------------------------
# Launch services
# ---------------------------------------------------------------------------
# Backend on :8000
if [ "$USE_UV" -eq 1 ]; then
  ( cd "$ROOT/tutor-service" && uv run python -m uvicorn app.main:app --reload --port 8000 ) &
else
  ( cd "$ROOT/tutor-service" && "$PYTHON_BIN" -m uvicorn app.main:app --reload --port 8000 ) &
fi
BACKEND_PID=$!
# Frontend on :3000
( cd "$ROOT/core" && pnpm dev ) &
FRONTEND_PID=$!
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
echo "Backend PID: $BACKEND_PID · Frontend PID: $FRONTEND_PID"
echo "Press Ctrl-C to stop both"
wait
