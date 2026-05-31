'use client';

/**
 * Prompt Eval — Layer 2 of the audit harness.
 *
 * Runs the same scenario against multiple personality configs side-by-side
 * via POST /api/v1/chat/eval (inline override_prefs, no saved-state mutation).
 * Lets you score each response against the prompt rules and identify which
 * personality configs the LLM honours vs ignores.
 */

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { PageHeader, Select, Button } from '@/components/atmosphere';

interface PromptBlock { label: string; body: string; bytes: number; }
interface EvalResponse {
  response: string;
  provider: string;
  latency_ms: number;
  assembled_prompt: string;
  blocks: PromptBlock[];
}

interface Config {
  name: string;
  prefs: Record<string, unknown>;
}

function buildConfigs(userName: string, assistantName: string): Config[] {
  return [
    {
      name: `Default · ${assistantName} · vyvážene`,
      prefs: { user_name: userName, assistant_name: assistantName, formality: 1, humor: 1, directness: 1, verbosity: 1 },
    },
    {
      name: 'Formálne + stručne (max strict)',
      prefs: { user_name: userName, assistant_name: assistantName, formality: 2, humor: 0, directness: 0, verbosity: 0 },
    },
    {
      name: 'Neformálne + hravo + bez okolkov + detailne',
      prefs: { user_name: userName, assistant_name: assistantName, formality: 0, humor: 2, directness: 2, verbosity: 2 },
    },
  ];
}

const SCENARIOS: Array<{ name: string; message: string; tests: string }> = [
  { name: 'Pozdrav (greeting)', message: 'Ahoj', tests: 'one sentence · learning-focused opener · addresses by name · introduces self' },
  { name: 'Krátka faktická', message: 'Čo je fotosyntéza?', tests: 'short answer (1–2 sentences) · no markdown · no filler' },
  { name: 'Stredná, mechanizmus', message: 'Prečo je nebo modré?', tests: 'medium length (2–4 sentences) · mechanism first · maybe one follow-up question' },
  { name: 'Hlboká, filozofická', message: 'Je vedomie len výpočet, alebo niečo viac?', tests: 'thinks aloud · explores edges · own view if relevant · no false consensus' },
  { name: 'Neviem', message: 'Neviem.', tests: 'no defensive · offers a smaller step · suggests where to start' },
  { name: 'Frustrácia', message: 'Som frustrovaný, nechápem to.', tests: 'names the feeling · acknowledges · proposes a smaller win · no "neboj sa"' },
  { name: 'Markdown bait', message: 'Vysvetli to v bodoch s **tučným** písmom prosím.', tests: 'follows formatting guardrail · uses prose · never starts lines with - or *' },
  { name: 'Czech leak bait', message: 'Děkuji, můžeš mi říct co je „není"?', tests: 'pure Slovak in reply · no ě/ř/ů · no české slová (děkuji → ďakujem)' },
  { name: 'Sokratovský test', message: 'Vysvetli mi rýchlu Fourierovu transformáciu.', tests: 'asks what student already knows OR what they need it for · smallest next step · no lecture dump' },
  { name: 'Praise filler bait', message: 'Mám 7 + 5 = 12?', tests: 'specific praise NOT „super!" · references what was correct · maybe extends to harder example' },
];

type Verdict = 'pass' | 'partial' | 'fail' | 'unscored';

const VERDICT_STYLE: Record<Verdict, { bg: string; ring: string; text: string; label: string }> = {
  pass:    { bg: 'rgba(61,214,140,0.12)',  ring: '#3DD68C', text: '#3DD68C', label: 'PASS' },
  partial: { bg: 'rgba(245,158,11,0.12)',  ring: '#f59e0b', text: '#f59e0b', label: 'PARTIAL' },
  fail:    { bg: 'rgba(239,68,68,0.12)',   ring: '#ef4444', text: '#ef4444', label: 'FAIL' },
  unscored:{ bg: 'transparent',             ring: 'var(--border)', text: 'var(--t3)', label: '—' },
};

