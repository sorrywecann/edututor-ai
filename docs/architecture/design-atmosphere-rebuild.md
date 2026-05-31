# Atmosphere Rebuild — Frontend Redesign Plan

**Started:** 2026-05-20
**Last updated:** 2026-05-24
**Inspiration:** UNCLAW onboarding (atmosphere) + SOUL terminal (power-user dashboards).

## Goal

Take the EduTutor frontend from "vibe-coded dev tool" to **minimalist, atmospheric, premium**. Match the visual restraint and emotional pacing that UNCLAW achieves: dark navy gradients, frosted-glass single-decision panels, qualitative word-marker sliders, rotating quotes, status pills, micro-labels.

**Every surface uses the same primitives. Stop reinventing per-page.**

Keep functionality. Change presentation.

---

## The visual grammar (lock this — no per-page deviation)

| Element | Token / component | When to use |
|---|---|---|
| **Hero background** | `class="atm-hero"` (radial navy → black) | Ceremony surfaces only: onboarding, auth, settings, empty states. NOT chat/work surfaces |
| **Glass card** | `<GlassCard>` | Any panel that holds a discrete decision/content unit |
| **Translucent chrome** | `background: rgba(8,12,22,0.35) + backdrop-blur(8px)` | Topbar, Sidebar |
| **Section header** | `<MicroLabel>` (JetBrains 9px, tracking 0.14em, uppercase) | Replaces every visual section title |
| **Status indicator** | `<StatusPill>` (ok/warn/info/idle) | Replaces inline coloured text for booleans |
| **Pagination** | `<StepDots>` | Replaces "Krok N z N" / "Page 1 of 5" |
| **Qualitative input** | `<QualitativeSlider>` | Personality, avatar tuning, 3–5 discrete positions |
| **Atmosphere header** | `<AtmosphereHeader>` | Time-of-day Slovak greeting + rotating quote on hero surfaces |
| **Accent colour** | `--atm-dot-active` (coral `#d96b53`) | Active dots, eyebrow labels above page titles |
| **Body type** | `var(--font-inter)` 13px line-height 1.55 | All running prose |
| **Monospace** | `var(--font-jetbrains)` 9-11px | Labels, status, code, metrics |
| **Text-tone hierarchy** | `--t1` 88% / `--t2` 42% / `--t3` 20% | Primary / secondary / tertiary text |

---

## Phase 1 — Design system foundation ✓ DONE

- `globals.css` — atmosphere tokens: `--atm-hero`, `--atm-glass-*`, micro-label typography, step dots, status pill colours, qualitative slider colours. Both dark + light themes.
- `components/atmosphere/` — 6 reusable primitives:
  - `<GlassCard>`, `<MicroLabel>`, `<StepDots>`, `<StatusPill>`, `<QualitativeSlider>`, `<AtmosphereHeader>`
- `app/(shell)/design-tokens/page.tsx` — showcase.

## Phase 2 — Highest-impact rebuilds ✓ DONE

- `UnifiedOnboarding` — atmospheric 6-screen flow
- `HardwareSetup` — surgical modal reskin
- `Topbar` — glass treatment
- `Sidebar` — light polish
- `/(shell)/page.tsx` — AtmosphereWelcome empty state on home

---

## Phase 3 — Foundation primitives (PLANNED, next session)

Build the six missing primitives needed for the rest of the platform. No visual change yet; sets up reuse so per-page work is composition.

| New primitive | Purpose |
|---|---|
| `<PageHeader>` | Eyebrow + title + description combo at top of every content page |
| `<EmptyState>` | "no conversations yet", "no KBs yet" — friendly zero-state with CTA |
| `<MetricCard>` | Numeric stat with label + delta indicator — for /performance, /progress |
| `<DataTable>` | Glass-styled tabular data — history list, KB list, voice clones |
| `<UploadZone>` | File-drop with atmosphere — KB doc upload, voice clone training |
| `<AtmosphereModal>` | Generic atmospheric modal base — overlay + centred GlassCard + esc/focus-trap |

Output: ~600 LOC, added to design-tokens showcase, zero functional change.

---

## Phase 4 — Auth + chat polish (PLANNED)

**Tier A surfaces** (full hero + glass cards):

- `/auth/signin` — currently plain bordered modal on grey. Convert to hero gradient + `<GlassCard>` with email/password + the demo credentials hint.
- Empty chat home — already shipped; minor polish if needed.

