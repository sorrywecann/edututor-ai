# EduTutor.AI → sorrywecann/edututor-ai — MASTER MIGRATION PLAN

**Status:** Ready for user review · 2 workflows · 14 agents · 269 commits to clean · 132 file operations

---

## TL;DR

Migrate EduTutor.AI from the private development repo (sorrywecann/edututor-ai at <repo-root>/edututor-ai-sandbox-test) to the clean public OSS repo sorrywecann/edututor-ai as v1.0.0. The plan is 9 phases, fully reversible until the final force-push, and uses a **fresh-repo + cherry-picked tree** strategy rather than git-filter-repo. Rationale: 92.8% of 251 main-branch commits carry "Co-Authored-By: Claude" trailers, internal grant docs and AI-handoff briefs are interleaved with shippable code, and the directory layout itself needs restructuring (monorepo flattening, core/→apps/web, tutor-service/→apps/api, desktop/→apps/desktop, scattered configs into infra/). Filter-repo would preserve a noisy DAG that still needs to be re-organized; a fresh squashed root commit produces a credible OSS history starting at v1.0.0, lets us re-create a clean architecture in the first commit, and eliminates 11 stale Dependabot branches plus 14 dead feature branches in one move. Internal artifacts (audits/, plans/, output3/, superpowers/, SESSION-HANDOFF*.md, V2.x_*.md, audit_run.py, build_docs_*.py, grant deliverable PDFs/HTML) are dropped entirely. Anthropic SDK integration stays (legitimate multi-provider LLM code), but the literal Claude model string `claude-haiku-4-5-20251001` is replaced with an opaque alias and CLAUDE_MODEL env var is renamed to ANTHROPIC_MODEL. New documentation set: README.md (rewritten, no grant attribution), AGENTS.md (provider-neutral AI agent guidelines extracted from CLAUDE.md invariants), DESIGN.md (extracted Living Room design system), ARCHITECTURE.md (apps/packages/infra map), CONTRIBUTING.md (cleaned, no /edu-pre-pr), SECURITY.md (GitHub Security Advisory contact), CHANGELOG.md (fresh v1.0.0 entry). Estimated end-to-end: 14-20 working hours over 3-4 calendar days, with hard checkpoints between every phase so the user can abort cleanly.

---

## Strategy: Fresh repo, single root commit at v1.0.0

**Recommended:** Strategy C (Fresh Repo, Single Root Commit at v1.0.0)

**Rationale:** The git-history audit found 233 of 251 main-branch commits carry Co-Authored-By: Claude trailers (92.8% pollution). All 14 feature branches share that common ancestry. The directory layout itself must be rewritten (core→apps/web, tutor-service→apps/api, desktop→apps/desktop, scattered infra into infra/). A git-filter-repo strategy would preserve a 251-commit DAG that still references the wrong file paths and pre-restructure conventions — useless archaeology. Strategy A (squash all) and Strategy C (fresh repo) produce identical end states; Strategy C is cleaner because it eliminates orphaned objects, blob references to deleted Slovak PDFs, and dependency lockfiles from old releases. Strategy D (hybrid: keep last 18 'clean' post-v0.7.7 commits + squash older) is tempting but those 18 commits

**Alternatives considered:**
- Strategy B (git-filter-repo --replace-text Co-Authored-By): Preserves 251 commits but leaves pre-restructure paths and inline Anthropic refs. Rejected because the tree itself needs restructuring — pre
- Strategy A (Squash all on current main without restructure): Produces a single clean commit but locks in the messy monorepo layout. Rejected for the same reason as B — no architectural cleanup.
- Strategy D (Hybrid: keep last 18 clean commits, squash older): Audit confirmed all recent commits still carry Claude attribution (v0.8.3, v0.8.2, v0.8.1, v0.8.0). No clean tail exists to preserve.

---

## Phases (enhanced with verification per WF2 review)

Per-phase: goal · steps · verification commands · rollback. Each phase is independently revertible until Phase 7 (point of no return).

### Phase 0: Phase 0 - Pre-flight & Staging Worktree
**Goal:** Create an isolated staging worktree with no risk to live working repo. Capture tagged snapshot and document baseline metrics so every later phase is reversible against a known-good reference.
**Estimated:** 1 hr

**Steps:**
- 0.1 In edututor-ai-sandbox-test: capture pre-migration commit SHA: git rev-parse HEAD > <repo-root>/edututor-ai-sandbox-pre-migration-sha.txt. Preserve this file - canonical rollback reference.
- 0.2 Tag snapshot: git tag pre-public-migration-snapshot-$(Get-Date -Format yyyyMMdd) && git push origin --tags. Verify tag visible on GitHub.
- 0.3 Verify main is pushed: cd edututor-ai-test && git status && git push origin main. Expect clean working tree.
- 0.4 Pre-flight grep (BLOCKER GATE per GO 4): grep -rE 'Start-EduTutor|Stop-EduTutor|Start-Stack-Persistent|Stop-Stack-Persistent' . --include='*.json' --include='*.yml' --include='*.md' --include='*.mjs' - expect zero matches in production code. Update any hits BEFORE proceeding.
- 0.5 Capture baseline test counts: cd tutor-service && python -m pytest tests/ --collect-only -q > <repo-root>/edututor-ai-sandbox-baseline-tests.txt && python -m pytest tests/ -q >> <repo-root>/edututor-ai-sandbox-baseline-tests.txt. Document exact pass/fail/skip numbers.
- 0.6 Capture baseline frontend: cd core && pnpm install && pnpm build > <repo-root>/edututor-ai-sandbox-baseline-web.txt 2>&1.
- 0.7 Create the migration staging directory: mkdir <repo-root>/edututor-ai-staging.
- 0.8 Initialize empty staging repo: cd <repo-root>/edututor-ai-staging && git init -b main.
- 0.9 Configure local git identity in staging (per BLOCKER 1 user decision): git config user.name '<maintainer-name>' && git config user.email '<maintainer-email>'. Do NOT rely on global config.
- 0.10 Copy current working tree (NOT .git) using robocopy: robocopy <repo-root>/edututor-ai-sandbox-test <repo-root>/edututor-ai-staging /MIR /XD .git node_modules .next .venv dist build .workspace .stack-pids.json .opencode .claude .dev .sisyphus resources /XF .env *.pyc .DS_Store *.log. Confirm exit code <= 7.
- 0.11 Sanity diff: Compare-Object (Get-ChildItem <repo-root>/edututor-ai-sandbox-test -Recurse | Select FullName) (Get-ChildItem <repo-root>/edututor-ai-staging -Recurse | Select FullName) | Out-File <repo-root>/staging-diff.txt. Manually review.
- 0.12 Install pre-commit hook: write .git/hooks/pre-commit script that greps staged content for: Claude, Anthropic Claude, Co-Authored-By: Claude, claude-haiku, claude-sonnet, claude-opus, noreply@anthropic.com, princeofwellness, SORRYWECAN s.r.o, 09I05-03-V04-00072, /edu-pre-pr, OpenCode. Reject commit if any match. Stays active through Phase 7.
- 0.13 CRITICAL: Smoke-test the pre-commit hook: create dummy file with content 'claude-haiku-4-5', attempt commit, confirm BLOCKED. Clean up dummy file. If hook fails to block, fix it before any further work.
- 0.14 CHECKPOINT with user: confirm staging tree mirrors source minus ignored paths, baseline test counts documented, pre-commit hook verified working.

**Verification (must pass before next phase):**
- `Test-Path <repo-root>/edututor-ai-sandbox-pre-migration-sha.txt -> True (rollback reference exists)`
- `git -C <repo-root>/edututor-ai-sandbox-test tag -l 'pre-public-migration-snapshot-*' -> shows today's tag`
- `git -C <repo-root>/edututor-ai-sandbox-test status -> clean working tree`
- `Baseline file shows expected 523 passed, 8 skipped (or document deviation)`
- `Test-Path <repo-root>/edututor-ai-staging/.git/hooks/pre-commit -> True`
- `Pre-commit hook smoke test BLOCKED a commit containing claude-haiku-4-5`

**Rollback:** Phase 0 is fully non-destructive to live repo. Rollback = Remove-Item -Recurse -Force <repo-root>/edututor-ai-staging and optionally git tag -d the snapshot tag.

**Blocker questions:**
- All 10 blockers from blockers_to_resolve_first answered?

---

### Phase 1: Phase 1 - Internal Artifact Purge (DELETE)
**Goal:** Remove every internal-only file before any restructuring. SEQUENCING FIX from adversarial review: DO NOT delete CLAUDE.md yet - it stays as source-of-truth until Phase 5 creates AGENTS.md.
**Estimated:** 1.5 hr

**Steps:**
- 1.1 SEQUENCING FIX: Do NOT delete CLAUDE.md or CONTEXT.md in this phase. They remain as source-of-truth for Phase 5 AGENTS.md/ARCHITECTURE.md authoring. Deletion deferred to Phase 5.13.
- 1.2 Delete root grant deliverables: EduTutor_AI_Technicka_Dokumentacia_final_v0.1.md, _v1.0_FINAL.md (the _v1.1_FINAL.md is RENAMED in Phase 5), EduTutor_v1.1_FINAL_Deliverable.html, EduTutor_v1.1_FINAL_Deliverable.pdf.
- 1.3 Delete root build/audit scripts: audit_run.py, build_docs_html_v11.py, build_v11_deliverable.py.
- 1.4 Delete root brand artifacts (if not referenced by README hero image): consolidated-landing.png, consolidated-onepager.png.
- 1.5 Delete 12 root one-off launchers (verified non-referenced per GO 4): Start-EduTutor-Avatar.ps1, Start-EduTutor-Web.ps1, Start-EduTutor-Dev.{ps1,bat}, Stop-EduTutor-Dev.{ps1,bat}, Start-EduTutor.{bat,command}, Stop-EduTutor.{bat,command}, Start-Stack-Persistent.ps1, Stop-Stack-Persistent.ps1, start.bat, start.sh.
- 1.6 Delete credentials.json.example (stale; .env.example covers all secrets).
- 1.7 If BLOCKER 6 = DELETE: delete livekit.yaml.
- 1.8 Delete docs/ internal artifacts: AUDIT.md, AUDIT_TECH_PIVOTY.md, V2.1_AUDIT_REPORT.md, V2.2_CODE_CHANGE_BRIEF.md, SESSION-HANDOFF.md, SESSION-HANDOFF-v0.7.0.md, v071-live-diag.txt, W3-cleanup-targets.md, W7-security-recon.md, MASTER_PLAN.md, STATE_OF_PROJECT.md, PLAN_v0.7.8_onboarding_card_swap.md, DEV-BLUEPRINT-CHANGES.md, FINAL_TESTING_CHECKLIST.md.
- 1.9 Spot-check before deleting (LOW-severity adversarial concern): Read first 50 lines of docs/V2.2_CODE_CHANGE_BRIEF.md, docs/output3/open-source-release.md, and one file from docs/audits/. Confirm internal-only. If doubt, move to private archive instead of deleting.
- 1.10 Delete docs/ AI handoff briefs: avatar-emotion-blueprint-handoff.md, avatar-pipeline-handoff.md, exe-bundle-handoff.md, team-rebrief-2026-05-16.md, frontend-arkit-brief.md, frontend-arkit-brief.html, slovak-viseme-recording-brief.md, backend-broadcast-sample.md, design-atmosphere-rebuild.md.
- 1.11 Delete docs/ entire internal subtrees: audits/, plans/, output/, output3/, superpowers/, evidence/, archive/.
- 1.12 Delete docs/ versioned Slovak HTML deliverables: TECHNICKA_DOKUMENTACIA.html, EduTutor_AI_Technicka_Dokumentacia_v2.html, _v2.1.html, architecture.html, avatar-debug.html.
- 1.13 Delete docs/ benchmark JSON dumps and helper scripts: benchmark_raw_data.json, benchmark_results.json, fingerprint-machine.ps1, clean-uninstall.ps1, install-v0.6.2.ps1, install.ps1, monitor.ps1.
- 1.14 Delete docs/lipsync_codepath_audit.md (review for public value first; if useful, RENAME in Phase 5 instead).
- 1.15 Delete .github/ISSUE_TEMPLATE/agent_task.md (mentions Cursor/Claude Code/OpenCode by name).
- 1.16 Stage all deletions and create a temporary commit for diff visibility: git add -A && git commit -m 'chore: strip internal artifacts'. (Squashed in Phase 7.)

