'use client';

import type { TutorId } from './useSettings';

export function TutorCard({
  letter, name, active, onClick,
}: {
  id: TutorId; letter: string; name: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      // v0.7.7: hover affordance for the non-active card. Border brightens to
      // mid-tone + slight lift on hover; active card's hover is suppressed.
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--ch-ink-dim, #9a8f82)';
          e.currentTarget.style.background = 'rgba(244,237,228,0.05)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--ch-line-strong, rgba(244,237,228,0.12))';
          e.currentTarget.style.background = 'rgba(244,237,228,0.02)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
        background: active
          ? 'linear-gradient(180deg, rgba(232,168,124,0.10), rgba(232,168,124,0.02))'
          : 'rgba(244,237,228,0.02)',
        border: `1px solid ${active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-line-strong, rgba(244,237,228,0.12))'}`,
        boxShadow: active ? '0 8px 28px rgba(232,168,124,0.16)' : 'none',
        color: 'var(--ch-ink, #f4ede4)',
        transition: 'all 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
        background: active
          ? 'radial-gradient(circle at 35% 30%, #F4B58A 0%, #E8A87C 50%, #B87A52 100%)'
          : 'radial-gradient(circle at 35% 30%, #5a5048 0%, #2a2018 100%)',
        boxShadow: active ? '0 0 20px rgba(232,168,124,0.4)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: 22, fontWeight: 500,
        color: active ? '#1a0e07' : 'var(--ch-ink, #f4ede4)',
      }}>{letter}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
          fontSize: 16, fontWeight: 500, color: active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink, #f4ede4)',
        }}>{name}</div>
        <div style={{
          marginTop: 2,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--ch-ink-faint, #5a5048)',
        }}>
          {active ? 'Vybraný' : 'K dispozícii'}
        </div>
      </div>
    </button>
  );
}
