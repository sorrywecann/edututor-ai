# tests/ — Test Suite

**Current baseline: 523 passed, 8 skipped** on CI / hosts with the full
embedding stack. On hosts where `sentence_transformers` cannot import
(usually ffmpeg major-version mismatch with `torchcodec`), 11 memory
tests skip cleanly at module level → **512 passed, 10 skipped**. Both
outcomes are green. Any regression below either means recent work broke
something.

For architectural decisions, see [`../../docs/adrs/`](../../docs/adrs/).

---

## Run

```bash
# All tests, quiet:
python -m pytest tests/ -q

# Single file, verbose:
python -m pytest tests/test_ws_avatar.py -v

# Single test, with stdout passthrough:
python -m pytest tests/test_chat_dependency_injection.py::test_chat_uses_dep_override -v -s

# Pattern match:
python -m pytest tests/ -k "ws_avatar or broadcaster" -v
```

Canonical project-level command: [`/edu-test`](../../.opencode/commands/edu-test.md)
(runs backend pytest + frontend tsc + build + reports baseline drift).

## Skipped tests (8) — pre-existing, expected

It is network-dependent or GPU-only. They are NOT regressions and
should not be flagged in normal test runs. They surface during the
infrequent live-integration sweep.

Run with `-v` to see the skip reasons:

```bash
python -m pytest tests/ -v 2>&1 | grep -E "(SKIP|skipped)"
```

If a skip count goes ABOVE 1, something new was skipped and that needs
investigation. If it drops BELOW 1, a skip was lifted — make sure that
was intentional.

## Test conventions (enforced)

### 1. Docstring documents the contract pinned

Every test gets a docstring that documents:
- **What contract** is being pinned
- **Historical context** for why it matters (e.g., "Phase 1 fix for the
 concurrent-disconnect race")

CI failure on a docstring-less test means on-call has to read the test
body to understand what just broke. Don't do that to your teammates.

### 2. Mock external systems

Backend tests don't make real network calls, real LLM API calls, or hit
real GPUs. Use FastAPI's `app.dependency_overrides` (verified by
[`test_chat_dependency_injection.py`](./test_chat_dependency_injection.py)) or
`pytest-mock` fixtures.

### 3. Pin contract, not implementation

Tests should pin behavior visible to callers — payload shape, return
types, error semantics. Tests that snapshot implementation details
(specific function call counts, internal state) bit-rot fast.

### 4. Test name documents the intent

Pattern: `test_<subject>_<scenario>_<expected_outcome>`. E.g.
`test_broadcast_drops_dead_connection_in_finally`.

## Key contract tests

| File | Tests | Pins |
|---|---|---|
| [`test_ws_avatar.py`](./test_ws_avatar.py) | 20 | UE5 broadcaster invariants — see [ADR-005](../../docs/adrs/005-ue5-protocol-v21.md) |
| [`test_chat_dependency_injection.py`](./test_chat_dependency_injection.py) | 5 | Depends-override pattern works for chat/llm/avatar |
| [`test_tool_loop.py`](./test_tool_loop.py) | 9 | Tool loop bypass, dispatch, error recovery, max-iterations |
| [`test_skill_registry.py`](./test_skill_registry.py) | 10 | Skill+tool name uniqueness, dispatch contract |
| [`test_learning_modes.py`](./test_learning_modes.py) | 6 | Backwards-compat defaults (sk + en + default modes) |
| [`test_slopal_registry.py`](./test_slopal_registry.py) | 6 | NaiveNeuron HF model IDs verbatim — see [ADR-003](../../docs/adrs/003-naiveneuron-attribution.md) |
| [`test_tts_voice_routing.py`](./test_tts_voice_routing.py) | 16 | Voice-ID → provider routing |
| [`test_llm_switch.py`](./test_llm_switch.py) | 6 | LLM provider/model switching coherence |
| [`test_fragile_contracts.py`](./test_fragile_contracts.py) | 6 | RAG defaults, /chat greeting, SSE done event |
| [`test_user_identity.py`](./test_user_identity.py) | (Phase 8a) | Header > cookie > generate UUID — see [ADR-004](../../docs/adrs/004-anonymous-by-default-identity.md) |

## `conftest.py`

[`conftest.py`](./conftest.py) sets test-only env overrides (mock
providers, disabled web search, in-memory DB) so tests are deterministic
without external dependencies. Read it before authoring new fixtures
that touch env vars.

## When tests fail

1. Read the actual error first. Don't shotgun debug.
2. If it's pre-existing (was failing before your changes), note that in
 your PR — don't fix it inline unless asked.
3. If it's caused by your change, fix the root cause, not the symptom.
4. **NEVER delete a failing test to make CI green.** Hard block.

After 2+ failed fix attempts, consult `oracle`.
