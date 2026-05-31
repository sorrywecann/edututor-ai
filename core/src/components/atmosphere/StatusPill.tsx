// Status pill — "Verified", "Working", "Not configured", "Needs key".
// Compact, monospace, colour-coded.
import { ReactNode } from 'react';

type StatusKind = 'ok' | 'warn' | 'info' | 'idle';

interface StatusPillProps {
  kind?: StatusKind;
  children: ReactNode;
  /** Show a leading status dot. Default true. */
  dot?: boolean;
  onClick?: () => void;
}

const STYLES: Record<StatusKind, { bg: string; text: string; ring: string }> = {
  ok:   { bg: 'var(--atm-pill-ok-bg)',   text: 'var(--atm-pill-ok-text)',   ring: 'var(--atm-pill-ok-ring)' },
  warn: { bg: 'var(--atm-pill-warn-bg)', text: 'var(--atm-pill-warn-text)', ring: 'var(--atm-pill-warn-ring)' },
  info: { bg: 'var(--atm-pill-info-bg)', text: 'var(--atm-pill-info-text)', ring: 'var(--atm-pill-info-ring)' },
  idle: { bg: 'transparent', text: 'var(--atm-micro-color)', ring: 'var(--atm-glass-border)' },
};

export function StatusPill({ kind = 'idle', children, dot = true, onClick }: StatusPillProps) {
  const s = STYLES[kind];
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 8,
        background: s.bg,
        border: `1px solid ${s.ring}`,
        color: s.text,
        fontFamily: 'var(--font-jetbrains), monospace',
        fontSize: 9,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: s.text,
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </span>
  );
}
