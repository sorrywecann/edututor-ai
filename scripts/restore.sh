#!/usr/bin/env bash
set -euo pipefail

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

usage() {
    cat <<EOF
EduTutor.AI — Volume Restore

Usage:  $(basename "$0") <backup_directory>

Restores Docker named volumes from a timestamped backup directory created by
scripts/backup.sh. The backup directory must contain manifest.json and one or
more .tar.gz volume archives.

⚠  WARNING: This OVERWRITES existing volume contents.

Steps performed:
  1. Verify all archives match SHA-256 from manifest.json
  2. docker compose down (stops all services)
  3. For each volume: docker volume create + extract tarball into it
  4. (Optional) docker compose up -d to restart

Env:
  COMPOSE_PROJECT_NAME   default edututor-prototyp-v2
  AUTO_RESTART=1         auto-run "docker compose up -d" after restore
EOF
    exit 1
}

[[ -z "${1:-}" || "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage

BACKUP_DIR="$1"
[[ -d "$BACKUP_DIR" ]] || { red "✗ Backup dir not found: $BACKUP_DIR"; exit 2; }
MANIFEST="$BACKUP_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || { red "✗ manifest.json not found in $BACKUP_DIR"; exit 2; }

COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-edututor-prototyp-v2}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

command -v docker >/dev/null 2>&1 || { red "✗ docker not found"; exit 2; }
docker info >/dev/null 2>&1 || { red "✗ docker daemon not running"; exit 2; }

yellow "▶ Verifying archive checksums…"
VERIFY_FAILED=0
while read -r file sha; do
    actual=$(shasum -a 256 "$BACKUP_DIR/$file" | awk '{print $1}')
    if [[ "$actual" != "$sha" ]]; then
        red "  ✗ CHECKSUM MISMATCH: $file"
        red "    expected: $sha"
        red "    actual:   $actual"
        VERIFY_FAILED=1
    else
        green "  ✓ $file"
    fi
done < <(jq -r '.volumes[] | "\(.file) \(.sha256)"' "$MANIFEST")
if [[ "$VERIFY_FAILED" -eq 1 ]]; then
    red "✗ One or more checksums failed. Aborting restore."
    exit 3
fi

yellow "▶ Stopping running services (docker compose down)…"
cd "$REPO_ROOT"
docker compose down 2>&1 | tail -5

yellow "▶ Restoring volumes…"
while read -r vol file; do
    green "  ▶ Restoring $vol from $file"
    docker volume rm "$vol" 2>/dev/null || true
    docker volume create "$vol" >/dev/null
    docker run --rm \
        -v "$vol":/dest \
        -v "$BACKUP_DIR":/src:ro \
        alpine:3.20 \
        sh -c "cd /dest && tar xzf /src/$file"
    green "  ✓ $vol restored"
done < <(jq -r '.volumes[] | "\(.name) \(.file)"' "$MANIFEST")

green "✓ All volumes restored from $BACKUP_DIR"

if [[ "${AUTO_RESTART:-0}" == "1" ]]; then
    yellow "▶ AUTO_RESTART=1 → docker compose up -d"
    docker compose up -d
else
    yellow "  Run \`docker compose up -d\` to restart services."
fi
