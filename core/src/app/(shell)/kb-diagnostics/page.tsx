'use client';

import { useState, useEffect } from 'react';

import { API_BASE } from '@/lib/config';
import { PageHeader } from '@/components/atmosphere';

interface KnowledgeBase {
  name: string;
  document_count: number;
  total_chunks: number;
}

interface QuestionResult {
  id: string;
  question: string;
  hit: boolean;
  matched_keywords: string[];
  expected_keywords: string[];
  rag_score: number;
  rag_chunks: number;
  latency_ms: number;
}

interface BenchmarkResult {
  knowledge_base: string;
  total_questions: number;
  hits: number;
  misses: number;
  hit_rate: number;
  avg_latency_ms: number;
  avg_score: number;
  mode: string;
  results: QuestionResult[];
}

export default function KBDiagnosticsPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState('');
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.4);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/knowledge-bases`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : data.knowledge_bases ?? [];
        setKbs(list);
        if (list.length > 0) setSelectedKb(list[0].name);
      })
      .catch(() => {});
  }, []);

  async function runBenchmark() {
    if (!selectedKb) return;
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/diagnostics/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge_base: selectedKb, top_k: topK, similarity_threshold: threshold, mode: 'auto' }),
      });
      if (!res.ok) {
        setError(`Benchmark zlyhal: ${res.status}`);
        return;
      }
      setResult(await res.json());
    } catch {
      setError('Backend nedostupný.');
    } finally {
      setRunning(false);
    }
  }

  const hitColor = '#22c55e';
  const missColor = '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '32px 40px 56px', maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <PageHeader
        eyebrow={`Diagnostika · ${result?.mode === 'golden' ? 'Golden Dataset' : 'Reálne otázky'}`}
        title="KB Diagnostika"
        description="Spusti RAG benchmark proti zlatej sade alebo proti reálnym otázkam z konverzácií. Vidíš presné chunks, similarity skóre a kde retrieval zlyhalo."
      />

      <div style={{
        padding: 16, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
              Databáza znalostí
            </div>
            <select
              value={selectedKb}
              onChange={e => setSelectedKb(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border-mid)',
                borderRadius: 8, fontSize: 11.5, color: 'var(--t1)', outline: 'none',
              }}
            >
              {kbs.length === 0 && <option value="">Žiadne KB</option>}
              {kbs.map(kb => (
                <option key={kb.name} value={kb.name}>{kb.name} ({kb.document_count} dok, {kb.total_chunks} chunkov)</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 80 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
              Top-K
            </div>
            <input
              type="number" min={1} max={20} value={topK}
              onChange={e => setTopK(Number(e.target.value))}
              style={{
                width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border-mid)',
                borderRadius: 8, fontSize: 11.5, color: 'var(--t1)', outline: 'none', fontFamily: 'var(--font-jetbrains)',
              }}
            />
          </div>

          <div style={{ minWidth: 80 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
              Threshold
            </div>
            <input
              type="number" min={0} max={1} step={0.05} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              style={{
                width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border-mid)',
                borderRadius: 8, fontSize: 11.5, color: 'var(--t1)', outline: 'none', fontFamily: 'var(--font-jetbrains)',
              }}
            />
          </div>

          <button
            onClick={runBenchmark}
            disabled={running || !selectedKb}
            style={{
              padding: '9px 18px', background: running ? 'transparent' : 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: 8,
              fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: running ? 'var(--accent)' : '#fff', cursor: running ? 'default' : 'pointer',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}
          >
            {running && <span style={{ width: 9, height: 9, border: '1.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
            {running ? 'Testujem…' : 'Spustiť benchmark'}
          </button>
        </div>

        {error && (
          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: missColor }}>{error}</div>
        )}
      </div>

      {result && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { label: 'Hit Rate', value: `${Math.round(result.hit_rate * 100)}%`, color: result.hit_rate >= 0.85 ? hitColor : result.hit_rate >= 0.7 ? '#f59e0b' : missColor },
              { label: 'Zásahy', value: `${result.hits}/${result.total_questions}`, color: hitColor },
              { label: 'Priem. skóre', value: `${(result.avg_score * 100).toFixed(0)}%`, color: 'var(--accent)' },
              { label: 'RAG latencia', value: `${result.avg_latency_ms}ms`, color: 'var(--t3)' },
            ].map(c => (
              <div key={c.label} style={{
                padding: '14px 14px 12px', background: 'var(--raised)', border: '1px solid var(--border)',
                borderRadius: 10, borderLeft: `3px solid ${c.color}`,
              }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 8 }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-jetbrains)', letterSpacing: '-0.03em' }}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 12 }}>
              Výsledky podľa otázok
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 450, overflowY: 'auto' }}>
              {result.results.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: r.hit ? `${hitColor}08` : `${missColor}08`,
                  border: `1px solid ${r.hit ? `${hitColor}30` : `${missColor}30`}`,
                  borderRadius: 8,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: r.hit ? hitColor : missColor,
                    boxShadow: `0 0 5px ${r.hit ? hitColor : missColor}44`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.question}
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--t3)', marginTop: 2, letterSpacing: '0.04em' }}>
                      {r.id} · {r.rag_chunks} chunkov · skóre {r.rag_score} · {r.latency_ms}ms
                      {r.matched_keywords.length > 0 && ` · kľúče: ${r.matched_keywords.join(', ')}`}
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4,
                    fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: r.hit ? `${hitColor}22` : `${missColor}22`,
                    color: r.hit ? hitColor : missColor,
                    flexShrink: 0,
                  }}>
                    {r.hit ? 'HIT' : 'MISS'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!result && !running && (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>
            Vyber databázu znalostí a spusti benchmark.
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.6 }}>
            Otestuje RAG pipeline reálnymi otázkami z tvojich konverzácií — ukáže, koľko odpovedí nájde v databáze znalostí.
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
