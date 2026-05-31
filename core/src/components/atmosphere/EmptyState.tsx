// EmptyState — friendly zero-state for "no conversations yet", "no KBs",
// "no metrics" etc. Centred in available space, with optional icon + CTA.
//
// Lives inside a parent that controls layout; doesn't force min-height
// itself so it works in both full-page and panel contexts.

import { CSSProperties, ReactNode } from 'react';

interface EmptyStateProps {
  /** Decorative leading icon (24x24-ish) or short emoji-like char */
  icon?: ReactNode;
  /** Short title — what's missing */
  title: ReactNode;
  /** One- or two-line description with context + suggested next step */
  description?: ReactNode;
  /** Primary CTA — usually a button or link */
  action?: ReactNode;
  /** Secondary CTA — quieter, e.g. "Learn more" */
  secondaryAction?: ReactNode;
  /** Pad amount around content. Default 'lg' */
  pad?: 'sm' | 'md' | 'lg';
  style?: CSSProperties;
}

const PAD = { sm: '28px 24px', md: '40px 32px', lg: '60px 40px' };

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  pad = 'lg',
  style,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 14,
        padding: PAD[pad],
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'rgba(245, 237, 216, 0.04)',
            border: '1px solid var(--atm-glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            color: 'var(--t2)',
            marginBottom: 4,
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--t1)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--t2)',
            lineHeight: 1.55,
            maxWidth: 380,
          }}
        >
          {description}
        </div>
      )}
      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
