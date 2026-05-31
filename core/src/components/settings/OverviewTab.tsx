'use client';

// OverviewTab — extracted from ChamberHardwareSetup.tsx (PREHĽAD).
// Render output is byte-identical except the Apply CTA now lives at the
// bottom of the tab body (instead of the modal footer).

import { Check } from 'lucide-react';
import { useSettingsCtx } from './SettingsContext';
import { SectionLabel, KvRow } from './primitives';
import { TutorCard } from './TutorCard';
import { ApplyConfigCTA } from './ApplyConfigCTA';
import { TabShell } from './TabShell';

export function OverviewTab() {
  const { data, status, tutor, applied, pickTutor } = useSettingsCtx();

  const ramGb = data?.hardware.ram_gb;
  const cpuBrand = data?.hardware.cpu_brand;
  const gpu = data?.hardware.gpu_backend || 'CPU';
  const cpuShort = cpuBrand?.split(' ')[0] || '—';

  return (
    <TabShell title="Prehľad" sub="Stav tvojich nástrojov.">
      {/* Hardvér */}
      <section>
        <SectionLabel>Hardvér · {data?.profile_label || 'Detekujem'}</SectionLabel>
        <div style={{ marginTop: 8 }}>
          <KvRow label="Pamäť" value={ramGb ? `${ramGb.toFixed(1)} GB` : '—'} />
          <KvRow label="Procesor" value={cpuShort} />
          <KvRow label="Grafika" value={gpu} accent />
        </div>
      </section>

      {/* Tutor */}
      <section>
        <SectionLabel>Tutor</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 12 }}>
          <TutorCard
            id="lukas" letter="L" name="Lukáš"
            active={tutor === 'lukas'} onClick={() => pickTutor('lukas')}
          />
          <TutorCard
            id="viktoria" letter="V" name="Viktória"
            active={tutor === 'viktoria'} onClick={() => pickTutor('viktoria')}
          />
        </div>
      </section>

      {/* Aktívne provideri */}
      <section>
        <SectionLabel>Aktívne</SectionLabel>
        <div style={{ marginTop: 8 }}>
          <KvRow label="STT" value={status?.stt || '—'} mono />
          <KvRow label="LLM" value={status?.llm_model || status?.llm || '—'} mono />
          <KvRow label="TTS" value={status?.tts || '—'} mono />
        </div>
      </section>

      {!applied && (
        <div style={{
          marginTop: 4,
          padding: '12px 14px',
          background: 'rgba(244,237,228,0.02)',
          border: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
          borderRadius: 10,
          fontSize: 11.5, color: 'var(--ch-ink-dim, #9a8f82)', lineHeight: 1.55,
        }}>
          Optimálnu konfiguráciu STT · LLM · TTS pre tento počítač môžeš použiť tlačidlom <span style={{ color: 'var(--ch-amber, #E8A87C)', fontWeight: 500 }}>„Použiť konfiguráciu“</span> nižšie.
        </div>
      )}
      {applied && (
        <div style={{
          marginTop: 4,
          padding: '12px 14px',
          background: 'rgba(126,168,138,0.06)',
          border: '1px solid rgba(126,168,138,0.22)',
          borderRadius: 10,
          fontSize: 12.5, color: 'var(--ch-ok, #7ea88a)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={14} />
          Konfigurácia použitá. Tutor reštartuje so správnym STT · LLM · TTS pre tento počítač.
        </div>
      )}

      <ApplyConfigCTA />
    </TabShell>
  );
}
