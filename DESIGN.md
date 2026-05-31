# EduTutor.AI — Design System

**Design language:** Atmosphere (Living Room direction)
**Inspiration:** UNCLAW onboarding restraint + SOUL terminal density
**Feeling:** warm, cozy, premium — like a well-lit study, not a cold data terminal

This file is the single source of truth for all visual decisions.
Agents working on the frontend MUST read this file before touching any UI code.
Do not introduce colors, fonts, spacing, or components that are not defined here.

---

## Color Palette

### Dark Theme (default)

| Token | Value | Usage |
|---|---|---|
| `--atm-hero-from` | `#221912` | Hero gradient start (warm charcoal) |
| `--atm-hero-mid` | `#160f0a` | Hero gradient mid |
| `--atm-hero-to` | `#0c0805` | Hero gradient end (near black) |
| `--atm-glass-bg` | `rgba(26, 20, 16, 0.62)` | Glass card background |
| `--atm-glass-border` | `rgba(245, 237, 216, 0.10)` | Glass card border (cream tint) |
| `--atm-glass-ring` | `rgba(245, 237, 216, 0.05)` | Glass inner highlight |
| `--atm-dot-active` | `#D4845A` | Accent: active dots, eyebrow labels, CTA highlights |
| `--atm-pill-ok-text` | `#7FB069` | Status OK (warm green) |
| `--atm-pill-warn-text` | `#E0A458` | Status warning (amber) |
| `--atm-pill-info-text` | `#D4845A` | Status info (terracotta) |

### Light Theme

| Token | Value | Usage |
|---|---|---|
| `--atm-hero-from` | `#F2EBDD` | Hero gradient start (warm cream) |
| `--atm-hero-mid` | `#E6DCC9` | Hero gradient mid |
| `--atm-hero-to` | `#D8CDB6` | Hero gradient end |
| `--atm-glass-bg` | `rgba(250, 245, 235, 0.72)` | Glass card background |
| `--atm-glass-border` | `rgba(60, 40, 20, 0.10)` | Glass card border |
| `--atm-dot-active` | `#C2703F` | Accent (darker terracotta for light bg) |

### Text Hierarchy

| Token | Opacity | Usage |
|---|---|---|
| `--t1` | 88% | Primary text — headings, body prose, labels the user reads |
| `--t2` | 42% | Secondary text — supporting info, descriptions, placeholders |
| `--t3` | 20% | Tertiary text — timestamps, system notes, disabled states |

**Rule:** Do not use raw `white` or `black` for text. Use the hierarchy tokens. This ensures both themes work automatically.

---

## Typography

### Font Stack

| Role | Family | Sizes | Weight |
|---|---|---|---|
| **Display / Headline** | Syne → Inter fallback | `clamp(28px, 4.4vw, 44px)` | 700 |
| **Body** | Inter | 13px | 400 |
| **UI Labels** | Inter | 13–14px | 400–500 |
| **Micro Labels** | JetBrains Mono | 9px | 400 |
| **Monospace / Code** | JetBrains Mono | 9–11px | 400 |

### Typography Rules

- **Display:** Syne 700, letter-spacing `-0.025em`, line-height `1.05`. Use `.atm-greeting` class.
- **Body prose:** Inter 13px, line-height `1.55`. Never go below 13px for readable text.
- **Micro labels:** JetBrains Mono 9px, `letter-spacing: 0.16em`, `text-transform: uppercase`. Use `.atm-micro` class or `<MicroLabel>` component.
- **Never mix font families** within a single UI section. Display only on hero/ceremony surfaces.
- **Never use font-weight 300 or lighter.** The warm dark background requires 400 minimum for legibility.
- **Heading scale:** 44 → 32 → 24 → 18 → 14px. Skip steps only when the design clearly calls for it.

---

## Spacing & Layout

| Scale step | Value | Usage |
|---|---|---|
| `xs` | 4px | Icon padding, tight inline gaps |
| `sm` | 8px | Component internal padding (micro) |
| `md` | 12–16px | Default padding, card gaps |
| `lg` | 24px | Section spacing, card padding |
| `xl` | 40–48px | Page section gaps |
| `2xl` | 64–80px | Hero vertical rhythm |

**Rule:** Use multiples of 4. No odd pixel values except for borders (1px) and shadows.

---

## Surface Hierarchy

| Layer | Treatment | When |
|---|---|---|
| **Hero / Ceremony** | `.atm-hero` radial gradient | Onboarding, auth, empty states, settings. NOT chat/work surfaces. |
| **Glass Card** | `.atm-glass` — blur 24px, warm border | Any panel holding a discrete unit of content or a single decision |
| **Translucent Chrome** | `rgba(8,12,22,0.35) + backdrop-blur(8px)` | Topbar, Sidebar |
| **Flat Surface** | Background with `--surface` token | Dense work areas: KB list, history, data tables |

**Rule:** Only one hero surface per view. Glass cards sit on top of the hero. Do not stack two `.atm-hero` layers.

---

## Component Primitives

All primitives live in `core/src/components/atmosphere/`. **Use these. Do not recreate.**

