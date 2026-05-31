# Known Issues + Architectural Debt

This is the honest list. Every entry is either:
- **By design** — an intentional tradeoff with rationale
- **Architectural debt** — known limitation, post-grant roadmap candidate
- **Open bug** — to be fixed (priority + size noted)

Grant reviewers: this document gives you the full picture. For active phase
plans see [`./plans/`](./plans/). For the contract obligations see
[`./AUDIT_TECH_PIVOTY.md`](./AUDIT_TECH_PIVOTY.md).

---

## By design (intentional tradeoffs)

### XTTS voice cloning uses Czech (`cs`) for Slovak text

**Location:** [`tutor-service/app/services/tts_service.py:77`](../tutor-service/app/services/tts_service.py)

**Why:** XTTS-v2 supports 17 languages but `sk` is not one of them.
Czech is the closest phonetic + grammatical match (mutually intelligible
with Slovak) and produces materially better synthesis than English on
Slovak text. Override via `XTTS_LANGUAGE` env var.

**Status:** documented in source. Not changing.

---

### `UE5_BROADCAST_DELAY_MS` defaults to 180ms

**Location:** [`tutor-service/app/api/chat.py:164`](../tutor-service/app/api/chat.py)

**Why:** The browser MSE audio buffer takes a median 180ms to start
playing after the first audio chunk arrives. The UE5 viseme broadcast
fires from the backend the moment TTS starts. Without the delay, the
avatar's mouth moves 180ms before audio plays. With the delay, the two
align.

**Tradeoff:** This is a calibrated-constant solution to a structural
problem (request-response pipeline vs full-duplex). The right long-term
fix is streaming viseme events as TTS chunks arrive (1-week refactor)
or moving to Moshi-style full-duplex (post-grant V2).

**Override:** `UE5_BROADCAST_DELAY_MS=0` for fully-local low-latency
deploys, higher values for slow networks.

---

### `system.py` has many `except Exception:` blocks

**Location:** [`tutor-service/app/api/system.py`](../tutor-service/app/api/system.py) — 12 occurrences

**Why:** Hardware introspection (CPU count, RAM, GPU detection,
ollama-list, broadcaster status). These platforms expose different
APIs across macOS / Linux / Windows. The broad `except` returns a safe
default (e.g. 16GB RAM, empty GPU dict, empty model list). This is
defensive coding for an introspection endpoint where partial info >
none.

**Not changing.** Narrowing the exceptions would risk silently breaking
on a future OS or kernel version.

---

### Chat hot-path `asyncio.create_task` without explicit exception surfacing

**Location:** [`tutor-service/app/api/chat.py`](../tutor-service/app/api/chat.py) — `_delayed_ue5_broadcast`, `_drain_speak`, `_produce_text`

**Why:** All three task creation sites have `try/finally` blocks that
guarantee resource cleanup + SSE-queue sentinel emission even on
exception. The exception itself is left on the task object (Python's
default behavior) and surfaces as a one-line warning at task GC time.
The consumer loop continues to drain TTS tasks, yield SSE items, and
terminate gracefully when the producer signals end-of-stream.

**Tradeoff:** Errors are operationally silent in chat sessions. They
appear in stderr warnings but not in user-facing responses.

**Status:** intentional graceful-degrade. A future refactor could add
`task.add_done_callback(log_if_exception)` to surface errors in INFO
logs without changing user-facing behavior. Estimate: 2 hours, low risk,
post-grant.

---

## Architectural debt (post-grant roadmap)

### Voice clones are NOT scoped per user (security gap)

**Location:** [`tutor-service/app/api/voice_clones.py`](../tutor-service/app/api/voice_clones.py)

**Severity:** Medium — relevant only when multi-user deployment uses
authenticated voice cloning. The grant deliverable is single-tenant
(anonymous-by-default per Phase 8a), so this is not a current
production risk.

**Problem:** Reference WAVs land at
`models/xtts/references/{slug}.wav` — a shared filesystem namespace.
Any user can list, use, or delete any other user's cloned voice.
`request.state.user_id` (the Phase 8a identity middleware output) is
NOT consulted in any voice-clone endpoint.

**Fix shape (Phase 9 candidate):**
1. Migrate storage to `models/xtts/references/{user_id}/{slug}.wav`
2. Filter list endpoint by `request.state.user_id`
3. Validate user ownership before delete
4. Add legacy-user backfill for existing references
5. Update `tts.py` voice-scanning to be user-aware

**Estimate:** 1 week (multi-file refactor + tests + migration).

---

### Tool-call loop uses regex-parsed XML tags

**Location:** [`tutor-service/app/api/chat.py`](../tutor-service/app/api/chat.py) — `_run_tool_loop` ~line 186

**Why:** "Phase 6c prompt-based emission" — the LLM is prompted to
emit `<tool_call>...</tool_call>` tags in its text output, which the
loop parses with regex. This works across every provider (no native
function-calling API required).

**Limitations:**
- Malformed JSON in tags is recoverable but lossy
- Partial tags from streaming chunks need accumulation logic
- No parallel tool calls (one at a time)
- Only safety net against runaway is `max_iterations=4`

**Fix shape (post-grant V2):**
1. Detect provider capabilities — if OpenAI / Anthropic, use native
   structured outputs / function calling
2. Schema-validate tool args via Pydantic before dispatch
3. Keep XML fallback for Ollama / custom providers
4. Support parallel tool calls where the LLM supports them

**Estimate:** 1 week. Replaces the prompt regex with a capability-aware
dispatcher.

---

### Dialog model is request-response, not voice-native

**Location:** entire chat hot path

