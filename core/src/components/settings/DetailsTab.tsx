'use client';

// DetailsTab — extracted byte-identical from ChamberHardwareSetup.tsx
// (DETAILY). Key/value list of OS / CPU / RAM / GPU / network / mic.

import { useSettingsCtx } from './SettingsContext';
import { TabShell } from './TabShell';

export function DetailsTab() {
  const { data } = useSettingsCtx();
  const hw = data?.hardware;
  const rows: [string, string][] = [
    ['Operačný systém', hw?.is_apple_silicon ? 'macOS · Apple Silicon' : (typeof navigator !== 'undefined' ? (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || 'Windows' : '—')],
    ['CPU',             hw?.cpu_brand || '—'],
    ['RAM',             hw?.ram_gb ? `${hw.ram_gb.toFixed(1)} GB` : '—'],
    ['GPU',             hw?.gpu_backend || 'CPU only'],
    ['Sieť',            typeof navigator !== 'undefined' && navigator.onLine ? 'Online' : 'Offline'],
    ['Mikrofón',        'Default · 48 kHz'],
  ];
  return (
    <TabShell title="Detaily" sub="Konkrétne čísla a verzie.">
      <div>{rows.map(([k, v], i) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 0',
          borderBottom: i < rows.length - 1 ? '1px solid var(--ch-line, rgba(244,237,228,0.06))' : 'none',
        }}>
          <div style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'var(--ch-ink-dim, #9a8f82)',
          }}>
            {k}
          </div>
          <div style={{
            fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
            fontSize: 15, color: 'var(--ch-ink, #f4ede4)',
            textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: '60%',
          }}>
            {v}
          </div>
        </div>
      ))}</div>
    </TabShell>
  );
}
