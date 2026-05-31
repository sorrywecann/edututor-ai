# app/services/ — Multi-Provider Service Layer

EduTutor.AI's provider-abstracted services. Every external system (TTS,
LLM, STT, RAG, emotion, lipsync) is fronted by a service class with a
**dict-dispatch table** keyed on provider ID.

For architectural decisions, see [`../../../docs/adrs/`](../../../docs/adrs/).

---

## The dispatch table contract

**One entry per provider. Never `if/elif`.** This is a NON-NEGOTIABLE
architectural invariant (see [ADR-002](../../../docs/adrs/002-dict-dispatch.md)).

| Service | File | Providers shipped |
|---|---|---|
| **TTS** | [`tts_service.py`](./tts_service.py) | 10 active — Edge, OpenAI, Azure, Azure-voice, Google, Piper, Kokoro, OmniVoice, Clone (alias→OmniVoice), Mock. Removed in `b22c568`: XTTS, Chatterbox, Coqui VITS — replaced by OmniVoice native `sk` voice cloning. |
| **LLM** | [`llm_service.py`](./llm_service.py) | 6 — OpenAI, Anthropic, Azure, Ollama, vLLM, custom registry + mock fallback |
| **STT** | `stt_service.py` | Multiple Whisper variants including SloPal SK fine-tunes (CC-BY-4.0) |
| **RAG** | [`rag_service.py`](./rag_service.py) + [`chroma_rag_service.py`](./chroma_rag_service.py) | Chroma (default) or Weaviate (env-switch on `VECTOR_DB_BACKEND`) |
| **Emotion** | [`emotion_detector.py`](./emotion_detector.py) + [`bert_emotion_detector.py`](./bert_emotion_detector.py) | Regex + BERT — toggleable at runtime |
| **Lipsync** | [`audio2lipsync/`](./audio2lipsync/) + [`audio2lipsync_client.py`](./audio2lipsync_client.py) | Viseme generation for UE5 |
| **Memory** (Phase 8b in-flight) | [`memory_service.py`](./memory_service.py) | Per-user episodic memory |
| **Broadcaster** | [`avatar_broadcaster.py`](./avatar_broadcaster.py) | UE5 WebSocket fan-out — see [`/edu-ue5-check`](../../../.opencode/commands/edu-ue5-check.md) |

## Adding a new provider

Use the slash command: [`/edu-new-tts <provider>`](../../../.opencode/commands/edu-new-tts.md)

The same 8-step pattern applies to LLM/STT/RAG with the relevant service
file + test file pair. The canonical TTS dispatch table is at
[`tts_service.py:196-204`](./tts_service.py).

## NaiveNeuron contract (CRITICAL)

[`tests/test_slopal_registry.py`](../../tests/test_slopal_registry.py) pins
NaiveNeuron HuggingFace model IDs **verbatim**. This is a CC-BY-4.0
attribution contract — see [ADR-003](../../../docs/adrs/003-naiveneuron-attribution.md).

**NEVER** change these IDs without explicit user confirmation in the
current turn.

## Asymmetric DI rule

Per [ADR-001](../../../docs/adrs/001-asymmetric-DI.md):

- **LLM** is **eager-injected** via `Depends(llm_service_dep)` in [`../deps.py`](../deps.py). Its init is robust — falls back to mock if all providers fail.
- **RAG and TTS** stay **lazy** inside endpoint bodies (`get_rag_service`, `get_tts_service` called inside handlers). Their init can fail legitimately — the handler must catch and degrade gracefully (no RAG → continue without context; no TTS → text-only).

Don't "normalize" these. Converting RAG/TTS to eager DI converts graceful
paths into 500s.

## Tests

| Test | Pins |
|---|---|
| `test_tts_voice_routing.py` (16) | Voice-ID → provider routing for every voice |
| `test_slopal_registry.py` (6) | NaiveNeuron HF IDs verbatim, baseline non-displacement |
| `test_llm_switch.py` (6) | Provider/model switching, `ollama:model` wire format |
| `test_emotion_backend_switch.py` (4) | Regex ↔ BERT toggle |
| `test_fragile_contracts.py` (6) | RAG defaults, /chat greeting |
| `test_chat_dependency_injection.py` (5) | Depends-override pattern works for chat/llm/avatar endpoints |
