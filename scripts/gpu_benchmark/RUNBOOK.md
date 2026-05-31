# Phase C GPU Benchmark — Operator Runbook

**Goal:** Empirically measure T1 (RTX 4060 Ti), T3 (A100 40 GB), T4 (A100 80 GB) so the GPU Decision Matrix has measured numbers across all 5 tiers (T0 + T2 already done).

**Budget:** ~$9.30 USD on vast.ai (hard cap $12 enforced by `launch_tier.sh`).
**Total wall time:** 3-6 h depending on offer availability.
**Prerequisite:** Working `vastai` CLI + `VAST_API_KEY`.

---

## 1. Pre-flight (one-time setup, ~10 min)

```bash
# Working Python 3.11+ vastai install (current Python 3.9 on this Mac is broken)
brew install python@3.11
python3.11 -m pip install vastai jq

# Get API key from https://cloud.vast.ai/account/  (CLI sets it locally)
export VAST_API_KEY='your-key-here'
vastai set api-key "$VAST_API_KEY"

# Verify
vastai show user 2>&1 | grep email     # should show your vast.ai login
```

If `vastai` ImportError on Python 3.9 (seen on this host):

```bash
# Force Python 3.11 vastai binary:
python3.11 -m vastai search offers 'gpu_name=RTX_4090' --limit 1
# Or pin pip path explicitly:
PATH="$HOME/Library/Python/3.11/bin:$PATH" vastai show user
```

---

## 2. Cost guardrails (mandatory)

Before any launch, check the cumulative cost log:

```bash
cat docs/load_tests_v5/cross_gpu/cost_log.md
# If empty / first run: budget $9.30 fresh
# If $X already spent: budget $9.30 - X
```

`launch_tier.sh` auto-aborts at `COST_HARD_CAP=$12` cumulative. To override (NOT recommended):

```bash
COST_HARD_CAP=15 ./scripts/gpu_benchmark/launch_tier.sh t3
```

---

## 3. Per-tier launch (3 h each, sequential)

### 3.1 T1 — RTX 4060 Ti 16 GB (~$0.60 expected)

```bash
# Dry-run first — prints plan, picks offer, exits before creating instance
DRY_RUN=1 ./scripts/gpu_benchmark/launch_tier.sh t1

# If offer + price look right, launch for real:
./scripts/gpu_benchmark/launch_tier.sh t1 3
```

**What this does (automated):**
1. Searches vast.ai for `gpu_name=RTX_4060_Ti reliability>0.95 dph_total<=$0.30`, picks cheapest.
2. Creates Ubuntu 22.04 + CUDA 12.5 instance with `vastai_startup_t1.sh` as `--onstart-cmd`.
3. Polls every 10 s for `status=running` + onstart log finishing.
4. SCP-uploads `scripts/gpu_benchmark/` + `tests/k6/` + `test-files/test.wav`.
5. SSH-executes `setup_and_run.sh` with `TIER=t1`.
6. Streams remote stdout to `docs/load_tests_v5/cross_gpu/t1-run.log`.
7. SCP-downloads `results/` → `docs/load_tests_v5/cross_gpu/t1-rtx-4060-ti/`.
8. `vastai destroy instance` (always, via bash `trap`).
9. Appends to `docs/load_tests_v5/cross_gpu/cost_log.md`.

**Expected output structure:**

```
docs/load_tests_v5/cross_gpu/t1-rtx-4060-ti/
├── llm_bench.json
├── load_tests/
│   ├── s1-smoke/
│   ├── s2-rampup/
│   ├── s3-spike/
│   └── s4-endurance/   (1 h, time-permitting)
├── hw_info.txt
└── instance_metadata.json
```

### 3.2 T3 — A100 40 GB (~$3.00 expected)

```bash
./scripts/gpu_benchmark/launch_tier.sh t3 3
```

T3 pulls 3 LLM models (7b + 14b + **32b**, ~30 GB). Onstart bootstrap takes ~10 min longer than T1.

### 3.3 T4 — A100 80 GB (~$4.50 expected)

```bash
./scripts/gpu_benchmark/launch_tier.sh t4 3
```

T4 same as T3 except 80 GB VRAM headroom. Does NOT pull qwen2.5:72b (145 GB GGUF, disk-bound, not relevant for Output 3 grant).

### 3.4 T2 — RTX 4090 24 GB k6 scenarios (~$1.20 expected)

T2 LLM bench is already done. The remaining piece is the full k6 scenario suite (S1-S6) on RTX 4090 to populate `docs/load_tests_v5/cross_gpu/t2-rtx-4090/load_tests/`.

```bash
./scripts/gpu_benchmark/launch_tier.sh t2 3
```

This re-runs T2 with `setup_and_run.sh TIER=t2 K6_SCENARIOS="s1 s2 s3 s4 s5 s6"`, which is wider than the original LLM-only T2 bench.

---

## 4. Post-run integration (~20 min)

After each tier completes successfully:

```bash
# 1. Verify results exist
ls -la docs/load_tests_v5/cross_gpu/${tier}-*/

# 2. Read LLM bench JSON
jq '.summary' docs/load_tests_v5/cross_gpu/${tier}-*/llm_bench.json

# 3. Update GPU Decision Matrix with measured numbers
$EDITOR docs/load_tests_v5/GPU_DECISION_MATRIX.md
# Replace "🟡 Projected" entries with "✅ Measured" + paste real tok/s + p95 latency

# 4. Update cross_gpu/REPORT.md to add tier section
$EDITOR docs/load_tests_v5/cross_gpu/REPORT.md

# 5. Commit
git add docs/load_tests_v5/
git commit -m "test(load): Phase C ${tier} benchmark — measured GPU Decision Matrix entry"
```