**Verification (must pass before next phase):**
- `Test-Path docs/V2.2_CODE_CHANGE_BRIEF.md -> False`
- `Test-Path audit_run.py -> False`
- `Test-Path docs/audits -> False`
- `CLAUDE.md and CONTEXT.md STILL EXIST: Test-Path CLAUDE.md -> True`
- `git log --oneline shows the 'chore: strip internal artifacts' commit`
- `cd tutor-service && python -m pytest tests/ -q still shows 523 passed, 8 skipped`

**Rollback:** git reset --hard HEAD~1 undoes Phase 1 commit. Or Remove-Item -Recurse -Force <repo-root>/edututor-ai-staging and re-run Phase 0.

---

### Phase 2: Phase 2 - Source Code Sanitization (REDACT in place)
**Goal:** Scrub remaining Claude/AI traces from code that ships. Anthropic SDK stays; literal model fingerprint and CLAUDE_MODEL alias do not. ADVERSARIAL FIX: health.py line 16 is updated alongside llm_service.py.
**Estimated:** 1.5 hr

**Steps:**
- 2.1 ADVERSARIAL FIX - Rename env var CLAUDE_MODEL -> ANTHROPIC_MODEL in THREE locations (health.py was previously missed): (a) tutor-service/app/api/health.py:16 - change MODEL_ID = os.getenv('CLAUDE_MODEL', 'claude-haiku-4-5-20251001') to MODEL_ID = os.getenv('ANTHROPIC_MODEL', 'anthropic-default'); (b) .env.example - update or remove CLAUDE_MODEL line; (c) any internal .env files in staging.
- 2.2 Replace hardcoded model string 'claude-haiku-4-5-20251001' with neutral alias 'anthropic-default' in TWO places: tutor-service/app/services/llm_service.py:590 and :617.
- 2.3 Verify all hardcoded Claude model strings are gone: grep -rn 'claude-haiku|claude-sonnet|claude-opus' tutor-service/app/ --include='*.py' - expect zero matches.
- 2.4 Add backward-compat shim (optional per master plan risk matrix): in llm_service.py, before reading ANTHROPIC_MODEL, fall back to CLAUDE_MODEL with deprecation warning. Remove alias in v1.1.0 per CHANGELOG.
- 2.5 Audit .env.example: confirm no real keys, replace any sk-* placeholder with 'sk-REPLACE_ME'.
- 2.6 Audit tutor-service tests for inline Claude refs: read test_api.py, test_chat_dependency_injection.py, test_chat_rag.py - KEEP 'anthropic' in provider assertion lists, remove any docstring/comment referencing Claude versions.
- 2.7 Grep entire staging tree for residual strings: grep -rE 'claude-haiku|claude-sonnet|claude-opus|Co-Authored-By|OpenCode|/edu-pre-pr|Cursor|Devin|Aider|noreply@anthropic.com|princeofwellness|SORRYWECAN s\.r\.o\.|09I05-03-V04-00072' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv - each hit triaged.
- 2.8 Verify pre-commit hook accepts the sanitized state: git add -A && git commit -m 'chore: sanitize source - rename env vars and neutralize model strings'.
- 2.9 PASS GATE - Run full backend test suite: cd tutor-service && python -m pytest tests/ -q. Expect: 523 passed, 8 skipped (within +/- 2 of baseline).
- 2.10 Manual health.py smoke test: cd tutor-service && python -c 'from app.api.health import MODEL_ID; print(MODEL_ID)' - expect 'anthropic-default'.

**Verification (must pass before next phase):**
- `grep -rn 'CLAUDE_MODEL' tutor-service/app/ .env.example -> zero matches`
- `grep -rn 'claude-haiku-4-5|claude-sonnet|claude-opus' tutor-service/app/ -> zero matches`
- `cd tutor-service && python -m pytest tests/ -q -> 523 passed, 8 skipped`
- `python -c 'from app.api.health import MODEL_ID; print(MODEL_ID)' -> prints 'anthropic-default'`
- `git log --oneline shows 'chore: sanitize source' commit`

**Rollback:** git reset --hard HEAD~1 undoes Phase 2 commit. Re-run from Phase 0 if multi-phase corruption.

---

### Phase 3: Phase 3 - Directory Restructure (RENAME/MOVE)
**Goal:** Reorganize into monorepo: /apps, /packages, /infra, /docs, /scripts, /tests. ADVERSARIAL FIX: this phase has the most hidden path dependencies - 29 references found across config/CI/docs that MUST be updated atomically with the moves.
**Estimated:** 4 hr

**Steps:**
- 3.1 Create top-level dirs: New-Item -ItemType Directory apps, packages, infra/compose, infra/platforms/railway, infra/platforms/render, infra/platforms/vercel, infra/monitoring, infra/nginx, infra/systemd, scripts/dev, scripts/infra, tests/e2e, tests/load, tests/fixtures, tests/integration.
- 3.2 git mv core/ apps/web/ (Next.js frontend). Update apps/web/package.json name field to '@edututor/web'.
- 3.3 git mv tutor-service/ apps/api/ (FastAPI backend).
- 3.4 git mv desktop/ apps/desktop/ (Electron orchestrator).
- 3.5 ADVERSARIAL FIX (HIGH - desktop/stage-resources.mjs): Update apps/desktop/scripts/stage-resources.mjs - replace join(REPO, 'tutor-service') with join(REPO, 'apps', 'api') on line 94 (and any other hardcoded 'tutor-service' strings). Verify: grep -n 'tutor-service' apps/desktop/scripts/stage-resources.mjs -> zero matches.
- 3.6 ADVERSARIAL FIX (HIGH - apps/desktop/main.mjs UE5_RELEASE_REPO): Update apps/desktop/main.mjs and orchestrator.mjs - replace 'sorrywecann/edututor-ai-releases' with 'sorrywecann/edututor-ai' in UE5_RELEASE_REPO constant. Verify: grep -rn 'princeofwellness|edututor-ai-sandbox-releases' apps/desktop/ -> zero matches.
- 3.7 ADVERSARIAL FIX (BLOCKER - .devcontainer/devcontainer.json): line 25 postCreateCommand: 'tutor-service' -> 'apps/api'; line 41 python.defaultInterpreterPath: 'apps/api/venv/bin/python'; line 43 pytestArgs: 'apps/api/tests'.
- 3.8 ADVERSARIAL FIX (BLOCKER - .github/workflows/): ci.yml line 31 working-directory: 'apps/api'; line 46 cache-dependency-path: 'apps/api/requirements.txt'. release.yml line 57 context: './apps/api'; line 58 dockerfile: './apps/api/Dockerfile'. dependabot.yml directory: '/apps/api'.
- 3.9 ADVERSARIAL FIX (MEDIUM - .github/pull_request_template.md): line 30 'cd tutor-service' -> 'cd apps/api'; line 34 (/edu-ue5-check) replace with docs/ue5-avatar-contract.md reference.
- 3.10 ADVERSARIAL FIX (HIGH - docker-compose files): infra/compose/docker-compose*.yml: rename service tutor-service -> api; rename service core -> web; update build context ./tutor-service -> ./apps/api; ./core -> ./apps/web; API_PROXY_TARGET http://tutor-service:8000 -> http://api:8000; depends_on: tutor-service -> depends_on: api.
- 3.11 ADVERSARIAL FIX (MEDIUM - user-facing error message): apps/web/src/hooks/useKnowledgePage.ts line 747 - Slovak error message: replace 'tutor-service' reference with generic 'backendovej sluzby' wording.
- 3.12 git mv docker-compose.yml docker-compose.prod.yml docker-compose.release.yml -> infra/compose/.
- 3.13 git mv railway.backend.toml railway.frontend.toml -> infra/platforms/railway/; render.yaml -> infra/platforms/render/; vercel.json -> infra/platforms/vercel/.
- 3.14 Review railway.backend.toml and render.yaml for hardcoded 'tutor-service' service names or paths './tutor-service' - update to 'api' or './apps/api' as needed.
- 3.15 git mv monitoring/prometheus.yml -> infra/monitoring/; nginx/nginx.conf -> infra/nginx/; deploy/ -> infra/systemd/.
- 3.16 ADVERSARIAL CLARIFICATION (test layout): App-local tests STAY at apps/api/tests/ (not moved to shared tests/). Only move: git mv tests/k6 -> tests/load/k6; git mv test-files/golden_dataset -> tests/fixtures/golden_dataset; git mv apps/web/e2e -> tests/e2e/web. apps/api/tests/ remains in place.
- 3.17 Create root pnpm-workspace.yaml: packages: ['apps/*', 'packages/*'].
- 3.18 Create stub packages/ subdirs: packages/atmosphere|api-client|types|utils/package.json - empty {"name":"@edututor/<name>","version":"0.0.0","private":true}.
- 3.19 Create/update root package.json with workspaces field and scripts: dev/build/test/lint that fan out via pnpm -r.
- 3.20 Move .env.example: keep root as union/master, create apps/api/.env.example, apps/web/.env.example, apps/desktop/.env.example per-app.
- 3.21 Comprehensive grep sweep: grep -rn 'tutor-service|\./core' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=apps --exclude='*.lock' --exclude='CHANGELOG.md' - expect zero matches. CHANGELOG historical entries are exempted.
- 3.22 PASS GATE - Verify build for both apps: pnpm install && pnpm -r build (web + desktop). Then cd apps/api && pip install -r requirements.txt && python -m pytest tests/ -q -> 523 passed, 8 skipped.
- 3.23 PASS GATE - Verify Electron bundle dry-run path resolution: cd apps/desktop && pnpm run stage-resources. Expect 'backend python final file count: N' message and smoke import test passes.
- 3.24 Stage everything and commit: git add -A && git commit -m 'chore: restructure into monorepo layout'.

**Verification (must pass before next phase):**
- `Test-Path apps/web && apps/api && apps/desktop && infra/compose && packages/atmosphere -> all True`
- `Test-Path core -> False; tutor-service -> False; desktop -> False (only apps/desktop)`
- `grep -rn 'tutor-service|\./core' . --exclude-dir=node_modules --exclude-dir=.git --exclude=CHANGELOG.md -> zero matches`
- `grep -rn 'princeofwellness|edututor-ai-sandbox-releases' apps/desktop/ -> zero matches`
- `cd apps/api && python -m pytest tests/ -q -> 523 passed, 8 skipped`
- `pnpm install && pnpm -r build -> exits 0`
- `cd apps/desktop && pnpm run stage-resources -> 'backend python final file count' message appears`
- `cat .devcontainer/devcontainer.json | grep -i 'apps/api' -> shows updated paths`
- `cat .github/workflows/ci.yml | grep 'working-directory' -> shows 'apps/api'`

**Rollback:** Per-step rollback via git reset --hard HEAD~1. If multiple steps corrupted: Remove-Item -Recurse -Force <repo-root>/edututor-ai-staging and re-run Phase 0 robocopy + Phase 1. NEVER touch <repo-root>/edututor-ai-sandbox-test directly.

**Blocker questions:**
- If pnpm -r build fails, is it a path issue (fix and retry) or a code regression (rollback to Phase 2)?

---

### Phase 4: Phase 4 - Launcher & Script Consolidation
**Goal:** Replace 12 deleted root-level Start/Stop scripts with two cross-platform entry points and a unified scripts/ tree. ADVERSARIAL FIX: scripts must use POST-restructure paths (apps/api, apps/web).
**Estimated:** 2 hr

