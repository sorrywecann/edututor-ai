---
name: Agent task
about: A self-contained task scoped for delegation to an AI coding agent
title: 'task: '
labels: ['agent-task', 'triage']
assignees: ''
---

<!--
This template is for tasks scoped to be picked up by an AI coding agent
(any AI coding agent) — or by a
human contributor who wants the same kind of clarity.

If a task is too open-ended for an agent to execute without
clarification, it's probably not ready to be filed yet. Open a
discussion or feature request first.
-->

## Task

<!-- One-sentence goal. Atomic. -->

## Authoritative context (read these first)

<!-- File paths the agent must read before starting. Be specific. -->

-
-

## Required reading from AGENTS.md

- [ ] "Hot path" section (if touching `chat.py`)
- [ ] "Architectural pillars" — relevant pillar number
- [ ] "Smart routing playbook" — relevant intent row
- [ ] "Non-negotiable invariants"

## Acceptance criteria

<!-- Specific, testable. No "and stuff". -->

1.
2.
3.

## Must do

<!-- Exhaustive list of requirements. Leave nothing implicit. -->

-
-

## Must not do

<!-- Anticipate rogue behavior. -->

-
-

## Recommended approach

<!-- Optional. Sketch the approach so the agent doesn't have to derive it. -->

## Tests required

<!-- Which tests to add or update. Every behavior gets a test. -->

-

## Verification command

```bash
# Exact command(s) to confirm acceptance criteria are met:
cd tutor-service && python -m pytest tests/<file>.py -v
```

## Estimated effort

- [ ] S — single file, <30 min
- [ ] M — multi-file in one module, <2 hours
- [ ] L — cross-module, <1 day
- [ ] XL — phase-sized, needs a plan in `docs/plans/` first

## Suggested agent profile

<!-- Optional hint for the contributor about which agent / category fits. -->

- [ ] Trivial / single-file (DeepSeek Flash / Sonnet / Cursor inline)
- [ ] Deep reasoning needed (Opus / Sonnet via Oracle)
- [ ] Plan authoring (Metis → write → Momus review workflow)
- [ ] Other:

## Definition of done

- [ ] Acceptance criteria all pass
- [ ] Tests added / updated (with docstrings documenting the contract pinned)
- [ ] No regression in `cd tutor-service && python -m pytest tests/ -q` baseline (502/1)
- [ ] No regression in `cd core && pnpm tsc --noEmit && pnpm build`
- [ ] LSP diagnostics clean on changed files
- [ ] PR opened referencing this issue