interface CellResult {
  data?: EvalResponse;
  loading: boolean;
  error?: string;
  verdict: Verdict;
  notes: string;
}

const EMPTY_CELL: CellResult = { loading: false, verdict: 'unscored', notes: '' };

export default function PromptEvalPage() {
  const [userName, setUserName] = useState('Študent');
  const [assistantName, setAssistantName] = useState('Lukáš');

  // Pull the user's actual onboarding choices so all configs show YOUR name.
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/user/preferences`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (p?.user_name) setUserName(p.user_name);
        if (p?.assistant_name) setAssistantName(p.assistant_name);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const configs = useMemo(() => buildConfigs(userName, assistantName), [userName, assistantName]);
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [customMessage, setCustomMessage] = useState('');
  const [mode, setMode] = useState('deeptutor');
  const [maxTokens, setMaxTokens] = useState(140);
  // 2D map: scenarioIdx → configIdx → result
  const [results, setResults] = useState<Record<string, CellResult>>({});

  const scenario = SCENARIOS[scenarioIdx];
  const effectiveMessage = customMessage.trim() || scenario.message;
  const cellKey = (s: number, c: number) => `${s}:${c}`;

  function getCell(s: number, c: number): CellResult {
    return results[cellKey(s, c)] ?? EMPTY_CELL;
  }

  function setCell(s: number, c: number, patch: Partial<CellResult>) {
    setResults(prev => ({
      ...prev,
      [cellKey(s, c)]: { ...EMPTY_CELL, ...prev[cellKey(s, c)], ...patch },
    }));
  }

  async function runOne(s: number, c: number) {
    const message = customMessage.trim() || SCENARIOS[s].message;
    setCell(s, c, { loading: true, error: undefined });
    try {
      const r = await fetch(`${API_BASE}/api/v1/chat/eval`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          message,
          mode,
          override_prefs: configs[c].prefs,
          max_tokens: maxTokens,
        }),
      });
      if (!r.ok) {
        setCell(s, c, { loading: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 180)}` });
        return;
      }
      const data = (await r.json()) as EvalResponse;
      setCell(s, c, { loading: false, data, error: undefined });
    } catch (e) {
      setCell(s, c, { loading: false, error: (e as Error).message });
    }
  }

  async function runAllConfigs() {
    await Promise.all(configs.map((_, c) => runOne(scenarioIdx, c)));
  }

  const verdictSummary = useMemo(() => {
    const counts = { pass: 0, partial: 0, fail: 0, unscored: 0 };
    for (const r of Object.values(results)) counts[r.verdict] += 1;
    return counts;
  }, [results]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', padding: '24px 28px 56px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        eyebrow="Layer 2 · scenario harness"
        title="Prompt Eval"
        description={(
          <>
            Run the same scenario through {configs.length} personality configs side-by-side, then score each
            response against the prompt rules. <code style={{ fontSize: 10 }}>POST /api/v1/chat/eval</code> uses
            inline override_prefs — your saved preferences are NOT mutated.
          </>
        )}
      />

      {/* Scenario picker */}
      <section style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 380px' }}>
          <Select
            label="Scenario"
            value={scenarioIdx}
            onChange={(v) => { setScenarioIdx(v); setCustomMessage(''); }}
            options={SCENARIOS.map((s, i) => ({ value: i, label: `${i + 1}. ${s.name}` }))}
          />
        </div>
        <div style={{ flex: '0 0 180px' }}>
          <Select
            label="Mode"
            value={mode}
            onChange={(v) => setMode(v as string)}
            options={[
              { value: 'deeptutor', label: 'deeptutor' },
              { value: 'sk', label: 'sk' },
              { value: 'tutor_practice', label: 'tutor_practice' },
            ]}
          />
        </div>
        <div style={{ flex: '0 0 110px' }}>
          <label className="atm-micro" style={{ display: 'block', marginBottom: 6 }}>Max tokens</label>
          <input type="number" min={20} max={600} value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value, 10) || 140)} style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label className="atm-micro" style={{ display: 'block', marginBottom: 6 }}>Custom message (overrides scenario)</label>
          <input placeholder={scenario.message} value={customMessage} onChange={e => setCustomMessage(e.target.value)} style={inputStyle} />
        </div>
      </section>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={runAllConfigs} variant="primary">
          Run scenario in all {configs.length} configs
        </Button>
        <span className="atm-micro">
          will test: {effectiveMessage}
        </span>
      </div>

      <div style={{
        padding: '10px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 12, color: 'var(--t2)', lineHeight: 1.55,
      }}>
        <span className="atm-micro" style={{ marginRight: 8 }}>Rubric for this scenario:</span>
        {scenario.tests}
      </div>

      {/* Results grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${configs.length}, minmax(0, 1fr))`,
        gap: 14,
      }}>
        {configs.map((cfg, c) => {
          const cell = getCell(scenarioIdx, c);
          const v = VERDICT_STYLE[cell.verdict];
          return (
            <div key={c} style={{
              border: `1px solid ${v.ring}55`,
              borderRadius: 10,
              background: 'var(--surface)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: v.bg, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="atm-micro" style={{ color: v.text, fontWeight: 700 }}>{cfg.name}</span>
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
                  fmt:{String(cfg.prefs.formality)} hum:{String(cfg.prefs.humor)} dir:{String(cfg.prefs.directness)} ver:{String(cfg.prefs.verbosity)}
                </span>
              </header>

              <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 240 }}>
                {cell.loading && (
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t3)' }}>
                    generating…
                  </div>
                )}
                {cell.error && (
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: '#ef4444' }}>
                    ✗ {cell.error}
                  </div>
                )}
                {cell.data && (
                  <>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em' }}>
                      {cell.data.provider} · {cell.data.latency_ms}ms · {cell.data.response.length} chars
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', flex: 1 }}>
                      {cell.data.response}
                    </div>
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        view prompt
                      </summary>
                      <pre style={{ marginTop: 6, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' }}>
                        {cell.data.assembled_prompt}
                      </pre>
                    </details>
                  </>
                )}
              </div>

              {/* Verdict controls */}
              <footer style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['pass', 'partial', 'fail', 'unscored'] as const).map(v => {
                    const s = VERDICT_STYLE[v];
                    const active = cell.verdict === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setCell(scenarioIdx, c, { verdict: v })}
                        style={{
                          flex: 1, padding: '4px 0', borderRadius: 4,
                          background: active ? s.bg : 'transparent',
                          border: `1px solid ${active ? s.ring : 'var(--border)'}`,
                          color: active ? s.text : 'var(--t3)',
                          fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.1em',
                          cursor: 'pointer',
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  placeholder="notes on what passed/failed…"
                  value={cell.notes}
                  onChange={e => setCell(scenarioIdx, c, { notes: e.target.value })}
                  style={{ ...inputStyle, fontSize: 10, padding: '5px 8px' }}
                />
                <button
                  onClick={() => runOne(scenarioIdx, c)}
                  style={{
                    padding: '5px 8px', background: 'var(--raised)',
                    border: '1px solid var(--border-mid)', borderRadius: 4,
                    color: 'var(--t2)', fontFamily: 'var(--font-jetbrains)',
                    fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {cell.data ? 'Re-run' : 'Run only this'}
                </button>
              </footer>
            </div>
          );
        })}
      </div>

      {/* Running tally */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="atm-micro">Verdict tally across all runs:</span>
        {(['pass', 'partial', 'fail', 'unscored'] as const).map(v => {
          const s = VERDICT_STYLE[v];
          const n = verdictSummary[v];
          return (
            <span key={v} style={{
              padding: '3px 8px', borderRadius: 4, background: s.bg, border: `1px solid ${s.ring}55`,
              fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: s.text, letterSpacing: '0.08em',
            }}>
              {s.label}: {n}
            </span>
          );
        })}
      </div>
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
  cursor: 'pointer',
};
