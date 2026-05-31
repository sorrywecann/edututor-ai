# Workflow: Ship a Phase Deliverable

EduTutor.AI ships in numbered phases. Each phase = one focused
deliverable. Phase plans live in [`../plans/`](../plans/) as
`YYYY-MM-DD-phase<N>-<slug>.md`.

This workflow takes you from idea → planned → built → shipped.

---

## Phase 0 — Idea (you're here)

You have a one-sentence goal. E.g. "add cross-session memory so the
tutor remembers facts across sessions."

## Phase 1 — Planning (`/edu-phase-plan`)

Run the slash command:
```
/edu-phase-plan <one-sentence goal>
```

This walks the canonical workflow:

1. **Metis consultation** — pre-planning agent identifies hidden intentions, ambiguities, scope clarifications. Pass it the goal + relevant ADRs + in-flight context.
2. **Plan authoring** — write a plan document. Match the shape of existing plans in `docs/` for reference.
3. **Momus review** — invoke with the plan file path as the SOLE prompt. Momus reviews for clarity, verifiability, completeness.
4. **Apply Momus feedback** — edit plan inline. Document intentional disagreements.
5. **User green light** — present plan + Momus concerns + estimated effort. Wait for explicit go-ahead.

Do NOT skip Metis or Momus. the project's plans without review tend to be
optimistic.

## Phase 2 — Implementation (subagent-driven)

Once the plan is green-lit:

1. Load the `subagent-driven-development` skill
2. Decompose tasks atomically (the plan should already have done this)
3. Delegate task-by-task via `task` with appropriate category + skills
4. Verify each task BEFORE moving to the next:
 - `lsp_diagnostics` on changed files
 - Run relevant test files
 - Confirm against the plan's acceptance criteria

For trivial tasks (single file, clear scope), execute directly. For
multi-file or unfamiliar surfaces, delegate to specialists.

## Phase 3 — Testing

Every new behavior gets a test. Every test has a docstring documenting:
- What contract is pinned
- Historical context (why it matters)

See [`tutor-service/tests/README.md`](../../tutor-service/tests/README.md).

Backwards-compatibility tests are MANDATORY when the change could affect
existing user flows. E.g. Phase 8a added 24 tests pinning the
header-first identity resolution because it's the legacy-compat
guarantee.

## Phase 4 — Documentation

Update:
- [`CHANGELOG.md`](../../CHANGELOG.md) — `[Unreleased]` section gets a new entry
- **ADRs** — if you made a non-trivial architectural decision, add a new ADR in `docs/adrs/`
- **`tutor-service/README.md`** + relevant sub-domain READMEs — if the change affects developer workflow

## Phase 5 — Verification

Run [`/edu-pre-pr`](../../.opencode/commands/edu-pre-pr.md). All 9 steps must pass:
- Working tree sanity
- Backend tests (no regression from baseline)
- Frontend tsc + build
- LSP diagnostics on changed files
- UE5 protocol check (if avatar files touched)
- Convention review
- `review-work` skill (5 parallel sub-agents)
- Commit message preview
- Final summary

## Phase 6 — Ship

1. Commit. Imperative summary. No AI attribution. No emojis. Body explains the why. End with `Verified: N passed + M skipped`.
2. Push the branch.
3. Open PR (only when user asks).
4. Address review comments.
5. Merge.
6. Update [`CHANGELOG.md`](../../CHANGELOG.md) `[Unreleased]` section.

## Anti-patterns to avoid

- **Implementing before planning** — leads to scope creep
- **Skipping Metis** — leads to missed scope ambiguities
- **Skipping Momus** — leads to optimistic plans
- **Skipping tests** — leads to regressions in next phase
- **Over-engineering** — refactoring unrelated code while shipping the feature
- **Deleting failing tests** — hard block

## When stuck

After 2+ failed fix attempts: consult `oracle`.
After 3 consecutive failures: STOP, revert, document, ask user.