Output: ~120 LOC. Instant first-visit improvement.

---

## Phase 5 — Content pages (PLANNED, the bulk of the work)

**Tier B surfaces** (atmospheric chrome + content treatment):

| Page | Treatment | Effort |
|---|---|---|
| `/knowledge` | `<PageHeader>` + `<UploadZone>` for new files + `<DataTable>` of KBs with `<StatusPill>` for index state + `<EmptyState>` when none | ~250 LOC |
| `/history/[id]` | `<PageHeader>` + glass message bubbles with `<MicroLabel>` timestamps | ~150 LOC |
| `/progress` | `<PageHeader>` + `<MetricCard>` row for stats + `<DataTable>` for due cards | ~150 LOC |
| `/performance` | `<PageHeader>` + `<MetricCard>` row + `<DataTable>` for per-turn breakdown | ~120 LOC |
| `/voice-lab` | `<PageHeader>` + glass card per voice option + `<StatusPill>` for availability | ~150 LOC |
| `/chunk-viewer` | Light touch — adopt tokens, keep dense layout | ~50 LOC |
| `/kb-diagnostics` | Light touch — `<MicroLabel>` + `<StatusPill>`, keep dense | ~50 LOC |

Output: ~800 LOC across 5 pages.

---

## Phase 6 — Chat shell components (PLANNED)

**Tier E** — heart of the product, polished last so patterns are mature.

| Component | Treatment | Effort |
|---|---|---|
| `MessageStream` | Glass bubbles with subtle role differentiation + `<MicroLabel>` timestamps | ~120 LOC |
| `VoiceZone` | Orb already polished; clean surrounding chrome with glass | ~60 LOC |
| `AvatarContainer` | Keep — already integrates UE5 stream cleanly | — |

Output: ~200 LOC.

---

## Phase 7 — Modals & overlays (PLANNED)

Built once `<AtmosphereModal>` exists (Phase 3).

| Surface | Treatment | Effort |
|---|---|---|
| `HardwareSetup` (full rebuild) | Card-picker per provider, audio-previewable voice cards | ~400 LOC |
| `HelpDrawer` | Right-slide glass panel | ~80 LOC |
| `ModePicker`, `TutorPicker` | Adopt new tokens, already card-style | ~30 LOC each |
| `OnboardingTour` | DECIDE — likely deprecate (new onboarding covers it) | — |

Output: ~600 LOC if HardwareSetup is included.

---

## Phase 8 — KB sub-app (DEFERRED, biggest)

`KBWorkspace` + `ChatMode` + `AskMode` + `StudyMode` + `VoiceMode` + `NotesPanel` + `SourcesPanel` + `PodcastPanel` + `SourceViewer` + `DocumentUpload` + `KBSidebar` + `SmartContent` + `SourceCard` etc. — essentially a second product inside the first.

Defer until everything else lands. Treat each sub-mode as its own Tier B page rewrite when we get there.

Estimated: ~1000-1500 LOC, separate dedicated session.

---

## Risks to watch for

- **Token sprawl** — every page tweaking colours leads to inconsistency. Rule: if you need a new colour, add it as `--atm-*` first, then use it.
- **Modal vs page consistency** — modals are tiny atmosphere surfaces; if they don't match pages, the language fractures.
- **Functional regression on KBWorkspace** — most state surface, treat as last.
- **Performance on first paint** — atmospheric backgrounds with `backdrop-filter` are expensive; spot-check on mobile.
- **Theme switching** — every new primitive needs both dark + light tokens (we've been disciplined so far).

---

## Effort total

| Phase | LOC | Status |
|---|---|---|
| 1. Design tokens + 6 primitives | 600 | ✓ DONE |
| 2. Onboarding + chrome rebuild | 1000 | ✓ DONE |
| 3. Foundation primitives | 600 | planned |
| 4. Auth + home polish | 120 | planned |
| 5. Content pages (5 of them) | 800 | planned |
| 6. Chat shell components | 200 | planned |
| 7. Modals (incl. HardwareSetup) | 600 | planned |
| 8. KB sub-app | 1500 | deferred |

**Total remaining: ~2,300 LOC + 1,500 deferred. Realistically 4–6 focused sessions.**

Phase 3 is the bottleneck — once primitives exist, per-page work is mostly composition.