**Steps:**
- 4.1 Create scripts/dev/start.ps1 with subcommands: dev, web, api, avatar, stack. All paths reference POST-restructure layout: cd apps/api && python run_dev.py, cd apps/web && pnpm dev. NO references to old tutor-service/ or core/ directories.
- 4.2 Create scripts/dev/start.sh as macOS/Linux equivalent (same subcommands, same path references).
- 4.3 Create scripts/dev/stop.ps1 and stop.sh that kill tracked PIDs from .cache/stack-pids.json (relocated from root, now gitignored).
- 4.4 Add root Makefile with targets: dev, build, test, lint, deploy. Each target delegates to scripts/dev/ entry points (e.g., dev: pwsh scripts/dev/start.ps1 dev).
- 4.5 Update root README.md install/run sections to reference make dev or pwsh scripts/dev/start.ps1 dev. Do NOT reference deleted Start-EduTutor*.ps1.
- 4.6 Verify scripts have no hardcoded old paths: grep -E 'tutor-service|\./core' scripts/dev/*.ps1 scripts/dev/*.sh -> zero matches.
- 4.7 PASS GATE - End-to-end test on Windows: pwsh scripts/dev/start.ps1 dev -> backend on :8000, frontend on :3000 both up within 60 seconds.
- 4.8 PASS GATE - End-to-end stop: pwsh scripts/dev/stop.ps1 -> both ports release within 10 seconds.
- 4.9 Commit: git add -A && git commit -m 'feat: consolidate launchers into scripts/dev'.

**Verification (must pass before next phase):**
- `Test-Path scripts/dev/start.ps1 && start.sh && stop.ps1 && stop.sh && Makefile -> all True`
- `grep -E 'tutor-service|\./core' scripts/ -> zero matches`
- `pwsh scripts/dev/start.ps1 dev -> within 60s curl http://localhost:8000/api/health returns 200 JSON; curl http://localhost:3000 returns 200 HTML`
- `pwsh scripts/dev/stop.ps1 -> within 10s ports 3000 and 8000 are released`

**Rollback:** git reset --hard HEAD~1 undoes Phase 4 commit. Scripts are independent of code changes.

**Blocker questions:**
- Did stop.ps1 actually kill the processes (check Task Manager) or just remove PID file?

---

### Phase 5: Phase 5 - Documentation Creation + CLAUDE.md Deletion
**Goal:** Build the public docs set, redact keepers, AND delete CLAUDE.md/CONTEXT.md (deferred from Phase 1 per sequencing fix). After this phase, source-of-truth invariants live in AGENTS.md + ADRs.
**Estimated:** 6 hr

**Steps:**
- 5.1 ADVERSARIAL VERIFY - ADR pre-requisites exist: Test-Path docs/adrs/001-asymmetric-DI.md && 002-dict-dispatch.md && 003-naiveneuron-attribution.md && 004-anonymous-by-default-identity.md && 005-ue5-protocol-v21.md -> ALL True. If any missing, author it BEFORE drafting AGENTS.md.
- 5.2 Rewrite README.md per master plan outline: remove grant attribution (line 8), SORRYWECAN footer (line 438), replace ALL sorrywecann/edututor-ai URLs with sorrywecann/edututor-ai. Add badges, quick start, features matrix, link to ARCHITECTURE.md.
- 5.3 Create AGENTS.md per master plan outline + adversarial additions: (a) sections 1-9 from outline; (b) section 4 expanded with 'When to extend vs create new' decision tree; (c) section 2 with estimated read time per doc and task-picking checklist; (d) section 7b 'Getting started' with platform-specific commands (.venv activation, pnpm install, pwsh scripts/dev/start.ps1 dev); (e) section 8 expanded to 6+ FAQs covering local testing, WebSocket debugging, failed test triage, adding routes, adding i18n keys, adding env vars.
- 5.4 Create DESIGN.md per master plan outline + adversarial additions: (a) sections 1-10 from outline; (b) section 2 structured CSS token list (--color-bg-primary etc.) + Atmosphere philosophy paragraph; (c) section 4 concrete Ceremony vs Work mapping table (route -> tier -> spacing token); (d) section 5 'Adding a new component' subsection + clarified GlassCard rule scope; (e) section 8 motion section rewritten SELF-CONTAINED (no ref to deleted ~/.claude/craft/); (f) section 9 names i18n framework with code example.
- 5.5 Create ARCHITECTURE.md per master plan outline + adversarial addition: section 2 includes Node/Python/Electron version table linking to .nvmrc, .python-version, package.json.
- 5.6 Rewrite CONTRIBUTING.md: delete /edu-pre-pr line (46), point to .github/pull_request_template.md. Add 'For AI coding agents' section -> AGENTS.md. Update all path examples: core/ -> apps/web/, tutor-service/ -> apps/api/. Include testing conventions and mocking strategies.
- 5.7 Rewrite SECURITY.md: replace security@sorrywecan.com with GitHub Security Advisory link (https://github.com/sorrywecann/edututor-ai/security/advisories/new).
- 5.8 Verify CODE_OF_CONDUCT.md is verbatim Contributor Covenant - KEEP as-is.
- 5.9 Create CHANGELOG.md fresh: entry 'v1.0.0 - Initial public release - Slovak AI language tutor with multi-provider LLM, voice, RAG, cross-session memory, optional UE5 MetaHuman avatar.' Add migration note: 'Users of v0.8.x from sorrywecann/edututor-ai-releases must download v1.0.0 manually.'
- 5.10 Update .github/pull_request_template.md: remove /edu-pre-pr (lines 2-3, 34), remove 'NO Claude / AI / attribution' (line 70), replace with 'Commit messages use imperative mood; no tool attribution.'
- 5.11 Create .github/ISSUE_TEMPLATE/bug_report.md and feature_request.md (generic, no agent-specific language).
- 5.12 RENAME and SANITIZE keepers: git mv docs/avatar-protocol-deep-dive.md docs/avatar-protocol.md then strip 'deep dive' tone. git mv EduTutor_AI_Technicka_Dokumentacia_v1.1_FINAL.md docs/TECHNICAL_DOCUMENTATION.md then SCRUB content: grep for SORRYWECAN, 09I05-03-V04-00072, princeofwellness, Priloha, APVV, Vystup, UE5 Engineer, Animation Engineer personal names - remove or genericize each hit.
- 5.13 SEQUENCING FIX (deferred from Phase 1): Now delete CLAUDE.md and CONTEXT.md. Verify: Test-Path CLAUDE.md -> False; Test-Path AGENTS.md -> True.
- 5.14 ADVERSARIAL FIX - CI/CD workflow audit: grep .github/workflows/ for (a) hardcoded paths to old layout - update to apps/api, apps/web, apps/desktop; (b) all secret references - note for Phase 8 to recreate; (c) internal service URLs, custom runners. grep -rE 'secrets\.' .github/workflows/ > workflow-secrets-inventory.txt.
- 5.15 Update .gitignore: add .workspace/, .cache/, **/SESSION-HANDOFF*.md, **/*-handoff.md, **/audits/, **/superpowers/, audit_run.py, resources/backend/.
- 5.16 Generate docs/THIRD_PARTY_LICENSES.md: cd apps/api && pip-licenses --format=markdown > ../../docs/THIRD_PARTY_LICENSES_python.md then cd apps/web && pnpm license-checker --markdown > ../../docs/THIRD_PARTY_LICENSES_node.md. Concatenate into single file.
- 5.17 Verify doc cross-links and content: grep 'ARCHITECTURE.md' README.md -> hit; grep 'AGENTS.md' README.md CONTRIBUTING.md -> hits; grep '001-asymmetric-DI|005-ue5-protocol-v21' AGENTS.md -> hits; grep 'apps/web/src/components/atmosphere' DESIGN.md -> hit; grep -iE 'SORRYWECAN|09I05-03-V04-00072|Vystup|UE5 Engineer/Animation Engineer' docs/TECHNICAL_DOCUMENTATION.md -> zero hits.
- 5.18 Commit: git add -A && git commit -m 'docs: create public documentation set (README, AGENTS, DESIGN, ARCHITECTURE, CHANGELOG)'.

**Verification (must pass before next phase):**
- `All required files exist: Test-Path README.md, LICENSE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, AGENTS.md, ARCHITECTURE.md, DESIGN.md, Makefile, package.json, pnpm-workspace.yaml`
- `CLAUDE.md and CONTEXT.md are DELETED: Test-Path CLAUDE.md -> False`
- `Doc cross-links verified (see step 5.17)`
- `TECHNICAL_DOCUMENTATION.md content scrubbed: grep -iE 'SORRYWECAN|09I05-03-V04-00072' docs/TECHNICAL_DOCUMENTATION.md -> zero hits`
- `All 5 ADRs exist: Get-ChildItem docs/adrs/00*.md -> 5 files`
- `docs/ contains ONLY public-facing content (no audits/, plans/, output3/, superpowers/, SESSION-HANDOFF*, *-handoff.md)`
- `THIRD_PARTY_LICENSES.md exists and contains Anthropic SDK attribution`

**Rollback:** Per-step rollback via git reset --hard HEAD~1. If docs corrupted: re-do Phase 5 only (Phases 1-4 stable). CLAUDE.md restoration: git checkout HEAD~N -- CLAUDE.md from earlier staging commit.

**Blocker questions:**
- Is docs/adrs/005-ue5-protocol-v21.md complete or does it need authoring?
- Is docs/avatar-protocol.md ready (renamed from deep-dive) and sanitized?

---

### Phase 6: Phase 6 - Verification Sweep (HARD CHECKPOINT)
**Goal:** Prove the restructured tree builds, tests, runs, and contains zero forbidden strings BEFORE history is rewritten. Final verification before point-of-no-return.
**Estimated:** 3 hr

**Steps:**
- 6.1 PASS GATE - Backend tests with drift triage: cd apps/api && python -m pytest tests/ -q. Expect: 523 passed, 8 skipped. If count drifts: capture pytest --collect-only -q diff. FAIL GATE: count <515 or >530 - escalate to user.
- 6.2 PASS GATE - Frontend build + lint: cd apps/web && pnpm install && pnpm build && pnpm lint. Clean build, zero lint errors.
- 6.3 PASS GATE - Desktop bundle dry-run with path verification: Remove-Item -Recurse -Force apps/desktop/resources/backend (if exists). cd apps/desktop && pnpm run stage-resources. Expect 'backend python final file count: N' message and smoke import test passes (apps.services.stt_service, tts_service imports succeed).
- 6.4 PASS GATE - Comprehensive forbidden-string scan (cross-platform via grep per adversarial review): grep -rE 'Claude|Co-Authored-By|claude-haiku|claude-sonnet|claude-opus|princeofwellness|sorrywecan\.com|SORRYWECAN s\.r\.o\.|09I05-03-V04-00072|OpenCode|/edu-pre-pr|noreply@anthropic\.com' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv > forbidden-string-scan.txt. Investigate EVERY hit. Expected acceptable: tests asserting 'anthropic' provider id, anthropic SDK __init__.py if shipped, comments on multi-provider design. FAIL GATE: any hit in commit history, root docs, or production code.
- 6.5 Boot test - start stack: pwsh scripts/dev/start.ps1 dev. Wait 60s. Verify ports up: curl http://localhost:3000 -> 200 HTML; curl http://localhost:8000/api/health -> 200 JSON with provider info.
- 6.6 ADVERSARIAL ADDITION - Integration smoke: curl -X POST http://localhost:8000/api/chat/stream -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hello"}]}'. Expect streaming JSON response (not HTML error page).
- 6.7 Manual avatar smoke test (if UE5 available - skip if not on user decision): pwsh scripts/dev/start.ps1 avatar. Confirm visemes broadcast on /ws/avatar via DevTools.
- 6.8 Stop stack: pwsh scripts/dev/stop.ps1. Verify ports released.
- 6.9 ADVERSARIAL ADDITION - PRE-COMMIT HOOK validation test: create dummy file with content 'claude-haiku-4-5'; git add dummy.txt; git commit -m 'test' -> EXPECT BLOCKED by hook. If commit succeeds, hook is broken -> FAIL GATE. Cleanup: git reset HEAD dummy.txt; Remove-Item dummy.txt.
- 6.10 Broken-link scan: grep -rE '\]\(\./|\]\(docs/' *.md docs/*.md docs/**/*.md -> for each link, verify target file exists. FAIL GATE: any broken link in README, AGENTS, CONTRIBUTING, ARCHITECTURE, DESIGN.
- 6.11 Bundle smoke (if BLOCKER 3 = rebuild fresh): full apps/desktop electron-builder build, run resulting .exe in clean Windows session, verify backend+frontend launch and chat round-trips. Otherwise (ship existing v0.8.3 binaries): document in Phase 8 release notes.
- 6.12 Final tree audit: list root files - expect ONLY: README.md, LICENSE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, AGENTS.md, ARCHITECTURE.md, DESIGN.md, Makefile, package.json, pnpm-workspace.yaml, .env.example, .gitignore, .editorconfig, .gitleaks.toml + dotfile dirs (.devcontainer, .github). NO Start-*.ps1, audit_run.py, PDFs, PNGs at root.
- 6.13 HARD CHECKPOINT WITH USER: present scan output (forbidden-string-scan.txt), screenshot of running app, pytest output, lint output. DO NOT proceed to Phase 7 without explicit user 'go for history reset'.

**Verification (must pass before next phase):**
- `Backend: cd apps/api && pytest -q -> 523 passed, 8 skipped`
- `Frontend: cd apps/web && pnpm build && pnpm lint -> clean`
- `Desktop: cd apps/desktop && pnpm run stage-resources -> file count + smoke passes`
- `Forbidden-string scan -> zero hits in tracked source/docs (acceptable only in tests asserting provider list)`
- `App boots and chat works: curl tests return expected JSON`
- `Pre-commit hook actively blocks forbidden strings`
- `Zero broken doc links`
- `Root tree is exactly the 16 governance files listed in step 6.12`
- `USER explicit go-ahead recorded`

