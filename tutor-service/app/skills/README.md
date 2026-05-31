# app/skills/ — Skill Platform (Phase 6+ Spine)

This is EduTutor.AI's modular agent skill platform. Skills are the units
of capability the chat agent can call via tool-use during a conversation.

Currently shipped: **`web_search`** (Phase 7), **`spaced_repetition`** (Phase 7), **`memory`** (Phase 8b).

For the chat hot path that dispatches skills, see [`../api/chat.py`](../api/chat.py).
For architectural decisions, see [`../../../docs/adrs/`](../../../docs/adrs/).

---

## Files

| File | Purpose |
|---|---|
| [`base.py`](./base.py) | `Skill` ABC + `ToolDef` dataclass — **LOCKED contract**, pinned by `test_skill_registry.py` |
| [`__init__.py`](./__init__.py) | `SkillRegistry` singleton + `get_registry` + `dispatch` |
| [`startup.py`](./startup.py) | `register_default_skills` lifespan hook + typo validation |
| [`web_search/skill.py`](./web_search/skill.py) | Canonical **stateless** skill — DDG + trafilatura, 2 tools |
| [`spaced_repetition/skill.py`](./spaced_repetition/skill.py) | Canonical **stateful per-user** skill — py-fsrs + SQLite, 3 tools |
| [`memory/skill.py`](./memory/skill.py) | **Phase 8b cross-session memory** — recall + remember, 2 tools, scoped via `user_id` to `episodic_memory_service` |

## Adding a new Skill

Use the slash command: [`/edu-new-skill <name>`](../../../.opencode/commands/edu-new-skill.md)

That command walks the canonical 8-step procedure derived from how
`WebSearchSkill` and `SpacedRepetitionSkill` were shipped. Read both
reference skills end-to-end before authoring a new one.

## The `user_id` rule (Phase 8a)

`SkillRegistry.dispatch` detects via `inspect.signature` whether a
handler accepts `user_id: str`. If yes, it forwards
`request.state.user_id` automatically. If no, no boilerplate is added.

- **Stateless skills** (like `web_search`) — handlers do NOT take `user_id`. Same query → same result regardless of caller.
- **Stateful per-user skills** (like `spaced_repetition`) — handlers take `user_id: str`. Data is scoped by that ID. Tests pin this contract: [`tests/test_skill_dispatch_user_id.py`](../../tests/test_skill_dispatch_user_id.py).

## The agentState mapping

After a skill's tool is dispatched, the UE5 avatar reflects the work via
its `agentState` field. The mapping lives in
[`../api/chat.py:_TOOL_NAME_TO_AGENT_STATE`](../api/chat.py). When you
add a new tool, append an entry — otherwise the avatar shows the default
`thinking` during dispatch.

Common states: `thinking`, `searching`, `writing`, `reading`, `listening`.

## Hard constraints

- **DO NOT modify** [`base.py`](./base.py) — the ABC is locked
- **DO NOT enable** new skills on `sk`, `en`, `learn-en-from-sk`, or `default` LearningModes — `test_learning_modes.py` pins backwards-compat
- **DO scope by `user_id`** in any per-user skill — Phase 8a contract
- **DO bound your outputs** — tool results must not exhaust LLM context across `max_iterations=4`. WebSearchSkill caps at 5×200 chars; FetchUrl caps at 500 chars body.
- **DO write a docstring** for every test — project convention

## Tests

| Test | Pins |
|---|---|
| [`test_skill_registry.py`](../../tests/test_skill_registry.py) | Skill+tool name uniqueness, dispatch contract, singleton |
| [`test_tool_loop.py`](../../tests/test_tool_loop.py) | Bypass-when-empty, single+multi-call dispatch, error recovery, max-iterations |
| [`test_skill_dispatch_user_id.py`](../../tests/test_skill_dispatch_user_id.py) | `user_id` forwarding gated on `inspect.signature` |
