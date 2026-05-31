'use client';

// SettingsHeader — title row at the top of every Settings tab.
//
// v0.8.0 numbering-bug fix: the previous badge held the profile-tier number
// (00..04 from PROFILE_NUM) which visually clashed with the tab strip's
// 01..05 indices. Per Fix B from the W5 spec: drop the number, render a
// small terracotta-accent dot inside the badge instead.

import { useSettingsCtx } from './SettingsContext';

export function SettingsHeader() {
  const { data } = useSettingsCtx();
  const profileLabel = data?.profile_label || 'Detekujem…';
  const cpuShort = data?.hardware.cpu_brand?.slice(0, 60) || '';

  return (
    <header style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
      {/* Profile badge — number replaced with a terracotta accent dot to avoid
          clashing with the tab strip's 01..08 indices. */}
      <div style={{
        width: 64, height: 64, borderRadius: 14, flexShrink: 0,
        background: 'rgba(232, 168, 124, 0.06)',
        border: '1px solid rgba(232, 168, 124, 0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: 'var(--ch-amber, #E8A87C)',
          boxShadow: '0 0 12px rgba(232,168,124,0.55)',
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{
          fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
          fontSize: 18, fontWeight: 500, letterSpacing: '-0.005em',
          color: 'var(--ch-ink, #f4ede4)', margin: 0,
        }}>
          Hardvérové nastavenie
        </h2>
        <div style={{
          marginTop: 4,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 10.5, letterSpacing: '0.20em', textTransform: 'uppercase',
          color: 'var(--ch-ink-faint, #5a5048)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {profileLabel} · {cpuShort || 'detekujem cpu…'}
        </div>
      </div>
    </header>
  );
}
