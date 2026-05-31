#!/usr/bin/env bash
set -euo pipefail

ts() { date +%Y%m%d-%H%M%S; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
TIMESTAMP="$(ts)"
TARGET="$BACKUP_DIR/$TIMESTAMP"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-edututor-prototyp-v2}"

VOLUMES=(
    "${COMPOSE_PROJECT}_postgres_data"
    "${COMPOSE_PROJECT}_redis_data"
    "${COMPOSE_PROJECT}_chroma_data"
    "${COMPOSE_PROJECT}_hf_cache"
)

usage() {
    cat <<EOF
EduTutor.AI — Volume Backup

Usage:  $(basename "$0") [BACKUP_DIR]

Backs up Docker named volumes to a timestamped directory:
  - postgres_data  (relational DB)
  - redis_data     (cache / session)
  - chroma_data    (vector DB)
  - hf_cache       (HuggingFace model downloads — optional, large)

Output:  \$BACKUP_DIR/YYYYMMDD-HHMMSS/<volume>.tar.gz + manifest.json

Restore via:  scripts/restore.sh \$BACKUP_DIR/YYYYMMDD-HHMMSS

Env:
  BACKUP_DIR             default ./backups
  COMPOSE_PROJECT_NAME   default edututor-prototyp-v2
  SKIP_HF_CACHE=1        skip large HuggingFace cache (default: included)
EOF
    exit 1
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage
[[ -n "${1:-}" ]] && BACKUP_DIR="$1" && TARGET="$BACKUP_DIR/$TIMESTAMP"

command -v docker >/dev/null 2>&1 || { red "✗ docker not found"; exit 2; }
docker info >/dev/null 2>&1 || { red "✗ docker daemon not running"; exit 2; }

mkdir -p "$TARGET"
yellow "▶ Backup target: $TARGET"

MANIFEST="$TARGET/manifest.json"
{
    echo "{"
    echo "  \"timestamp\": \"$TIMESTAMP\","
    echo "  \"compose_project\": \"$COMPOSE_PROJECT\","
    echo "  \"hostname\": \"$(hostname)\","
    echo "  \"git_commit\": \"$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)\","
    echo "  \"volumes\": ["
} > "$MANIFEST"

FIRST=1
for vol in "${VOLUMES[@]}"; do
    if [[ "$vol" == *"hf_cache"* && "${SKIP_HF_CACHE:-0}" == "1" ]]; then
        yellow "  ↷ skipping $vol (SKIP_HF_CACHE=1)"
        continue
    fi

    if ! docker volume inspect "$vol" >/dev/null 2>&1; then
        yellow "  ↷ skipping $vol (volume not found — likely never started)"
        continue
    fi

    OUT="$TARGET/${vol#${COMPOSE_PROJECT}_}.tar.gz"
    green "  ▶ Archiving $vol → $(basename "$OUT")"
    docker run --rm \
        -v "$vol":/source:ro \
        -v "$TARGET":/dest \
        alpine:3.20 \
        sh -c "cd /source && tar czf /dest/$(basename "$OUT") ."

    SIZE=$(du -h "$OUT" | awk '{print $1}')
    SHA=$(shasum -a 256 "$OUT" | awk '{print $1}')

    [[ $FIRST -eq 0 ]] && echo "    ," >> "$MANIFEST"
    cat >> "$MANIFEST" <<EOF
    {
      "name": "$vol",
      "file": "$(basename "$OUT")",
      "size": "$SIZE",
      "sha256": "$SHA"
    }
EOF
    FIRST=0
done

{
    echo "  ]"
    echo "}"
} >> "$MANIFEST"

green "✓ Backup complete: $TARGET"
ls -lh "$TARGET"
