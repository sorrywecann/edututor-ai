'use client';

import { useEffect, useState, useCallback } from 'react';
import { QualitativeSlider } from '@/components/atmosphere';
import { API_BASE } from '@/lib/config';

// ─── Personality (mood) ─────────────────────────────────────────────────────
interface UserPrefs {
  user_name: string;
  assistant_name: string;
  formality: number;
  humor: number;
  directness: number;
  verbosity: number;
}
const DEFAULT_PREFS: UserPrefs = {
  user_name: '', assistant_name: 'Lukáš', formality: 1, humor: 1, directness: 1, verbosity: 1,
};
const PREFS_KEY = 'edututor_user_prefs';

// ─── Master prompt ──────────────────────────────────────────────────────────
interface PromptListItem { mode_id: string; label: string; overridden: boolean; }
interface PromptDetail {
  mode_id: string; label: string; default: string;
  override: string | null; effective: string; overridden: boolean;
}

const label: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--t3)',
};
const card: React.CSSProperties = {
  padding: 16, background: 'rgba(245, 237, 216, 0.03)',
  border: '1px solid var(--atm-glass-border)', borderRadius: 10,
};
const textInput: React.CSSProperties = {
  width: '100%', padding: '9px 11px', boxSizing: 'border-box',
  background: 'var(--bg)', border: '1px solid var(--atm-glass-border)', borderRadius: 7,
  fontSize: 13, color: 'var(--t1)', fontFamily: 'var(--font-inter)', outline: 'none',
};

export function PersonaPanel({ accent }: { accent: string }) {
  // ── Personality ──
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) }));
    } catch { /* ignore */ }
    fetch(`${API_BASE}/api/v1/user/preferences`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v != null));
        setPrefs((p) => ({ ...p, ...clean }));
      })
      .catch(() => {});
  }, []);

  const updatePrefs = useCallback((patch: Partial<UserPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    fetch(`${API_BASE}/api/v1/user/preferences`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  // ── Master prompt ──
  const [list, setList] = useState<PromptListItem[]>([]);
  const [modeId, setModeId] = useState('sk');
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/prompts`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: PromptListItem[]) => {
        setList(d);
        if (d.length && !d.find((m) => m.mode_id === 'sk')) setModeId(d[0].mode_id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/prompts/${modeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PromptDetail | null) => { if (d && !cancelled) { setDetail(d); setDraft(d.effective); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [modeId]);

  async function savePrompt() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/prompts/${modeId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      if (r.ok) {
        const d: PromptDetail = await r.json();
        setDetail(d); setDraft(d.effective);
        setList((l) => l.map((m) => (m.mode_id === modeId ? { ...m, overridden: true } : m)));
        setSaved(true); setTimeout(() => setSaved(false), 2500);
      }
    } finally { setBusy(false); }
  }

  async function revertPrompt() {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/prompts/${modeId}`, { method: 'DELETE' });
      if (r.ok) {
        const d: PromptDetail = await r.json();
        setDetail(d); setDraft(d.effective);
        setList((l) => l.map((m) => (m.mode_id === modeId ? { ...m, overridden: false } : m)));
      }
    } finally { setBusy(false); }
  }

  const dirty = detail != null && draft !== detail.effective;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Osobnosť ── */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Osobnosť</div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.5 }}>
            Ako sa tutor správa. Mení sa hneď a premietne sa do ⟨PERSONALITY⟩ bloku promptu.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...label, marginBottom: 6 }}>Tvoje meno</div>
            <input style={textInput} value={prefs.user_name} placeholder="Tvoje meno"
              onChange={(e) => updatePrefs({ user_name: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...label, marginBottom: 6 }}>Meno asistenta</div>
            <input style={textInput} value={prefs.assistant_name} placeholder="Lukáš"
              onChange={(e) => updatePrefs({ assistant_name: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <QualitativeSlider title="Formálnosť" labels={['Neformálne', 'Srdečné', 'Formálne']}
            value={prefs.formality} onChange={(v) => updatePrefs({ formality: v })} />
          <QualitativeSlider title="Humor" labels={['Suchý', 'Vtipný', 'Hravý']}
            value={prefs.humor} onChange={(v) => updatePrefs({ humor: v })} />
          <QualitativeSlider title="Priamosť" labels={['Jemne', 'Úprimne', 'Bez okolkov']}
            value={prefs.directness} onChange={(v) => updatePrefs({ directness: v })} />
          <QualitativeSlider title="Výrečnosť" labels={['Stručne', 'Vyvážene', 'Detailne']}
            value={prefs.verbosity} onChange={(v) => updatePrefs({ verbosity: v })} />
        </div>
      </div>

      {/* ── Master system prompt ── */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ ...label, marginBottom: 4 }}>Systémový prompt (master)</div>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.5 }}>
              „Mozog“ tutora pre vybraný režim. Úpravy sa uložia ako override — originál zostáva nedotknutý.
            </div>
          </div>
          {detail?.overridden && (
            <span style={{
              flexShrink: 0, padding: '3px 9px', borderRadius: 5,
              background: `${accent}1f`, border: `1px solid ${accent}55`,
              color: accent, fontFamily: 'var(--font-jetbrains)', fontSize: 8,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>Upravený</span>
          )}
        </div>

        {/* Mode selector */}
        <div>
          <div style={{ ...label, marginBottom: 6 }}>Režim</div>
          <select
            value={modeId}
            onChange={(e) => setModeId(e.target.value)}
            style={{ ...textInput, cursor: 'pointer', appearance: 'auto' }}
          >
            {list.map((m) => (
              <option key={m.mode_id} value={m.mode_id}>
                {m.label}{m.overridden ? '  • upravený' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Editor */}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: 260, maxHeight: 420,
            resize: 'vertical', padding: '12px 14px',
            background: 'var(--bg)', border: '1px solid var(--atm-glass-border)', borderRadius: 8,
            color: 'var(--t1)', fontFamily: 'var(--font-jetbrains)', fontSize: 11.5, lineHeight: 1.65,
            outline: 'none', whiteSpace: 'pre-wrap',
          }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={savePrompt}
            disabled={busy || !dirty || !draft.trim()}
            style={{
              padding: '8px 18px', borderRadius: 8, border: `1px solid ${accent}`,
              background: (busy || !dirty) ? 'transparent' : accent,
              color: (busy || !dirty) ? 'var(--t3)' : '#fff',
              fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: (busy || !dirty) ? 'default' : 'pointer', transition: 'all 0.15s',
            }}
          >
            {busy ? 'Ukladám…' : saved ? '✓ Uložené' : 'Uložiť'}
          </button>
          <button
            onClick={revertPrompt}
            disabled={busy || !detail?.overridden}
            style={{
              padding: '8px 14px', borderRadius: 8,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
              background: 'transparent', color: detail?.overridden ? 'var(--t2)' : 'var(--t3)',
              fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: (busy || !detail?.overridden) ? 'default' : 'pointer', opacity: detail?.overridden ? 1 : 0.5,
              transition: 'all 0.15s',
            }}
          >
            ↺ Obnoviť pôvodný
          </button>
          {dirty && (
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.04em' }}>
              neuložené zmeny
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
