'use client';

/**
 * Prompt Inspector — Layer 1 of the audit harness.
 *
 * Calls POST /api/v1/chat/preview-prompt (no LLM cost) and renders the
 * fully-assembled system prompt with each prepended block colour-coded.
 * Confirms at a glance whether OSOBNOSŤ / memory / mode are all reaching
 * the model in the order and shape we expect.
 */

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { PageHeader, Select, Button } from '@/components/atmosphere';

interface PromptBlock {
  label: string;
  body: string;
  bytes: number;
}

interface PreviewResponse {
  mode_id: string;
  mode_label: string;
  tutor_name: string;
  blocks: PromptBlock[];
  assembled: string;
  total_chars: number;
}

const MODES = [
  { id: 'deeptutor', label: 'Hĺbkový učiteľ' },
  { id: 'sk', label: 'Po slovensky' },
  { id: 'tutor_practice', label: 'Slovenský tréner (kartičky)' },
  { id: 'tutor_practice_pro', label: 'Slovenský tréner Pro' },
  { id: 'en', label: 'In English' },
  { id: 'assistant', label: 'Research assistant' },
  { id: 'assistant_pro', label: 'Assistant Pro' },
  { id: 'learn-en-from-sk', label: 'Učím sa angličtinu' },
];

// Same colour token per block label as the design tokens use elsewhere
const BLOCK_COLOR: Record<string, string> = {
  osobnosť: '#d96b53',        // coral, matches step-dots-active
  'memory profile': '#06b6d4', // cyan
  'mode prompt': '#D4845A',    // accent blue
  default: '#94a3b8',
};

function blockColor(label: string): string {
  // Labels are now numbered (e.g. "1. mode prompt (deeptutor)") so match
  // on the substring rather than prefix.
  if (label.includes('osobnosť')) return BLOCK_COLOR.osobnosť;
  if (label.includes('memory')) return BLOCK_COLOR['memory profile'];
  if (label.includes('mode prompt')) return BLOCK_COLOR['mode prompt'];
  return BLOCK_COLOR.default;
}

// Built dynamically from the user's actual saved prefs so the inspector
// shows YOUR name + chosen assistant name in every preset variant.
function buildPresets(userName: string, assistantName: string) {
  return [
    { name: 'Use my saved prefs (read /user/preferences)', prefs: null as Record<string, unknown> | null },
    { name: 'Defaults only (no personality)', prefs: {} },
    {
      name: `${userName} + ${assistantName} · formálne · suchý · jemne · stručne`,
      prefs: { user_name: userName, assistant_name: assistantName, formality: 2, humor: 0, directness: 0, verbosity: 0 },
    },
    {
      name: `${userName} + ${assistantName} · neformálne · hravý · bez okolkov · detailne`,
      prefs: { user_name: userName, assistant_name: assistantName, formality: 0, humor: 2, directness: 2, verbosity: 2 },
    },
  ];
}

export default function PromptInspectorPage() {
  const [message, setMessage] = useState('Ahoj, predstav sa mi.');
  const [modeId, setModeId] = useState('deeptutor');
  const [presetIdx, setPresetIdx] = useState(0);
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('Študent');
  const [assistantName, setAssistantName] = useState('Lukáš');

  // Pull the user's actual onboarding choices so presets show YOUR name
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/user/preferences`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (p?.user_name) setUserName(p.user_name);
        if (p?.assistant_name) setAssistantName(p.assistant_name);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const presets = useMemo(() => buildPresets(userName, assistantName), [userName, assistantName]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { message, mode: modeId };
      const override = presets[presetIdx].prefs;
      if (override !== null) body.override_prefs = override;
      const r = await fetch(`${API_BASE}/api/v1/chat/preview-prompt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setError(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        return;
      }
      setData(await r.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', padding: '24px 32px 40px', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        eyebrow="Layer 1 · prompt observability"
        title="Prompt Inspector"
        description="Shows the fully-assembled system prompt the LLM would receive. No tokens spent, no LLM call. Use this to verify the personality block + memory profile + mode prompt are all reaching the model in the right order and shape."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
        <Select
          label="Mode"
          value={modeId}
          onChange={(v) => setModeId(v as string)}
          options={MODES.map(m => ({ value: m.id, label: `${m.label} (${m.id})` }))}
        />
        <Select
          label="Personality preset"
          value={presetIdx}
          onChange={(v) => setPresetIdx(v as number)}
          options={presets.map((p, i) => ({ value: i, label: p.name }))}
        />
        <div>
          <label className="atm-micro" style={{ display: 'block', marginBottom: 6 }}>Message (reserved for future per-message blocks)</label>
          <input value={message} onChange={e => setMessage(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <Button onClick={run} disabled={loading} variant="primary" style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Načítavam…' : 'Preview prompt'}
      </Button>

      {error && (
        <div style={{ padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444455', borderRadius: 8, color: '#ef4444', fontFamily: 'var(--font-jetbrains)', fontSize: 11 }}>
          ✗ {error}
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="atm-micro">{data.mode_label} · tutor {data.tutor_name}</span>
            <span className="atm-micro" style={{ color: 'var(--t2)' }}>
              {data.total_chars.toLocaleString()} chars · {data.blocks.length} block(s)
            </span>
          </div>

          {/* Blocks list — colour-coded */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.blocks.map((b, i) => {
              const c = blockColor(b.label);
              return (
                <section key={i} style={{ border: `1px solid ${c}55`, borderRadius: 8, overflow: 'hidden' }}>
                  <header style={{ padding: '8px 12px', background: `${c}15`, borderBottom: `1px solid ${c}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="atm-micro" style={{ color: c, fontWeight: 700 }}>{b.label}</span>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
                      {b.bytes} bytes · {b.body.split('\n').length} lines
                    </span>
                  </header>
                  <pre style={{ margin: 0, padding: '12px 14px', background: 'var(--bg)', fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'var(--t1)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto' }}>
                    {b.body}
                  </pre>
                </section>
              );
            })}
          </div>

          {/* Raw assembled — what the LLM literally sees */}
          <details style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <summary style={{ padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t2)' }}>
              Raw assembled prompt — what the LLM receives byte-for-byte
            </summary>
            <pre style={{ margin: 0, padding: '14px 16px', background: 'var(--bg)', fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 480, overflow: 'auto' }}>
              {data.assembled}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: 'var(--bg)',
  border: '1px solid var(--border-mid)', borderRadius: 8,
  color: 'var(--t1)', fontSize: 12, fontFamily: 'var(--font-inter)', outline: 'none',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: 'var(--bg)',
  border: '1px solid var(--border-mid)', borderRadius: 8,
  color: 'var(--t1)', fontSize: 12, fontFamily: 'var(--font-inter)', outline: 'none', boxSizing: 'border-box',
};

const primaryButton: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--accent)',
  border: '1px solid var(--accent)', borderRadius: 8,
  color: '#fff', fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', alignSelf: 'flex-start',
};
