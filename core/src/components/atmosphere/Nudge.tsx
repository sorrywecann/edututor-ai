'use client';

// Nudge — atmosphere-consistent error / warning / info / empty primitive.
//
// Built for W2 (v0.8.0): we needed a single primitive that could replace the
// scattered ad-hoc inline error rows + the empty-state placeholders + the
// future banner that warns "no LLM configured" above the input bar.
//
// Variants (warm palette only — DESIGN.md bans cold red except the existing
// `#ef4444` save-row error inside HW Setup which is kept untouched elsewhere):
//   info    — muted amber on var(--accent-soft) bg
//   warning — warmer amber
//   error   — terracotta border + lighter text (NOT red)
//   empty   — most subtle, no fill, just var(--t2) border
//
// Layouts:
//   inline — small, compact, no card frame, max-width 480px
//   banner — sticky, full-width, optional dismiss × button, action right-aligned
//   block  — centred empty-state replacement, icon + title + body + CTA
//
// The component is purely presentational. The host decides where it sits
// (above the chat bar, inside an empty list, etc.) and how it gets dismissed.

import { CSSProperties, ReactNode, useState } from 'react';

import { Button } from './Button';

export type NudgeKind = 'info' | 'warning' | 'error' | 'empty';
export type NudgeLayout = 'inline' | 'banner' | 'block';

interface NudgeAction {
  label: string;
  onClick: () => void;
}

export interface NudgeProps {
  kind?: NudgeKind;
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: NudgeAction;
  secondary?: NudgeAction;
  /** Show a × close button (banner/inline). When clicked, the nudge hides
   *  itself locally — the host can also externally re-mount it. */
  dismissible?: boolean;
  layout?: NudgeLayout;
  style?: CSSProperties;
}

// Visual tokens per kind. Backgrounds + borders are warm — never red.
// Error uses terracotta (the project accent) at a higher opacity, which
// reads as "important / urgent" without breaking the palette.
const KIND_STYLE: Record<NudgeKind, { bg: string; border: string; title: string; body: string }> = {
  info: {
    bg: 'var(--accent-soft, rgba(212, 132, 90, 0.08))',
    border: '1px solid rgba(212, 132, 90, 0.22)',
    title: 'var(--t1)',
    body: 'var(--t2)',
  },
  warning: {
    bg: 'rgba(212, 132, 90, 0.12)',
    border: '1px solid rgba(212, 132, 90, 0.36)',
    title: 'var(--t1)',
    body: 'var(--t2)',
  },
  error: {
    // Terracotta border + lighter text — warm, not red. DESIGN.md compliant.
    bg: 'rgba(212, 132, 90, 0.10)',
    border: '1px solid var(--accent)',
    title: 'var(--t1)',
    body: 'var(--t2)',
  },
  empty: {
    bg: 'transparent',
    border: '1px dashed var(--atm-glass-border)',
    title: 'var(--t1)',
    body: 'var(--t2)',
  },
};

export function Nudge({
  kind = 'info',
  icon,
  title,
  body,
  action,
  secondary,
  dismissible = false,
  layout = 'inline',
  style,
}: NudgeProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const k = KIND_STYLE[kind];

  // Layout-specific container styling.
  const containerStyle: CSSProperties =
    layout === 'banner'
      ? {
          width: '100%',
          padding: '10px 18px',
          borderRadius: 0,
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: kind === 'empty' ? '1px dashed var(--atm-glass-border)' : '1px solid transparent',
        }
      : layout === 'block'
      ? {
          width: '100%',
          maxWidth: 480,
          padding: '28px 24px',
          borderRadius: 14,
          textAlign: 'center',
        }
      : {
          // inline
          maxWidth: 480,
          padding: '10px 14px',
          borderRadius: 10,
        };

  const flexDirection: CSSProperties['flexDirection'] =
    layout === 'block' ? 'column' : 'row';

  return (
    <div
      role={kind === 'error' || kind === 'warning' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        flexDirection,
        alignItems: layout === 'block' ? 'center' : 'flex-start',
        justifyContent: 'space-between',
        gap: layout === 'block' ? 12 : 14,
        background: k.bg,
        border: k.border,
        color: k.title,
        fontFamily: 'var(--font-inter)',
        backdropFilter: layout === 'banner' ? 'blur(10px) saturate(1.2)' : undefined,
        WebkitBackdropFilter: layout === 'banner' ? 'blur(10px) saturate(1.2)' : undefined,
        ...containerStyle,
        ...style,
      }}
    >
      {/* Leading: icon + text block (title + body). For block layout this becomes
          a vertical stack centred above the actions. */}
      <div
        style={{
          display: 'flex',
          flexDirection: layout === 'block' ? 'column' : 'row',
          alignItems: layout === 'block' ? 'center' : 'flex-start',
          gap: layout === 'block' ? 10 : 12,
          flex: '1 1 auto',
          minWidth: 0,
          textAlign: layout === 'block' ? 'center' : 'left',
        }}
      >
        {icon && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: layout === 'block' ? 36 : 22,
              height: layout === 'block' ? 36 : 22,
              borderRadius: layout === 'block' ? 10 : 6,
              background: 'rgba(245, 237, 216, 0.04)',
              border: '1px solid var(--atm-glass-border)',
              color: 'var(--t2)',
              fontSize: layout === 'block' ? 18 : 13,
            }}
          >
            {icon}
          </span>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div
            style={{
              fontSize: layout === 'block' ? 16 : 13,
              fontWeight: 600,
              color: k.title,
              letterSpacing: '-0.01em',
              lineHeight: 1.35,
            }}
          >
            {title}
          </div>
          {body && (
            <div
              style={{
                fontSize: layout === 'block' ? 13 : 12,
                color: k.body,
                lineHeight: 1.55,
                maxWidth: layout === 'block' ? 380 : undefined,
              }}
            >
              {body}
            </div>
          )}
        </div>
      </div>

      {/* Trailing: actions + dismiss. For block layout these sit beneath the text. */}
      {(action || secondary || dismissible) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            marginTop: layout === 'block' ? 6 : 0,
          }}
        >
          {secondary && (
            <Button variant="ghost" size="sm" onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          )}
          {action && (
            <Button variant="primary" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {dismissible && (
            <button
              aria-label="Zavrieť"
              onClick={() => setHidden(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--t2)',
                cursor: 'pointer',
                padding: 4,
                fontSize: 16,
                lineHeight: 1,
                marginLeft: 2,
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
