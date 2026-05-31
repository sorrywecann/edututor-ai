'use client';

// MasterPromptSection — "Mozog" tutora: per-mode system prompt editor.
// Hits GET /api/v1/prompts (list), GET/PUT/DELETE /api/v1/prompts/{mode_id}.
//
// v0.8.4 polish: gives the editor MASSIVELY more vertical room (50vh min,
// vertical resize), 14px monospace, generous internal padding, char/line
// counter below, sticky action row with an amber hairline above, and the
// mode picker promoted to a horizontal scroll row of pill buttons so the
// textarea owns all the remaining vertical space. Lives inside <TabShell>.

import { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '@/lib/config';

// Toolbar ghost-button used above the textarea. Quiet, neutral, no amber
// until hover so the textarea remains the visual anchor of the section.
function ToolbarBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px', borderRadius: 8,
        border: '1px solid var(--ch-line, rgba(244,237,228,0.08))',
        background: 'transparent',
        color: disabled ? 'var(--ch-ink-faint, #5a5048)' : 'var(--ch-ink-dim, #9a8f82)',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.color = 'var(--ch-ink, #f4ede4)';
          e.currentTarget.style.borderColor = 'var(--ch-line-strong, rgba(244,237,228,0.16))';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.color = 'var(--ch-ink-dim, #9a8f82)';
          e.currentTarget.style.borderColor = 'var(--ch-line, rgba(244,237,228,0.08))';
        }
      }}
    >
      {children}
    </button>
  );
}

interface PromptListItem { mode_id: string; label: string; overridden: boolean; }
interface PromptDetail {
  mode_id: string; label: string; default: string;
  override: string | null; effective: string; overridden: boolean;
}

