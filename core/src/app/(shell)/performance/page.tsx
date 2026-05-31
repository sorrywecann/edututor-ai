'use client';

import { useState, useEffect } from 'react';

import { API_BASE } from '@/lib/config';
import { PageHeader, MetricCard, EmptyState, GlassCard, MicroLabel, StatusPill } from '@/components/atmosphere';
import { Zap } from 'lucide-react';

interface TurnMetric {
  timestamp: number;
  provider: string;
  total_ms: number;
  rag_ms: number;
  llm_ms: number;
  emotion_ms: number;
  viseme_ms: number;
  response_len: number;
}

interface PerfSummary {
  count: number;
  total_p50: number;
  total_p95: number;
  rag_avg: number;
  llm_avg: number;
  llm_p95: number;
}

interface PerfData {
  turns: TurnMetric[];
  summary: PerfSummary | null;
}

const MODULE_COLORS: Record<string, string> = {
  rag: '#22c55e',
  llm: '#6366f1',
  emotion: '#f59e0b',
  viseme: '#06b6d4',
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function PerformancePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function load() {
      fetch(`${API_BASE}/api/v1/performance?last=50`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setData(d); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  const turns = data?.turns ?? [];
  const summary = data?.summary;
  const maxMs = Math.max(1, ...turns.map(t => t.total_ms));

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, padding: '28px 32px 40px', maxWidth: 900, width: '100%' }}>
      <PageHeader
        eyebrow="Výkonnosť · pipeline latency"
        title="Výkonnosť pipeline"
        description={`Latencia na modul · posledných ${turns.length} odpovedí · auto-refresh 3 s`}
      />

      {loading && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Načítavam metriky…
        </div>
      )}

      {!loading && turns.length === 0 && (
        <GlassCard pad="md" maxWidth={680}>
          <EmptyState
            icon={<Zap size={22} strokeWidth={1.7} />}
            title="Zatiaľ žiadne dáta"
            description="Začni konverzáciu a výkonnostné metriky sa automaticky zobrazia."
          />
        </GlassCard>
      )}

      {!loading && summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <MetricCard label="p50 Latencia" value={formatMs(summary.total_p50)} description="medián celkového času" />
            <MetricCard label="p95 Latencia" value={formatMs(summary.total_p95)} description="95. percentil" />
            <MetricCard label="LLM priemer" value={formatMs(summary.llm_avg)} description="jazykový model" />
            <MetricCard label="RAG priemer" value={formatMs(summary.rag_avg)} description="vyhľadávanie kontextu" />
          </div>

          <div className="atm-glass" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <MicroLabel style={{ marginBottom: 0 }}>Per-turn breakdown</MicroLabel>
              <div style={{ display: 'flex', gap: 12 }}>
                {Object.entries(MODULE_COLORS).map(([name, color]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: color, display: 'inline-block' }} />
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
              {[...turns].reverse().map((t, i) => {
                const segments = [
                  { key: 'rag', ms: t.rag_ms },
                  { key: 'llm', ms: t.llm_ms },
                  { key: 'emotion', ms: t.emotion_ms },
                  { key: 'viseme', ms: t.viseme_ms },
                ];
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--t3)', minWidth: 52, textAlign: 'right', letterSpacing: '0.02em' }}>
                      {formatTime(t.timestamp)}
                    </div>
                    <div style={{
                      flex: 1, display: 'flex', height: 18, borderRadius: 4,
                      overflow: 'hidden', background: 'var(--bg)',
                    }}>
                      {segments.filter(s => s.ms > 0).map(s => (
                        <div
                          key={s.key}
                          title={`${s.key}: ${s.ms}ms`}
                          style={{
                            width: `${Math.max(1, (s.ms / maxMs) * 100)}%`,
                            background: MODULE_COLORS[s.key],
                            minWidth: s.ms > 0 ? 2 : 0,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t2)', minWidth: 48, textAlign: 'right' }}>
                      {formatMs(t.total_ms)}
                    </div>
                    <span style={{
                      padding: '1px 6px', borderRadius: 3,
                      fontFamily: 'var(--font-jetbrains)', fontSize: 7.5, letterSpacing: '0.08em', textTransform: 'uppercase',
                      background: t.provider === 'ollama' ? '#22c55e22' : t.provider.startsWith('custom') ? 'rgba(99,102,241,0.15)' : '#6366f122',
                      color: t.provider === 'ollama' ? '#22c55e' : '#6366f1',
                      flexShrink: 0,
                    }}>
                      {t.provider === 'ollama' ? 'LOCAL' : t.provider.startsWith('custom') ? 'CUSTOM' : 'CLOUD'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="atm-glass" style={{ padding: '16px 18px' }}>
            <MicroLabel>Priemer per modul</MicroLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                if (!turns.length) return null;
                const avg = (key: keyof TurnMetric) => Math.round(turns.reduce((s, t) => s + (t[key] as number), 0) / turns.length);
                const modules = [
                  { name: 'RAG', ms: avg('rag_ms'), color: MODULE_COLORS.rag },
                  { name: 'LLM', ms: avg('llm_ms'), color: MODULE_COLORS.llm },
                  { name: 'Emotion', ms: avg('emotion_ms'), color: MODULE_COLORS.emotion },
                  { name: 'Viseme', ms: avg('viseme_ms'), color: MODULE_COLORS.viseme },
                ];
                const maxAvg = Math.max(1, ...modules.map(m => m.ms));
                return modules.map(m => (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t2)', minWidth: 56, letterSpacing: '0.06em' }}>
                      {m.name}
                    </div>
                    <div style={{ flex: 1, height: 12, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(1, (m.ms / maxAvg) * 100)}%`,
                        height: '100%',
                        background: m.color,
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t2)', minWidth: 48, textAlign: 'right' }}>
                      {formatMs(m.ms)}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--t3)', letterSpacing: '0.04em', textAlign: 'center' }}>
            {summary.count} turnov · aktualizuje sa automaticky
          </div>
        </>
      )}
    </div>
  );
}
