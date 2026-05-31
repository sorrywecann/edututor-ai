'use client';

// Chamber primitives — the small set of reusable atoms used across every
// Chamber screen. The design language: pure black, one amber, Geist for
// display + body, Geist Mono for labels/meta, Instrument Serif italic for
// emotional notes. Spacing generous, surfaces subtle, motion calm.

import { ReactNode, useState } from 'react';

// ── ChamberShell ─────────────────────────────────────────────────────────────
// Full-bleed cinematic frame for a Chamber screen. Pure black bg, warm vignette
// behind the orb, fade-up screen entrance. Children center themselves.
export function ChamberShell({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, overflowY: 'auto',
      background: 'var(--ch-bg, #050403)',
      color: 'var(--ch-ink, #f4ede4)',
      fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px',
      animation: 'chamber-rise 720ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
    }}>
      {/* Warm vignette anchored under the orb */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(232,168,124,0.05), rgba(232,168,124,0) 70%)',
      }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 720, textAlign: 'center', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ── ChamberEyebrow ───────────────────────────────────────────────────────────
// Tiny mono caps label above the hero. The step indicator lives here.
export function ChamberEyebrow({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div style={{
      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
      fontSize: 10.5, letterSpacing: '0.30em', textTransform: 'uppercase',
      color: color || 'var(--ch-ink-faint, #5a5048)',
      marginBottom: 28,
    }}>
      {children}
    </div>
  );
}

// ── ChamberHero ──────────────────────────────────────────────────────────────
// The display headline. Pass an `accent` for the optional italic-serif amber
// fragment on the second line ("Tichá miestnosť" / "na učenie." pattern).
export function ChamberHero({ children, accent }: { children: ReactNode; accent?: ReactNode }) {
  return (
    <h1 style={{
      fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
      fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.04,
      fontSize: 'clamp(40px, 5.6vw, 80px)',
      color: 'var(--ch-ink, #f4ede4)', margin: '0',
    }}>
      {children}
      {accent && (
        <>
          {' '}<span style={{
            fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
            fontStyle: 'italic',
            color: 'var(--ch-amber, #E8A87C)',
          }}>{accent}</span>
        </>
      )}
    </h1>
  );
}

// ── ChamberSub ───────────────────────────────────────────────────────────────
export function ChamberSub({ children, maxWidth = 480 }: { children: ReactNode; maxWidth?: number }) {
  return (
    <p style={{
      fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
      fontSize: 16, lineHeight: 1.55,
      color: 'var(--ch-ink-dim, #9a8f82)',
      margin: '24px auto 0', maxWidth,
    }}>
      {children}
    </p>
  );
}

// ── ChamberPrimary ───────────────────────────────────────────────────────────
// The one amber pill CTA per screen. Soft amber gradient, gentle hover lift.
export function ChamberPrimary({
  children, onClick, disabled,
}: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '14px 36px', borderRadius: 999,
        background: disabled
          ? 'transparent'
          : 'linear-gradient(180deg, #F4B58A, #B87A52)',
        border: `1px solid ${disabled ? 'var(--ch-line-strong, rgba(244,237,228,0.12))' : 'rgba(244,237,228,0.10)'}`,
        color: disabled ? 'var(--ch-ink-faint, #5a5048)' : '#1a0e07',
        fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.005em',
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: disabled
          ? 'none'
          : hover
            ? '0 14px 36px rgba(232,168,124,0.34)'
            : '0 8px 28px rgba(232,168,124,0.22)',
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.28s, opacity 0.18s',
        opacity: disabled ? 0.65 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 9,
      }}
    >
      {children}
    </button>
  );
}

// ── ChamberGhost ─────────────────────────────────────────────────────────────
export function ChamberGhost({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'transparent', border: 'none', padding: '8px 12px',
        color: hover ? 'var(--ch-ink, #f4ede4)' : 'var(--ch-ink-dim, #9a8f82)',
        fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: 13, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'color 0.18s',
      }}
    >
      {children}
    </button>
  );
}

// ── ChamberInput ─────────────────────────────────────────────────────────────
// Big centred input, hairline bottom border, amber-glow on focus.
export function ChamberInput({
  value, onChange, placeholder, autoFocus, onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', background: 'transparent', textAlign: 'center',
        border: 'none', borderBottom: `1px solid ${focused ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-line-strong, rgba(244,237,228,0.12))'}`,
        padding: '16px 0', borderRadius: 0,
        fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em',
        color: 'var(--ch-ink, #f4ede4)', outline: 'none',
        transition: 'border-color 0.25s',
        boxShadow: focused ? '0 8px 16px -8px rgba(232,168,124,0.20)' : 'none',
      }}
    />
  );
}

// ── ChamberChip ──────────────────────────────────────────────────────────────
// Pill chip for feature highlights / meta tags. Mono caps.
export function ChamberChip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '8px 14px', borderRadius: 999,
      border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
      fontSize: 11, color: 'var(--ch-ink-dim, #9a8f82)', letterSpacing: '0.04em',
    }}>
      {icon && <span style={{ color: 'var(--ch-amber, #E8A87C)', display: 'inline-flex' }}>{icon}</span>}
      {children}
    </span>
  );
}

// ── ChamberStepDots ──────────────────────────────────────────────────────────
// Slim progress indicator: tiny rounded segments, the active one is amber.
export function ChamberStepDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === current;
        const past = i < current;
        return (
          <span key={i} style={{
            width: active ? 22 : 14, height: 2, borderRadius: 999,
            background: active
              ? 'var(--ch-amber, #E8A87C)'
              : past
                ? 'var(--ch-ink-faint, #5a5048)'
                : 'var(--ch-line-strong, rgba(244,237,228,0.12))',
            boxShadow: active ? '0 0 8px rgba(232,168,124,0.45)' : 'none',
            transition: 'width 0.28s cubic-bezier(0.2,0.8,0.2,1), background 0.28s',
          }} />
        );
      })}
    </div>
  );
}

// ── ChamberCard ──────────────────────────────────────────────────────────────
// Selectable glass card for vibe / mode choices. Hairline border, soft amber
// lift when active.
export function ChamberCard({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, minWidth: 0, textAlign: 'left',
        padding: '20px 18px', borderRadius: 16,
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--ch-amber, #E8A87C)' : hover ? 'var(--ch-line-strong, rgba(244,237,228,0.12))' : 'var(--ch-line, rgba(244,237,228,0.06))'}`,
        background: active
          ? 'linear-gradient(180deg, rgba(232,168,124,0.10), rgba(232,168,124,0.02))'
          : hover
            ? 'rgba(244,237,228,0.02)'
            : 'transparent',
        boxShadow: active
          ? '0 12px 36px rgba(232,168,124,0.18), inset 0 0 0 1px rgba(232,168,124,0.08)'
          : 'none',
        transform: active ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
        color: 'var(--ch-ink, #f4ede4)',
      }}
    >
      {children}
    </button>
  );
}

// ── ChamberStepNav ───────────────────────────────────────────────────────────
// Bottom strip with back ghost, step dots in the middle, primary CTA on right.
export function ChamberStepNav({
  onBack,
  total,
  current,
  right,
}: {
  onBack?: () => void;
  total: number;
  current: number;
  right: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, maxWidth: 540, margin: '0 auto', width: '100%',
    }}>
      <div style={{ width: 88, textAlign: 'left' }}>
        {onBack ? <ChamberGhost onClick={onBack}>← Späť</ChamberGhost> : <span />}
      </div>
      <ChamberStepDots total={total} current={current} />
      <div style={{ width: 200, textAlign: 'right' }}>{right}</div>
    </div>
  );
}