---

## 5. Failure recovery

### Instance won't start

- Symptom: `Instance status="exited"` within 1 min of create.
- Cause: offer was over-subscribed, disk image too large, or onstart-cmd crashed.
- Fix: try next offer manually:
  ```bash
  vastai search offers 'gpu_name=RTX_4090 reliability>0.95' --limit 5 --raw | jq '.[] | {id, dph_total, machine_id}'
  # Pick a different offer_id, launch manually:
  vastai create instance <other_id> --image nvidia/cuda:12.5.0-runtime-ubuntu22.04 --disk 30 --onstart-cmd "$(cat scripts/gpu_benchmark/vastai_startup_t1.sh)"
  ```

### SSH proxy intermittent (seen on T2 in cross_gpu/REPORT.md)

- Symptom: `ssh_exchange_identification: Connection closed`.
- Fix: retry SSH for 5 min. Vast.ai proxy stabilizes after ~3 min in our experience.
  ```bash
  for i in $(seq 1 20); do
    ssh -o ConnectTimeout=10 "$SSH_CONN" "echo OK" && break
    sleep 15
  done
  ```

### SSH proxy port-forwarding conflict (T1 attempt 2026-05-15)

- Symptom: persistent `Connection closed by <ip> port <N>`, no SSH success after 5+ min retry.
- Diagnostic: `vastai logs <instance_id>` shows:
  ```
  Error: remote port forwarding failed for listen port <N>
  ```
- Cause: vast.ai proxy at `sshN.vast.ai:<port>` cannot bind reverse-tunnel listen socket. Another tenant or stale TCP socket held it. This is **vast.ai infrastructure flake** — not a script bug.
- Mitigation (in order of impact):
  1. `vastai destroy instance <id>` → relaunch with **different host** (filter `machine_id!=<failing>`).
  2. Use vast.ai web console for first-touch provisioning (more reliable proxy management than CLI).
  3. Switch provider: RunPod / Lambda Labs (no proxy, direct SSH; +$0.05-0.15/h cost).
  4. Try direct IP `machine_dir_ssh_port` field if instance was provisioned with direct SSH (most aren't by default).
- Cost impact: documented attempt 2026-05-15 cost $0.06 before destroy (30 min idle billing during failed connection).
- See full failure analysis: [`docs/load_tests_v5/cross_gpu/cost_log.md`](../../docs/load_tests_v5/cross_gpu/cost_log.md#2026-05-15t210000z--t1-attempt-1-manual).

### Onstart-cmd silently fails

- Symptom: instance "running" but `setup_and_run.sh` errors on missing `nvidia-smi` or `ollama`.
- Cause: vast.ai dropped the onstart-cmd output. Re-run manually:
  ```bash
  ssh "$SSH_CONN" "bash /root/gpu_benchmark/vastai_startup_t${tier}.sh"
  ```

### Cost runaway

- Symptom: `cost_log.md` shows $11+ spent before all tiers done.
- Fix: skip remaining tiers, document partial coverage in REPORT.md:
  ```bash
  # In GPU_DECISION_MATRIX.md, mark unmeasured tiers as:
  #   "⏳ Pending — budget exhausted at \$$X.XX, deferred to next cycle"
  ```

### Forgot to destroy instance

- Symptom: vast.ai dashboard shows running instance after script exit.
- Fix: manual destroy
  ```bash
  vastai show instances --raw | jq '.[] | {id, label, gpu_name, dph_total}'
  vastai destroy instance <leaked_instance_id>
  ```

`launch_tier.sh` uses `trap cleanup EXIT` so this should be rare, but verify in dashboard after each tier.

---

## 6. Complete the run (final sign-off)

When T1, T2 k6, T3, T4 all finished:

1. **Verify no live instances:** `vastai show instances` should return empty list.
2. **Final cost tally:** `cat docs/load_tests_v5/cross_gpu/cost_log.md | tail -20`. Must be ≤ $12.
3. **Update GPU Decision Matrix:** all 5 tiers should now have ✅ Measured status.
4. **Cross-link:** add reference from `EduTutor_AI_Technicka_Dokumentacia_final_v0.1.md` §21 to new tier entries in `GPU_DECISION_MATRIX.md`.
5. **Commit + push:** `git commit -am "test(load): Phase C complete — all 5 GPU tiers measured"` then `git push origin main`.

---

## 7. Why not just use AWS / GCP?

Vast.ai chosen for Output 3 because:
- **Price:** $0.20 RTX 4060 Ti, $1.00 A100 vs $1.50+/$3.00+ on hyperscalers.
- **No commit:** spin up, run, destroy per session — total cost <$15 budget.
- **GPU diversity:** AWS has limited consumer GPU options (no RTX 4060 Ti).
- **Reproducibility:** offers are stable enough that same `launch_tier.sh` reruns produce comparable hardware over weeks.

Trade-off:
- SSH proxy occasional flakiness (see §5).
- Disk persistence not guaranteed across reboots (use `--disk` adequately).
- No SLA — for production use, switch to managed cloud after grant phase.

---

**Author:** Sisyphus Ultraworker, post-Phase-B handoff
**Audience:** Project lead with VAST_API_KEY in hand, ~2-3 h focused execution window
**Status of this runbook:** validated against existing T2 evidence in [`docs/load_tests_v5/cross_gpu/t2-rtx-4090/`](../docs/load_tests_v5/cross_gpu/t2-rtx-4090/) — same flow that produced those measurements
