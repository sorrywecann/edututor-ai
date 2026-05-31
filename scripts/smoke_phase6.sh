#!/usr/bin/env bash
# Phase 6 platform-spine end-to-end smoke check.
#
# Exercises every Phase 6 piece in 30 seconds against a running backend:
#   1. agentState v2.1 protocol field is broadcastable (chat helper test)
#   2. Skill ABC + SkillRegistry imports cleanly
#   3. Tool-call loop is wired into chat handlers (integration test)
#   4. LearningMode.enabled_skills + agent_type are persisted
#   5. /api/v1/system/status reports avatar_ws_clients (UE5 reachability)
#   6. /api/v1/avatar/status returns the connection count
#   7. /api/v1/chat happy-path runs without skills (Slovak production parity)
#
# Usage:
#   ./scripts/smoke_phase6.sh                 # default: localhost:8000
#   API=https://example.com ./scripts/smoke_phase6.sh
#
# Exit code 0 = all green. Non-zero = at least one check failed.

set -uo pipefail

API="${API:-http://localhost:8000}"
PASS=0
FAIL=0

check() {
  local label="$1" cmd="$2"
  printf "[ ... ] %s" "$label"
  if eval "$cmd" >/tmp/smoke6.out 2>&1; then
    printf "\r[ \033[32mOK\033[0m  ] %s\n" "$label"
    PASS=$((PASS+1))
  else
    printf "\r[\033[31mFAIL\033[0m ] %s\n" "$label"
    sed 's/^/        /' /tmp/smoke6.out
    FAIL=$((FAIL+1))
  fi
}

echo "Phase 6 smoke check against $API"
echo "─────────────────────────────────────────────────"

check "backend reachable"                 "curl -fsS $API/api/v1/health"
check "system status reports avatar_ws_clients" \
  "curl -fsS $API/api/v1/system/status | grep -q avatar_ws_clients"
check "avatar status endpoint exists"     "curl -fsS $API/api/v1/avatar/status | grep -q clients"
check "chat happy path (no skills, Slovak)" \
  "curl -fsS -X POST $API/api/v1/chat -H 'Content-Type: application/json' -d '{\"message\":\"Ahoj\",\"language\":\"sk\",\"mode_id\":\"sk\"}' | grep -q response"

echo "─────────────────────────────────────────────────"
echo "Backend integration tests (in-process):"
echo

cd "$(dirname "$0")/../tutor-service" || exit 1

if [ -d ".venv" ]; then
  PYBIN=".venv/bin/python"
elif [ -d "venv" ]; then
  PYBIN="venv/bin/python"
else
  PYBIN="python3"
fi

check "Skill ABC + SkillRegistry import" \
  "$PYBIN -c 'from app.skills import Skill, ToolDef, SkillRegistry, get_registry; assert get_registry().tools_for([\"x\"]) == []'"

check "Tool-call loop integration test"   "$PYBIN -m pytest tests/test_tool_loop.py::test_chat_handler_uses_skill_registry_when_mode_has_skills -q"
check "LearningMode backwards-compat"     "$PYBIN -m pytest tests/test_learning_modes.py::test_existing_sk_mode_loads_with_safe_defaults -q"
check "agentState v2.1 protocol contract" "$PYBIN -m pytest tests/test_ws_avatar.py::test_broadcast_omits_agent_state_when_none tests/test_ws_avatar.py::test_broadcast_includes_agent_state_when_set -q"
check "Slovak chat response contract"     "$PYBIN -m pytest tests/test_fragile_contracts.py::test_chat_greeting_returns_slovak_response -q"

echo "─────────────────────────────────────────────────"
echo "Result: $PASS passed, $FAIL failed"
exit $FAIL
