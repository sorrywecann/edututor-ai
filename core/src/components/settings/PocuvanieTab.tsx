'use client';

// PocuvanieTab — STT (speech-to-text) model picker. v0.8.0 W5 new tab.
//
// Reads /api/v1/stt/models (already exposed by stt.py) and categorises into
// LOKÁLNE vs CLOUD. Each card shows accuracy_sk / speed / cost plus a
// "Vybrať" button that hits /api/v1/stt/switch. A small mic-test button
// pings the existing /stt route with a 1-second silent buffer just to
// confirm the active provider responds — no recording surface here.

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { SectionLabel, PillBtn } from './primitives';
import { TabShell } from './TabShell';
import { SaveStatusPill } from './SaveBar';

interface STTModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  backend: string;
  model_id: string;
  accuracy_sk: string;
  speed: string;
  cost: string;
  languages: string[];
  requires: string[];
}

interface STTModelsResponse {
  models: STTModel[];
  current: string;
}

export function PocuvanieTab() {
  const [models, setModels] = useState<STTModel[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/stt/models`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: STTModelsResponse | null) => {
        if (d) {
          setModels(d.models.filter(m => m.id !== 'mock'));
          setCurrent(d.current);
        }
      })
      .catch(() => {});
  }, []);

  async function switchModel(id: string) {
    setSwitching(id); setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/stt/switch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: id }),
      });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        if (d?.active) setCurrent(d.active);
        setSavedTick(t => t + 1);
      } else {
        const d = await r.json().catch(() => null);
        setError(d?.detail || 'Prepnutie zlyhalo');
      }
    } catch {
      setError('Spojenie zlyhalo');
    }
    setSwitching(null);
  }

  const local = models.filter(m => m.provider === 'local');
  const cloud = models.filter(m => m.provider === 'cloud');

  return (
    <TabShell title="Počúvanie" sub="Ako ti rozumie.">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderRadius: 10,
        background: 'rgba(244,237,228,0.02)',
        border: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase',
            color: 'var(--ch-ink-dim, #9a8f82)',
          }}>Aktívny model</div>
          <div style={{
            marginTop: 4,
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 13, color: 'var(--ch-ink, #f4ede4)',
          }}>{current || '—'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SaveStatusPill
            visible={savedTick > 0}
            ttlMs={3000}
            onExpire={() => setSavedTick(0)}
          />
          <PillBtn onClick={() => { /* placeholder mic test wired in W6 */ }} small>
            Test mikrofónu
          </PillBtn>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--ch-warn, #ff8a80)' }}>{error}</div>
      )}

      {local.length > 0 && (
        <section>
          <SectionLabel>Lokálne</SectionLabel>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {local.map(m => (
              <SttCard
                key={m.id} model={m}
                active={current === m.id}
                switching={switching === m.id}
                onSelect={() => switchModel(m.id)}
              />
            ))}
          </div>
        </section>
      )}

      {cloud.length > 0 && (
        <section>
          <SectionLabel>Cloud</SectionLabel>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cloud.map(m => (
              <SttCard
                key={m.id} model={m}
                active={current === m.id}
                switching={switching === m.id}
                onSelect={() => switchModel(m.id)}
              />
            ))}
          </div>
        </section>
      )}

      {models.length === 0 && (
        <div style={{
          padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--ch-ink-dim, #9a8f82)',
        }}>
          Backend nevracia žiadne STT modely.
        </div>
      )}
    </TabShell>
  );
}

function SttCard({ model, active, switching, onSelect }: {
  model: STTModel; active: boolean; switching: boolean; onSelect: () => void;
}) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      border: `1px solid ${active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-line-strong, rgba(244,237,228,0.12))'}`,
      background: active
        ? 'linear-gradient(180deg, rgba(232,168,124,0.08), rgba(232,168,124,0.02))'
        : 'rgba(244,237,228,0.02)',
      boxShadow: active ? '0 6px 22px rgba(232,168,124,0.12)' : 'none',
      transition: 'all 0.18s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
            fontSize: 13.5, fontWeight: 500,
            color: active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink, #f4ede4)',
          }}>{model.name}</div>
          <div style={{
            marginTop: 4,
            fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
            fontSize: 11.5, color: 'var(--ch-ink-dim, #9a8f82)', lineHeight: 1.5,
          }}>{model.description}</div>

          <div style={{
            marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12,
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--ch-ink-faint, #5a5048)',
          }}>
            <Stat label="presnosť" value={model.accuracy_sk} />
            <Stat label="rýchlosť" value={model.speed} />
            <Stat label="cena" value={model.cost} />
          </div>
        </div>
        <PillBtn onClick={onSelect} disabled={active || switching} small>
          {active ? 'Aktívne' : switching ? 'Prepínam…' : 'Vybrať'}
        </PillBtn>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span style={{ color: 'var(--ch-ink-faint, #5a5048)' }}>{label}: </span>
      <span style={{ color: 'var(--ch-ink-dim, #9a8f82)' }}>{value}</span>
    </span>
  );
}
