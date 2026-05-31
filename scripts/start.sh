#!/usr/bin/env bash
# EduTutor.AI — local dev start (no Docker required)
# Usage: ./scripts/start.sh
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BOLD="\033[1m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"

echo ""
echo -e "${BOLD}EduTutor.AI${RESET} — local dev"
echo "─────────────────────────────────────────────"

# ── .env ──────────────────────────────────────────
if [ ! -f tutor-service/.env ]; then
  echo -e "${YELLOW}⚠  tutor-service/.env not found — copying from .env.example${RESET}"
  cp .env.example tutor-service/.env
fi

# ── Python backend ────────────────────────────────
echo -e "► Python backend..."
cd tutor-service

VENV=".venv"
if [ ! -d "$VENV" ]; then
  echo "  Creating virtual environment..."
  python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"

# Install / sync dependencies quietly
pip install -r requirements.txt -q --disable-pip-version-check

python -c "from app.database import create_tables; import asyncio; asyncio.run(create_tables())" 2>/dev/null || true

uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo -e "  ${GREEN}✓ Backend started${RESET} (PID $BACKEND_PID)"

cd "$ROOT"

# ── Node frontend ─────────────────────────────────
echo -e "► Next.js frontend..."
cd core

# pnpm preferred, fallback to npm
if command -v pnpm &>/dev/null; then
  PM="pnpm"
else
  PM="npm"
fi

if [ ! -d node_modules ]; then
  echo "  Installing Node dependencies..."
  $PM install -q
fi

$PM dev &
FRONTEND_PID=$!
echo -e "  ${GREEN}✓ Frontend started${RESET} (PID $FRONTEND_PID)"

cd "$ROOT"

echo ""
echo -e "${GREEN}${BOLD}✓ Running${RESET}"
echo -e "  App      → ${BOLD}http://localhost:3000${RESET}"
echo -e "  API      → ${BOLD}http://localhost:8000${RESET}"
echo -e "  API docs → ${BOLD}http://localhost:8000/docs${RESET}"
echo ""
echo -e "Press ${BOLD}Ctrl+C${RESET} to stop."

trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT
wait
