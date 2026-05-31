# core — EduTutor.AI Frontend

Next.js 15 App Router frontend for EduTutor.AI. React 19, Tailwind CSS,
Radix UI, framer-motion, TipTap editor, LiveKit voice integration.

For architectural decisions, see [`../docs/adrs/`](../docs/adrs/).

---

## Quick start

```bash
# From repo root,./start.sh boots both backend and frontend.
# To run just the frontend locally:

cd core
pnpm install # legacy-peer-deps already set in.npmrc
pnpm dev # → http://localhost:3000
```

> **Why `.npmrc` has `legacy-peer-deps=true`:** `next@15` + `next-auth@4`
> have peer-dep declarations that npm strict mode rejects. The repo-local
> `.npmrc` allows the install. Don't remove it without testing both `pnpm`
> and `npm` installs end-to-end.

## Build + check

```bash
pnpm tsc --noEmit # typecheck — must be clean
pnpm build # build — must exit 0, all 13 routes compile
pnpm lint # Next.js lint
```

The canonical verification command at project level is [`/edu-test`](../.opencode/commands/edu-test.md).

## Architecture pointers

| What | Where |
|---|---|
| **API base + WS base config** (single source of truth) | [`src/lib/config.ts`](./src/lib/config.ts) — **NEVER** write `process.env.NEXT_PUBLIC_API_URL` directly anywhere else |
| **Tagged client logger** | [`src/lib/logger.ts`](./src/lib/logger.ts) — replaces silent `catch {}` blocks |
| **Persistent user ID** | [`src/lib/api.ts`](./src/lib/api.ts) — `getPersistentUserId` reads localStorage `edututor_user_id` and sends as `X-EduTutor-User-Id` header. **This is the legacy-compat contract — never remove the header path.** |
| **Voice session hook** | `src/hooks/useVoiceSession.ts` |
| **Error boundaries** (3 mounted: main / sidebar / onboarding) | [`src/components/ErrorBoundary.tsx`](./src/components/ErrorBoundary.tsx) |
| **UE5 WS bridge** | [`src/lib/ue5-bridge/`](./src/lib/ue5-bridge/) |
| **Atmospheric design system** | [`src/components/atmosphere/`](./src/components/atmosphere/) — `GlassCard`, `Button`, `MicroLabel`, `AtmosphereModal`, `PageHeader`, `EmptyState`, `MetricCard`, `DataTable`, `UploadZone`. **Always reach for these before inventing new button/card styles.** |
| **Design tokens** | [`src/app/globals.css`](./src/app/globals.css) — `--atm-hero`, `--atm-glass-*`, micro-label typography, status pill colours, global form (`<input>`, `<textarea>`, `<select>`) glass styling. |
| **Main chat shell + ChatDrawer** | [`src/app/(shell)/page.tsx`](./src/app/(shell)/page.tsx) — avatar locked large; right-side collapsible drawer with peek pill. |
| **Voice Lab (3-tab UI)** | [`src/app/(shell)/voice-lab/page.tsx`](./src/app/(shell)/voice-lab/page.tsx) — Generovať / Moje hlasy / Vytvoriť hlas. |
| **Knowledge 3-column workspace** | [`src/components/kb/KBWorkspace.tsx`](./src/components/kb/KBWorkspace.tsx) + [`KBStudio.tsx`](./src/components/kb/KBStudio.tsx) + [`../lib/kb/studyTools.ts`](./src/lib/kb/studyTools.ts) — Sources / Chat / Studio rail. |
| **KB store with optimistic delete** | [`src/stores/useKBStore.ts`](./src/stores/useKBStore.ts) — `removeDocument` is the optimistic path; backend 404 is treated as success. |

## Backend dependency

The frontend assumes the backend at `http://localhost:8000` by default
(configurable via `NEXT_PUBLIC_API_URL` consumed in [`src/lib/config.ts`](./src/lib/config.ts)). With
no backend running:

- Chat / voice flows error gracefully via ErrorBoundary
- Static routes still render
- Auth still works (next-auth handles its own state)

## Conventions

- **No raw `process.env.NEXT_PUBLIC_API_URL`** anywhere except `src/lib/config.ts`
- **No silent catch** — use `src/lib/logger.ts` tagged loggers
- **Three error boundaries** at shell layout — never strip them
- **`X-EduTutor-User-Id` header on every API call** — anonymous identity contract (see [`../docs/adrs/004-anonymous-by-default-identity.md`](../docs/adrs/004-anonymous-by-default-identity.md))
- **No `as any`, `@ts-ignore`, `@ts-expect-error`** — hard block
