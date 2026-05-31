# Workflow: Add a New TTS Provider

> Use the [`/edu-new-tts <provider>`](../../.opencode/commands/edu-new-tts.md)
> slash command — this document is its long-form companion.

EduTutor.AI ships 11 TTS providers. Adding a 12th is **one dict-dispatch
entry** — no `if/elif`. See [ADR-002](../adrs/002-dict-dispatch.md).

---

## Before you start

Read these (DO NOT skip):

1. [`tutor-service/app/services/tts_service.py`](../../tutor-service/app/services/tts_service.py) — read 2 existing entries (`edge`, `openai`) end-to-end to understand the inference function signature and `TTSResult` shape. Dispatch table is at `_default_dispatch` around line 196.
2. [`tutor-service/app/config/tts_config.py`](../../tutor-service/app/config/tts_config.py) — how voices attach to providers
3. [`tutor-service/tests/test_tts_voice_routing.py`](../../tutor-service/tests/test_tts_voice_routing.py) — 16 tests pinning voice-ID → provider
4. [`tutor-service/tests/test_slopal_registry.py`](../../tutor-service/tests/test_slopal_registry.py) — CC-BY-4.0 NaiveNeuron contract — see [ADR-003](../adrs/003-naiveneuron-attribution.md)

## NaiveNeuron warning (CRITICAL)

Some TTS providers reference NaiveNeuron HuggingFace model IDs verbatim
(CC-BY-4.0 attribution). **NEVER** change those IDs without explicit user
confirmation in the current turn. The baseline non-displacement test
will fail if you do.

## The 8 steps

### 1. Inference function

```python
async def _synthesize_<provider>(self, text: str, voice: Optional[str] = None) -> TTSResult:
 """One-line spec: what the function does."""
 # implementation
 return TTSResult(audio_bytes=..., duration_ms=...,...)
```

Pattern: match an existing inference function's exact shape. Use
`asyncio.subprocess` for CLI providers, `httpx.AsyncClient` for HTTP
APIs, async SDK calls for SDK providers.

### 2. Register in dispatch table

In `_default_dispatch` (~line 196 of `tts_service.py`):

```python
return {
 "edge": self._synthesize_edge,
 "openai": self._synthesize_openai,...
 "<provider>": self._synthesize_<provider>, # ← your entry
 "mock": self._synthesize_mock, # ← keep mock last
}
```

ORDER MATTERS for `test_slopal_registry.py` baseline non-displacement.
Add at the bottom (just above `mock`), never reorder existing entries.

### 3. Add voices to `tts_config.py`

List the voice IDs your provider exposes with metadata:
```python
TTS_VOICES = {...,
 "<voice-id>": VoiceConfig(
 provider="<provider>",
 language="sk", # ISO 639-1
 gender="female",
 display_name="...",
 ),
}
```

### 4. Voice routing test

Add a row to [`test_tts_voice_routing.py`](../../tutor-service/tests/test_tts_voice_routing.py) per voice. The test auto-validates `voice_id → provider` resolution.

### 5. Unit test the inference function

```python
@pytest.mark.asyncio
async def test_synthesize_<provider>_returns_tts_result(mocker):
 """Pin: _synthesize_<provider> returns TTSResult with non-empty audio bytes when the SDK succeeds."""
 mocker.patch(...) # mock the SDK
 result = await tts._synthesize_<provider>("hello")
 assert isinstance(result, TTSResult)
 assert len(result.audio_bytes) > 0
```

### 6. Env vars + deps (if needed)

- New env vars (API keys, endpoints) → document in `.env.example` (NEVER `.env`)
- New deps → confirm with user BEFORE adding to `requirements.txt`. Existing deps already in the repo: `edge-tts`, `openai`, `azure-cognitiveservices-speech`, `google-cloud-texttospeech`, `piper-tts`, `TTS` (Coqui), `chatterbox-tts`.

### 7. Graceful failure

If the provider's SDK fails (network, auth, unsupported voice), raise a
typed exception that the caller can degrade from. Do NOT crash the chat
hot path — the user must still get text.

The existing `Mock` provider is the fallback path. The dict-dispatch
machinery already handles missing-handler cases by routing to `_synthesize_mock`.

### 8. Verify

```bash
cd tutor-service && python -m pytest \
 tests/test_tts_voice_routing.py \
 tests/test_slopal_registry.py \
 -v
```

Then the full suite:
```bash
python -m pytest tests/ -q
```

Baseline: 502 passed + 1 skipped. New count = baseline + your new tests.

## Hard constraints (recap)

- **NEVER** `if/elif` for provider dispatch
- **NEVER** change existing entries' order/IDs (baseline non-displacement)
- **NEVER** touch NaiveNeuron HF IDs verbatim without user confirmation
- Inference function MUST be `async` and return `TTSResult`
- Voice routing test gets a row per new voice
- Env vars in `.env.example`, never `.env`

## When done

Run [`/edu-pre-pr`](../../.opencode/commands/edu-pre-pr.md).
