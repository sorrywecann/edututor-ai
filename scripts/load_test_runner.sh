#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# EduTutor.AI — Load Test Master Orchestrator (PHASE 1.3)
#
# Usage:  ./scripts/load_test_runner.sh <scenario_name> [--dry-run]
#         ./scripts/load_test_runner.sh --help
#
# Scenarios: s1-smoke  s2-rampup  s3-spike  s4-endurance  s5-stt-heavy  s6-schoolday
#
# Captures all artefacts into docs/load_tests_v5/<scenario_name>/
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:8000}"
OUTPUT_BASE="docs/load_tests_v5"
SCENARIO_DIR_BASE="tests/k6/scenarios"
VALID_SCENARIOS=("s1-smoke" "s2-rampup" "s3-spike" "s4-endurance" "s5-stt-heavy" "s6-schoolday")
REQUIRED_CMDS=("k6" "curl" "git")
SCRIPT_START_EPOCH=$(date +%s)

DRY_RUN=false
SCENARIO=""
OUTDIR=""
TMPDIR=""
PID_FILE=""
WATCHER_PIDS=()

# ── Color helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'  # No Color

# ── ISO 8601 UTC timestamp ────────────────────────────────────────────────────
iso8601() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ── Log helpers ───────────────────────────────────────────────────────────────
log_info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$*"; }
log_ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
log_warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
log_error() { printf "${RED}[ERROR]${NC} %s\n" "$*"; }

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
    cat <<'EOF'
EduTutor.AI — Load Test Master Orchestrator

Usage:
  ./scripts/load_test_runner.sh <scenario_name> [--dry-run]
  ./scripts/load_test_runner.sh --help

Scenarios:
  s1-smoke        1 VU, 5 min constant — sanity check
  s2-rampup       Gradual ramp 0→10→50→100 VUs over ~20 min (5 stages)
  s3-spike        200 VU spike in 30s, 2 min sustain
  s4-endurance    15 VU constant for 30 min
  s5-stt-heavy    Mixed STT-heavy load, 20 VUs
  s6-schoolday    Realistic school-day pattern, 60 min

Flags:
  --dry-run       Validate everything, print plan, don't run tests
  --help          Show this help