| Component | Purpose | Key props |
|---|---|---|
| `<GlassCard>` | Any panel — discrete content, single decision | `className` for width/layout |
| `<MicroLabel>` | All-caps tracked section title | `children` — always uppercase |
| `<StatusPill>` | Boolean/state indicator | `status: 'ok' \| 'warn' \| 'info' \| 'idle'` |
| `<StepDots>` | Pagination / progress | `total`, `current` |
| `<QualitativeSlider>` | Discrete position input (3–5 steps) | `markers`, `value`, `onChange` |
| `<AtmosphereHeader>` | Time-of-day greeting + rotating quote | `name`, `quotes` — hero surfaces only |
| `<AtmosphereModal>` | Modal base with focus-trap | `open`, `onClose`, `children` |
| `<PageHeader>` | Eyebrow + title + description | `eyebrow`, `title`, `description` |
| `<EmptyState>` | Zero-state with friendly copy + CTA | `icon`, `title`, `description`, `action` |
| `<MetricCard>` | Numeric stat with label + delta | `label`, `value`, `delta` |
| `<DataTable>` | Glass-styled tabular data | `columns`, `rows` |
| `<UploadZone>` | File-drop with atmosphere | `onDrop`, `accept` |
| `<Button>` | Primary / secondary / ghost actions | `variant`, `size` |
| `<Select>` | Atmospheric dropdown | `options`, `value`, `onChange` |

**Adding a new component:** It must extend one of the above or be a composition of them. If it requires a new visual pattern not in this system, run the `brainstorming` skill first.

---

## Glass Card Spec

```css
background: rgba(26, 20, 16, 0.62);
border: 1px solid rgba(245, 237, 216, 0.10);
border-radius: 16px;
backdrop-filter: blur(24px) saturate(1.2);
box-shadow:
  0 22px 60px -20px rgba(0, 0, 0, 0.7),
  0 1px 0 0 rgba(245, 237, 216, 0.06) inset;
```

**Rule:** Border radius is always `16px` for cards, `8px` for inputs and small components, `4px` for badges/pills.

---

## Animation & Motion

| Interaction | Duration | Easing |
|---|---|---|
| Hover state | 150ms | `ease` |
| Modal open/close | 200ms | `ease-out` |
| Quote fade-in | 400ms | `ease` |
| Indeterminate progress | 1.4s | linear, looping |
| Page transitions | 150ms | `ease-out` |

**Rules:**
- Never animate layout (avoid animating `width`, `height`, `top`, `left`) — use `transform` and `opacity` only.
- Do not use `transition: all` — enumerate specific properties.
- Respect `prefers-reduced-motion` — wrap all non-essential animations.
- If an animation lasts longer than 300ms, question whether it earns its cost.

---

## Icon & Imagery

- **Icon library:** Lucide React (already installed). Use `size={16}` for inline, `size={20}` for standalone.
- **No emoji in UI.** Emoji in code comments is fine; never in rendered UI text.
- **No stock photography.** The avatar IS the visual personality — it carries emotional weight. Flat geometry > stock photos.
- **Screenshots / previews:** always use a `<GlassCard>` wrapper with a subtle overlay.

---

## Anti-Patterns (do not do these)

| Anti-pattern | Why | Instead |
|---|---|---|
| Raw `<div style={{ color: 'white' }}>` | Breaks theming | Use `--t1` / `--t2` / `--t3` |
| Per-page custom card styles | Fragments the design | `<GlassCard>` |
| Blue / purple accent colors | Wrong palette | `--atm-dot-active` (#D4845A terracotta) |
| Cold navy / dark blue backgrounds | Wrong tone (UNCLAW, not our direction) | Warm charcoal `#221912` |
| `font-weight: 300` | Unreadable on warm dark | 400 minimum |
| `font-size: 11px` for body text | Unreadable | 13px minimum for prose |
| `transition: all 0.3s` | Performance hit, unexpected | Enumerate properties, 150ms |
| Two hero gradients on one view | Cluttered ceremony | One `.atm-hero` per route |
| Inline status via colored text | Inconsistent | `<StatusPill>` |
| Custom pagination markup | Inconsistent | `<StepDots>` |

---

## Surface Map (page-by-page)

| Route | Tier | Background | Key components |
|---|---|---|---|
| `/auth/*` | Ceremony | `.atm-hero` | `<GlassCard>`, `<AtmosphereHeader>` |
| `/onboarding` | Ceremony | `.atm-hero` | `<GlassCard>`, `<StepDots>`, `<QualitativeSlider>` |
| `/(shell)` home | Ceremony | `.atm-hero` | `<AtmosphereHeader>`, `<EmptyState>` |
| `/chat/*` | Work | Flat surface | `<GlassCard>` for message bubbles, `<MicroLabel>` for timestamps |
| `/knowledge` | Work | Flat surface | `<PageHeader>`, `<DataTable>`, `<UploadZone>`, `<StatusPill>` |
| `/history` | Work | Flat surface | `<PageHeader>`, `<DataTable>` |
| `/progress` | Work | Flat surface | `<PageHeader>`, `<MetricCard>`, `<DataTable>` |
| `/performance` | Work | Flat surface | `<PageHeader>`, `<MetricCard>`, `<DataTable>` |
| `/voice-lab` | Work | Flat surface | `<PageHeader>`, `<GlassCard>` per voice, `<StatusPill>` |
| `/settings` | Ceremony-lite | `.atm-hero` | `<GlassCard>`, `<PageHeader>` |
| `/design-tokens` | Dev showcase | `.atm-hero` | All primitives |
