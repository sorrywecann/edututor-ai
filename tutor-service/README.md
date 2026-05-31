# tutor-service — EduTutor.AI Backend

FastAPI service for the EduTutor.AI Slovak language tutor. Hot path is
`POST /api/v1/chat` and `POST /api/v1/chat/stream`.

For architectural decisions, see [`../docs/adrs/`](../docs/adrs/).

---

## Quick start

```bash
# From repo root, run./start.sh which auto-installs and runs everything.
# To run just the backend locally:

cd tutor-service
python -m venv venv
source venv/bin/activate # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs at http://localhost:8000/docs once it's running.

## Test loop

```bash
# Run everything (canonical):
python -m pytest tests/ -q
# Baseline: 523 passed, 8 skipped
# (or 512 / 10 on hosts where sentence_transformers can't import — the 11
#  memory tests then skip at module level, see tests/test_memory_recall.py)

# Run one file with output:
python -m pytest tests/test_ws_avatar.py -v

# Run one test with stdout passthrough:
python -m pytest tests/test_chat_dependency_injection.py::test_chat_uses_dep_override -v -s
```

1 skipped test is pre-existing and expected (network-only, GPU-only). See [`tests/README.md`](./tests/README.md) for the skip catalog.

For the full pre-PR check (incl. frontend), use the project-level slash command [`/edu-pre-pr`](../.opencode/commands/edu-pre-pr.md).

## Environment

Sensitive secrets go in `.env` (gitignored). Public defaults in `.env.example`.

Key env vars:

| Var | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI LLM + TTS | — |
| `ANTHROPIC_API_KEY` | Anthropic LLM | — |
| `LLM_PROVIDER` | `openai` / `anthropic` / `azure` / `ollama` / `vllm` / `mock` | `openai` |
| `TTS_PROVIDER` | `edge` / `openai` / `azure` / `xtts` / `piper` / `kokoro` /... | `edge` |
| `STT_PROVIDER` | Whisper variant ID (incl. SloPal SK fine-tunes) | depends on mode |
| `VECTOR_DB_BACKEND` | `chroma` (default) or `weaviate` | `chroma` |
| `WEB_SEARCH_ENABLED` | Phase 7 web_search skill kill switch | `false` |

`tests/conftest.py` overrides env vars for the test suite — see [`tests/README.md`](./tests/README.md).

## Architecture pointers

| What | Where |
|---|---|
| **Hot path** (chat → tools → avatar) | [`app/api/chat.py`](./app/api/chat.py) |
| **UE5 avatar protocol** | [`app/api/ws_avatar.py`](./app/api/ws_avatar.py) + [`app/services/avatar_broadcaster.py`](./app/services/avatar_broadcaster.py) |
| **Provider abstractions** (TTS/LLM/STT/RAG) | [`app/services/`](./app/services/) — see [`services/README.md`](./app/services/README.md) |
| **Skill platform** (Phase 6+) | [`app/skills/`](./app/skills/) — see [`skills/README.md`](./app/skills/README.md) |
| **LearningModes** (personas) | [`app/config/learning_modes.py`](./app/config/learning_modes.py) |
| **Identity middleware** (Phase 8a) | [`app/middleware/user_identity.py`](./app/middleware/user_identity.py) |
| **FastAPI DI wiring** | [`app/deps.py`](./app/deps.py) |

## Conventions (enforced)

- **Asymmetric DI**: LLM eager-injected (`Depends`), RAG/TTS lazy inside endpoint bodies — see [ADR-001](../docs/adrs/001-asymmetric-DI.md)
- **Dict-dispatch tables**: new providers are table entries, never `if/elif` — see [ADR-002](../docs/adrs/002-dict-dispatch.md)
- **No type-error suppression**: no `as any`, no `@ts-ignore`, no `@ts-expect-error` (hard block)
- **No empty `except`**: catch what you can handle, let the rest propagate
- **Comments only for non-obvious invariants** — CI hook flags violations
- **Every test has a docstring** documenting the contract pinned — see [`tests/README.md`](./tests/README.md)

## Common workflows

| Want to... | Use |
|---|---|
| Add a new Skill | [`/edu-new-skill <name>`](../.opencode/commands/edu-new-skill.md) |
| Add a new TTS provider | [`/edu-new-tts <provider>`](../.opencode/commands/edu-new-tts.md) |
| Add a new LearningMode | [`/edu-new-mode <name>`](../.opencode/commands/edu-new-mode.md) |
| Touch avatar/broadcaster | [`/edu-ue5-check`](../.opencode/commands/edu-ue5-check.md) FIRST |
| Pre-PR validation | [`/edu-pre-pr`](../.opencode/commands/edu-pre-pr.md) |
