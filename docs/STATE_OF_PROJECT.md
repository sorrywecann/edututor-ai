# State of the Project — EduTutor.AI

> **First-touch doc.** Read this before any other source. Supersedes scattered memory and ad-hoc handoff files as the canonical answer to "what is this, what is it not, and where are we going."
>
> **Last updated:** 2026-05-29 · **Owner:** <repo-owner> ([princeofwellness](https://github.com/princeofwellness)) · **Grant:** 09I05-03-V04-00072 (Výstup 3)

---

## Part 1 — Reviewer Summary

*≈1 page. Written for grant reviewers and anyone arriving cold.*

### 1.1 What EduTutor is

EduTutor.AI is a Slovak-language AI tutor for K-12 students, delivered as a Windows desktop application. A real-time **MetaHuman avatar** (a photoreal 3D character rendered in Unreal Engine 5) listens, speaks, lip-syncs, and emotes during the tutoring dialogue. The system runs **fully local on the student's machine** — local LLM via Ollama, local text-to-speech via Piper, local Pixel Streaming from a cooked UE5 build — with no data sent to third-party clouds during a session. It is delivered to end users as a single installable EXE.

### 1.2 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Student's PC (Windows)                      │
│                                                                      │
│   ┌────────────────┐   HTTP /chat   ┌──────────────────────┐         │
│   │  Frontend      │ ─────────────▶ │  Tutor Service       │         │
│   │  Next.js 14    │ ◀───────────── │  FastAPI (Python)    │         │
│   │  :3000         │   SSE stream   │  :8000               │         │
│   └────────────────┘                │   · Ollama (LLM)     │         │
│           ▲                         │   · Piper (TTS)      │         │
│           │ HTML5 video             │   · viseme pipeline  │         │
│           │                         └──────────┬───────────┘         │
│           │                                    │ WS /ws/avatar       │
│           │                                    │  {viseme,emotion}   │
│           │                                    ▼                     │
│   ┌───────┴─────────┐                ┌─────────────────────┐         │
│   │  Wilbur signal  │ ◀─── WebRTC ── │  EdutorUE (UE5)     │         │
│   │  :8888          │                │  cooked app · -game │         │
│   └─────────────────┘ ─── H.264 ───▶ │   · MetaHuman face  │         │
│                       Pixel Stream   │   · ZenDyn emotion  │         │
│                       to browser     └─────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

**Legend.** *Pixel Streaming* = UE5's H.264 video-streaming protocol; the avatar pixels reach the browser as a WebRTC video track. *Wilbur* = the WebRTC signalling server bundled with UE5. *Viseme* = a phoneme-shaped mouth pose used to drive lip-sync.

### 1.3 v1.0.0 milestone status

- ✅ **Shipped (2026-05-29).** Backend↔Blueprint emotion contract aligned; viseme pipeline timing locked at 80 ms step; avatar window debug-clean; EXE bundle v0.4.4 boots on clean Windows.
- 🔄 **In flight.** UE5 re-cook with today's Blueprint fixes; orchestrator launch flags upgraded to HQ Pixel Streaming; fresh-account migration plan; per-workstream cleanup specs.
- ⏳ **Planned for v1.0.0.** Tier 2 LLM-structured emotion output; source-side audio Blueprint wiring (UE5 Engineer); risk/security audit; AI-comment cleanup pass.

### 1.4 Grant context

Delivered under grant **09I05-03-V04-00072** as part of **Výstup 3**. Roadmap, workstreams, and owners are tracked in [`docs/MASTER_PLAN.md`](MASTER_PLAN.md); this document is the operational counterpart that fixes the *current* state of the codebase.

---

## Part 2 — Operational Truth

*≈3 pages. Written for <owner> and future Claude agents. Blunt. Trust this over memory.*

### 2.1 WHAT IT IS

**Components (with one-line purpose each):**

- **`tutor-service/`** — FastAPI backend. Owns the chat loop, emotion detection, viseme generation, `/ws/avatar` WebSocket, and the dev-only broadcast endpoint. Runs on `:8000`.
- **`core/`** — Next.js 14 (App Router) frontend. Owns the chat UI, the avatar `<video>` element, persona prefs, the Prehľad/Chamber surfaces. Runs on `:3000`.
- **`EdutorUE/`** — Unreal Engine 5 project. Owns the MetaHuman avatar, viseme curves, ZenDyn emotion driver, and the Pixel Streaming sender. Cooked output is consumed by the EXE bundle.
- **`ZenDyn v1.4.0`** — UE5 plugin (third-party, embedded). Drives MetaHuman facial emotions via the `EZenDynEmotion` enum and `BPC_ZenDyn` component.
- **Wilbur** — UE5's bundled WebRTC signalling server. Runs on `:8888`, brokers the Pixel Streaming connection between the cooked UE5 app and the browser.
- **Ollama** — local LLM runtime (third-party). Serves the chat completion model the backend talks to.
- **Piper** — local neural TTS (third-party). Synthesises Slovak speech audio from the LLM's text.

**Runtime entrypoints:**

- **Dev (manual):** `pnpm dev` in `core/`, `python -m app.main` in `tutor-service/`, launch UE5 via Unreal Editor → Play Standalone. Memory `reference_dev_stack` has the exact sequence — launcher scripts are stale.
- **Prod (end user):** a single `EduTutor-Setup-<version>.exe` produced by `pnpm dist` in `desktop/`. The installer drops `resources/` containing bundled Python, bundled Node, the cooked UE5 app, Wilbur, Ollama, and Piper. `orchestrator.mjs` spawns the four child processes at runtime.

### 2.2 WHAT IT IS NOT

- **Not a web SaaS.** Not multi-tenant. Not cloud-hosted. Each install is a standalone desktop app.
- **Not** `legacy-account-1/edututor` or `legacy-account-1/edututor-fullstack` — local clones from a frozen legacy account (`legacy-account-1`, all-caps, NOT the same as `sorrywecan`). Reference only. See ledger §2.4.
- **Not** `legacy-account-2/swc-ainag` — a VuePress doc site on the legacy `legacy-account-2` account, unrelated to this project.
- **The intended clean release repo `sorrywecann/edututor-ai` is not yet present locally** — it is the *target* of workstream #6, not a source of truth. Today, canonical source is `princeofwellness/edotutor` (clone `edotutor-test/`).
- **Not** using ARKit-driven blendshapes. The `audio2lipsync`/ARKit code path renders nowhere in production (UE5 consumes visemes, not ARKit). Safe to delete; tracked in memory `project_arkit_orphaned`.
- **Not** using cloud TTS or cloud LLM by default. Both are local. The frontend has no API keys for OpenAI / ElevenLabs / similar.
- **Not** yet using LLM-structured-output for per-sentence emotion labels. The regex-based Slovak emotion detector is current; the LLM-structured Tier 2 design is deferred — see workstream #3.
- **Not** auto-cooked. UE5 is a manual re-cook step before each bundle release. See `docs/exe-bundle-handoff.md`.

### 2.3 WHERE WE'RE HEADED

**Anchor milestone: v1.0.0 EXE delivered from a clean fresh account.**

#### v1.0.0 Definition of Done

- [ ] Green-field EduTutor EXE built under the new GitHub account (existing or to-be-created — see workstream #6).
- [ ] No AI-comment cruft in source.
- [ ] No zombie clones / dead branches in the active repos.
- [ ] Clean linear git history on `main` for backend+frontend.
- [ ] UE5 `Edutor_UnrealEngine-pow-face` merged to `Edutor_UnrealEngine` and reconciled.
- [ ] Working install on a clean Windows 11 machine (no msvcp140 gap, no path leakage, smoke-test passes).
- [ ] Risk/security audit completed (secrets, exposed ports, embedded keys).

#### The 8 workstreams

#### Workstream 1 — Strategy doc (THIS FILE)

**State:** ✅ done (this commit). **Owner:** <owner>. **Next action:** none — keep current as state changes; any other workstream that drifts the ledger updates §2.4 here in the same commit.

#### Workstream 2 — EXE bundle to production-clean

**State:** 🔄 in-flight. **Blocker:** UE5 re-cook of today's Blueprint fixes (`85694ade`) into `Downloads/Edutor0529/Windows/`; then patch `desktop/stage-resources.mjs` line 29 (`UE5_BUILD` path) and `desktop/orchestrator.mjs` lines 273-277 (HQ launch flags + 1440p). **Next action:** another agent / <owner> runs the two-gate procedure in [`docs/exe-bundle-handoff.md`](exe-bundle-handoff.md), then `pnpm dist` → v0.4.5. **Future spec:** none needed — handoff doc is sufficient.

#### Workstream 3 — Backend cleanup (`tutor-service/`)

**State:** ⏳ planned. **Blocker:** none. **Next action:** brainstorm → spec → plan. Scope: strip AI-generated comments, delete the ARKit/audio2lipsync orphan path, audit dead routes, decide Tier 2 LLM-structured-emotion design. **Future spec:** TBD — brainstorm pending.

#### Workstream 4 — Frontend cleanup (`core/`)

**State:** ⏳ planned. **Blocker:** none. **Next action:** brainstorm → spec → plan. Scope: delete the stale `edotutor-fresh` clone, decide the fate of the `feat/living-room-redesign` branch, strip AI-generated comments, audit dead routes. **Future spec:** TBD — brainstorm pending.

#### Workstream 5 — UE5 reconcile + re-cook

**State:** 🔄 in-flight. **Blocker:** Animation Engineer review of `Edutor_UnrealEngine-pow-face` for merge to `Edutor_UnrealEngine`. **Next action:** open PR `Edutor_UnrealEngine-pow-face → Edutor_UnrealEngine`; once merged, re-cook for workstream #2. **Future spec:** TBD if more than a merge+cook is needed.

#### Workstream 6 — Git hygiene + fresh-account migration

**State:** ⏳ planned. **Target:** clean public release repo `sorrywecann/edututor-ai` (per [CLAUDE.md](../CLAUDE.md) "Release repo" rule and the master plan). Whether the `sorrywecan` GitHub account already exists or needs creating is the first decision in the spec for this workstream. **Next action:** brainstorm → spec → plan. **Scope:** delete stale clones (`edotutor-fresh`, `edotutor-audit`, `edotutor-ue5`); rewrite/squash any history that embeds AI provenance (CLAUDE.md: "zero Claude/AI references in history/docs/comments"); set up or confirm the `sorrywecan` account; create `sorrywecann/edututor-ai` as the clean release repo; mirror `princeofwellness/edotutor` content (NOT history) into it; update local remotes; archive the `legacy-account-1/*` and `legacy-account-2/*` clones. **Future spec:** TBD — brainstorm pending.

#### Workstream 7 — Risk / security audit

**State:** ⏳ planned. **Blocker:** none. **Next action:** brainstorm → spec → plan. Scope: secrets in `.env` files, exposed local ports (Ollama, Wilbur, Pixel Streaming), embedded API keys in the bundled EXE, account-handover risks (billing, ownership, recovery), supply-chain review of third-party plugins (ZenDyn, Piper voices). **Future spec:** TBD — brainstorm pending.

#### Workstream 8 — AI-slop / comment cleanup pass

**State:** ⏳ planned. **Blocker:** workstreams #3 and #4 should land first to avoid re-work. **Next action:** brainstorm → spec → plan once #3 and #4 finalise file boundaries. Scope: a systematic pass to delete AI-generated comments, normalise docstrings, remove dead code identified in #3/#4. **Future spec:** TBD — brainstorm pending.

### 2.4 Canonical repo ledger

Verified by `git -C <path> log` audit on 2026-05-29. Every disk path confirmed to exist.

| Repo / clone path | Branch | Last commit | Account | Status |
|---|---|---|---|---|
| `<repo-root>/edotutor-test` | `main` | `d9441222` (2026-05-29) | princeofwellness | **CANONICAL — frontend + backend** |
| `<repo-root>/edotutor-ue5-latest` | `Edutor_UnrealEngine-pow-face` | `85694ade` (2026-05-29) | princeofwellness | **CANONICAL — UE5** |
| `<repo-root>/edotutor-fresh` | `main` | `aa3317b3` (2026-05-17) | princeofwellness | **STALE — delete after backup (W6)** |
| `<repo-root>/edotutor-audit` | `fix/lipsync-anchor-audio-tempo` | `b7609d5` (2026-05-15) | princeofwellness | **FEATURE BRANCH — merge or drop (W6)** |
| `<repo-root>/edotutor-ue5` | DETACHED HEAD | `d5f1d4c` (2026-05-15) | princeofwellness | **DETACHED — delete (W6)** |
| `<repo-root>/edututor` | `main` | `4ca4586` (2025-09-24) | legacy-account-1 | **ARCHIVED — out of scope** |
| `<repo-root>/edututor-fullstack` | `master` | `e0090b7` (2026-01-15) | legacy-account-1 | **ABANDONED — out of scope** |
| `<repo-root>/swc-ainag` | `master` | `f71bbfa` (2025-02-15) | legacy-account-2 | **UNRELATED — out of scope** |

### 2.5 Workstream status table

| # | Workstream | State | Blocker | Next action | Owner |
|---|---|---|---|---|---|
| 1 | Strategy doc (this file) | done | — | keep current as state changes | <owner> |
| 2 | EXE bundle to production-clean | in-flight | UE5 re-cook + 2 file patches | run two-gate procedure in `exe-bundle-handoff.md` → `pnpm dist` v0.4.5 | <owner> |
| 3 | Backend cleanup (`tutor-service/`) | planned | — | brainstorm → spec → plan | <owner> |
| 4 | Frontend cleanup (`core/`) | planned | — | brainstorm → spec → plan | <owner> |
| 5 | UE5 reconcile + re-cook | in-flight | Animation Engineer review | open PR `Edutor_UnrealEngine-pow-face → Edutor_UnrealEngine` | Animation Engineer |
| 6 | Git hygiene + fresh-account migration | planned | decide if new account exists | brainstorm → spec → plan | <owner> |
| 7 | Risk / security audit | planned | — | brainstorm → spec → plan | <owner> |
| 8 | AI-slop / comment cleanup pass | planned | needs W3 + W4 first | brainstorm → spec → plan after #3, #4 land | <owner> |

### 2.6 Open risks

**(a) Secrets / `.env` discipline.** Pending security audit for credential handling.

**(b) Local exposed ports.** Backend `:8000`, frontend `:3000`, Wilbur `:8888`, Ollama `:11434`, UE5 streamer — all bind on the student's machine. If they bind `0.0.0.0` (post the Windows IPv6 fix), they're reachable from the LAN. Memory `project_ipv6_bind_windows` covers the bind fix but does not address LAN exposure. Workstream #7 must decide loopback-only vs LAN-OK and document.

**(c) Embedded keys in bundled EXE.** Pending security audit for credential handling.

**(d) Account-handover risks.** The `princeofwellness` account currently owns the canonical repos and (likely) Vercel / GitHub Actions / domain registrations. Workstream #6 must enumerate every platform tied to that account, document the migration order (DNS last), and decide on recovery contacts before any transfer.

**(e) Cooked UE5 build is opaque.** The `Downloads/Edutor<date>/Windows/` cook is binary `.pak` content with no git history. If the cook breaks, there's no diff to read — only the source project on `Edutor_UnrealEngine-pow-face` is reviewable. Treat each cook as a one-way handoff; keep the source branch tag matching the cook date.

### 2.7 Handoff pointers

Documents to read after this one, in priority order:

- [`docs/exe-bundle-handoff.md`](exe-bundle-handoff.md) — what today's fixes need before the next EXE cook.
- [`docs/MASTER_PLAN.md`](MASTER_PLAN.md) — the grant-level roadmap, owners (UE5 Engineer / Animation Engineer / Eng), and W1–W10 workstreams (a superset of the 8 above).
- [`CLAUDE.md`](../CLAUDE.md) — project-specific operational rules for Claude agents.
- [`CONTEXT.md`](../CONTEXT.md) — vocabulary (Avatar not character, Tutor Service not backend) and contract pointers.
- [`DESIGN.md`](../DESIGN.md) — design tokens, typography, color discipline for the frontend.
- Memory index at `<local Claude config directory>/memory/MEMORY.md` — durable, cross-session truths. Key entries: `project_github_account`, `reference_dev_stack`, `reference_ue5_project`, `project_avatar_emotion_gap`, `project_source_side_audio`, `project_arkit_orphaned`.

---

*End of document. If state has changed and this doc has not, the doc is wrong — fix it in the same commit that changed state.*