export function MasterPromptSection() {
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
      .then((d: PromptDetail | null) => {
        if (d && !cancelled) { setDetail(d); setDraft(d.effective); }
      })
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
  const accent = 'var(--ch-amber, #E8A87C)';
  const amberFaint = 'rgba(232,168,124,0.18)';

  // Counts shown below the textarea — Slovak grammar: 1 znak / 2-4 znaky / 5+ znakov.
  const { chars, lines } = useMemo(() => ({
    chars: draft.length,
    lines: draft.length ? draft.split('\n').length : 0,
  }), [draft]);
  const znaky = chars === 1 ? 'znak' : (chars >= 2 && chars <= 4) ? 'znaky' : 'znakov';
  const riadky = lines === 1 ? 'riadok' : (lines >= 2 && lines <= 4) ? 'riadky' : 'riadkov';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header strip — short blurb + "Upravený" badge. The big title lives
          in TabShell now, so this is intentionally compact.
          v0.8.5: "Upravený" badge softened — muted ink-dim until the user has
          actually edited (dirty), then bright amber. Stops the eye-yelling. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div style={{
          fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
          fontSize: 13, color: 'var(--ch-ink-dim, #9a8f82)', lineHeight: 1.55, maxWidth: 640,
        }}>
          „Mozog“ tutora pre vybraný režim. Originál je predvyplnený — môžeš ho upraviť alebo
          kedykoľvek obnoviť tlačidlom <span style={{ color: 'var(--ch-ink, #f4ede4)' }}>↺ Obnoviť pôvodný</span>.
        </div>
        {detail?.overridden && (
          <span style={{
            flexShrink: 0, padding: '3px 9px', borderRadius: 5,
            background: dirty ? 'rgba(232,168,124,0.12)' : 'rgba(244,237,228,0.04)',
            border: `1px solid ${dirty ? amberFaint : 'var(--ch-line, rgba(244,237,228,0.08))'}`,
            color: dirty ? accent : 'var(--ch-ink-dim, #9a8f82)',
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
            transition: 'color 0.2s, background 0.2s, border-color 0.2s',
          }}>Upravený</span>
        )}
      </div>

      {/* Mode picker — horizontal scrolling pill row with a soft right-fade
          gradient so users see there's more to scroll. v0.8.5: bumped padding
          (14→18px), whiteSpace:nowrap explicit, fade overlay added. */}
      {list.length > 0 && (
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto',
            padding: '2px 22px 6px 0',
            scrollbarWidth: 'thin',
          }}>
            {list.map((m) => {
              const active = m.mode_id === modeId;
              return (
                <button
                  key={m.mode_id}
                  onClick={() => setModeId(m.mode_id)}
                  style={{
                    flexShrink: 0,
                    padding: '8px 18px', borderRadius: 999,
                    border: `1px solid ${active ? accent : 'var(--ch-line-strong, rgba(244,237,228,0.12))'}`,
                    background: active ? 'rgba(232,168,124,0.10)' : 'transparent',
                    color: active ? accent : 'var(--ch-ink-dim, #9a8f82)',
                    fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                    fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase',
                    fontWeight: active ? 600 : 400,
                    cursor: active ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--ch-ink, #f4ede4)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--ch-ink-dim, #9a8f82)'; }}
                >
                  {m.label}
                  {m.overridden && (
                    <span style={{
                      marginLeft: 8, display: 'inline-block',
                      width: 5, height: 5, borderRadius: '50%',
                      background: accent, verticalAlign: 'middle',
                    }} />
                  )}
                </button>
              );
            })}
          </div>
          {/* Soft right-edge fade — pure visual hint that the row scrolls. */}
          <div aria-hidden style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 28,
            pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(0,0,0,0), rgba(12,8,5,0.92))',
          }} />
        </div>
      )}

      {/* Editor toolbar — minimal two-action ghost row above the textarea.
          Only "Vymazať všetko" + "Skopírovať" — no kitchen sink. */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 8,
      }}>
        <ToolbarBtn onClick={() => setDraft('')} disabled={!draft}>
          Vymazať všetko
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => {
            try { navigator.clipboard?.writeText(draft); } catch { /* ignore */ }
          }}
          disabled={!draft}
        >
          Skopírovať
        </ToolbarBtn>
      </div>

      {/* The editor itself — huge editable surface, monospace, generous padding.
          v0.8.5: line-height 1.65 → 1.7, font-size 14 → 14.5, inner top shadow
          so text doesn't feel glued to the border. */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        borderRadius: 12,
        border: '1px solid var(--ch-line, rgba(244,237,228,0.08))',
        background: 'rgba(0,0,0,0.18)',
        boxShadow: 'inset 0 6px 14px -10px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box',
            minHeight: '50vh',
            resize: 'vertical',
            padding: '22px 22px 20px',
            background: 'transparent',
            border: 'none',
            color: 'var(--ch-ink, #f4ede4)',
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 14.5, lineHeight: 1.7,
            outline: 'none', whiteSpace: 'pre-wrap',
          }}
        />

        {/* Counter row — mono, faint. v0.8.5: left-aligned counter (flows with
            reading direction), unsaved badge on the right. */}
        <div style={{
          padding: '8px 22px 10px',
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 10, letterSpacing: '0.12em',
          color: 'var(--ch-ink-faint, #5a5048)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ textAlign: 'left' }}>{chars} {znaky} · {lines} {riadky}</span>
          {dirty && (
            <span style={{ color: 'var(--ch-ink-dim, #9a8f82)' }}>
              neuložené zmeny
            </span>
          )}
        </div>

        {/* Action row — sticks visually to the bottom of the editor with a
            thin amber hairline above. */}
        <div style={{
          padding: '14px 22px',
          borderTop: `1px solid ${amberFaint}`,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(0,0,0,0.10)',
        }}>
          <button
            onClick={savePrompt}
            disabled={busy || !dirty || !draft.trim()}
            style={{
              padding: '9px 22px', borderRadius: 8,
              border: `1px solid ${accent}`,
              background: (busy || !dirty) ? 'transparent' : accent,
              color: (busy || !dirty) ? 'var(--ch-ink-dim, #9a8f82)' : '#1a120a',
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
              fontWeight: 600,
              cursor: (busy || !dirty) ? 'default' : 'pointer', transition: 'all 0.15s',
            }}
          >
            {busy ? 'Ukladám…' : saved ? '✓ Uložené' : 'Uložiť'}
          </button>
          <button
            onClick={revertPrompt}
            disabled={busy || !detail?.overridden}
            style={{
              padding: '9px 16px', borderRadius: 8,
              border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
              background: 'transparent',
              color: detail?.overridden ? 'var(--ch-ink, #f4ede4)' : 'var(--ch-ink-faint, #5a5048)',
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: (busy || !detail?.overridden) ? 'default' : 'pointer',
              opacity: detail?.overridden ? 1 : 0.55,
              transition: 'all 0.15s',
            }}
          >
            ↺ Obnoviť pôvodný
          </button>
        </div>
      </div>
    </div>
  );
}
