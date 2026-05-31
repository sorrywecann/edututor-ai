# EduTutor.AI — Project Rules for Claude Code

## Read These First

Before doing anything in this repository:

1. **Read `CONTEXT.md`** — Domain glossary. Use the exact terms defined there.
2. **Read `DESIGN.md`** — All visual decisions. Do not introduce colors/fonts/components not defined there.
3. **Read `docs/MASTER_PLAN.md`** — Active workstreams and locked architectural decisions.
4. **Check `docs/STATE_OF_PROJECT.md`** — Current state of each workstream.

Global behaviour rules are in `~/.claude/CLAUDE.md`. They apply here too.

---

## Locked Architectural Decisions

These are NOT open for discussion. Do not propose alternatives, do not "improve" them, do not revert them.

| Decision | Rule |
|---|---|
| **Audio source** | UE5 plays all TTS audio. The browser NEVER plays audio in avatar mode. `EDU_UE5_AUDIO` controls this. |
| **Avatar protocol** | `/ws/avatar` WebSocket. Every avatar payload includes `visemes` (14 keys), `emotion`, `intensity`. |
| **Lipsync system** | ZenDyn + 14 visemes. The `audio2lipsync/ARKit` path is orphaned — do not extend it. |
| **Avatar asset** | `MHC_Girl` MetaHuman in UE5. Viseme → blendshape mapping is in `docs/ue5/viseme-to-arkit-mapping.csv`. |
| **Release repo** | Clean public repo `sorrywecann/edututor-ai` — zero Claude/AI references in history/docs/comments. |
| **Frontend path** | All frontend code lives in `core/`. The Next.js 15 App Router. |
| **Design system** | Atmosphere (Living Room). All tokens in `DESIGN.md`. All primitives in `core/src/components/atmosphere/`. |

---

## What Not To Do

**Backend:**
- Do not extend `audio2lipsync/ARKit`. It renders nowhere. Remove it when W6 cleanup begins.
- Do not add browser-side audio playback when `EDU_UE5_AUDIO` is enabled.
- Do not add new `/ws/avatar` fields without updating `docs/ue5-avatar-contract.md` and briefing Martin.
- Do not change the 14-viseme inventory without Dominik's sign-off.
- Do not add a new LLM provider without first checking `docs/plans/` for prior decisions.

**Frontend:**
- Do not introduce colors, fonts, or spacing not in `DESIGN.md`.
- Do not create per-page custom card/panel components — use `<GlassCard>`.
- Do not use blue or purple accent colors (wrong palette — use `#D4845A` terracotta).
- Do not use cold dark navy as the background (use warm charcoal `#221912`).
- Do not render emoji in UI text (comments are fine).
- Do not skip `<StatusPill>` for boolean/state indicators.
- Do not hard-code Slovak text outside of i18n keys.

**Git:**
- Always work on a feature branch — never commit directly to `main`.
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/` prefixes.
- Never force-push `main`.
- Commit messages: present tense, 72-char subject line, no "Claude" or "AI" in messages destined for the release repo.

---

## Repository Structure

```
core/                   — Next.js 15 frontend
  src/
    app/                — App Router routes
    components/
      atmosphere/       — Design system primitives (read DESIGN.md first)
      chat/             — Chat UI
      kb/               — Knowledge base UI
      shell/            — Layout shell
      ui/               — Generic utility components
    context/            — React contexts
    hooks/              — Custom React hooks
    lib/                — Utilities, API clients
    stores/             — Zustand state stores
    types/              — TypeScript types

scripts/                — Tutor Service (Python/FastAPI backend)
  chat.py               — Main chat handler (ZenDyn, TTS, viseme broadcast)
  avatar_ws.py          — /ws/avatar WebSocket
  tutor.py              — LLM + RAG pipeline

docs/
  MASTER_PLAN.md        — The plan. Read this.
  CONTEXT.md            — Domain glossary (same as root)
  ue5-avatar-contract.md — Avatar protocol contract
  avatar-pipeline-handoff.md — Full pipeline: TTS → visemes → emotion → UE5
  design-atmosphere-rebuild.md — Atmosphere design phases
  plans/                — Per-workstream implementation plans
```

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, deployable. Never force-pushed. |
| `Edutor_UnrealEngine` | UE5 assets (`.uasset` files). Owned by Martin/Dominik. |
| `feat/living-room-redesign` | Current frontend redesign work |
| `feat/ue5-audio` | `EDU_UE5_AUDIO` source-side audio |
| `feat/*` | All new feature work |
| `fix/*` | Bug fixes |

---

## Working With UE5

- UE5 work lives on the `Edutor_UnrealEngine` branch.
- `.uasset` files are plain git blobs (not LFS). Do not add LFS.
- Key paths: `Blueprints/ABP_Face_PostProcess` (Dominik), `Characters/MHC_Girl` (Martin).
- When you change the avatar protocol: update `docs/ue5-avatar-contract.md` AND write a brief for Martin.
- For emotion changes: coordinate with Martin on the exact enum names the emotion plugin uses.
- Run UE5 in **Standalone Game mode** (not PIE) for avatar testing.

---

## Working With the Frontend

Before any frontend work:
1. Check `DESIGN.md` for tokens and component inventory
2. Check `core/src/components/atmosphere/` for existing primitives
3. Run `cd core && pnpm dev` to start the dev server at `:3000`
4. Test your change in the running browser before reporting done

When adding a new page/surface:
1. Determine the Tier (Ceremony vs Work) from `DESIGN.md` Surface Map
2. Use `<PageHeader>` at the top of every content page
3. Use `<EmptyState>` for zero-data states
4. Use `<StatusPill>` for any boolean/state displayed to the user

---

## Testing

- Unit tests: `cd core && pnpm test`
- E2E: currently manual — document test steps in the PR
- Backend: `pytest scripts/` (or per-file: `pytest scripts/test_chat.py`)
- Avatar protocol: see `docs/architecture/ue5-avatar-contract.md` for the WebSocket contract

TDD is required for all new backend logic. Frontend components: test behaviour, not implementation.

---

## Workstream Status → `docs/MASTER_PLAN.md`

Always check MASTER_PLAN.md for the current state of workstreams before starting work. The workstream owner must be consulted before touching their domain (Martin for W2/W3/W4, Dominik for W3).
