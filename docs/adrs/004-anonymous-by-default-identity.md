# ADR-004: Anonymous-by-Default Identity (Header > Cookie > Generate UUID)

**Status:** Accepted

---

## Context

Phase 8a needed a per-user identity for the upcoming Phase 8b
cross-session memory (per-user profile + per-user episodic memory in
ChromaDB). Three constraints shaped the decision:

1. **No friction** — users should not have to log in to get the tutor
 to remember them.
2. **Legacy compatibility** — pre-Phase-8 users have flashcards stored
 under a `'default'` Skill row. They must not be orphaned.
3. **Future-proof for real auth** — Phase 9 will add magic-link / OAuth,
 so the identity model must support a "claim flow" (anonymous user
 binds to email later).

## Decision

`UserIdentityMiddleware` (in [`tutor-service/app/middleware/user_identity.py`](../../tutor-service/app/middleware/user_identity.py))
resolves a per-browser anonymous user on every HTTP request via this
priority chain:

1. **`X-EduTutor-User-Id` header** (PRIMARY)
 - The frontend's `getPersistentUserId` (in [`core/src/lib/api.ts`](../../core/src/lib/api.ts)) generates a UUID and stores it in localStorage under key `edututor_user_id`.
 - The header is sent on every API call.
 - **This is THE legacy-compat guarantee.** Pre-Phase-8 users keep their UUID across the upgrade.

2. **`edu_uid` cookie** (BACKUP)
 - Server-issued on first request when neither header nor valid cookie is present.
 - Survives a localStorage clear (different storage layer).

3. **Generate new UUID** (FALLBACK)
 - When neither header nor cookie present.
 - Creates an anonymous `User` row in the DB.
 - Sets the cookie for future requests.

After middleware runs, `request.state.user_id` is guaranteed to be a
non-empty UUID and the corresponding `users` row exists.

## The `User` model

The DB model includes:
- `id: UUID` (primary key)
- `email: Optional[str]` (nullable — anonymous users have none)
- `is_anonymous: bool` (default `True`)

Phase 9 will add the claim flow: anonymous user provides email, magic
link confirms, `is_anonymous` flips to `False`, `email` is set. The
UUID stays the same — no data migration.

## The rule (NON-NEGOTIABLE)

**Header path takes priority over cookie.** This is the legacy-compat
guarantee. Reversing the priority would orphan pre-Phase-8 users from
their flashcards and (in Phase 8b) their memory.

This rule is pinned in:
- This ADR (canonical source). The anonymous-by-default identity rule: no user_id is required to use the app; identity resolves via `X-EduTutor-User-Id` header (primary) → `edu_uid` cookie (backup) → generate new UUID (fallback). Header takes priority — this is the legacy-compat guarantee.
- [`tutor-service/app/middleware/user_identity.py`](../../tutor-service/app/middleware/user_identity.py) docstring

## Skill-level integration

`SkillRegistry.dispatch` accepts an optional `user_id` keyword and
forwards it ONLY to handlers whose signature accepts it (detected once
at registration via `inspect.signature`).

- **Stateless skills** (like `web_search`) — handlers omit `user_id`. No boilerplate.
- **Per-user skills** (like `spaced_repetition`) — handlers take `user_id: str`. Data scoped by that ID.

`chat` and `chat_stream` thread `request.state.user_id` into
`_run_tool_loop`, which forwards it to `registry.dispatch`.

## Migration handling

Phase 7 stored flashcards under `user_id='default'` (single shared deck).
Phase 8a adds idempotent backfill:

- A stable "legacy user" UUID is generated once and persisted to
 `data/legacy_user_id.txt`.
- On startup, any flashcard rows with `user_id='default'` are reassigned
 to this legacy user.
- The flashcard FK constraint on `users.id` is then enforced.

This ensures pre-Phase-8 flashcards are preserved across the upgrade.

## Pinned by

- [`tutor-service/tests/test_user_identity.py`](../../tutor-service/tests/test_user_identity.py) — header > cookie > generate UUID resolution
- [`tutor-service/tests/test_user_me_endpoint.py`](../../tutor-service/tests/test_user_me_endpoint.py) — `/api/v1/user/me` returns resolved identity
- [`tutor-service/tests/test_skill_dispatch_user_id.py`](../../tutor-service/tests/test_skill_dispatch_user_id.py) — `inspect.signature` gating
- [`tutor-service/tests/test_chat_user_identity.py`](../../tutor-service/tests/test_chat_user_identity.py) — `request.state.user_id` threading
- [`tutor-service/tests/test_flashcard_migration.py`](../../tutor-service/tests/test_flashcard_migration.py) — legacy backfill idempotency

(24 tests total.)

## Alternatives considered

1. **Cookie-first** — rejected. Would orphan pre-Phase-8 users on first post-upgrade visit.
2. **Server-side session (Redis)** — rejected as over-engineering. Stateless middleware is sufficient.
3. **Require email upfront** — rejected. Friction breaks the anchor use case (Slovak voice tutor that just works).
