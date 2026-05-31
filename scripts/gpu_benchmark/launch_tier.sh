#!/usr/bin/env bash
set -euo pipefail

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }

usage() {
    cat <<EOF
EduTutor.AI — Vast.ai GPU benchmark launcher

Usage:  $(basename "$0") <tier> [duration_hours]

Tiers:
  t1   RTX 4060 Ti 16GB  ~\$0.20/h  qwen2.5:7b
  t2   RTX 4090 24GB     ~\$0.40/h  qwen2.5:14b
  t3   A100 40GB         ~\$1.00/h  qwen2.5:32b
  t4   A100 80GB         ~\$1.50/h  qwen2.5:32b + full pack

Default duration: 3 hours per tier.

Requires:
  - VAST_API_KEY env var (https://cloud.vast.ai/account/)
  - vastai CLI installed (pip install vastai)
  - Working SSH config (vast.ai generates per-instance proxy)

Steps performed:
  1. Search offers matching tier requirements + cheapest reliable.
  2. Create instance with appropriate \`vastai_startup_\${tier}.sh\` as onstart.
  3. Poll until bootstrap complete + ssh available.
  4. SCP this repo's scripts/gpu_benchmark/setup_and_run.sh + tests/k6.
  5. SSH-execute setup_and_run.sh with TIER env var.
  6. Stream remote stdout to local docs/load_tests_v5/cross_gpu/\${tier}-*.log
  7. SCP results back to docs/load_tests_v5/cross_gpu/\${tier}-*/
  8. Destroy instance.
  9. Append cost entry to docs/load_tests_v5/cross_gpu/cost_log.md.

Output:
  docs/load_tests_v5/cross_gpu/\${tier}-<gpu-slug>/
    ├── llm_bench.json
    ├── load_tests/  (k6 scenarios)
    ├── hw_info.txt
    └── instance_metadata.json

Env overrides:
  DRY_RUN=1            print plan, don't launch
  COST_HARD_CAP=12     abort if cumulative cost (cost_log.md) ≥ \$12
  MAX_OFFER_PRICE=...  override max \$/h filter
EOF
    exit 1
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" || -z "${1:-}" ]] && usage
TIER="$(echo "$1" | tr 'A-Z' 'a-z')"
DURATION_HOURS="${2:-3}"

case "$TIER" in
    t1|t2|t3|t4) ;;
    *) red "✗ Invalid tier: $TIER (use t1, t2, t3, or t4)"; exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_BASE="$REPO_ROOT/docs/load_tests_v5/cross_gpu"
COST_LOG="$OUT_BASE/cost_log.md"

if [[ -z "${VAST_API_KEY:-}" ]]; then
    if [[ -s "$HOME/.config/vastai/vast_api_key" ]]; then
        VAST_API_KEY=$(cat "$HOME/.config/vastai/vast_api_key")
        export VAST_API_KEY
        cyan "  ℹ Loaded VAST_API_KEY from ~/.config/vastai/vast_api_key"
    else
        red "✗ VAST_API_KEY not set, and no key file at ~/.config/vastai/vast_api_key"
        red "   Get yours at: https://cloud.vast.ai/account/"
        red "   Then run: vastai set api-key 'your-key'   OR   export VAST_API_KEY='your-key'"
        exit 3
    fi
fi
command -v vastai >/dev/null 2>&1 || { red "✗ vastai CLI not on PATH (export PATH=~/Library/Python/3.11/bin:\$PATH)"; exit 3; }

case "$TIER" in
    t1) GPU_Q='gpu_name=RTX_4060_Ti reliability>0.95'                       ; MAX_P="${MAX_OFFER_PRICE:-0.30}" ; STARTUP="vastai_startup_t1.sh" ;;
    t2) GPU_Q='gpu_name=RTX_4090 reliability>0.95'                          ; MAX_P="${MAX_OFFER_PRICE:-0.50}" ; STARTUP="vastai_startup_t2.sh" ;;
    t3) GPU_Q='gpu_name=A100_PCIE reliability>0.95 gpu_ram>=40000'          ; MAX_P="${MAX_OFFER_PRICE:-1.20}" ; STARTUP="vastai_startup_t3.sh" ;;
    t4) GPU_Q='gpu_name=A100_SXM4 reliability>0.95 gpu_ram>=80000'          ; MAX_P="${MAX_OFFER_PRICE:-1.80}" ; STARTUP="vastai_startup_t4.sh" ;;
esac
STARTUP_PATH="$(dirname "$0")/$STARTUP"

[[ -f "$STARTUP_PATH" ]] || { red "✗ Missing $STARTUP_PATH"; exit 4; }

cyan "═══════════════════════════════════════════"
cyan "EduTutor.AI — Vast.ai launcher"
cyan "Tier: $TIER · Duration: ${DURATION_HOURS}h · Max price: \$${MAX_P}/h"
cyan "Filter: $GPU_Q"
cyan "═══════════════════════════════════════════"

# ── Cost cap check ──────────────────────────────────────────────────────────
COST_HARD_CAP="${COST_HARD_CAP:-12}"
if [[ -f "$COST_LOG" ]]; then
    SPENT=$(grep -oE 'spent.*?\$[0-9.]+' "$COST_LOG" | grep -oE '[0-9.]+' | awk '{s+=$1} END {print s+0}')
    yellow "Cumulative spent so far: \$${SPENT}"
    if (( $(echo "$SPENT >= $COST_HARD_CAP" | bc -l) )); then
        red "✗ Cost hard cap \$${COST_HARD_CAP} reached. Aborting."
        red "  Override: COST_HARD_CAP=20 $0 $@"
        exit 5
    fi
fi

# ── Search offers ───────────────────────────────────────────────────────────
cyan "▶ Searching offers..."
OFFERS_FILE=$(mktemp)
vastai search offers "$GPU_Q dph_total<=$MAX_P" --order=dph_total --raw 2>&1 | tee "$OFFERS_FILE" | head -10

OFFER_ID=$(jq -r '.[0].id // empty' "$OFFERS_FILE" 2>/dev/null || head -2 "$OFFERS_FILE" | tail -1 | awk '{print $1}')
OFFER_PRICE=$(jq -r '.[0].dph_total // empty' "$OFFERS_FILE" 2>/dev/null || echo "?")
[[ -z "$OFFER_ID" || "$OFFER_ID" == "null" ]] && { red "✗ No offers found matching filter"; exit 6; }

green "✓ Selected offer $OFFER_ID @ \$${OFFER_PRICE}/h"

# ── Dry-run gate ────────────────────────────────────────────────────────────
if [[ "${DRY_RUN:-0}" == "1" ]]; then
    yellow "DRY_RUN=1 — stopping before instance creation."
    yellow "Would: vastai create instance $OFFER_ID --image ubuntu:22.04 \\
        --onstart-cmd \"$(cat "$STARTUP_PATH" | head -c 100)...\" --disk 30 --label edututor-${TIER}-${USER}"
    exit 0
fi

# ── Create instance ─────────────────────────────────────────────────────────
cyan "▶ Creating instance from offer $OFFER_ID..."
CREATE_OUT=$(vastai create instance "$OFFER_ID" \
    --image nvidia/cuda:12.5.0-runtime-ubuntu22.04 \
    --disk 30 \
    --label "edututor-${TIER}-$(date +%Y%m%d-%H%M%S)" \
    --onstart-cmd "$(cat "$STARTUP_PATH")" \
    --raw 2>&1)

INSTANCE_ID=$(echo "$CREATE_OUT" | jq -r '.new_contract // empty' 2>/dev/null)
[[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "null" ]] && { red "✗ Failed to create instance:"; red "$CREATE_OUT"; exit 7; }

green "✓ Instance created: $INSTANCE_ID"
yellow "  Manual destroy if script crashes: vastai destroy instance $INSTANCE_ID"

cleanup() {
    [[ -n "${INSTANCE_ID:-}" ]] && {
        yellow "▶ Destroying instance $INSTANCE_ID..."
        vastai destroy instance "$INSTANCE_ID" 2>&1 | head -3
    }
}
trap cleanup EXIT

# ── Wait for running + ssh ──────────────────────────────────────────────────
cyan "▶ Waiting for instance to be running (up to 10 min)..."
for i in $(seq 1 60); do
    STATUS=$(vastai show instance "$INSTANCE_ID" --raw 2>/dev/null | jq -r '.actual_status // "loading"')
    [[ "$STATUS" == "running" ]] && { green "✓ Instance running (status check $i)"; break; }
    [[ "$STATUS" == "exited" ]] && { red "✗ Instance exited prematurely"; exit 8; }
    sleep 10
done

cyan "▶ Waiting for onstart script to complete (up to 15 min)..."
sleep 90
# vastai logs polling
for i in $(seq 1 60); do
    LOGS=$(vastai logs "$INSTANCE_ID" --tail 50 2>&1 || true)
    if echo "$LOGS" | grep -q "ready\|DONE\|provisioned"; then
        green "✓ Bootstrap complete (poll $i)"
        break
    fi
    sleep 15
done

# ── Run benchmark on remote ─────────────────────────────────────────────────
SSH_CONN=$(vastai ssh-url "$INSTANCE_ID" 2>/dev/null)
[[ -z "$SSH_CONN" ]] && { red "✗ Could not get SSH URL"; exit 9; }

cyan "▶ Uploading benchmark scripts..."
scp -o StrictHostKeyChecking=no -r "$REPO_ROOT/scripts/gpu_benchmark" "${SSH_CONN}:/root/" 2>&1 | tail -5
scp -o StrictHostKeyChecking=no -r "$REPO_ROOT/tests/k6"             "${SSH_CONN}:/root/" 2>&1 | tail -5
scp -o StrictHostKeyChecking=no    "$REPO_ROOT/test-files/test.wav"  "${SSH_CONN}:/root/test-files/" 2>&1 | tail -3

cyan "▶ Running setup_and_run.sh on remote (TIER=$TIER)..."
ssh -o StrictHostKeyChecking=no "$SSH_CONN" "cd /root && TIER=$TIER bash gpu_benchmark/setup_and_run.sh" 2>&1 | tee "$OUT_BASE/${TIER}-run.log"

# ── Download results ────────────────────────────────────────────────────────
OUT_DIR="$OUT_BASE/${TIER}-$(vastai show instance "$INSTANCE_ID" --raw | jq -r '.gpu_name' | tr ' ' '-' | tr 'A-Z' 'a-z')"
mkdir -p "$OUT_DIR"
cyan "▶ Downloading results to $OUT_DIR..."
scp -o StrictHostKeyChecking=no -r "${SSH_CONN}:/root/results/*" "$OUT_DIR/" 2>&1 | tail -5

# ── Cost logging ────────────────────────────────────────────────────────────
ELAPSED_HOURS=$(echo "scale=2; $DURATION_HOURS" | bc)
ACTUAL_COST=$(echo "scale=2; $OFFER_PRICE * $ELAPSED_HOURS" | bc)
{
    echo ""
    echo "## $(date -u +%Y-%m-%dT%H:%M:%SZ) — $TIER"
    echo "- Instance: $INSTANCE_ID"
    echo "- Offer: $OFFER_ID @ \$${OFFER_PRICE}/h"
    echo "- Duration: ${DURATION_HOURS}h"
    echo "- spent: \$${ACTUAL_COST}"
} >> "$COST_LOG"

green "✓ $TIER complete. Spent: \$${ACTUAL_COST}"

# cleanup trap will destroy instance