**Rollback:** Phase 6 is read-only verification. If any test fails: rollback to relevant Phase commit via git reset --hard <phase-commit-sha> and re-run that phase. Staging repo is still disposable until Phase 8.

**Blocker questions:**
- Are forbidden-string hits triaged and either redacted or documented as acceptable (test fixtures only)?
- Did the user explicitly approve proceeding to Phase 7 (point-of-no-return)?

---

### Phase 7: Phase 7 - History Reset to v1.0.0 Root Commit
**Goal:** Collapse staging history into ONE clean root commit. Point of no return for history rewriting (within staging), but still reversible because staging is disposable and edututor-ai-sandbox-test history is untouched.
**Estimated:** 45 min

**Steps:**
- 7.1 Final pre-flight: re-confirm git config local identity matches BLOCKER 1 decision. git config user.name; git config user.email -> show maintainer identity, NOT princeofwellness defaults.
- 7.2 ADVERSARIAL ADDITION - Re-verify pre-commit hook is installed and functional: Test-Path .git/hooks/pre-commit -> True; smoke-test with dummy 'claude-haiku' string -> BLOCKED.
- 7.3 Backup the pre-reset state: cd <repo-root> && Copy-Item -Recurse edututor-ai-staging edututor-ai-staging-backup-$(Get-Date -Format yyyyMMdd-HHmm). Insurance against catastrophic mistake.
- 7.4 Nuke history: cd <repo-root>/edututor-ai-staging && Remove-Item -Recurse -Force .git && git init -b main.
- 7.5 Re-install pre-commit hook (init wipes .git/hooks/): copy hook from backup or re-author. Verify with smoke test.
- 7.6 Re-set local git identity (init wipes config): git config user.name '<maintainer>' && git config user.email '<maintainer-email>'.
- 7.7 Stage everything: git add -A. Pre-commit hook will scan everything - must pass. If blocked, a forbidden string slipped through Phase 6 - escalate to user (rollback to staging-backup).
- 7.8 Create the root commit (NO Co-Authored-By, NO emoji, imperative mood): git commit -m 'feat: initial public release v1.0.0' -m 'Slovak AI language tutor with multi-provider LLM, voice pipeline, RAG knowledge base, cross-session memory, and optional UE5 MetaHuman avatar.'
- 7.9 Tag: git tag -a v1.0.0 -m 'EduTutor.AI v1.0.0 - initial public release'.
- 7.10 PASS GATE - Verify history is clean: git log --all --format='%H %an <%ae>%n%s%n%b' -> shows ONE commit, author matches maintainer identity, NO Co-Authored-By line, NO Claude/Anthropic/OpenCode mentions.
- 7.11 PASS GATE - Verify NO forbidden strings in commit message OR body: git log --all --format='%H %s%n%b' | grep -iE 'claude|anthropic co-author|opencode|princeofwellness' -> zero matches.
- 7.12 Generate SBOM (optional but recommended): syft packages dir:. -o spdx-json > sbom.spdx.json. Do NOT commit - attach to GitHub release in Phase 8.
- 7.13 Final sanity: git log --oneline -> ONE line. git tag -l -> shows v1.0.0.

**Verification (must pass before next phase):**
- `git log --oneline | Measure-Object -Line -> exactly 1`
- `git log --format='%an <%ae>' -> maintainer identity (not princeofwellness default)`
- `git log --format='%b' | grep -iE 'claude|anthropic|opencode' -> zero matches`
- `git tag -l -> shows v1.0.0`
- `Test-Path <repo-root>/edututor-ai-staging-backup-* -> backup exists for rollback`
- `Pre-commit hook still installed and functional in fresh .git/hooks/`

**Rollback:** If history reset went wrong (forbidden string slipped in, wrong author): Remove-Item -Recurse -Force <repo-root>/edututor-ai-staging && Rename-Item edututor-ai-staging-backup-<timestamp> edututor-ai-staging restores pre-reset state. Then debug and retry Phase 7.

**Blocker questions:**
- Is the maintainer identity confirmed correct in git config local?

---

### Phase 8: Phase 8 - Create Public Repo & Initial Push
**Goal:** Create sorrywecann/edututor-ai on GitHub and push v1.0.0 as canonical first commit. POINT-OF-NO-RETURN: once pushed publicly, history rewrite requires force-push and admin override.
**Estimated:** 1.5 hr

**Steps:**
- 8.1 ADVERSARIAL FIX (BLOCKER 2) - Pre-flight auth verification: gh auth status -> confirm logged in. gh api user -> confirm user details. gh api user/orgs -> confirm 'sorrywecan' is in the list. FAIL GATE: if sorrywecan not visible, STOP and arrange org membership via GitHub UI before retrying.
- 8.2 Create the public repo: gh repo create sorrywecann/edututor-ai --public --description 'Slovak AI language tutor with voice, RAG knowledge base, cross-session memory, and 3D MetaHuman avatar' --license MIT --disable-issues=false --disable-wiki=true --homepage https://github.com/sorrywecann/edututor-ai. Note: --license flag may create a LICENSE file; if conflicts with staging LICENSE, prefer staging version.
- 8.3 Add remote and push: cd <repo-root>/edututor-ai-staging && git remote add origin git@github.com:sorrywecann/edututor-ai.git && git push -u origin main. Expect: 1 commit pushed.
- 8.4 Push tag: git push origin v1.0.0.
- 8.5 PASS GATE - Verify on github.com/sorrywecann/edututor-ai: README renders, LICENSE visible, v1.0.0 tag exists, main shows 1 commit, no Co-Authored-By, repo description correct.
- 8.6 ADVERSARIAL FIX - Enable branch protection on main: gh api -X PUT /repos/sorrywecann/edututor-ai/branches/main/protection -f required_pull_request_reviews[required_approving_review_count]=1 -f required_pull_request_reviews[dismiss_stale_reviews]=true -F enforce_admins=true -F required_linear_history=true -F allow_force_pushes=false -F allow_deletions=false -F required_status_checks=null. Verify: gh api /repos/sorrywecann/edututor-ai/branches/main/protection.
- 8.7 Configure Dependabot: commit .github/dependabot.yml watching apps/web (npm), apps/api (pip), root (github-actions). Verify present and correct (created in Phase 3).
- 8.8 Recreate workflow secrets (from Phase 5 workflow-secrets-inventory.txt): for each documented secret, add via gh secret set <NAME> --body <value> or via GitHub UI Settings -> Secrets. Do NOT commit secrets.
- 8.9 Set repository topics: gh repo edit sorrywecann/edututor-ai --add-topic education --add-topic ai --add-topic slovak --add-topic fastapi --add-topic nextjs --add-topic electron --add-topic rag --add-topic voice-cloning --add-topic metahuman --add-topic ue5.
- 8.10 Create v1.0.0 GitHub Release from the tag: gh release create v1.0.0 --title 'EduTutor.AI v1.0.0 - Initial Public Release' --notes-file CHANGELOG.md. Attach assets per BLOCKER 3 decision: (a) ship existing: download v0.8.3 .exe + ue5.zip + .sha256 from sorrywecann/edututor-ai-releases and upload via gh release upload v1.0.0 EduTutorAI-Setup.exe ue5.zip *.sha256; OR (b) rebuild fresh: build new .exe + ue5.zip from staging Phase 6.11 output.
- 8.11 Optional: attach SBOM (sbom.spdx.json from Phase 7.12) and THIRD_PARTY_LICENSES.md as release assets: gh release upload v1.0.0 sbom.spdx.json docs/THIRD_PARTY_LICENSES.md.
- 8.12 PASS GATE - Verify release page: visit https://github.com/sorrywecann/edututor-ai/releases/tag/v1.0.0 - check assets list, release notes formatted, source code links work.

**Verification (must pass before next phase):**
- `gh repo view sorrywecann/edututor-ai --json url,description,visibility,licenseInfo -> public, MIT, correct desc`
- `gh api /repos/sorrywecann/edututor-ai/branches/main/protection -> shows enforced rules`
- `gh release view v1.0.0 --repo sorrywecann/edututor-ai -> assets attached, notes render`
- `Manual: https://github.com/sorrywecann/edututor-ai in browser - README renders, badges work, topics show, license visible`
- `Manual: https://github.com/sorrywecann/edututor-ai/commits/main - exactly 1 commit, no Co-Authored-By trailer`
- `gh api /repos/sorrywecann/edututor-ai/topics -> 10 topics listed`

**Rollback:** POINT-OF-NO-RETURN once pushed. Emergency rollback (within first 24h, low visibility): gh repo delete sorrywecann/edututor-ai --yes (requires owner role) deletes the public repo entirely. Then re-do Phase 7 with fixes and re-push. After 24h+ public visibility: prefer fix-forward with v1.0.1 patch instead of force-push (preserves OSS reputation).

**Blocker questions:**
- Is the v1.0.0 release rendering correctly with all expected assets attached?
- Are branch protection rules enforced (not just configured)?

---

### Phase 9: Phase 9 - Private Repo Cleanup & Cross-Linking
**Goal:** Finalize the private repo as ongoing dev archive. Establish release workflow. Document the public-mirror flow for future v1.x releases.
**Estimated:** 1.5 hr

