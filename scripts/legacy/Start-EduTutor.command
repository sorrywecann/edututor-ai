#!/usr/bin/env bash
# EduTutor.AI — Mac one-click launcher
# Double-click in Finder. The file extension .command makes Finder run it as a script.

set -e
cd "$(dirname "$0")"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'

clear
echo ""
echo -e "${B}╔════════════════════════════════════════════╗${N}"
echo -e "${B}║       EduTutor.AI — spúšťam systém...      ║${N}"
echo -e "${B}╚════════════════════════════════════════════╝${N}"
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${R}✗ Docker nie je nainštalovaný${N}"
  echo "  Stiahni Docker Desktop: https://www.docker.com/products/docker-desktop"
  read -rp "Stlač Enter pre zatvorenie..."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo -e "${Y}⚠  Docker Desktop nebeží — spúšťam ho...${N}"
  open -a Docker
  echo -n "  Čakám na Docker daemon"
  for _ in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then echo " ✓"; break; fi
    echo -n "."; sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    echo -e "${R}✗ Docker sa nespustil do 60 sekúnd${N}"
    read -rp "Stlač Enter pre zatvorenie..."
    exit 1
  fi
fi
echo -e "${G}✓ Docker beží${N}"

if [ ! -f .env ]; then
  echo -e "${Y}⚠  .env neexistuje — kopírujem z .env.example${N}"
  cp .env.example .env
  echo "  Tip: otvor .env a vlož OpenAI/Anthropic kľúč pre cloud LLM."
  echo "  Bez kľúča funguje s lokálnou Ollama (ak je nainštalovaná)."
fi
echo -e "${G}✓ .env pripravené${N}"

echo ""
echo "► Spúšťam kontajnery (prvé spustenie môže trvať pár minút)..."
docker compose up -d

echo -n "► Čakám na backend"
for _ in $(seq 1 60); do
  if curl -sf http://localhost:8000/api/v1/health/live >/dev/null 2>&1; then
    echo " ✓"; break
  fi
  echo -n "."; sleep 2
done

echo ""
echo -e "${G}╔════════════════════════════════════════════╗${N}"
echo -e "${G}║         EduTutor.AI je PRIPRAVENÉ!         ║${N}"
echo -e "${G}╠════════════════════════════════════════════╣${N}"
echo -e "${G}║  Frontend:  http://localhost:3000          ║${N}"
echo -e "${G}║  Backend:   http://localhost:8000/docs     ║${N}"
echo -e "${G}╚════════════════════════════════════════════╝${N}"
echo ""
echo "Zastavenie:  docker compose down  (alebo Stop-EduTutor.command)"
echo ""
open http://localhost:3000

read -rp "Stlač Enter pre zatvorenie tohto okna (kontajnery bežia ďalej)..."
