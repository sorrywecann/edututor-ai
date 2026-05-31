'use client';

// ApplyConfigCTA — primary action for the Overview tab. Was the
// chamber-modal footer's contextual action; in the route world it lives at
// the bottom of OverviewTab so it's adjacent to the data it applies.

import { Check } from 'lucide-react';
import { useSettingsCtx } from './SettingsContext';

export function ApplyConfigCTA() {
  const { applying, applied, applyConfig } = useSettingsCtx();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <button
        onClick={applyConfig}
        disabled={applying || applied}
        style={{
          padding: '9px 18px',
          background: applied ? 'transparent' : 'var(--ch-amber, #E8A87C)',
          color: applied ? 'var(--ch-ok, #7ea88a)' : '#1a1006',
          border: applied ? '1px solid var(--ch-ok, #7ea88a)' : 'none',
          borderRadius: 8,
          fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
          fontSize: 12.5, fontWeight: 500,
          cursor: applying || applied ? 'default' : 'pointer',
          opacity: applying ? 0.6 : 1,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          transition: 'opacity 0.15s, transform 0.15s',
        }}
      >
        {applied && <Check size={13} />}
        {applying && (
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: '#1a1006', animation: 'applyPulse 0.9s ease-in-out infinite',
          }} />
        )}
        {applying ? 'Aplikujem…' : applied ? 'Konfigurácia použitá' : 'Použiť konfiguráciu'}
      </button>
      <style>{`
        @keyframes applyPulse {
          0%, 100% { opacity: 0.35; transform: scale(0.8); }
          50%      { opacity: 1;    transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
