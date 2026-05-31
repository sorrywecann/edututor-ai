'use client';

/**
 * RAG Eval — does an attached knowledge base actually change the answer?
 *
 * Runs the same question twice via POST /api/v1/chat/rag-eval:
 *   - WITHOUT RAG: just mode prompt + personality
 *   - WITH RAG: above + retrieved chunks formatted as the production chat
 *     would inject them
 * Shows both responses side-by-side + the retrieved chunks below.
 *
 * Common failure modes this exposes:
 *   - RAG retrieved chunks but the LLM ignored them (same response both sides)
 *   - RAG dominated and flipped tutor tone to research-assistant
 *   - Chunks retrieved are off-topic (low similarity score, irrelevant)
 *   - Empty retrieval (no chunks → no influence possible)
 */

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { PageHeader, Select, Button } from '@/components/atmosphere';

interface RagChunk {
  chunk_id: string;
  document_id: string;
  filename: string;
  page: number | null;
  chunk_index: number;
  content: string;
  score: number;
}

interface RagSideRun {
  label: string;
  response: string;
  latency_ms: number;
  prompt_chars: number;
}

interface RagEvalResponse {
  with_rag: RagSideRun;
  without_rag: RagSideRun;
  chunks_retrieved: number;
  chunks: RagChunk[];
  assembled_with_rag: string;
  assembled_without_rag: string;
  rag_blocks: Array<{ label: string; body: string; bytes: number }>;
}

interface KnowledgeBase {
  name: string;
  document_count?: number;
}

type Verdict = 'helped' | 'ignored' | 'dominated' | 'unscored';

const VERDICT_STYLE: Record<Verdict, { bg: string; ring: string; text: string; label: string; desc: string }> = {
  helped:    { bg: 'rgba(61,214,140,0.12)', ring: '#3DD68C', text: '#3DD68C', label: 'HELPED',     desc: 'RAG improved the answer' },
  ignored:   { bg: 'rgba(245,158,11,0.12)', ring: '#f59e0b', text: '#f59e0b', label: 'IGNORED',    desc: 'Same as without-RAG' },
  dominated: { bg: 'rgba(239,68,68,0.12)',  ring: '#ef4444', text: '#ef4444', label: 'DOMINATED',  desc: 'RAG flipped tone away from tutor' },
  unscored:  { bg: 'transparent',           ring: 'var(--border)', text: 'var(--t3)', label: '—', desc: '' },
};

