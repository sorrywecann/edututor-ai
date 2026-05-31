#!/usr/bin/env bash
# verify_release.sh — Smoke test against a running EduTutor.AI release stack
#
# Used by:
#   - .github/workflows/release.yml smoke-test job (CI)
#   - Manual verification after `docker compose up -d` on a fresh machine
#
# Exits 0 if backend + frontend respond on documented endpoints within timeout.
# Exits non-zero on first failure, leaving the stack running for inspection.

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-180}"
POLL_SECONDS="${POLL_SECONDS:-3}"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; }
info() { printf '  • %s\n' "$1"; }

wait_for_url() {
  local label=$1
  local url=$2
  local elapsed=0
  info "waiting for $label ($url, max ${MAX_WAIT_SECONDS}s)"
  while [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ]; do
    if curl -sf -m 5 "$url" >/dev/null 2>&1; then
      pass "$label up after ${elapsed}s"
      return 0
    fi
    sleep "$POLL_SECONDS"
    elapsed=$((elapsed + POLL_SECONDS))
  done
  fail "$label did not respond within ${MAX_WAIT_SECONDS}s"
  return 1
}

assert_json_key() {
  local label=$1
  local url=$2
  local key=$3
  local body
  body=$(curl -sf -m 5 "$url" 2>/dev/null) || { fail "$label: request failed"; return 1; }
  if printf '%s' "$body" | grep -q "\"$key\""; then
    pass "$label: contains '$key'"
  else
    fail "$label: missing '$key' in response"
    printf '    response (first 200 bytes): %s\n' "$(printf '%s' "$body" | head -c 200)"
    return 1
  fi
}

assert_min_bytes() {
  local label=$1
  local url=$2
  local min=$3
  local bytes
  bytes=$(curl -sf -m 5 "$url" 2>/dev/null | wc -c | tr -d ' ') || { fail "$label: request failed"; return 1; }
  if [ "$bytes" -ge "$min" ]; then
    pass "$label: $bytes bytes (>= $min)"
  else
    fail "$label: $bytes bytes (< $min minimum)"
    return 1
  fi
}

echo "==> EduTutor.AI release smoke test"
echo "    backend:  $BACKEND_URL"
echo "    frontend: $FRONTEND_URL"
echo

echo "==> Phase 1: liveness"
wait_for_url "backend liveness"  "$BACKEND_URL/api/v1/health/live"
wait_for_url "frontend root"     "$FRONTEND_URL/"
echo

echo "==> Phase 2: endpoint sanity"
assert_json_key   "backend /api/v1/health"        "$BACKEND_URL/api/v1/health"        "status"
assert_json_key   "backend /api/v1/system/status" "$BACKEND_URL/api/v1/system/status" "stt"
assert_min_bytes  "frontend HTML render"          "$FRONTEND_URL/"                    1000
echo

echo "==> Phase 3: avatar subsystem"
# /avatar/status returns broadcaster connection info — should exist even with 0 clients
assert_json_key "backend /api/v1/avatar/status" "$BACKEND_URL/api/v1/avatar/status" "connected"
echo

echo "==> All smoke tests PASSED"
