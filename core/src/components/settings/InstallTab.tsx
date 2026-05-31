'use client';

// InstallTab — extracted byte-identical from ChamberHardwareSetup.tsx
// (INŠTALÁCIA). Lists installed Ollama models + the always-on STT/TTS.

import { useSettingsCtx } from './SettingsContext';
import { SectionLabel } from './primitives';
import { ModelRow } from './ModelRow';
import { TabShell } from './TabShell';

export function InstallTab() {
  const { data } = useSettingsCtx();
  const installed = data?.hardware.ollama_models || [];
  const ALWAYS: { name: string; size: string }[] = [
    { name: 'faster-whisper (sk · base)', size: '~145 MB' },
    { name: 'edge-tts',                   size: 'CLOUD' },
  ];
  return (
    <TabShell title="Inštalácia" sub="Skratky, obnova, odinštalovanie.">
      <section>
        <SectionLabel>Nainštalované modely</SectionLabel>
        <div style={{ marginTop: 8 }}>
          {installed.map((name) => (
            <ModelRow key={name} name={name} status="installed" />
          ))}
          {installed.length === 0 && (
            <div style={{
              padding: '14px 0', fontSize: 12.5, color: 'var(--ch-ink-dim, #9a8f82)',
            }}>
              Žiadne lokálne LLM modely. Ollama stiahne predvolený model pri prvom použití.
            </div>
          )}
          {ALWAYS.map((m) => (
            <ModelRow key={m.name} name={m.name} size={m.size} status="installed" />
          ))}
        </div>
      </section>
    </TabShell>
  );
}
