'use client';

// ProviderKeyRow — extracted byte-identical from ChamberHardwareSetup.tsx.
// Cloud-provider API-key input + "Pripojené/Nepripojené" pill + "Overiť"
// button. Posts to /api/v1/system/config (field name passed via prop).

import { useState } from 'react';
import { API_BASE } from '@/lib/config';
import { PillBtn } from './primitives';

export function ProviderKeyRow({
  label, placeholder, field, connected, onSaved,
}: {
  label: string; placeholder: string; field: string; connected: boolean; onSaved: () => void;
}) {
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!val.trim()) return;
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val.trim() }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.success !== false) {
        setVal('');
        // v0.7.7: surface immediate "✓ Uložené" feedback for 2.5s.
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        onSaved();
        // v0.5.2: dispatch the global event that useProviderSettings listens
        // for so the chat-page LLM dropdown immediately refetches /llm/models.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('edututor:providers-changed'));
        }
      }
      else setErr((data && data.error) || 'Kľúč zlyhal');
    } catch { setErr('Spojenie zlyhalo'); }
    setSaving(false);
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', alignItems: 'center', gap: 18 }}>
      <div>
        <div style={{
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 10.5, letterSpacing: '0.20em', textTransform: 'uppercase',
          color: 'var(--ch-ink-dim, #9a8f82)',
        }}>
          {label}
        </div>
        <div style={{
          marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: connected ? 'var(--ch-ok, #7ea88a)' : 'var(--ch-ink-faint, #5a5048)',
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: connected ? 'var(--ch-ok, #7ea88a)' : 'transparent',
            border: connected ? 'none' : '1px solid var(--ch-ink-faint, #5a5048)',
          }} />
          {connected ? 'Pripojené' : 'Nepripojené'}
        </div>
      </div>
      <input
        type="password" value={val} placeholder={placeholder}
        onChange={(e) => { setVal(e.target.value); setErr(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-amber, #E8A87C)'; }}
        onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-line-strong, rgba(244,237,228,0.12))'; }}
        style={{
          width: '100%', background: 'transparent', textAlign: 'left',
          border: 'none', borderBottom: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
          padding: '8px 0', borderRadius: 0,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 13, color: 'var(--ch-ink, #f4ede4)', outline: 'none',
          transition: 'border-bottom-color 0.15s',
        }}
      />
      <PillBtn onClick={save} disabled={saving || !val.trim()} small>
        {saving ? 'Overujem…' : saved ? '✓ Uložené' : 'Overiť'}
      </PillBtn>
      {err && <div style={{ gridColumn: '2 / -1', fontSize: 11, color: 'var(--ch-warn, #ff8a80)' }}>{err}</div>}
    </div>
  );
}