**Why:** The pipeline is STT → POST /chat/stream (SSE) → LLM → TTS →
MSE buffer. 3-5 serial async hops before the avatar's mouth opens.
Median latency from mic-up to first-spoken-word is ~900-1500ms on
typical Mac/Linux deployments.

**The architectural truth:** This is a *text chat with audio bolted on*,
not a voice-native system. Streaming visemes (above) and full-duplex
audio (Moshi-style) are the two upgrade paths.

**Fix paths:**
- **Grant timeline (1 week):** stream viseme events as TTS chunks
  arrive, instead of building the full timeline upfront. Eliminates
  the `UE5_BROADCAST_DELAY_MS` hack.
- **V2 (1 quarter, post-grant):** adopt Moshi (`kyutai-labs/moshi`)
  for full-duplex speech-to-speech. Audio bi-directional simultaneously,
  no STT→text→TTS round-trip. Targets 200ms total latency.

---

### RAG pipeline is single-stage dense retrieval

**Location:** [`tutor-service/app/services/rag_service.py`](../tutor-service/app/services/rag_service.py)

**State today:** query → embed → vector search top_k (default 5) →
context build → LLM.

**Missing for production-grade Slovak Q&A:**
- No reranker (cross-encoder over top_k pairs)
- No hybrid search (dense + BM25 keyword)
- Chunking is fixed-token (no semantic-aware boundaries)
- No citation back-mapping to source files in responses

**Fix shape:** additive — gated behind env vars so the default path
stays unchanged. A `RAG_RERANKER=cross-encoder` flag would inject
`sentence-transformers/ms-marco-MiniLM-L-6-v2` between vector search
and context build.

**Estimate:** 3 days incl. tests. Low risk, additive, post-grant if
the §7.8 golden-dataset hit rate is already acceptable.

---

## Fresh-clone friction (now resolved)

### 19 undocumented env vars

**Status:** ✅ FIXED — all 19 added to [`.env.example`](../.env.example)
in organized sections (Azure LLM, storage, identity, memory, UE5
timing, dev mode, LiveKit, Coqui).

### Python version requirement

**Status:** ✅ ALREADY HANDLED — [`start.sh`](../start.sh) auto-detects
Python 3.11+ on Mac (`brew`) / Linux (`apt`). README and SETUP both
document the requirement.

### `tutor-service/.venv 2/` directory junk

**Status:** Pre-existing untracked artifact. Safe to delete locally
(`rm -rf "tutor-service/.venv 2"`). Not committed.

---

## Test suite state

- **Backend:** 579 passed, 3 failed, 11 skipped, 7 xfailed (2026-05-17)
- **Frontend:** 10 Vitest tests pass, `pnpm tsc --noEmit` clean, `pnpm build` exit 0, 11 static routes
- **Baseline drift:** Historical 451/8 → 509/1 (in `65326dd`) → 579/3 today.
  Tests grew with Phase 7-8b features + commits adding broadcaster, lipsync,
  load-test infrastructure, frontend Vitest suite, and avatar cancel-mute coverage.

For the canonical test commands, see [`/edu-test`](../.opencode/commands/edu-test.md)
(local OpenCode tooling) or [`tutor-service/README.md`](../tutor-service/README.md).

### Open production-code test failures (paralel agent territory)

Three tests fail against current `main` (2026-05-17). Each points at a real
production behaviour bug in code that is **actively being iterated** by a parallel
contributor. Listed here so the next reader sees the open work explicitly rather
than discovering it via red CI.

| Test | File | Failure | Diagnosis |
|---|---|---|---|
| `test_profile_cascades_on_user_delete` | [`tutor-service/tests/test_user_profile.py`](../tutor-service/tests/test_user_profile.py) | After `await db.delete(user) + commit()`, `UserProfile.user_id` count is **1** instead of **0** | `ON DELETE CASCADE` constraint on the `user_profile.user_id → user.id` FK is not firing despite `PRAGMA foreign_keys = ON`. Either the FK is declared without `ondelete='CASCADE'` in the ORM, or the constraint name does not propagate to the SQLite schema migration. Fix lives in [`tutor-service/app/services/memory_service.py`](../tutor-service/app/services/memory_service.py) (model definition) or the corresponding alembic-equivalent migration. |
| `test_from_word_boundaries_anchors_word_start_to_audio_offset` | [`tutor-service/tests/test_word_boundaries.py`](../tutor-service/tests/test_word_boundaries.py) | First speaking frame at `start_ms=0` when first word's `offset_ms=100` | `from_word_boundaries` in [`tutor-service/app/services/viseme_timeline.py`](../tutor-service/app/services/viseme_timeline.py) does not anchor the first word's first frame to the supplied `offset_ms` — output starts at zero regardless. This breaks the **stated invariant** (commit message `4b5ebee feat(avatar): audio-anchored lipsync sync` claims sub-25ms drift; this regression accumulates ±100ms+ per sentence). |
| `test_from_word_boundaries_skips_punctuation_only_words` | same | Punctuation-only word at `[0, 100ms)` emits speaking frames | `from_word_boundaries` does not filter words whose text is only punctuation / whitespace. Defensive skip is in the test's stated contract but not in the implementation. |

**Why not fixed in this session:** all three live in files paralel agent has
uncommitted modifications to (see `bc8fada` hardening pass + the still-open
`5b6e738` P0/P1 production hardening commit). Editing production code from
two independent agent processes risks merge conflicts + double-fix regressions.
Honest hand-off: these are tracked here so the parallel commit cycle picks them
up, and so a reviewer (or new contributor) sees them without first running
`pytest` and being surprised.