**Steps:**
- 9.1 In edututor-ai-sandbox-test: delete 14 stale feature branches: gh api --method DELETE /repos/sorrywecann/edututor-ai/git/refs/heads/<branch> for each of: chore/strip-ai-comments-backend, docs/state-of-project, docs/v21-audit-fixes-and-diagrams, docs/w3-cleanup-targets, fix/lipsync-anchor-audio-tempo, and 9-11 dependabot/* branches.
- 9.2 KEEP private branches: main, feat/floating-glass-bars, fix/v0.4.4-split-bundle, fix/v0.4.5-complete-bundle, fix/v0.5.0-godlike, fix/v0.5.2-backend-timeout-modular, fix/v0.5.4-polish-voice, docs/w7-security-recon, Edutor_UnrealEngine, Edutor_UnrealEngine-pow-face.
- 9.3 In edututor-ai-sandbox-test, create CONTRIBUTING-PRIVATE.md: 'Land changes here first. To sync to public: cherry-pick the diff into a clean staging worktree, scrub per docs/PUBLIC_RELEASE_CHECKLIST.md, push to sorrywecann/edututor-ai with imperative-only commit messages.'
- 9.4 Create docs/PUBLIC_RELEASE_CHECKLIST.md in private repo capturing scrub steps from Phases 1-2 as reusable checklist for v1.1+ releases. Include: forbidden-string regex, file deletion list, env var rename mapping.
- 9.5 Archive sorrywecann/edututor-ai-releases (if BLOCKER 5 = hard cut): add README banner pointing to sorrywecann/edututor-ai, optionally mark repo as archived (Settings -> Danger Zone -> Archive). Old v0.8.x releases remain downloadable.
- 9.6 Update memory file (~/.claude/projects/C--Users-<owner>/memory/MEMORY.md) - add new entry: 'Public repo - sorrywecann/edututor-ai live at v1.0.0; future development lands in private edututor-ai-sandbox first, scrubbed and mirrored to public per docs/PUBLIC_RELEASE_CHECKLIST.md'.
- 9.7 Update project memory project_master_plan.md to mark W9 complete with public repo URL.
- 9.8 Optional: enable Dependabot security alerts on public repo: gh api -X PUT /repos/sorrywecann/edututor-ai/vulnerability-alerts.
- 9.9 Optional: enable secret scanning: gh api -X PUT /repos/sorrywecann/edututor-ai -f security_and_analysis[secret_scanning][status]=enabled.
- 9.10 Final user checkpoint: confirm public repo renders correctly on github.com (README, license badge, topics, release page). Confirm private repo has stale branches removed and is documented as dev archive.

**Verification (must pass before next phase):**
- `gh api /repos/sorrywecann/edututor-ai/branches -> 9 branches remain (matches keep-list)`
- `Test-Path <repo-root>/edututor-ai-sandbox-test/docs/PUBLIC_RELEASE_CHECKLIST.md -> True`
- `Memory file updated with public repo URL`
- `Manual: public repo URL works, topics visible, release page shows assets`
- `Manual: private repo README (if archived) shows banner pointing to public repo`

**Rollback:** Phase 9 is non-destructive to public repo. Branch deletions in private repo can be restored from local clones via git push origin <sha>:refs/heads/<branch>. Pre-public-migration-snapshot tag from Phase 0 preserves the full pre-migration state.

**Blocker questions:**
- Should sorrywecann/edututor-ai-releases be archived now or kept active for legacy v0.8.x downloads?

---

## Verification Matrix

Commands that MUST pass between phases. Failure = STOP + investigate before continuing.

| After phase | Verification commands | Pass criteria |
|---|---|---|
| Phase 0 - Pre-flight & Staging | `Test-Path <repo-root>/edututor-ai-sandbox-pre-migration-sha.txt`<br>`git -C <repo-root>/edututor-ai-sandbox-test tag -l 'pre-public-migration-snapshot-*'`<br>`Test-Path <repo-root>/edututor-ai-staging/.git/hooks/pre-commit`<br>`cd <repo-root>/edututor-ai-staging/tutor-service; python -m pytest tests/ -q` | Snapshot tag exists on origin, staging worktree mirrors source minus ignored paths, pre-commit hook installed AND verified to block forbidden strings, |
| Phase 1 - Internal Artifact Purge | `Test-Path <repo-root>/edututor-ai-staging/audit_run.py`<br>`Test-Path <repo-root>/edututor-ai-staging/docs/audits`<br>`Test-Path <repo-root>/edututor-ai-staging/CLAUDE.md`<br>`cd <repo-root>/edututor-ai-staging/tutor-service; python -m pytest tests/ -q`<br>`git -C <repo-root>/edututor-ai-staging log --oneline | head -1` | audit_run.py and docs/audits/ are GONE; CLAUDE.md and CONTEXT.md still PRESENT (deleted in Phase 5); backend tests still pass 523/8; deletion commit v |
| Phase 2 - Source Code Sanitization | `grep -rn 'CLAUDE_MODEL' <repo-root>/edututor-ai-staging/tutor-service/app <repo-root>/edututor-ai-staging/.env.example`<br>`grep -rn 'claude-haiku|claude-sonnet|claude-opus' <repo-root>/edututor-ai-staging/tutor-service/app`<br>`cd <repo-root>/edututor-ai-staging/tutor-service; python -m pytest tests/ -q`<br>`cd <repo-root>/edututor-ai-staging/tutor-service; python -c 'from app.api.health import MODEL_ID; print(MODEL_ID)'` | Zero CLAUDE_MODEL refs; zero hardcoded claude-* model strings in app source; backend tests pass 523/8; health.py imports MODEL_ID successfully (return |
| Phase 3 - Directory Restructure | `Test-Path <repo-root>/edututor-ai-staging/apps/web; Test-Path <repo-root>/edututor-ai-staging/apps/api; Test-Path <repo-root>/edututor-ai-staging/apps/desktop`<br>`Test-Path <repo-root>/edututor-ai-staging/core; Test-Path <repo-root>/edututor-ai-staging/tutor-service`<br>`grep -rn 'tutor-service|\./core' <repo-root>/edututor-ai-staging --exclude-dir=node_modules --exclude-dir=.git --exclude=CHANGELOG.md`<br>`grep -rn 'princeofwellness|edututor-ai-sandbox-releases' <repo-root>/edututor-ai-staging/apps/desktop`<br>`cd <repo-root>/edututor-ai-staging/apps/api; python -m pytest tests/ -q`<br>`cd <repo-root>/edututor-ai-staging; pnpm install; pnpm -r build`<br>`cd <repo-root>/edututor-ai-staging/apps/desktop; pnpm run stage-resources` | apps/web|api|desktop exist; old core|tutor-service|desktop GONE; zero tutor-service refs outside CHANGELOG; zero princeofwellness refs in apps/desktop |
| Phase 4 - Launcher & Script Consolidation | `Test-Path <repo-root>/edututor-ai-staging/scripts/dev/start.ps1; Test-Path <repo-root>/edututor-ai-staging/Makefile`<br>`grep -E 'tutor-service|\./core' <repo-root>/edututor-ai-staging/scripts/`<br>`pwsh <repo-root>/edututor-ai-staging/scripts/dev/start.ps1 dev`<br>`curl http://localhost:8000/api/health`<br>`curl http://localhost:3000`<br>`pwsh <repo-root>/edututor-ai-staging/scripts/dev/stop.ps1` | start.ps1, start.sh, stop.ps1, stop.sh, Makefile all exist; scripts contain ZERO old paths; start.ps1 dev brings up :3000 + :8000 within 60s; both ret |
| Phase 5 - Documentation Creation | `Test-Path <repo-root>/edututor-ai-staging/README.md; Test-Path AGENTS.md; Test-Path ARCHITECTURE.md; Test-Path DESIGN.md`<br>`Test-Path <repo-root>/edututor-ai-staging/CLAUDE.md`<br>`grep 'ARCHITECTURE.md' <repo-root>/edututor-ai-staging/README.md`<br>`grep 'AGENTS.md' <repo-root>/edututor-ai-staging/README.md <repo-root>/edututor-ai-staging/CONTRIBUTING.md`<br>`Get-ChildItem <repo-root>/edututor-ai-staging/docs/adrs/00*.md`<br>`grep -iE 'SORRYWECAN|09I05-03-V04-00072|Vystup|UE5 Engineer/Animation Engineer' <repo-root>/edututor-ai-staging/docs/TECHNICAL_DOCUMENTATION.md`<br>`Test-Path <repo-root>/edututor-ai-staging/docs/THIRD_PARTY_LICENSES.md` | All 4 new docs created; CLAUDE.md DELETED (Test-Path -> False); README links to ARCHITECTURE and AGENTS; CONTRIBUTING links to AGENTS; all 5 ADRs pres |
| Phase 6 - Verification Sweep (HARD CHECKPOINT) | `cd <repo-root>/edututor-ai-staging/apps/api; python -m pytest tests/ -q`<br>`cd <repo-root>/edututor-ai-staging/apps/web; pnpm install; pnpm build; pnpm lint`<br>`Remove-Item -Recurse -Force <repo-root>/edututor-ai-staging/apps/desktop/resources/backend -ErrorAction SilentlyContinue; cd <repo-root>/edututor-ai-staging/apps/desktop; pnpm run stage-resources`<br>`grep -rE 'Claude|Co-Authored-By|claude-haiku|claude-sonnet|claude-opus|princeofwellness|sorrywecan\.com|SORRYWECAN s\.r\.o\.|09I05-03-V04-00072|OpenCode|/edu-pre-pr' <repo-root>/edututor-ai-staging --exclude-dir=node_modules --exclude-dir=.git`<br>`pwsh <repo-root>/edututor-ai-staging/scripts/dev/start.ps1 dev`<br>`curl -X POST http://localhost:8000/api/chat/stream -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hello"}]}'`<br>`<pre-commit hook smoke test: create dummy.txt with 'claude-haiku-4-5', git add, git commit -> EXPECT BLOCKED>`<br>`grep -rE '\]\(\./|\]\(docs/' <repo-root>/edututor-ai-staging/*.md <repo-root>/edututor-ai-staging/docs/` | Backend 523/8; frontend builds clean; Electron stage-resources passes smoke; forbidden-string scan returns ONLY acceptable hits (tests + provider list |
| Phase 7 - History Reset to v1.0.0 | `git -C <repo-root>/edututor-ai-staging log --oneline`<br>`git -C <repo-root>/edututor-ai-staging log --format='%an <%ae>'`<br>`git -C <repo-root>/edututor-ai-staging log --format='%B' | Select-String -Pattern 'claude|anthropic co-author|opencode|princeofwellness' -CaseSensitive:$false`<br>`git -C <repo-root>/edututor-ai-staging tag -l`<br>`Test-Path <repo-root>/edututor-ai-staging-backup-*` | Exactly 1 commit on main; author is maintainer identity (not princeofwellness); commit body has ZERO Claude/Anthropic/OpenCode/princeofwellness; v1.0. |
| Phase 8 - Public Repo Push | `gh repo view sorrywecann/edututor-ai --json url,description,visibility,licenseInfo`<br>`gh api /repos/sorrywecann/edututor-ai/branches/main/protection`<br>`gh release view v1.0.0 --repo sorrywecann/edututor-ai`<br>`gh api /repos/sorrywecann/edututor-ai/topics`<br>`<manual browser check: https://github.com/sorrywecann/edututor-ai - README renders, license badge, 1 commit, no Co-Authored-By>` | Public repo exists with MIT license; branch protection enforced (PRs required, force-push disabled, linear history); v1.0.0 release page renders with  |
| Phase 9 - Private Cleanup | `gh api /repos/sorrywecann/edututor-ai/branches | ConvertFrom-Json | Measure-Object`<br>`Test-Path <repo-root>/edututor-ai-sandbox-test/docs/PUBLIC_RELEASE_CHECKLIST.md`<br>`Get-Content <repo-root>/.claude/projects/C--Users-<owner>/memory/MEMORY.md | Select-String 'sorrywecann/edututor-ai'` | Private repo has 9 branches (14 stale deleted, 9 kept); PUBLIC_RELEASE_CHECKLIST.md exists in private repo; memory file references new public repo URL |

---

## Critical Risks (from 5 adversarial reviewers)

**Total concerns:** 52 across all reviewers

### [BLOCKER] Phase 3 (Directory Restructure) — devcontainer.json hardcoded path tutor-service/venv — breaks development setup if renamed before Phase 3
_Perspective: Cross-consumer verification audit for migration pl_
**Concern:** devcontainer.json hardcoded path tutor-service/venv — breaks development setup if renamed before Phase 3
**Recommendation:** CRITICAL: Update .devcontainer/devcontainer.json in Phase 3 immediately after 'git mv tutor-service/ apps/api/' with: postCreateCommand change 'tutor-service' → 'apps/api' (line 25); python.defaultInt
**Mitigation:** Lines 25 (postCreateCommand bash), 41 (python.defaultInterpreterPath), 43 (pytest discovery path) all hardcode 'tutor-service'. This is used when developers open the project in VS Code dev container. If Phase 1-2 run but Phase 3 is incomplete, venv setup and pytest discovery will break. The path mus

### [BLOCKER] Phase 3 (Directory Restructure) — .github/workflows/ci.yml and release.yml hardcoded paths in PRODUCTION CI — blocks build/release if not updated
_Perspective: Cross-consumer verification audit for migration pl_
**Concern:** .github/workflows/ci.yml and release.yml hardcoded paths in PRODUCTION CI — blocks build/release if not updated
**Recommendation:** CRITICAL: Update workflows in Phase 3 immediately after git mv: ci.yml:31 → 'working-directory: apps/api'; ci.yml:46 → 'cache-dependency-path: apps/api/requirements.txt'; release.yml:57 → 'context: ./
**Mitigation:** ci.yml:31 'working-directory: tutor-service' (default for all backend steps), ci.yml:46 'cache-dependency-path: tutor-service/requirements.txt' (pip cache), release.yml:57,58 'context: ./tutor-service' and 'dockerfile: ./tutor-service/Dockerfile' (Docker build). These control how CI runs tests and h

### [HIGH] Phase 2 — Phase 2 REDACT: CLAUDE_MODEL env var renamed to ANTHROPIC_MODEL breaks health.py line 16
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 2 REDACT: CLAUDE_MODEL env var renamed to ANTHROPIC_MODEL breaks health.py line 16
**Recommendation:** Add explicit step in Phase 2 Phase 2 REDACT instructions: 'Update health.py line 16: change MODEL_ID = os.getenv("CLAUDE_MODEL", ...) to MODEL_ID = os.getenv("ANTHROPIC_MODEL", ...)'. Verify with: gre
**Mitigation:** Update tutor-service/app/api/health.py:16 from os.getenv("CLAUDE_MODEL", ...) to os.getenv("ANTHROPIC_MODEL", ...) during Phase 2. CRITICAL: This line is read at module import time and used in health check responses. If not updated before tests run, health checks will return stale model IDs or misma

### [HIGH] Phase 3 — Phase 3 MOVE: stage-resources.mjs hardcodes path ../tutor-service 12 times, will break after tutor-service→apps/api move
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 3 MOVE: stage-resources.mjs hardcodes path ../tutor-service 12 times, will break after tutor-service→apps/api move
**Recommendation:** Add a new step in Phase 3 MOVE: 'Update desktop/stage-resources.mjs: replace join(REPO, "tutor-service") with join(REPO, "apps", "api") at line 94. Verify with: grep -n "tutor-service" desktop/stage-r
**Mitigation:** During Phase 3 git mv tutor-service/ → apps/api/, ALSO update desktop/stage-resources.mjs all 12 hardcoded paths: line 94 'const svc = join(REPO, 'tutor-service')' must become 'const svc = join(REPO, 'apps', 'api')'. Lines 126-127 HF_MODELS references must remain unchanged (they use process.env.USER

### [HIGH] Phase 6 — Phase 6 Verification: stage-resources.mjs smoke test imports 'from app.services import stt_service, tts_service' will fa
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 6 Verification: stage-resources.mjs smoke test imports 'from app.services import stt_service, tts_service' will fail if app/services/ was moved/deleted during Phase 3
**Recommendation:** In Phase 6 Verification, add explicit step: 'Verify stageBackendApp() path is correct post-Phase-3: grep -n "join(REPO" desktop/stage-resources.mjs should show line 94 now reads join(REPO, "apps", "ap
**Mitigation:** The smoke test at line 347 in desktop/stage-resources.mjs (Phase 6 verification step #1) runs in the context of dest = join(RES, 'backend'), which is resources/backend/. The test sources import app.services.{stt_service,tts_service} which are relative imports from the backend working directory. As l

### [HIGH] Phase 4 — Phase 4 launcher consolidation: new scripts/dev/start.ps1 must NOT hardcode paths to tutor-service or core; must use pos
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 4 launcher consolidation: new scripts/dev/start.ps1 must NOT hardcode paths to tutor-service or core; must use post-Phase-3 paths (apps/api, apps/web)
**Recommendation:** In Phase 4, verify scripts/dev/start.ps1 (and start.sh) do NOT reference old paths. Correct patterns: cd "${REPO_ROOT}/apps/api" for backend, cd "${REPO_ROOT}/apps/web" for frontend. The scripts shoul
**Mitigation:** Phase 4 creates scripts/dev/start.ps1 (new file) which will orchestrate the stack. If written before Phase 3 is complete, it may reference the old paths. The plan states Phase 4 depends_on Phase 3, so this should not happen. BUT if the script is written using copy-paste from old Start-* scripts, it 

### [HIGH] Phase 3 — Directory Restructure (RENAME/MOVE) — Phase 3 restructure path resolution risks not fully verified until Phase 6 dry-run; Electron bundler is late-stage block
_Perspective: Technical Architect / QA Lead designing a per-phas_
**Concern:** Phase 3 restructure path resolution risks not fully verified until Phase 6 dry-run; Electron bundler is late-stage blocker
**Recommendation:** ADD_VERIFICATION_STEP: Phase 3 step 12 (final verification) should include: 'Before declaring Phase 3 complete, grep -r tutor-service apps/desktop/scripts/stage-resources.mjs apps/desktop/main.mjs and
**Mitigation:** Risk matrix already flags this: 'Directory restructure breaks Electron bundler path resolution'. Mitigation says Phase 6 includes dry-run, but Phase 3 should have an early grep to prevent late discovery.

### [HIGH] Phase 3 (Directory Restructure) — MOVE tutor-service/ → apps/api/ — 29 literal string references found across config, tests, docs, and CI
_Perspective: Cross-consumer verification audit for migration pl_
**Concern:** MOVE tutor-service/ → apps/api/ — 29 literal string references found across config, tests, docs, and CI
**Recommendation:** ALL references MUST be updated in Phase 3 as part of git mv. Priority updates: .devcontainer/devcontainer.json (blocks development setup), .github/workflows/*.yml (blocks CI/release), .github/pull_req
**Mitigation:** Critical references identified in 7 files: (1) .devcontainer/devcontainer.json:25,41,43 — postCreateCommand + Python interpreter path + pytest discovery; (2) .github/dependabot.yml:6 — pip dependency scanning; (3) .github/ISSUE_TEMPLATE/agent_task.md, bug_report.md, feature_request.md — template exa

### [HIGH] Phase 8 (Release) — User data migration from %APPDATA%/edututor-ai-sandbox-desktop (old .exe) is NOT covered. Plan restructures code but provides no mi
_Perspective: Code Review / Migration Plan Validation

Based on _
**Concern:** User data migration from %APPDATA%/edututor-ai-sandbox-desktop (old .exe) is NOT covered. Plan restructures code but provides no migration strategy for existing user installation data.
**Recommendation:** Before Phase 8 finalization: Add an 'upgrade path' section to CHANGELOG.md and docs/guides/INSTALLATION.md explaining how users with v0.8.x .exe will find their data (study history, generated avatars,
**Mitigation:** Add migration handling to apps/desktop/main.mjs or orchestrator.mjs that detects old install path and moves/symlinks user data to new location. Test on a fresh Windows VM with old install present.

### [HIGH] Phase 6 (Verification) and Phase 8 (Release) — UE5 Edutor_UnrealEngine branch strategy is documented but incomplete. Plan says 'archive separately' but does not specif
_Perspective: Code Review / Migration Plan Validation

Based on _
**Concern:** UE5 Edutor_UnrealEngine branch strategy is documented but incomplete. Plan says 'archive separately' but does not specify how users access UE5 avatars in v1.0.0.
**Recommendation:** Plan correctly states v1.0.0 ships .exe + ue5.zip + .sha256 as release assets, with main.mjs ensureUE5Downloaded() fetching on first launch. However, the plan should explicitly verify: (1) GitHub Rele
**Mitigation:** Phase 6 step 7 should explicitly test: pwsh scripts/dev/start.ps1 dev on a clean VM without UE5 locally; verify ensureUE5Downloaded() triggers and avatar features work after download. If ue5.zip > 500MB, pre-arrange GitHub Actions matrix build or add a Releases API fallback to serve from a secondary

### [HIGH] Phase 5 (Documentation Redaction) - explicitly called out as open question #6 (line 2099) — CI/CD workflow audit is TBD ('Phase 5 should include a workflow audit step — TBD by user'). The plan does not verify .gi
_Perspective: Code Review / Migration Plan Validation

Based on _
**Concern:** CI/CD workflow audit is TBD ('Phase 5 should include a workflow audit step — TBD by user'). The plan does not verify .github/workflows/ for internal secrets, service references, or hardcoded paths tha
**Recommendation:** Before Phase 7, explicitly audit .github/workflows/ for: (1) hardcoded paths (tutor-service/, core/, desktop/) — update to apps/api, apps/web, apps/desktop, (2) repository secrets referenced by name (
**Mitigation:** Phase 5 step 10 should be: 'Audit .github/workflows/ for 10 minutes: (a) grep for hardcoded paths, (b) list all secrets used, (c) verify no internal service URLs. Triage: update paths, redact/replace secrets, delete broken workflows.'

### [HIGH] Phase 3 (Restructure) and Phase 6 (Verification) — main.mjs UE5_RELEASE_REPO hardcoded reference is mentioned in the brief but NOT verified in the plan. If hardcoded to pr
_Perspective: Code Review / Migration Plan Validation

Based on _
**Concern:** main.mjs UE5_RELEASE_REPO hardcoded reference is mentioned in the brief but NOT verified in the plan. If hardcoded to sorrywecann/edututor-ai-releases, v1.0.0 users will fetch UE5 from the old repo,
**Recommendation:** Phase 3 step 12 should explicitly include: 'Update apps/desktop/main.mjs UE5_RELEASE_REPO constant to point to sorrywecann/edututor-ai. Verify ensureUE5Downloaded() fetches from the correct release str
**Mitigation:** In apps/desktop/main.mjs (or wherever ensureUE5Downloaded is defined), confirm the repo URL is parameterized or hardcoded to sorrywecann/edututor-ai before Phase 7 commit. Test on a clean VM: ensureUE5Downloaded() should fetch from sorrywecann/edututor-ai, not sorrywecann/edututor-ai-releases.

### [HIGH] Pre-implementation (must validate docs exist before AGENTS.md is written) — AGENTS.md section 3 (Five non-negotiable invariants) references docs/avatar-protocol.md and docs/adrs/005-ue5-protocol-v
_Perspective: Documentation Architecture Review - AI Agent & New_
**Concern:** AGENTS.md section 3 (Five non-negotiable invariants) references docs/avatar-protocol.md and docs/adrs/005-ue5-protocol-v21.md as external sources of truth, but the outline does NOT specify whether the
**Recommendation:** Verify that docs/adrs/005-ue5-protocol-v21.md exists and is complete before drafting AGENTS.md. If missing, it MUST be created in parallel. Same for docs/avatar-protocol.md. The plan's docs_to_create 
**Mitigation:** Audit docs/adrs/ and docs/ for these two files. If missing, add them to docs_to_create or to a dependency chain BEFORE writing AGENTS.md.

### [HIGH] Design documentation — DESIGN.md outline does NOT address motion/animation discipline beyond 'subtle, restrained, ≤300ms'. The outline says 're
_Perspective: Documentation Architecture Review - AI Agent & New_
**Concern:** DESIGN.md outline does NOT address motion/animation discipline beyond 'subtle, restrained, ≤300ms'. The outline says 'reference ~/.claude/craft/animation-discipline.md philosophy' but that is an INTER
**Recommendation:** Replace the reference to ~/.claude/craft/animation-discipline.md with a one-paragraph summary of animation philosophy IN DESIGN.md itself. Example: 'Animations are used to provide feedback on state ch
**Mitigation:** Rewrite DESIGN.md section 8 (Motion) to be self-contained, not referencing external deleted files.

### [MEDIUM] Phase 3 — Phase 3 MOVE: docker-compose.yml hardcodes service names and paths (tutor-service, core) will break after rename to apps
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 3 MOVE: docker-compose.yml hardcodes service names and paths (tutor-service, core) will break after rename to apps/web, apps/api, apps/desktop
**Recommendation:** Add explicit step in Phase 3: 'Update all docker-compose*.yml files: (1) rename service 'tutor-service' → 'api', (2) rename service 'core' → 'web', (3) update build context: ./tutor-service → ./apps/a
**Mitigation:** During Phase 3 MOVE, update docker-compose.yml, docker-compose.prod.yml, docker-compose.release.yml at lines 64 (service name 'tutor-service') and 125 (service name 'core'), plus all references to ./tutor-service and ./core in build context directives. Lines 66-67, 128 must change from context: ./tu

### [MEDIUM] Phase 3 — Phase 3 MOVE: .env.example and .env files reference tutor-service/ paths in comments; .env is gitignored and may not be 
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 3 MOVE: .env.example and .env files reference tutor-service/ paths in comments; .env is gitignored and may not be in staging repo, causing build to fail
**Recommendation:** Before Phase 4 builds, verify: (1) Top-level .env.example exists and is updated with current app paths. (2) Each apps/api/.env.example, apps/web/.env.example, apps/desktop/.env.example is created with
**Mitigation:** During Phase 3, update .env.example and any committed .env documentation comments that reference 'tutor-service' paths. Check if .env itself is in the working tree (it should be gitignored and NOT present). Phase 3 step #8 creates per-app .env.example files in apps/api/.env.example, apps/web/.env.ex

### [MEDIUM] Phase 1 — Phase 1 DELETE: 12 Start/Stop scripts at root are deleted, but package.json or CI workflows may still reference them
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 1 DELETE: 12 Start/Stop scripts at root are deleted, but package.json or CI workflows may still reference them
**Recommendation:** Add pre-Phase-1 verification: 'Run grep -r "Start-EduTutor\|Stop-EduTutor\|Start-EduTutor-Avatar\|Start-Stack-Persistent\|Stop-Stack-Persistent" . --include="*.json" --include="*.yml" --include="*.md"
**Mitigation:** Before Phase 1 DELETE completes, search for references to the 12 deleted scripts in: (1) package.json at root and in core/, tutor-service/, desktop/ — check scripts.* entries for calls like 'node Start-EduTutor.bat' or 'pwsh Start-EduTutor-Dev.ps1'. (2) .github/workflows/*.yml for any CI jobs that r

### [MEDIUM] Phase 3 — Phase 3 MOVE: railway.backend.toml and render.yaml reference tutor-service/ paths or service names; if they do, deployme
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 3 MOVE: railway.backend.toml and render.yaml reference tutor-service/ paths or service names; if they do, deployment will fail after move
**Recommendation:** In Phase 3, add verification step: 'Review railway.backend.toml and render.yaml for references to tutor-service or ./tutor-service. If found, update to 'api' or './apps/api' respectively. Verify: grep
**Mitigation:** Check railway.backend.toml and render.yaml for references to tutor-service (service name in Railway/Render console), or to ./tutor-service (build context). These platform configs may reference environment variables or service orchestration that hard-codes the old name. If so, update them to 'api' or

### [MEDIUM] Phase 3 — Phase 3 MOVE: pytest discover pattern may fail after tutor-service→apps/api move if tests/ is not at root or if conftest
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 3 MOVE: pytest discover pattern may fail after tutor-service→apps/api move if tests/ is not at root or if conftest.py uses hardcoded paths
**Recommendation:** Clarify Phase 3 step #8: tests stay LOCAL to each app for now (v1.0.0 baseline). Move only test fixtures + cross-app tests to tests/{fixtures,integration,load,e2e}. Keep apps/api/tests/ at apps/api/te
**Mitigation:** The Phase 6 test step '523 passed, 8 skipped' assumes pytest finds tests/ from the correct working directory. After Phase 3 mv apps/api/tests → tests/integration/ (per Phase 3 step #8), the pytest command must update. Phase 6 specifies 'cd apps/api && pytest -q' which will only find tests IF tests/ 

### [MEDIUM] Phase 2 — Phase 2 hardcoded model string replacement: 'claude-haiku-4-5-20251001' → 'anthropic-default' must ONLY happen in TWO pl
_Perspective: Adversarial Review: After executing Phases 1-6 res_
**Concern:** Phase 2 hardcoded model string replacement: 'claude-haiku-4-5-20251001' → 'anthropic-default' must ONLY happen in TWO places (llm_service.py lines 590, 617), not elsewhere
**Recommendation:** In Phase 2 REDACT, add: '(3) Update tutor-service/app/api/health.py line 16: replace hardcoded default "claude-haiku-4-5-20251001" with "anthropic-default". Also update the env var name from CLAUDE_MO
**Mitigation:** The plan specifies llm_service.py lines 590, 617 for the model string replacement. BUT the same hardcoded string also appears in health.py line 16 as a DEFAULT fallback. If health.py is not updated, the fallback model will still be 'claude-haiku-4-5-20251001' instead of 'anthropic-default', causing 

### [MEDIUM] Phase 0 — Pre-flight & Staging Worktree — Phase 0 pre-flight snapshot missing explicit git commit hash documentation
_Perspective: Technical Architect / QA Lead designing a per-phas_
**Concern:** Phase 0 pre-flight snapshot missing explicit git commit hash documentation
**Recommendation:** ADD_VERIFICATION_STEP: Phase 0 step 1 should be: 'Capture pre-migration baseline: git rev-parse HEAD > /tmp/edututor-ai-sandbox-pre-migration-sha.txt (preserve this file for rollback reference).' Then proceed wi
**Mitigation:** Recommend adding a step to capture and log the exact commit SHA of the current main branch before staging begins, so rollback instructions can reference a specific point.

### [MEDIUM] Phase 2 (verification command 3), Phase 3 (verification after restructure), Phase 6 (re-verification) — Backend test baseline (523 passed, 8 skipped) is tight; no drift tolerance documented
_Perspective: Technical Architect / QA Lead designing a per-phas_
**Concern:** Backend test baseline (523 passed, 8 skipped) is tight; no drift tolerance documented
**Recommendation:** ADD_VERIFICATION_STEP: Phase 2 step 7, Phase 3 final step, and Phase 6 step 1 should include: 'If test count drifts from 523/8, capture pytest --collect-only -q output before/after and compare diff fo
**Mitigation:** Baseline is documented as 'Expected: 523 passed, 8 skipped' but plan mentions risk of 'false alarms if tests fail purely because of moved files'. Need explicit triage logic: 1) If count matches but different tests skip, investigate import changes; 2) If count differs by <5%, investigate path-only is

### [MEDIUM] Phase 5 — Documentation Creation (CREATE new + REDACT keepers) — Phase 5 creates multiple new docs without content verification that they are consistent with existing architecture
_Perspective: Technical Architect / QA Lead designing a per-phas_
**Concern:** Phase 5 creates multiple new docs without content verification that they are consistent with existing architecture
**Recommendation:** ADD_VERIFICATION_STEP: Phase 5 final verification should include: '(a) grep README.md for 'ARCHITECTURE.md' and 'AGENTS.md' (both must be referenced). (b) grep CONTRIBUTING.md for 'AGENTS.md' referenc
**Mitigation:** AGENTS.md, DESIGN.md, ARCHITECTURE.md are created with outlines but no verification that they cross-reference each other correctly or match the actual code structure post-restructure.

### [MEDIUM] Phase 6 — Verification Sweep — Phase 6 forbidden-string scan uses Select-String PowerShell regex; cross-platform verification not documented for Linux/
_Perspective: Technical Architect / QA Lead designing a per-phas_
**Concern:** Phase 6 forbidden-string scan uses Select-String PowerShell regex; cross-platform verification not documented for Linux/macOS runners
**Recommendation:** ADD_VERIFICATION_STEP: Phase 6 step 4 should offer both: 'Windows: powershell Select-String ... [command]. Linux/macOS: grep -r -iE 'claude|co-authored-by|claude-haiku|claude-sonnet|claude-opus|prince
**Mitigation:** Plan step 4 uses PowerShell Select-String, which is Windows-only. If CI/CD will run on Linux, this command fails.

### [MEDIUM] Phase 7 — History Reset to v1.0.0 Root Commit — Phase 7 pre-commit hook verification is implicit; no clear proof hook actually blocks forbidden strings
_Perspective: Technical Architect / QA Lead designing a per-phas_
**Concern:** Phase 7 pre-commit hook verification is implicit; no clear proof hook actually blocks forbidden strings
**Recommendation:** ADD_VERIFICATION_STEP: Phase 7 step 2 should be: 'Verify pre-commit hook is installed: test -f .git/hooks/pre-commit && cat .git/hooks/pre-commit | grep -q 'Claude|claude-haiku' (if hook file missing 
**Mitigation:** Step 2 says 'Confirm pre-commit hook (from Phase 0) passes' but if hook doesn't exist or is broken, step silently succeeds and bad strings land in v1.0.0.

---

## Rollback Plan (overall)

TIERED ROLLBACK STRATEGY based on phase reached:

TIER 1 - Phases 0-6 (staging-only, fully reversible): Staging worktree at <repo-root>/edututor-ai-staging is disposable. Rollback options: (a) git reset --hard HEAD~1 to undo the most recent phase commit; (b) git reset --hard <phase-N-commit-sha> to roll back multiple phases; (c) Remove-Item -Recurse -Force <repo-root>/edututor-ai-staging and re-run from Phase 0 robocopy. The live repo at <repo-root>/edututor-ai-sandbox-test is NEVER touched destructively during these phases.

TIER 2 - Phase 7 (history reset, still recoverable): Phase 7.3 creates <repo-root>/edututor-ai-staging-backup-<timestamp> BEFORE nuking .git. If the new root commit is corrupted (e.g., forbidden string slipped in, wrong author identity), restore via: Remove-Item -Recurse -Force <repo-root>/edututor-ai-staging && Rename-Item edututor-ai-staging-backup-<ts> edututor-ai-staging. Then fix and retry Phase 7.

TIER 3 - Phase 8 (POINT-OF-NO-RETURN, public): Once pushed to sorrywecann/edututor-ai, history rewrite requires force-push + admin override + branch protection bypass. Emergency rollback (within first 24h, low visibility): gh repo delete sorrywecann/edututor-ai --yes (requires owner role), then redo Phases 7-8. After 24h+ public visibility: prefer FIX-FORWARD with v1.0.1 patch release instead of force-push (preserves OSS reputation). NEVER force-push to main once branch protection is enabled.

TIER 4 - Catastrophic recovery (private repo damage): The pre-migration snapshot tag from Phase 0.2 (pre-public-migration-snapshot-<date> on origin/main) preserves the full pre-migration state of edututor-ai-sandbox-test. Recovery: cd <repo-root>/edututor-ai-sandbox-test && git fetch --tags && git reset --hard pre-public-migration-snapshot-<date>. This restores the live working repo to its exact pre-Phase-0 state.

GENERAL RULES: (1) Never use destructive git ops on edututor-ai-sandbox-test during the migration. (2) Always commit-then-verify within staging - no big-bang commits across phases. (3) The pre-commit hook is the final safety net but NOT the primary defense - rely on per-phase grep verifications. (4) If verification fails mid-phase, FIX FORWARD within that phase if possible; rollback only if the failure indicates structural corruption. (5) User checkpoints at end of Phase 0, 6, 7, 8 are MANDATORY - do not chain phases through them automatically.

---

## Go/No-Go Checklist (before Phase 0 start)

- [ ] GO 1: All 10 blockers above are resolved with explicit user answers documented.
- [ ] GO 2: Working copy of edututor-ai-sandbox-test is clean (`git status` -> nothing staged, no untracked files). All work is pushed to origin/main and origin/<feature-branches>.
- [ ] GO 3: Snapshot tag created and pushed: `git tag pre-public-migration-snapshot-$(date +%Y%m%d) && git push origin --tags`. Confirm tag visible on GitHub.
- [ ] GO 4: Pre-flight grep confirms NO production code references the 12 root-level Start-*/Stop-* scripts that will be deleted in Phase 1. Run: grep -r 'Start-EduTutor|Stop-EduTutor|Start-Stack-Persistent|Stop-Stack-Persistent' . --include='*.json' --include='*.yml' --include='*.md' | grep -v node_modules | grep -v '\.git/' - expect zero matches. Any hit -> update reference OR preserve script under scripts/legacy/ instead of deleting.
- [ ] GO 5: Baseline test counts captured. Run on current main: cd tutor-service && python -m pytest tests/ -q -> document exact count (expected 523 passed, 8 skipped). Also cd core && pnpm test and cd core && pnpm build -> document clean baseline.
- [ ] GO 6: Confirm disk space available for staging worktree: ~5 GB free at <repo-root>/.
- [ ] GO 7: Confirm Python git-filter-repo is NOT needed (using Strategy C - fresh repo). But `gh` CLI must be installed, authenticated, and have sorrywecan org access verified.
- [ ] GO 8: User commits to NOT pushing other changes to origin/main during the migration window (24-72 hours). The staging copy is a snapshot in time; concurrent edits to live repo will require re-sync.
- [ ] GO 9: Backup of edututor-ai-sandbox-test exists (either via remote push or local copy at edututor-ai-sandbox-test-backup-$(date)). The plan never touches the live repo destructively, but a backup is cheap insurance.

