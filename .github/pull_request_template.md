<!--
Pre-PR checklist — run /edu-pre-pr before opening this PR.
That command runs the full 9-step gauntlet automatically.
-->

## Summary

<!-- 1-3 bullet points. What does this PR do, and why? Focus on the WHY. -->

-
-

## Changes

<!-- Files / modules touched. Group by area if many. -->

-

## Phase / plan link

<!-- If this PR implements a Phase plan, link it. -->

- Plan: `docs/plans/...md`
- Phase: N.X

## Testing

<!-- How was this verified? Required for every PR. -->

- [ ] Backend tests pass (`cd tutor-service && python -m pytest tests/ -q`)
 - Baseline: 502 passed, 1 skipped. New count: _____ passed, _____ skipped.
- [ ] Frontend typecheck clean (`cd core && pnpm tsc --noEmit`)
- [ ] Frontend build clean (`cd core && pnpm build`)
- [ ] UE5 protocol check passed (if avatar/broadcaster files touched) — `/edu-ue5-check`
- [ ] LSP diagnostics clean on changed files

## Invariants checked

<!-- See AGENTS.md "Non-negotiable invariants". Tick all that apply to this PR. -->

- [ ] UE5 protocol v2.1 preserved (payload shape, snapshot-safe iteration, 2.0s wait_for, agentState back-compat)
- [ ] NaiveNeuron HF model IDs unchanged (CC-BY-4.0 attribution)
- [ ] `X-EduTutor-User-Id` header path preserved (Phase 8a identity)
- [ ] Asymmetric DI preserved (LLM eager, RAG/TTS lazy)
- [ ] Dict-dispatch tables preserved (no new `if/elif` for providers)
- [ ] No `as any`, `@ts-ignore`, `@ts-expect-error`
- [ ] No empty `catch {}` blocks
- [ ] No deleted failing tests
- [ ] Every new test has a docstring documenting the contract pinned

## Docs updated

<!-- Tick all that apply. -->

- [ ] AGENTS.md "Phase history" row added (if this lands a phase)
- [ ] AGENTS.md "Non-negotiable invariants" updated (if a new invariant)
- [ ] Relevant sub-domain README updated (`tutor-service/README.md`, `core/README.md`, etc.)
- [ ] New ADR added in `docs/adrs/` (if a new architectural decision)
- [ ] [`CHANGELOG.md`](../CHANGELOG.md) `[Unreleased]` section updated

## Reviewer notes

<!-- Anything reviewers should know? Tricky bits? Tradeoffs taken? -->

---

<!--
Commit convention reminder:
- Imperative summary line ("Add X" not "Added X" / "Adds X")
- NO Claude / AI / attribution
- NO emojis
- Body explains the WHY
- Reference related commit SHAs if applicable
- End with: Verified: N passed + M skipped
-->
