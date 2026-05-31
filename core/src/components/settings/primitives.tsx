'use client';

// Shared low-level Chamber primitives used across all Settings tabs.
// Extracted byte-identical from the original ChamberHardwareSetup.tsx
// (v0.7.7) so existing visual behaviour is preserved exactly.

import React from 'react';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
      fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase',
      color: 'var(--ch-ink-dim, #9a8f82)',
    }}>
      {children}
    </div>
  );
}

// Hairline-divided key/value row.
export function KvRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
    }}>
      <span style={{
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: 'var(--ch-ink-dim, #9a8f82)',
      }}>{label}</span>
      <span style={{
        fontFamily: mono
          ? 'var(--font-geist-mono), ui-monospace, monospace'
          : 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: mono ? 13 : 15,
        color: accent ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink, #f4ede4)',
        textAlign: 'right',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        maxWidth: '65%',
      }}>{value}</span>
    </div>
  );
}

export function CircleBtn({ children, onClick, aria }: { children: React.ReactNode; onClick: () => void; aria: string }) {
  return (
    <button onClick={onClick} aria-label={aria} style={{
      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
      background: 'transparent',
      border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
      color: 'var(--ch-ink-dim, #9a8f82)',
      cursor: 'pointer', padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'color 0.18s, border-color 0.18s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ch-ink, #f4ede4)'; e.currentTarget.style.borderColor = 'var(--ch-amber, #E8A87C)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ch-ink-dim, #9a8f82)'; e.currentTarget.style.borderColor = 'var(--ch-line-strong, rgba(244,237,228,0.12))'; }}
    >
      {children}
    </button>
  );
}

export function PillBtn({ children, onClick, disabled, small }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '7px 16px' : '10px 24px', borderRadius: 999,
      background: disabled ? 'transparent' : 'linear-gradient(180deg, #F4B58A, #B87A52)',
      border: `1px solid ${disabled ? 'var(--ch-line-strong, rgba(244,237,228,0.12))' : 'rgba(244,237,228,0.10)'}`,
      color: disabled ? 'var(--ch-ink-faint, #5a5048)' : '#1a0e07',
      fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
      fontSize: small ? 12.5 : 14, fontWeight: 500, letterSpacing: '-0.005em',
      cursor: disabled ? 'default' : 'pointer',
      boxShadow: disabled ? 'none' : '0 6px 20px rgba(232,168,124,0.22)',
      transition: 'transform 0.18s, box-shadow 0.18s, opacity 0.18s',
      opacity: disabled ? 0.65 : 1,
      whiteSpace: 'nowrap',
    }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(232,168,124,0.30)'; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(232,168,124,0.22)'; } }}
    >
      {children}
    </button>
  );
}

export function Loading() {
  return (
    <div style={{
      padding: 40, textAlign: 'center',
      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
      fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
      color: 'var(--ch-ink-dim, #9a8f82)',
    }}>
      Detekujem hardvér…
    </div>
  );
}

export function StatusPillSmall({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
      fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
      color: connected ? 'var(--ch-ok, #7ea88a)' : 'var(--ch-ink-faint, #5a5048)',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: connected ? 'var(--ch-ok, #7ea88a)' : 'transparent',
        border: connected ? 'none' : '1px solid var(--ch-ink-faint, #5a5048)',
      }} />
      {label ?? (connected ? 'Pripojené' : 'Nepripojené')}
    </span>
  );
}
