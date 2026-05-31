# Workflow: Bugfix vs. Refactor (and Why You Should Never Combine Them)

A core EduTutor.AI convention: **bugfix ≠ refactor**. When fixing a bug,
fix MINIMALLY. Resist the urge to clean up surrounding code "while
you're in there."

---

## Why this rule exists

1. **Reviewability** — a 5-line bugfix is easy to review. A 500-line "while I was in there" PR is not.
2. **Bisectability** — when a regression appears later, `git bisect` to a focused bugfix commit points at the cause. A mixed commit muddies the trail.
3. **Revertability** — if the bugfix is wrong, reverting it doesn't undo unrelated cleanup work.
4. **Scope creep** — "I'll just rename this variable too" leads to "I'll just refactor this module too" leads to a 3-day yak shave that delays the fix.

---

## Decision tree

```
Is there a confirmed bug (failing test, user report, error log)?
│
├── YES → BUGFIX MODE
│ │
│ ├── Locate the root cause (read error, check assumptions, NEVER guess)
│ ├── Write a failing test that reproduces the bug
│ ├── Make the SMALLEST CHANGE that turns it green
│ ├── Verify no other tests regressed
│ └── Commit ONLY the fix + the new test. Nothing else.
│
└── NO → Is the code working correctly?
 │
 ├── YES → REFACTOR MODE (only if user asks)
 │ │
 │ ├── Establish a regression baseline (current tests pass)
 │ ├── Make behavior-preserving changes
 │ ├── Confirm all existing tests still pass (byte-identical behavior)
 │ └── Commit the refactor separately, with explicit "Refactor:..." subject
 │
 └── NEEDS BOTH? → STOP. Two separate PRs.
 │
 ├── PR 1: bugfix (minimal)
 ├── Merge PR 1
 ├── PR 2: refactor (on top of fixed code)
 └── Reviewers see clean diffs each time
```

---

## Bugfix mode rules

1. **Read the actual error** — not your guess of the error. Stack trace, log line, test output.
2. **Reproduce locally** — a bug you can't reproduce isn't a bug you can fix confidently.
3. **Write the failing test FIRST** — so green = fixed, not green = lucky.
4. **Smallest change** — when two approaches both fix, prefer fewer new names, no new abstractions, no new files.
5. **DO NOT touch surrounding code** — even if you spot another bug. Note it for a future fix.
6. **DO NOT rename, reformat, or reorganize** — these are refactor changes, not bug fixes.
7. **DO NOT delete the failing test to make it pass** — hard block.
8. **DO NOT shotgun debug** — random changes hoping to fix it. Diagnose first.

## Refactor mode rules

1. **Only when user explicitly asks** — otherwise it's scope creep.
2. **Behavior must be byte-identical** — regression test or explicit doc on why no test is possible.
3. **Tests must still pass UNCHANGED** — if you have to modify tests to make a refactor work, you're not refactoring, you're changing behavior.
4. **Commit message starts with `Refactor:`** — signals intent to reviewers and bisect.
5. **No new features in a refactor commit** — even tiny ones. Separate commit.

## Common temptations (resist)

| You see... | The wrong reflex | The right move |
|---|---|---|
| A variable with a bad name nearby the bug | Rename it while you're here | Note it, fix the bug, file a follow-up |
| A duplicated code block | Extract a helper | Note it, fix the bug, file a follow-up |
| A missing type annotation | Add it | Note it, fix the bug, file a follow-up |
| A test without a docstring | Add the docstring | Note it, fix the bug, file a follow-up |
| An obvious comment in old code | Delete it | Note it, fix the bug, file a follow-up |

The pattern: **note → fix → follow-up**. Don't combine.

## When the bug REQUIRES a refactor

If the bug is structural (e.g. an `if/elif` chain has wrong logic and the
right fix is to convert to a dict-dispatch table), then:

1. Confirm with the user FIRST — "fixing this requires a small refactor, is that OK?"
2. Make the refactor minimal — convert only the affected branch, leave the rest as-is for a separate refactor PR
3. The PR title is `Fix + refactor: <description>` — flagged for closer review
4. Include the failing test that motivated the fix

## When stuck

If you can't tell whether it's a bugfix or a refactor: the test will
tell you. **Is there a failing test that this change makes pass?** If
yes: bugfix. If no: refactor (or new feature).
