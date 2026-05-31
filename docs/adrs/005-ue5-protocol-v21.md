# ADR-005: UE5 Avatar Protocol v2.1 (Backwards-Compatible agentState)

**Status:** Accepted

---

## Context

The UE5 MetaHuman avatar is EduTutor.AI's product differentiator. It
connects to the backend via WebSocket at `/ws/avatar` and receives
real-time updates during chat (emotion, lipsync visemes, blink, speaking
state).

Phase 6 needed to extend the protocol to carry **`agentState`** — a
field signaling what the agent is doing (`thinking`, `searching`,
`writing`, `reading`, `listening`) so the avatar can show appropriate
animation states beyond just lipsync.

The constraint: **existing v2 UE5 Blueprints in the field must not break.**
The v2.1 extension had to be deployed unilaterally on the backend while
v2 clients (Blueprints not yet rebuilt with v2.1 support) kept working.

## Decision

The `agentState` field is **OMITTED entirely** from the broadcast
payload when `agent_state=None` (the default). When omitted, v2
Blueprints see byte-identical traffic to the pre-v2.1 protocol.

```python
# In _broadcast_avatar_state — pseudocode
payload = {
 "emotion":...,
 "intensity":...,
 "isSpeaking":...,
 "visemes": [...],
 "viseme_timeline": [...],
 "total_duration_ms":...,
 "blink":...,
}
if agent_state is not None:
 payload["agentState"] = agent_state # v2.1 clients see it
# else: field is absent. v2 clients see legacy traffic.
```

The Slovak tutor flow (the primary anchor use case) does NOT pass
`agent_state`, so it remains on byte-identical v2 traffic.

Phase 7 skills (web_search, spaced_repetition) pass `agent_state` via
the `_TOOL_NAME_TO_AGENT_STATE` mapping in
[`tutor-service/app/api/chat.py`](../../tutor-service/app/api/chat.py),
so chat sessions that use skills emit v2.1 payloads.

## The rule (NON-NEGOTIABLE)

**`agentState` is omitted when `agent_state=None`. Never written as `null`,
never written as empty string.**

This rule is pinned in:
- This ADR (canonical source). The UE5 protocol v2.1 rule: broadcaster outputs must remain stable for v2 Blueprint clients; `agentState` is omitted entirely when `None`, never written as `null` or empty string, so v2 clients see byte-identical traffic.
- [`docs/ue5-avatar-contract.md`](../../docs/ue5-avatar-contract.md) — canonical spec
- [`.opencode/agents/ue5-guardian.md`](../../.opencode/agents/ue5-guardian.md) — guardian agent's primary invariant

Plus the reliability hardening (Phase 1):
- **Snapshot-safe iteration** — broadcaster copies the client set before iterating, no concurrent-disconnect race
- **2.0s `asyncio.wait_for` per send** — slow clients can't stall chat
- **Failed sends drop dead conn in `finally`** — never throw out of `broadcast`
- **Origin check** — localhost any port allowed (Phase 7.1 fix)

## Broadcast payload (v2.1)

| Field | Type | Required | Notes |
|---|---|---|---|
| `emotion` | string | | Detected emotion ID |
| `intensity` | float [0,1] | | Emotion intensity |
| `isSpeaking` | bool | | True during TTS playback |
| `visemes` | list[[viseme_id, duration]] | | Idle = `[[sil, 1.0]]` |
| `viseme_timeline` | list[{viseme, t_start_ms, t_end_ms}] | | For frame-accurate sync |
| `total_duration_ms` | int | | Total speech duration |
| `blink` | object | | Blink rate hint |
| `agentState` | string | (v2.1 only) | OMITTED when None. Values: `thinking`, `searching`, `writing`, `reading`, `listening` |

## Reliability constraints

The broadcaster MUST be:
1. **Snapshot-safe** — `clients = set(self._clients)` before iterating, then iterate the copy. Prevents `RuntimeError: Set changed size during iteration` on concurrent disconnect.
2. **Bounded latency** — `await asyncio.wait_for(ws.send_json(payload), timeout=2.0)`. A slow client can't stall the chat hot path beyond 2 seconds.
3. **Crash-resilient** — failed sends caught in `try/except`, dead connection dropped via `self._clients.discard(ws)` in the `finally` clause. Broadcaster NEVER throws out of `broadcast`.

These constraints are non-negotiable. Without them, one disconnected
client stalls or crashes all chat sessions.

## Pinned by

- [`tutor-service/tests/test_ws_avatar.py`](../../tutor-service/tests/test_ws_avatar.py) (20 tests):
 - 4 tests for broadcaster invariants (snapshot, timeout, finally)
 - 6 tests for handshake protocol (avatar_ready → ready_ack v2)
 - 4 tests for payload shape
 - 3 tests for idle viseme contract `[sil, 1.0]`
 - 2 tests for agentState v2.1 (present when set, absent when None)
 - 1 test for finally-on-cancel

Plus [`.opencode/commands/edu-ue5-check.md`](../../.opencode/commands/edu-ue5-check.md) — automated conformance check.

## Alternatives considered

1. **Always send `agentState: null` when no state** — rejected. v2
 Blueprints would receive a field they don't expect and might error
 or render incorrectly.
2. **Bump protocol to v3 with mandatory `agentState`** — rejected. Would
 require coordinated client rebuild. v2.1 lets us ship backend
 independently.
3. **Separate WS channel for agentState** — rejected as over-engineering.
 The existing payload has plenty of room for an optional field.

## Future evolution

When all v2 Blueprints are upgraded to v2.1, the omission rule can be
relaxed (always send the field, defaulting to `null` or `"idle"`). Until
that day, the omission rule stands. Estimated v2-only client phase-out:
end of Phase 9 or later.
