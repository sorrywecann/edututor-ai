# ADR-001: Asymmetric Dependency Injection (LLM eager, RAG/TTS lazy)

**Status:** Accepted

---

## Context

FastAPI's `Depends` system supports both eager (declared at endpoint
signature) and lazy (called inside the handler body) dependency
injection. Convention says "use Depends consistently." We deliberately
break that convention for EduTutor.AI.

The chat hot path needs three services: **LLM**, **RAG**, **TTS**.

- **LLM**: Must succeed. The whole point of the chat endpoint is LLM
 inference. If we can't get an LLM, we can fall back to a mock that
 returns a friendly degraded response — but we always need *something*.
- **RAG**: May legitimately fail. Vector DB might be unreachable, ingestion
 might not have run yet, or the deployment might not have RAG configured.
 When RAG fails, the chat handler must continue **without context**, not
 return 500.
- **TTS**: May legitimately fail. The user might be on a text-only deploy.
 The provider's API key might be invalid. When TTS fails, the chat
 handler must return **text-only**, not 500.

## Decision

- **LLM** is **eager-injected** via `Depends(llm_service_dep)` in
 [`tutor-service/app/deps.py`](../../tutor-service/app/deps.py). Its
 initialization is robust — it falls back to a mock provider if all
 configured providers fail.

- **RAG and TTS** stay **lazy** inside endpoint bodies:
 ```python
 try:
 rag = await get_rag_service
 context = await rag.retrieve(...)
 except RAGUnavailable:
 context = "" # degrade gracefully
 ```

This is asymmetry by design.

## Rationale

| Service | Init can fail legitimately? | Caller can degrade? | DI style |
|---|---|---|---|
| LLM | No (mock is fallback) | No (we need a response) | Eager |
| RAG | Yes (no DB, no ingestion) | Yes (continue without context) | Lazy |
| TTS | Yes (no provider configured) | Yes (return text-only) | Lazy |

Eager injection of RAG/TTS would convert their legitimate failures into
500 Internal Server Error responses. That breaks the deployment model
(text-only or no-RAG deploys are valid). Lazy with try/except preserves
the graceful degradation contract.

## Consequences

### Positive
- Chat endpoint works in text-only, no-RAG, partial-config deployments
- Failure modes are explicit at the callsite (try/except is visible)
- LLM init failures fail loudly via the eager Depends chain

### Negative
- Asymmetry violates the "be consistent" reflex
- Onboarding requires explaining why RAG/TTS aren't `Depends`-injected
- Risk: a well-meaning refactor "normalizes" the pattern and breaks graceful paths

### Mitigation
- This ADR is the canonical source. Future contributors read it before "fixing" the asymmetry.
- `tutor-service/README.md` and `app/services/README.md` repeat the rule.
- The asymmetric DI rule: required services (LLM) are injected eagerly at startup via `Depends`; optional services (RAG, TTS) are pulled lazily inside the handler body so their failures degrade gracefully instead of returning 500.

## Pinned by

- [`tutor-service/tests/test_chat_dependency_injection.py`](../../tutor-service/tests/test_chat_dependency_injection.py) (5 tests) — verifies the Depends-override pattern works for chat/llm/avatar endpoints

## Alternatives considered

1. **Eager all three** — rejected. Breaks graceful degradation.
2. **Lazy all three** — rejected. LLM init failure should be loud and immediate, not silently mocked deep inside a handler.
3. **A unified service abstraction with internal "optional" semantics** — rejected as over-engineering. The asymmetry is intrinsic to the services' failure profiles, not an accidental implementation detail.