---

## Blockers to resolve BEFORE execution

- ❗ USER DECISION 1: Maintainer identity for v1.0.0 root commit. Provide exact git user.name and user.email to use locally in staging worktree (do NOT use global princeofwellness identity). Required before Phase 7.
- ❗ USER DECISION 2: Confirm sorrywecan GitHub org write access on the active gh CLI account. Run `gh api user/orgs` and verify sorrywecan appears. If not, arrange access via GitHub UI BEFORE starting (blocks Phase 8 hard).
- ❗ USER DECISION 3: Ship existing v0.8.3 .exe + ue5.zip as v1.0.0 release assets, OR rebuild fresh from restructured tree (adds ~2 hours to Phase 6)? Recommend: ship existing binaries (faster, well-tested) with a documented note that the v1.0.0 source tree is the canonical going-forward layout.
- ❗ USER DECISION 4: LICENSE attribution - is the existing MIT LICENSE attributed to SORRYWECAN s.r.o. or an individual? If company-attributed, confirm whether to keep that attribution or genericize for public repo.
- ❗ USER DECISION 5: Backwards-compatibility for v0.8.x users on sorrywecann/edututor-ai-releases - hard cut at v1.0.0 (document in CHANGELOG) OR dual-publish v1.0.0-v1.0.2 to both old and new release streams? Recommend hard cut + clear CHANGELOG note.
- ❗ USER DECISION 6: Keep livekit.yaml? Per audit, it is flagged as possibly unused. Confirm to DELETE or KEEP.
- ❗ USER DECISION 7: CI/CD workflow audit - confirm scope. Phase 5 includes scrubbing .github/workflows/* for hardcoded paths and secrets. User must confirm no third-party CI services (Vercel, Railway, Render) need to be re-linked separately after public repo creation.
- ❗ VERIFY: Confirm docs/adrs/005-ue5-protocol-v21.md EXISTS in current repo. AGENTS.md cross-links to it; if missing, must be authored in Phase 5 before AGENTS.md is finalized.
- ❗ VERIFY: Confirm UE5 binaries (.uasset, .pak) are NOT in current git history of edututor-ai-sandbox-test main branch. Run `git log --all --name-only -- '*.uasset' '*.pak' | head` - expect zero hits. If present, history needs git-filter-repo cleanup in the private repo too (out of scope for public migration but flagged).

## Open questions needing user signoff

**From WF1 (master plan):**
- Which maintainer identity (name + email) should the v1.0.0 root commit author be attributed to? The princeofwellness vs sorrywecan account split (per memory) needs explicit resolution before Phase 7.
- Should the v1.0.0 release ship the existing v0.8.3 .exe + ue5.zip as binary assets, or rebuild fresh from the restructured tree? Rebuilding requires Phase 6 to include a full apps/desktop build, which adds ~2 hours; shipping the existing v0.8.x binaries is faster but the source tree on the public repo will not exactly match the binary.
- Keep livekit.yaml in repo? Audit did not flag it. If LiveKit integration is in active use, keep; if speculative or unused, DELETE.
- Migrate the W7 security recon document to public repo (as a sanitized security history) or keep private only? Recommended: keep private to avoid signposting historical vulnerabilities; addressed in plan as DELETE from public.
- Should the four placeholder packages (atmosphere, api-client, types, utils) ship empty in v1.0.0 or be populated as part of the migration? Recommended: ship empty placeholders so the monorepo structure is real; population is a v1.1 workstream.
- Are there CI workflows in .github/workflows/ that reference internal secrets, paths, or services that need scrubbing before public release? Phase 5 should include a workflow audit step — TBD by user.
- Is the existing LICENSE file (MIT) attributed to SORRYWECAN s.r.o., an individual, or generic? If attributed to the company, the user must confirm whether to keep that attribution in the public repo or genericize.

**From WF2 (review):**
- Is the existing docs/adrs/005-ue5-protocol-v21.md file present and complete? If not, Phase 5 must author it BEFORE finalizing AGENTS.md (which cross-links to it).
- Should there be a v1.0.1 immediately after v1.0.0 to ship the dual-publish bridge for legacy v0.8.x users, or is hard-cut final at v1.0.0?
- If shipping existing v0.8.3 .exe binaries: the binary contains pre-restructure paths inside the bundled Python. Is this acceptable for v1.0.0 (source tree shows new layout, binary shows old) or must we rebuild?
- Should docs/guides/TESTING.md and docs/guides/DEBUGGING.md be created in this migration (per adversarial doc review) or deferred to v1.1?
- Are there any third-party CI services (Vercel, Railway, Render) currently linked to the private repo that need to be re-linked to the public repo after Phase 8?
- Does the user want a public roadmap/MILESTONES.md as part of v1.0.0, or keep that internal-only?
- User data migration from %APPDATA%/edututor-ai-sandbox-desktop (v0.8.x install) to v1.0.0 install: should v1.0.0 main.mjs auto-migrate on first launch, or document manual copy instructions in INSTALLATION.md?
- If UE5 ue5.zip exceeds 2 GB GitHub Release asset limit, what CDN/mirror strategy is in place? (Adversarial review HIGH concern.)

---

## File operations summary

| Operation | Count | Examples |
|---|---|---|
| DELETE | 71 | CLAUDE.md, CONTEXT.md, EduTutor_AI_Technicka_Dokument |
| CREATE | 22 | AGENTS.md, DESIGN.md, ARCHITECTURE.md |
| MOVE | 13 | docker-compose.yml, docker-compose.prod.yml, docker-compose.release.yml |
| KEEP | 13 | CODE_OF_CONDUCT.md, LICENSE, docs/adrs/ |
| REDACT | 8 | .github/pull_request_template., tutor-service/app/api/health.p, tutor-service/app/services/llm |
| RENAME | 5 | EduTutor_AI_Technicka_Dokument, core/, tutor-service/ |

(Full file-by-file list in WF1 output — 132 operations)

---

## Target directory structure
```
sorrywecann/edututor-ai/
├── README.md                        # Public pitch + install + arch overview
├── LICENSE                          # MIT
├── CHANGELOG.md                     # Fresh v1.0.0 entry
├── CONTRIBUTING.md                  # PR flow, no /edu-pre-pr
├── CODE_OF_CONDUCT.md               # Contributor Covenant (unchanged)
├── SECURITY.md                      # GitHub Security Advisory
├── AGENTS.md                        # AI agent navigation guide (NEW)
├── ARCHITECTURE.md                  # System map (NEW)
├── DESIGN.md                        # Living Room design system (rewritten)
├── Makefile                         # make dev | make build | make test
├── package.json                     # Root workspace
├── pnpm-workspace.yaml
├── .env.example                     # Union of all app env vars
├── .gitignore                       # Excludes .claude/, .workspace/, handoffs
├── .editorconfig
├── .gitleaks.toml
├── .devcontainer/
│   └── devcontainer.json
├── .github/
│   ├── dependabot.yml               # Fresh config
│   ├── pull_request_template.md     # Scrubbed
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md            # Generic (NEW)
│   │   └── feature_request.md       # Generic (NEW)
│   └── workflows/                   # CI/CD
├── apps/
│   ├── web/                         # Next.js 15 (was core/)
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json             # @edututor/web
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── .env.example
│   ├── api/                         # FastAPI (was tutor-service/)
│   │   ├── app/
│   │   ├── tests/
│   │   ├── requirements.txt
│   │   ├── Dockerfile
│   │   ├── run_dev.py
│   │   ├── README.md
│   │   └── .env.example
│   └── desktop/                     # Electron (was desktop/)
│       ├── main.mjs
│       ├── orchestrator.mjs
│       ├── scripts/
│       ├── package.json             # @edututor/desktop
│       ├── README.md
│       └── .env.example
├── packages/                        # Shared code (placeholders for v1.0.0)
│   ├── atmosphere/                  # Design system extraction (planned)
│   ├── api-client/                  # WS/HTTP client (planned)
│   ├── types/                       # Shared TS types (planned)
│   └── utils/
├── infra/
│   ├── compose/
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.prod.yml
│   │   └── docker-compose.release.yml
│   ├── platforms/
│   │   ├── railway/{backend.toml, frontend.toml}
│   │   ├── render/render.yaml
│   │   └── vercel/vercel.json
│   ├── monitoring/prometheus.yml
│   ├── nginx/nginx.conf
│   └── systemd/{edututor-backend.service, edututor-frontend.service, profiles/}
├── scripts/
│   ├── dev/
│   │   ├── start.ps1                # subcmds: dev|web|api|avatar|stack
│   │   ├── start.sh
│   │   ├── stop.ps1
│   │   └── stop.sh
│   └── infra/                       # Deploy helpers
├── tests/
│   ├── e2e/web/                     # Playwright (was apps/web/e2e/)
│   ├── load/k6/                    
```

---

## Docs to create

### `README.md`
**Purpose:** Front door for the public repo. Pitch + install + architecture overview + how to contribute. Replaces the existing README that carries grant attribution and old GitHub URLs.
**Outline:** 1) Title + one-line pitch ('Slovak AI language tutor with voice, RAG, cross-session memory, and a 3D MetaHuman avatar — fully local, multi-provider LLM').
2) Badges (license MIT, CI status, version v1.0.0).
3) Why EduTutor? (Slovak-first, offline-capable, multi-provider, open avatar protocol).
4) Screenshot / hero image (consolidated-landing.png if kept, otherwise fresh).
5) Quick start — one-click .exe install (Windows) + manual dev path (cross-platform).
6) Architecture at a glance (Mermaid di

### `AGENTS.md`
**Purpose:** Provider-neutral guidance for any AI coding agent (Claude Code, Cursor, Copilot, Aider, Codex, etc.) navigating the repo. Extracts non-negotiable invariants from the deleted CLAUDE.md without referencing any specific agent.
**Outline:** 1) Purpose: 'This file orients AI coding agents and human contributors to the non-negotiable architectural invariants of EduTutor.AI.'
2) Read First (ordered): README.md → ARCHITECTURE.md → docs/adrs/ (all five) → DESIGN.md → CONTRIBUTING.md.
3) Five non-negotiable invariants (one section each, each cross-linked to its ADR):
   - UE5 protocol v2.1 back-compat — every /ws/avatar payload includes visemes (14 keys), emotion, intensity. See docs/adrs/005-ue5-protocol-v21.md and docs/avatar-protocol.

### `DESIGN.md`
**Purpose:** Public-facing design system spec for the Atmosphere / Living Room visual language. Extracted from internal DESIGN.md + CLAUDE.md frontend rules + code in apps/web/src/components/atmosphere/.
**Outline:** 1) Design language: Atmosphere (warm, residential, ceremony vs work tiers).
2) Color palette (semantic tokens, hex, usage):
   - Background: warm charcoal #221912.
   - Surface: cream #F5EFE3.
   - Primary accent: terracotta #D4845A.
   - Secondary accent: sage greens.
   - Text: charcoal on cream, cream on charcoal.
   - States (success / warning / error) with WCAG AA contrast verification.
   - Banned: cold dark navy, blue/purple accents (chamber-of-commerce palette).
3) Typography:
   - Body:

### `ARCHITECTURE.md`
**Purpose:** One-page system overview so new contributors understand the request lifecycle and where each piece lives.
**Outline:** 1) System diagram (Mermaid): User browser → apps/web (Next.js SSR) → apps/api (FastAPI HTTP + /ws/avatar WS) → {LLM provider | STT (faster-whisper) | TTS (Edge / Piper) | RAG (Chroma + sentence-transformers)} → apps/desktop (Electron orchestrator wraps web+api for one-click install) → optional UE5 MetaHuman client via Pixel Streaming.
2) Apps:
   - apps/web — Next.js 15 App Router, Atmosphere design system, calls apps/api over HTTP/WS.
   - apps/api — FastAPI. Asymmetric DI (LLM eager, RAG/TTS l

### `CONTRIBUTING.md`
**Purpose:** Rewritten contributor guide with /edu-pre-pr removed, paths updated for the new monorepo layout, and a new section for AI agents pointing at AGENTS.md.
**Outline:** 1) Welcome + project values (Slovak-first, offline-capable, multi-provider, accessible).
2) Before you start: read ADRs in docs/adrs/, read AGENTS.md if you are an AI coding agent, read DESIGN.md if you touch UI.
3) Run the test suite: cd apps/api && pytest -q (expect 523 passed, 8 skipped); cd apps/web && pnpm test.
4) Reporting bugs (link to .github/ISSUE_TEMPLATE/bug_report.md).
5) Proposing features (link to .github/ISSUE_TEMPLATE/feature_request.md, expect a plan-first conversation for non-

---

## Success criteria

- sorrywecann/edututor-ai repo exists, public, MIT licensed, with v1.0.0 tag and GitHub Release.
- git log on main shows exactly ONE commit, message 'feat: initial public release v1.0.0', no Co-Authored-By trailer, no emoji.
- Full-text scan across the public repo with 11-pattern regex (Claude|Co-Authored-By|claude-haiku|claude-sonnet|claude-opus|princeofwellness|sorrywecan.com|SORRYWECAN s.r.o|09I05-03-V04-00072|OpenCode|/edu-pre-pr) returns zero hits in tracked source files (acceptable hits only in node_modules-equivalent or in tests asserting 'anthropic' provider option).
- cd apps/api && python -m pytest tests/ -q → 523 passed, 8 skipped (matches CONTRIBUTING.md baseline).
- cd apps/web && pnpm install && pnpm build && pnpm lint → clean build, zero lint errors.
- pwsh scripts/dev/start.ps1 dev → stack comes up on :3000 (web) and :8000 (api); a chat message round-trips successfully.
- Repo root contains exactly these governance files: README.md, LICENSE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, AGENTS.md, ARCHITECTURE.md, DESIGN.md, Makefile, package.json, pnpm-workspace.yaml, .env.example, .gitignore, .editorconfig, .gitleaks.toml — and nothing else at root level (no Start-*.ps1, no audit_run.py, no PDFs, no .png).
- docs/ contains only public-facing content: TECHNICAL_DOCUMENTATION.md, avatar-protocol.md, ue5-avatar-contract.md, THIRD_PARTY_LICENSES.md, and subdirs adrs/ guides/ research/ load-testing/ release-notes/ test-runs/ workflows/ — no audits/, plans/, output3/, superpowers/, SESSION-HANDOFF*.md, *-handoff.md.
- AGENTS.md exists and is referenced from README, CONTRIBUTING, and ARCHITECTURE; cross-links to all five ADRs.
- DESIGN.md exists and is referenced from README, AGENTS.md, and CONTRIBUTING; documents the Atmosphere palette, typography, and component inventory with apps/web/src/components/atmosphere/ code paths.
- Private repo (sorrywecann/edututor-ai) has 14 stale branches deleted and retains 9 active branches (main + 5 fix/v0.x + feat/floating-glass-bars + docs/w7-security-recon + Edutor_UnrealEngine + Edutor_UnrealEngine-pow-face).
- Public repo has branch protection on main: PRs required, force-push disabled, linear history required.
- Dependabot is configured fresh and opens its first PR within 24h of repo creation.
- .exe + ue5.zip + .sha256 from the last private release are attached to the v1.0.0 GitHub Release with SBOM and THIRD_PARTY_LICENSES.md.
