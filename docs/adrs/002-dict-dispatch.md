# ADR-002: Dict-Dispatch Tables for Multi-Provider Services (No if/elif)

**Status:** Accepted

---

## Context

EduTutor.AI fronts every external system with a service class that
supports multiple providers:

- **TTS**: 11 providers (Edge, OpenAI, Azure, Google, Piper, XTTS,
 Kokoro, Chatterbox, Coqui, Mock, XTTS-clone)
- **LLM**: 6 providers (OpenAI, Anthropic, Azure, Ollama, vLLM,
 custom registry, mock fallback)
- **STT**: Multiple Whisper variants including SloPal SK fine-tunes
- **RAG**: Chroma (default) or Weaviate via `VECTOR_DB_BACKEND`

Pre-Phase-5, provider selection was an `if/elif` chain in each service:

```python
# Old style — REJECTED
if provider == "edge":
 return await self._synthesize_edge(text)
elif provider == "openai":
 return await self._synthesize_openai(text)
elif provider == "azure":
 return await self._synthesize_azure(text)
#... 11 elif branches
```

This had three problems:

1. **Adding a provider** required editing the chain AND remembering to
 maintain the order.
2. **Provider sets diverged** between similar services (TTS vs LLM had
 different conventions).
3. **Reading the dispatch logic** required scrolling past 11 branches
 to confirm what was supported.

## Decision

Every multi-provider service exposes a **dict-dispatch table** keyed on
provider ID. Inference logic lives in handler functions/methods. Adding
a provider is ONE table entry.

```python
# tts_service.py — current style
def _default_dispatch(self):
 return {
 "edge": self._synthesize_edge,
 "openai": self._synthesize_openai,
 "xtts_clone": self._synthesize_xtts_clone,
 "mock": self._synthesize_mock,
 }
```

Dispatch becomes:
```python
handler = self._default_dispatch.get(self._provider)
if handler is None:
 return await self._synthesize_mock(text)
return await handler(text)
```

## The rule (NON-NEGOTIABLE)

**NEVER `if/elif` for provider dispatch. ONLY table entries.**

This rule is pinned in:
- This ADR (canonical source). The dict-dispatch rule: every multi-provider service exposes a dict keyed on provider ID; adding a provider is one table entry, never an `if/elif` branch.
- [`tutor-service/app/services/README.md`](../../tutor-service/app/services/README.md)
- Tests indirectly via baseline non-displacement checks

## Rationale

### Positive consequences
- **One-line provider addition** — see [`/edu-new-tts`](../../.opencode/commands/edu-new-tts.md) workflow
- **Table is the documentation** — reading `_default_dispatch` tells you everything supported
- **Easier testing** — table can be patched in tests without monkeypatching control flow
- **Consistent shape** across TTS/LLM/STT/RAG — onboarding is faster

### Negative consequences
- Some provider-specific config (Azure's region, OpenAI's org ID) lives outside the table — accept this; the table is for dispatch, not config
- Subtle: the special case for Azure TTS (which DOES live in an `if` before the dispatch — see [`tts_service.py:188`](../../tutor-service/app/services/tts_service.py)) — this is legacy and tolerated because Azure has unique multi-param requirements (emotion, speech_rate, pitch, return_visemes). Future cleanup can subsume this into the table.

## Pinned by

- [`tutor-service/tests/test_slopal_registry.py`](../../tutor-service/tests/test_slopal_registry.py) (6 tests) — baseline non-displacement (existing entries can't be reordered or renamed)
- [`tutor-service/tests/test_tts_voice_routing.py`](../../tutor-service/tests/test_tts_voice_routing.py) (16 tests) — voice-ID → provider routing
- [`tutor-service/tests/test_llm_switch.py`](../../tutor-service/tests/test_llm_switch.py) (6 tests) — LLM provider/model switching coherence

## Alternatives considered

1. **Plugin registration system** (each provider self-registers via decorator) — rejected as over-engineering for a small fixed set. Dict literal is sufficient.
2. **Class-per-provider hierarchy** (TTSProvider ABC + 11 subclasses) — rejected. The inference functions don't share enough state to justify a class hierarchy.
3. **Provider config in YAML/JSON** (data-driven dispatch) — rejected. Inference logic is Python-specific (async SDK calls, subprocess management). External config adds complexity without benefit.