Environment:
  BASE_URL        Backend URL (default: http://localhost:8000)

Output:
  docs/load_tests_v5/<scenario_name>/
    run_metadata.json      k6_summary.json       prom_metrics_pre.txt
    k6_output.json         sysstat.log           prom_metrics_post.txt
    k6_summary.txt         memory_timeline.csv   system_status_pre.json
    health_check.log       stderr.log            system_status_post.json
EOF
    exit 0
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
    local exit_code=$?
    log_info "Cleaning up watchers..."
    for pid in "${WATCHER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    if [[ -n "${PID_FILE:-}" ]] && [[ -f "$PID_FILE" ]]; then
        while IFS= read -r pid; do
            [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    if [[ -n "${TMPDIR:-}" ]] && [[ -d "$TMPDIR" ]]; then
        rm -rf "$TMPDIR"
    fi
    # Let background processes finish their writes
    sleep 0.5 2>/dev/null || true
    exit $exit_code
}

# ── Validate scenario name ────────────────────────────────────────────────────
validate_scenario() {
    local name="$1"
    local scenario_file="${REPO_ROOT}/${SCENARIO_DIR_BASE}/${name}.js"

    if [[ ! -f "$scenario_file" ]]; then
        log_error "Scenario file not found: ${SCENARIO_DIR_BASE}/${name}.js"
        log_error "Valid scenarios: ${VALID_SCENARIOS[*]}"
        exit 1
    fi

    # Check name is in valid list
    local valid=false
    for s in "${VALID_SCENARIOS[@]}"; do
        [[ "$s" == "$name" ]] && valid=true && break
    done
    if ! $valid; then
        log_warn "Scenario '${name}' not in known list, but file exists — proceeding"
    fi

    log_ok "Scenario validated: ${name}"
}

# ── Validate prerequisites ────────────────────────────────────────────────────
validate_prerequisites() {
    # Check required commands
    local missing=()
    for cmd in "${REQUIRED_CMDS[@]}"; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required commands: ${missing[*]}"
        log_error "Install: brew install k6 curl git"
        exit 1
    fi

    # Check k6 version
    local k6_ver
    k6_ver=$(k6 version 2>&1 | head -1 || true)
    log_info "k6: ${k6_ver}"
}

# ── Validate backend reachability ─────────────────────────────────────────────
validate_backend() {
    local health_url="${BASE_URL}/api/v1/health"
    log_info "Checking backend health at ${health_url} ..."

    local http_code
    http_code=$(curl -sS -o /dev/null -w "%{http_code}" -m 5 "${health_url}" 2>/dev/null || echo "000")

    if [[ "$http_code" != "200" ]]; then
        log_error "Backend not reachable! HTTP ${http_code} from ${health_url}"
        log_error "Is the backend running? Start: tmux attach -t edu:backend"
        log_error "Or: cd tutor-service && uvicorn app.main:app --port 8000"
        exit 1
    fi

    # Detailed health response
    local health_body
    health_body=$(curl -sS -m 5 "${health_url}" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "{}")
    local overall_status
    overall_status=$(echo "$health_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")

    log_ok "Backend reachable — health status: ${overall_status}"
    if [[ "$overall_status" != "ok" ]]; then
        log_warn "Backend reports degraded health — continuing but watch for errors"
    fi
}

# ── Setup output directory ────────────────────────────────────────────────────
setup_output_dir() {
    OUTDIR="${REPO_ROOT}/${OUTPUT_BASE}/${SCENARIO}"
    mkdir -p "$OUTDIR"

    # Warn if files already exist
    local existing=()
    for f in run_metadata.json k6_summary.txt sysstat.log stderr.log; do
        [[ -f "${OUTDIR}/${f}" ]] && existing+=("$f")
    done
    if [[ ${#existing[@]} -gt 0 ]]; then
        log_warn "Existing output files will be overwritten: ${existing[*]}"
    fi

    log_ok "Output directory: ${OUTDIR}"
}

# ── Pre-test capture ──────────────────────────────────────────────────────────
capture_pre_test() {
    log_info "── Capturing PRE-test state ──"

    # --- run_metadata.json (initial) ---
    local git_commit hostname env_hash
    git_commit=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
    hostname=$(hostname 2>/dev/null || echo "unknown")

    if [[ -f "${REPO_ROOT}/.env" ]]; then
        if command -v md5sum &>/dev/null; then
            env_hash=$(md5sum "${REPO_ROOT}/.env" | awk '{print $1}')
        elif command -v md5 &>/dev/null; then
            env_hash=$(md5 -q "${REPO_ROOT}/.env")
        else
            env_hash="no-md5-tool"
        fi
    else
        env_hash="no-.env-file"
    fi

    cat > "${OUTDIR}/run_metadata.json" <<METADATA
{
  "start_time": "$(iso8601)",
  "scenario": "${SCENARIO}",
  "git_commit": "${git_commit}",
  "env_hash": "${env_hash}",
  "hostname": "${hostname}",
  "base_url": "${BASE_URL}",
  "runner_pid": "$$",
  "k6_exit_code": null,
  "end_time": null,
  "duration_seconds": null
}
METADATA
    log_ok "run_metadata.json (initial)"

    # --- prom_metrics_pre.txt ---
    local metrics_url="${BASE_URL}/api/v1/performance?last=100"
    log_info "Fetching pre-test metrics from ${metrics_url} ..."
    if curl -sS -m 5 "${metrics_url}" 2>/dev/null | python3 -m json.tool > "${OUTDIR}/prom_metrics_pre.txt" 2>/dev/null; then
        log_ok "prom_metrics_pre.txt"
    else
        echo "# Metrics endpoint unavailable at $(iso8601)" > "${OUTDIR}/prom_metrics_pre.txt"
        log_warn "prom_metrics_pre.txt — metrics endpoint unavailable, wrote placeholder"
    fi

    # --- system_status_pre.json ---
    local status_url="${BASE_URL}/api/v1/system/status"
    log_info "Fetching pre-test system status from ${status_url} ..."
    if curl -sS -m 5 "${status_url}" 2>/dev/null | python3 -m json.tool > "${OUTDIR}/system_status_pre.json" 2>/dev/null; then
        log_ok "system_status_pre.json"
    else
        echo '{"error":"system/status endpoint unavailable","timestamp":"'"$(iso8601)"'"}' > "${OUTDIR}/system_status_pre.json"
        log_warn "system_status_pre.json — endpoint unavailable, wrote placeholder"
    fi
}

# ── Launch background watchers ────────────────────────────────────────────────
launch_watchers() {
    log_info "── Launching background watchers ──"

    # Temp directory for PID tracking
    TMPDIR=$(mktemp -d)
    PID_FILE="${TMPDIR}/watcher_pids"
    > "$PID_FILE"  # create empty file

    # --- sysstat watcher (vmstat or top) ---
    {
        if command -v vmstat &>/dev/null; then
            # Linux: vmstat with 60s delay, 1000 samples
            log_info "sysstat: using vmstat (Linux)"
            vmstat 60 1000
        elif command -v vm_stat &>/dev/null; then
            # macOS: vm_stat + top hybrid
            log_info "sysstat: using top + vm_stat (macOS)"
            while true; do
                echo ""
                echo "=== $(iso8601) ==="
                echo "--- top (CPU) ---"
                top -l 1 -n 0 -o cpu 2>/dev/null | head -20
                echo ""
                echo "--- vm_stat (memory pages) ---"
                vm_stat 2>/dev/null | head -20
                sleep 60
            done
        else
            # Generic fallback
            log_info "sysstat: using top (generic fallback)"
            while true; do
                echo ""
                echo "=== $(iso8601) ==="
                top -l 1 -n 0 2>/dev/null || top -b -n 1 2>/dev/null | head -20
                sleep 60
            done
        fi
    } >> "${OUTDIR}/sysstat.log" 2>&1 &
    local sysstat_pid=$!
    echo "$sysstat_pid" >> "$PID_FILE"
    WATCHER_PIDS+=("$sysstat_pid")
    log_ok "sysstat watcher started (PID ${sysstat_pid}) → sysstat.log"

    # --- memory_timeline watcher ---
    {
        echo "timestamp,rss_kb,vsz_kb,cpu_pct"
        while true; do
            local ts
            ts=$(iso8601)
            # macOS / Linux compatible ps aux format:
            # USER PID %CPU %MEM VSZ RSS ... COMMAND
            ps aux 2>/dev/null | grep -v grep | awk -v ts="$ts" '
                $11 ~ /uvicorn/ || $0 ~ /[u]vicorn/ {
                    printf "%s,%s,%s,%s\n", ts, $6, $5, $3
                }
            '
            sleep 30
        done
    } >> "${OUTDIR}/memory_timeline.csv" 2>&1 &
    local mem_pid=$!
    echo "$mem_pid" >> "$PID_FILE"
    WATCHER_PIDS+=("$mem_pid")
    log_ok "memory_timeline watcher started (PID ${mem_pid}) → memory_timeline.csv"

    # --- health_check watcher ---
    {
        while true; do
            echo "=== $(iso8601) ==="
            curl -sS -m 5 "${BASE_URL}/api/v1/health" 2>&1 || echo "ERROR: health check failed"
            echo ""
            sleep 60
        done
    } >> "${OUTDIR}/health_check.log" 2>&1 &
    local health_pid=$!
    echo "$health_pid" >> "$PID_FILE"
    WATCHER_PIDS+=("$health_pid")
    log_ok "health_check watcher started (PID ${health_pid}) → health_check.log"

    # Register trap now that watchers are running
    trap cleanup EXIT INT TERM
}

# ── Run k6 ────────────────────────────────────────────────────────────────────
run_k6() {
    local scenario_file="${REPO_ROOT}/${SCENARIO_DIR_BASE}/${SCENARIO}.js"
    local k6_out_json="${OUTDIR}/k6_output.json"
    local k6_summary_txt="${OUTDIR}/k6_summary.txt"
    local k6_summary_json="${OUTDIR}/k6_summary.json"
    local k6_stderr="${OUTDIR}/stderr.log"

    log_info "── Running k6 scenario: ${SCENARIO} ──"
    log_info "Command: k6 run --env BASE_URL=${BASE_URL} ${SCENARIO_DIR_BASE}/${SCENARIO}.js"
    log_info "Output dir: ${OUTDIR}"
    echo ""

    # Allow k6 to exit non-zero without killing the script
    set +e
    k6 run \
        --env "BASE_URL=${BASE_URL}" \
        --out "json=${k6_out_json}" \
        --summary-export="${k6_summary_json}" \
        "${scenario_file}" \
        > "${k6_summary_txt}" \
        2> "${k6_stderr}"

    local k6_exit=$?
    set -e

    echo ""
    log_info "k6 exited with code: ${k6_exit}"

    update_metadata_k6 "$k6_exit"
}

# ── Update metadata with k6 results ───────────────────────────────────────────
update_metadata_k6() {
    local k6_exit="$1"
    local end_epoch end_time duration

    end_epoch=$(date +%s)
    end_time=$(iso8601)
    duration=$((end_epoch - SCRIPT_START_EPOCH))

    python3 -c "
import json, sys
with open('${OUTDIR}/run_metadata.json', 'r') as f:
    meta = json.load(f)
meta['k6_exit_code'] = ${k6_exit}
meta['end_time'] = '${end_time}'
meta['duration_seconds'] = ${duration}
with open('${OUTDIR}/run_metadata.json', 'w') as f:
    json.dump(meta, f, indent=2)
" 2>/dev/null || {
        log_warn "Failed to update run_metadata.json via python3; writing manually"
        # Fallback: use sed (less pretty but functional)
        local tmpfile="${TMPDIR}/meta_tmp.json"
        sed -e "s/\"k6_exit_code\": null/\"k6_exit_code\": ${k6_exit}/" \
            -e "s/\"end_time\": null/\"end_time\": \"${end_time}\"/" \
            -e "s/\"duration_seconds\": null/\"duration_seconds\": ${duration}/" \
            "${OUTDIR}/run_metadata.json" > "$tmpfile" && mv "$tmpfile" "${OUTDIR}/run_metadata.json"
    }
}

# ── Post-test capture ─────────────────────────────────────────────────────────
capture_post_test() {
    log_info "── Capturing POST-test state ──"

    # --- prom_metrics_post.txt ---
    local metrics_url="${BASE_URL}/api/v1/performance?last=100"
    log_info "Fetching post-test metrics from ${metrics_url} ..."
    if curl -sS -m 5 "${metrics_url}" 2>/dev/null | python3 -m json.tool > "${OUTDIR}/prom_metrics_post.txt" 2>/dev/null; then
        log_ok "prom_metrics_post.txt"
    else
        echo "# Metrics endpoint unavailable at $(iso8601)" > "${OUTDIR}/prom_metrics_post.txt"
        log_warn "prom_metrics_post.txt — metrics endpoint unavailable, wrote placeholder"
    fi

    # --- system_status_post.json ---
    local status_url="${BASE_URL}/api/v1/system/status"
    log_info "Fetching post-test system status from ${status_url} ..."
    if curl -sS -m 5 "${status_url}" 2>/dev/null | python3 -m json.tool > "${OUTDIR}/system_status_post.json" 2>/dev/null; then
        log_ok "system_status_post.json"
    else
        echo '{"error":"system/status endpoint unavailable","timestamp":"'"$(iso8601)"'"}' > "${OUTDIR}/system_status_post.json"
        log_warn "system_status_post.json — endpoint unavailable, wrote placeholder"
    fi
}

# ── Print summary ─────────────────────────────────────────────────────────────
print_summary() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  EduTutor.AI Load Test — ${SCENARIO}"
    echo "═══════════════════════════════════════════════════════════════════"

    # Read metadata
    local k6_exit start_t end_t dur
    if [[ -f "${OUTDIR}/run_metadata.json" ]]; then
        k6_exit=$(python3 -c "import json; print(json.load(open('${OUTDIR}/run_metadata.json')).get('k6_exit_code','?'))" 2>/dev/null || echo "?")
        start_t=$(python3 -c "import json; print(json.load(open('${OUTDIR}/run_metadata.json')).get('start_time','?'))" 2>/dev/null || echo "?")
        end_t=$(python3 -c "import json; print(json.load(open('${OUTDIR}/run_metadata.json')).get('end_time','?'))" 2>/dev/null || echo "?")
        dur=$(python3 -c "import json; print(json.load(open('${OUTDIR}/run_metadata.json')).get('duration_seconds','?'))" 2>/dev/null || echo "?")
    else
        k6_exit="?"; start_t="?"; end_t="?"; dur="?"
    fi

    # Determine pass/partial/fail
    local verdict
    if [[ "$k6_exit" == "0" ]]; then
        verdict="${GREEN}PASS${NC}"
    elif [[ "$k6_exit" == "?" ]]; then
        verdict="${YELLOW}UNKNOWN${NC}"
    elif [[ -n "$k6_exit" ]] && [[ "$k6_exit" =~ ^[0-9]+$ ]]; then
        verdict="${YELLOW}PARTIAL (exit ${k6_exit})${NC}"
    else
        verdict="${RED}FAIL${NC}"
    fi

    echo ""
    printf "  %-20s ${BOLD}%s${NC}\n" "Verdict:" "${verdict}"
    printf "  %-20s %s\n" "Scenario:" "${SCENARIO}"
    printf "  %-20s %s\n" "Start:" "${start_t}"
    printf "  %-20s %s\n" "End:" "${end_t}"
    printf "  %-20s %s s\n" "Duration:" "${dur}"

    # Extract key k6 metrics
    local summary_json="${OUTDIR}/k6_summary.json"
    if [[ -f "$summary_json" ]] && command -v python3 &>/dev/null; then
        echo ""
        echo "  ── Key k6 Metrics ────────────────────────────────────────────"

        local vus_max iters p95 err_rate
        vus_max=$(python3 -c "
import json
with open('${summary_json}') as f:
    m = json.load(f).get('metrics',{})
v = m.get('vus_max',{}).get('values',{}).get('value','N/A')
print(v)
" 2>/dev/null || echo "N/A")

        iters=$(python3 -c "
import json
with open('${summary_json}') as f:
    m = json.load(f).get('metrics',{})
v = m.get('iterations',{}).get('values',{}).get('count','N/A')
print(v)
" 2>/dev/null || echo "N/A")

        p95=$(python3 -c "
import json
with open('${summary_json}') as f:
    m = json.load(f).get('metrics',{})
v = m.get('http_req_duration',{}).get('values',{}).get('p(95)','N/A')
print(v)
" 2>/dev/null || echo "N/A")

        err_rate=$(python3 -c "
import json
with open('${summary_json}') as f:
    m = json.load(f).get('metrics',{})
v = m.get('http_req_failed',{}).get('values',{}).get('rate','N/A')
print(v)
" 2>/dev/null || echo "N/A")

        # Format p95 (round to 1 decimal if numeric)
        if [[ "$p95" =~ ^[0-9]+\.?[0-9]*$ ]]; then
            p95=$(printf "%.1f ms" "$p95")
        fi
        if [[ "$err_rate" =~ ^0?\.[0-9]+$ ]] || [[ "$err_rate" =~ ^[0-9]+\.?[0-9]*$ ]]; then
            err_rate=$(python3 -c "print(f'{float(${err_rate})*100:.2f}%')" 2>/dev/null || echo "$err_rate")
        fi

        printf "  %-20s %s\n" "VUs (max):" "${vus_max}"
        printf "  %-20s %s\n" "Iterations:" "${iters}"
        printf "  %-20s %s\n" "HTTP P95:" "${p95}"
        printf "  %-20s %s\n" "Error Rate:" "${err_rate}"
    else
        echo ""
        echo "  ${YELLOW}k6_summary.json not found — skipping metrics extraction${NC}"
    fi

    # Artefact listing
    echo ""
    echo "  ── Captured Artefacts ────────────────────────────────────────"
    local dir="${OUTDIR}"
    if [[ -d "$dir" ]]; then
        for f in run_metadata.json k6_output.json k6_summary.txt k6_summary.json \
                 sysstat.log memory_timeline.csv prom_metrics_pre.txt prom_metrics_post.txt \
                 system_status_pre.json system_status_post.json health_check.log stderr.log; do
            if [[ -f "${dir}/${f}" ]]; then
                local size
                size=$(wc -c < "${dir}/${f}" 2>/dev/null | tr -d ' ')
                printf "  %-30s %8s bytes\n" "${f}" "${size}"
            else
                printf "  %-30s ${RED}MISSING${NC}\n" "${f}"
            fi
        done
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    # Parse arguments
    if [[ $# -eq 0 ]]; then
        usage
    fi

    for arg in "$@"; do
        case "$arg" in
            --help|-h)
                usage
                ;;
            --dry-run)
                DRY_RUN=true
                ;;
            -*)
                log_error "Unknown flag: ${arg}"
                usage
                ;;
            *)
                if [[ -z "$SCENARIO" ]]; then
                    SCENARIO="$arg"
                else
                    log_error "Only one scenario name accepted"
                    usage
                fi
                ;;
        esac
    done

    if [[ -z "$SCENARIO" ]]; then
        log_error "Scenario name required"
        usage
    fi

    cd "$REPO_ROOT"

    log_info "EduTutor.AI Load Test Runner"
    log_info "Scenario: ${SCENARIO}"
    log_info "BASE_URL: ${BASE_URL}"
    echo ""

    # Step 1: Validation
    log_info "── Phase 1: Validation ──"
    validate_scenario "$SCENARIO"
    validate_prerequisites
    validate_backend
    echo ""

    # Step 2: Setup
    log_info "── Phase 2: Setup ──"
    setup_output_dir
    echo ""

    if $DRY_RUN; then
        log_info "DRY RUN — validation complete, skipping execution"
        log_info "Would run: k6 run --env BASE_URL=${BASE_URL} ${SCENARIO_DIR_BASE}/${SCENARIO}.js"
        log_info "Would output to: ${OUTPUT_BASE}/${SCENARIO}/"
        exit 0
    fi

    # Step 3: Pre-test capture
    capture_pre_test
    echo ""

    # Step 4: Launch watchers + k6
    launch_watchers
    echo ""

    run_k6
    echo ""

    # Step 5: Post-test capture (before cleanup kills watchers)
    capture_post_test
    echo ""

    # Step 6: Cleanup watchers
    log_info "── Stopping watchers ──"
    for pid in "${WATCHER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null && log_info "Killed watcher PID ${pid}" || true
    done
    if [[ -f "${PID_FILE}" ]]; then
        while IFS= read -r pid; do
            [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
        done < "$PID_FILE"
    fi
    # Wait a moment for files to flush
    sleep 1 2>/dev/null || true
    log_ok "All watchers stopped"
    echo ""

    # Step 7: Summary
    print_summary
}

main "$@"
