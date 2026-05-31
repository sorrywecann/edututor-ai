'use client';

// ProvidersTab — extracted byte-identical from ChamberHardwareSetup.tsx
// (PROVIDERI, renamed to LLM in the tab strip). Lists cloud LLM keys.
//
// v0.8.5: per-row saves are instant (POST /api/v1/system/config). A small
// SaveStatusPill at the top fades after 3s on any successful save so the
// user gets visible "Uložené" feedback even without a tab-level button.

import { useState } from 'react';
import { API_BASE } from '@/lib/config';
import { useSettingsCtx } from './SettingsContext';
import { SectionLabel } from './primitives';
import { ProviderKeyRow } from './ProviderKeyRow';
import { TabShell } from './TabShell';
import { SaveStatusPill } from './SaveBar';

export function ProvidersTab() {
  const { checks, setChecks } = useSettingsCtx();
  const [savedTick, setSavedTick] = useState(0);

  const PROVIDERS: { id: string; label: string; placeholder: string; field: string }[] = [
    { id: 'openai',     label: 'OpenAI',     placeholder: 'Vlož API kľúč', field: 'openai_api_key' },
    { id: 'anthropic',  label: 'Anthropic',  placeholder: 'Vlož API kľúč', field: 'anthropic_api_key' },
    // v0.7.7: id MUST be 'custom:deepseek' to match the key /system/check
    // writes (system.py:781). Field name `deepseek_api_key` stays — backend reads that.
    { id: 'custom:deepseek', label: 'DeepSeek', placeholder: 'Vlož API kľúč', field: 'deepseek_api_key' },
    { id: 'groq',       label: 'Groq',       placeholder: 'Vlož API kľúč', field: 'groq_api_key' },
  ];
  return (
    <TabShell title="LLM" sub="Kto za teba premýšľa.">
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>Cloud provideri</SectionLabel>
          <SaveStatusPill
            visible={savedTick > 0}
            ttlMs={3000}
            onExpire={() => setSavedTick(0)}
          />
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {PROVIDERS.map((p) => (
            <ProviderKeyRow
              key={p.id}
              label={p.label}
              placeholder={p.placeholder}
              field={p.field}
              connected={!!checks?.llm?.[p.id]?.available}
              onSaved={() => {
                setSavedTick(t => t + 1);
                fetch(`${API_BASE}/api/v1/system/check`).then(r => (r.ok ? r.json() : null)).catch(() => null).then(ch => { if (ch) setChecks(ch); });
              }}
            />
          ))}
        </div>
      </section>
    </TabShell>
  );
}
