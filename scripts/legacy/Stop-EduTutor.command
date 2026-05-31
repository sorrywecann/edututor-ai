#!/usr/bin/env bash
# EduTutor.AI — Mac stop launcher
set -e
cd "$(dirname "$0")"

echo ""
echo "► Zastavujem EduTutor.AI kontajnery..."
docker compose down
echo "✓ Zastavené."
echo ""
read -rp "Stlač Enter pre zatvorenie..."