export default function RagEvalPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [kb, setKb] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('deeptutor');
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.65);
  const [maxTokens, setMaxTokens] = useState(240);
  const [data, setData] = useState<RagEvalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict>('unscored');
  const [notes, setNotes] = useState('');

  // Load available knowledge bases on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/knowledge-bases`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((list: KnowledgeBase[]) => {
        setKbs(list);
        if (list.length > 0 && !kb) setKb(list[0].name);
      })
      .catch(() => { /* no kbs reachable */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (!message.trim() || !kb) return;
    setLoading(true);
    setError(null);
    setVerdict('unscored');
    setNotes('');
    try {
      const r = await fetch(`${API_BASE}/api/v1/chat/rag-eval`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          message,
          knowledge_base: kb,
          mode,
          top_k: topK,
          similarity_threshold: threshold,
          max_tokens: maxTokens,
        }),
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

  const sameResponse = useMemo(() => {
    if (!data) return false;
    return data.with_rag.response.trim() === data.without_rag.response.trim();
  }, [data]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', padding: '24px 28px 56px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        eyebrow="Audit · knowledge-base influence"
        title="RAG Eval"
        description={(
          <>
            Runs the same message twice — once with knowledge-base retrieval, once without —
            via <code style={{ fontSize: 10 }}>POST /api/v1/chat/rag-eval</code>. Reveals whether
            your attached documents actually change the answer or get ignored.
          </>
        )}
      />

      <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 0.8fr 0.8fr', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <label className="atm-micro" style={{ display: 'block', marginBottom: 6 }}>Message</label>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder="Ask something covered by your KB…"
            style={inputStyle}
          />
        </div>
        <Select
          label="Knowledge base"
          value={kb}
          onChange={(v) => setKb(v as string)}
          placeholder="(no KBs — upload via /knowledge)"
          options={kbs.map(k => ({ value: k.name, label: `${k.name}${k.document_count != null ? ` (${k.document_count} docs)` : ''}` }))}
        />
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
        <div>
          <label className="atm-micro" style={{ display: 'block', marginBottom: 6 }}>top_k</label>
          <input type="number" min={1} max={20} value={topK} onChange={e => setTopK(parseInt(e.target.value, 10) || 5)} style={inputStyle} />
        </div>
        <div>
          <label className="atm-micro" style={{ display: 'block', marginBottom: 6 }}>threshold</label>
          <input type="number" step={0.05} min={0} max={1} value={threshold} onChange={e => setThreshold(parseFloat(e.target.value) || 0.65)} style={inputStyle} />
        </div>
      </section>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button onClick={run} disabled={loading || !message.trim() || !kb} variant="primary">
          {loading ? 'Running both sides…' : 'Run side-by-side'}
        </Button>
        <label className="atm-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          max tokens
          <input type="number" min={20} max={600} value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value, 10) || 240)} style={{ ...inputStyle, width: 80, marginLeft: 6 }} />
        </label>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444455', borderRadius: 8, color: '#ef4444', fontFamily: 'var(--font-jetbrains)', fontSize: 11 }}>
          ✗ {error}
        </div>
      )}

      {data && (
        <>
          {/* Headline diagnostic */}
          <div style={{
            display: 'flex', gap: 12, padding: '10px 14px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span className="atm-micro">Retrieved <strong style={{ color: 'var(--t1)' }}>{data.chunks_retrieved}</strong> chunks</span>
            {data.chunks_retrieved === 0 && (
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: '#f59e0b' }}>
                ⚠ no chunks retrieved — RAG can&apos;t influence either way. Try lowering threshold or rephrasing.
              </span>
            )}
            {data.chunks_retrieved > 0 && sameResponse && (
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: '#ef4444' }}>
                ⚠ identical responses — RAG was retrieved but LLM ignored it.
              </span>
            )}
            {data.chunks_retrieved > 0 && !sameResponse && (
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: '#3DD68C' }}>
                ✓ responses differ — RAG influenced the answer. Score the influence below.
              </span>
            )}
          </div>

          {/* Side-by-side responses */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[data.without_rag, data.with_rag].map((side, i) => {
              const c = i === 0 ? '#94a3b8' : '#D4845A';
              return (
                <div key={i} style={{ border: `1px solid ${c}55`, borderRadius: 10, background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
                  <header style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: `${c}10` }}>
                    <span className="atm-micro" style={{ color: c, fontWeight: 700 }}>{side.label}</span>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', marginTop: 3 }}>
                      {side.latency_ms}ms · {side.response.length} chars · system prompt {side.prompt_chars.toLocaleString()} chars
                    </div>
                  </header>
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--t1)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {side.response}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Verdict */}
          <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="atm-micro">Verdict</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['helped', 'ignored', 'dominated', 'unscored'] as const).map(v => {
                const s = VERDICT_STYLE[v];
                const active = verdict === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVerdict(v)}
                    title={s.desc}
                    style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: active ? s.bg : 'transparent',
                      border: `1px solid ${active ? s.ring : 'var(--border)'}`,
                      color: active ? s.text : 'var(--t3)',
                      fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.1em',
                      cursor: 'pointer',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <input
              placeholder="notes — what worked / what failed…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ ...inputStyle, fontSize: 11 }}
            />
          </div>

          {/* Retrieved chunks */}
          {data.chunks.length > 0 && (
            <section>
              <div className="atm-micro" style={{ marginBottom: 8 }}>
                Retrieved chunks ({data.chunks.length}) — ranked by similarity
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.chunks.map((ch, i) => (
                  <details key={ch.chunk_id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <summary style={{ padding: '8px 12px', cursor: 'pointer', background: 'var(--raised)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily: 'var(--font-jetbrains)', fontSize: 9,
                        padding: '2px 6px', borderRadius: 3, color: 'var(--t2)',
                        background: ch.score >= 0.75 ? 'rgba(61,214,140,0.15)' : ch.score >= 0.6 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      }}>
                        #{i + 1}  score {ch.score.toFixed(3)}
                      </span>
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t1)' }}>
                        {ch.filename}{ch.page != null ? ` · s.${ch.page}` : ''}
                      </span>
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', marginLeft: 'auto' }}>
                        {ch.content.length} chars
                      </span>
                    </summary>
                    <pre style={{ margin: 0, padding: '10px 12px', background: 'var(--bg)', fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 280, overflow: 'auto' }}>
                      {ch.content}
                    </pre>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Assembled prompts */}
          <details style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <summary style={{ padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t2)' }}>
              Assembled prompts (with vs without)
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)' }}>
              {[
                { label: 'WITHOUT RAG', body: data.assembled_without_rag },
                { label: 'WITH RAG (+ rag context appended)', body: data.assembled_with_rag },
              ].map((d, i) => (
                <div key={i} style={{ background: 'var(--bg)' }}>
                  <header style={{ padding: '6px 10px', fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {d.label} · {d.body.length.toLocaleString()} chars
                  </header>
                  <pre style={{ margin: 0, padding: '10px 12px', fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto' }}>
                    {d.body}
                  </pre>
                </div>
              ))}
            </div>
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
  cursor: 'pointer',
};
