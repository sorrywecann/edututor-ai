# Workflow: Add a New Skill

> Use the [`/edu-new-skill <name>`](../../.opencode/commands/edu-new-skill.md)
> slash command — this document is its long-form companion.

This is the **canonical 8-step procedure** derived from how `WebSearchSkill`
and `SpacedRepetitionSkill` were shipped in Phase 7.

---

## Before you start

Read these in order (DO NOT skip):

1. [`tutor-service/app/skills/base.py`](../../tutor-service/app/skills/base.py) — `Skill` ABC + `ToolDef` dataclass
2. [`tutor-service/app/skills/web_search/skill.py`](../../tutor-service/app/skills/web_search/skill.py) — canonical stateless skill
3. [`tutor-service/app/skills/spaced_repetition/skill.py`](../../tutor-service/app/skills/spaced_repetition/skill.py) — canonical stateful per-user skill
4. [`tutor-service/app/skills/startup.py`](../../tutor-service/app/skills/startup.py) — registration + typo validation
5. [`tutor-service/app/api/chat.py`](../../tutor-service/app/api/chat.py) — find `_TOOL_NAME_TO_AGENT_STATE` mapping
6. [`tutor-service/tests/test_skill_registry.py`](../../tutor-service/tests/test_skill_registry.py) — registry invariants
7. [`tutor-service/tests/test_tool_loop.py`](../../tutor-service/tests/test_tool_loop.py) — dispatch semantics

## The 8 steps

### 1. Create directory
```
tutor-service/app/skills/<name>/
├── __init__.py
└── skill.py
```

### 2. Author `__init__.py`
```python
from.skill import <CamelCase>Skill

__all__ = ["<CamelCase>Skill"]
```

### 3. Author `skill.py`

Match the shape from one of the two reference skills:

- **Stateless** (network, computation, no user-specific data) → copy `web_search/skill.py` shape. Handlers do NOT take `user_id`.
- **Stateful per-user** (DB-backed, user data) → copy `spaced_repetition/skill.py` shape. Handlers take `user_id: str`. Data scoped by that ID.

Each tool gets a `ToolDef` with:
- `name` (snake_case, unique in registry)
- `description` (1-2 sentences, LLM-facing)
- `parameters` (JSON Schema dict)
- `handler` (your async method)

### 4. Register in `startup.py`

Inside `register_default_skills`:
```python
from app.skills.<name> import <CamelCase>Skill

if "<name>" not in known:
 registry.register(<CamelCase>Skill)
```

The `"<name>" not in known` guard makes registration idempotent.

### 5. Extend agentState mapping

In [`tutor-service/app/api/chat.py`](../../tutor-service/app/api/chat.py), find `_TOOL_NAME_TO_AGENT_STATE` and add entries for each new tool:

```python
_TOOL_NAME_TO_AGENT_STATE = {...,
 "<your_tool_name>": "thinking", # or "searching", "writing", "reading"
}
```

If you skip this, the avatar shows the default state during dispatch.

### 6. Enable on a LearningMode (carefully)

In [`tutor-service/app/config/learning_modes.py`](../../tutor-service/app/config/learning_modes.py), find a non-default mode and append your skill name to `enabled_skills`.

**DO NOT** add to `sk`, `en`, `learn-en-from-sk`, or `default` modes —
[`tests/test_learning_modes.py`](../../tutor-service/tests/test_learning_modes.py) pins their backwards-compat (empty `enabled_skills` + tutor type).

Consider creating a NEW mode if your skill is the differentiator (like
`assistant` and `tutor_practice` were added in Phase 7).

### 7. Write tests

Minimum:
- `tutor-service/tests/test_<name>_skill.py` — unit tests for each tool's handler (mock external deps)
- One integration test exercising the full `_run_tool_loop` path with a mocked LLM that emits a tool call

Every test gets a docstring documenting:
- What contract is pinned
- Why it matters (the historical context)

### 8. Verify

```bash
cd tutor-service && python -m pytest \
 tests/test_<name>_skill.py \
 tests/test_skill_registry.py \
 tests/test_tool_loop.py \
 -v
```

Then the full suite to confirm no regressions:
```bash
python -m pytest tests/ -q
```

Baseline: 502 passed + 1 skipped. New count = baseline + your new tests.

## Hard constraints (recap)

- **DO NOT** modify `app/skills/base.py` (ABC locked)
- **DO NOT** add to default modes (`sk`/`en`/`learn-en-from-sk`/`default`)
- **DO** scope by `user_id` in per-user skills (Phase 8a)
- **DO** bound tool output sizes (loop budget = `max_iterations=4`)
- **DO** write a docstring per test

## When done

Run [`/edu-pre-pr`](../../.opencode/commands/edu-pre-pr.md) for the full pre-PR check, then ask for review.
