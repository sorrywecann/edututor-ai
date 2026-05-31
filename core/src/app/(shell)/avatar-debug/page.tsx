'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';

import { API_BASE } from '@/lib/config';
import { useReconnectingWebSocket } from '@/lib/use-reconnecting-websocket';
import { ConnectionStatePill } from '@/lib/connection-state-pill';
import { PageHeader } from '@/components/atmosphere';
const WS_BASE = (API_BASE || 'http://localhost:8000').replace(/^http/, 'ws');

const EMOTION_COLOR: Record<string, string> = {
  neutral: '#6b7280', joy: '#f59e0b', proud: '#CB8A82',
  encouraging_mild: '#10b981', sadness: '#D4845A', patient: '#06b6d4',
  curious: '#f97316', thinking_deep: '#6366f1', surprise: '#ec4899',
};

const AGENT_STATE_COLOR: Record<string, string> = {
  idle:      '#6b7280',
  thinking:  '#6366f1',
  searching: '#f59e0b',
  writing:   '#10b981',
  listening: '#D4845A',
};

// Real Slovak viseme palette — only 14 symbols are emitted by the backend
// (tutor-service/app/services/viseme_timeline.py · SLOVAK_CHAR_VISEME).
// Symbols are case-sensitive: 'E' and 'CH' are uppercase by convention.
const VISEME_COLOR: Record<string, string> = {
  sil: '#6b7280',  // silence
  // Vowels
  aa:  '#ef4444',  // a, á, ä — open central
  E:   '#22c55e',  // e, é — mid front
  ih:  '#a3e635',  // i, í, y, ý, j — close front (also j-glide)
  oh:  '#f59e0b',  // o, ó, ô — mid back rounded
  ou:  '#eab308',  // u, ú — close back rounded
  // Consonants
  PP:  '#06b6d4',  // p, b, m — bilabial closure
  FF:  '#D4845A',  // f, v, w — labiodental
  DD:  '#6366f1',  // t, d, ť, ď, th/dh — dental/alveolar stop
  nn:  '#a5b4fc',  // n, ň — nasal
  kk:  '#14b8a6',  // k, g, h, ch, x — velar
  RR:  '#f97316',  // r, l, ľ, ĺ, ŕ — liquids
  SS:  '#ec4899',  // s, z, c — sibilant
  CH:  '#db2777',  // š, ž, č — postalveolar sibilant
};
const visemeColor = (v: string) => VISEME_COLOR[v] ?? '#64748b';

// ─────────────────────────────────────────────────────────────────────────────
// Slovak grapheme → viseme — TypeScript port of SLOVAK_CHAR_VISEME +
// digraphs + diphthongs + affricates from viseme_timeline.py. Used by the
// Backtest panel to compute the EXPECTED viseme sequence for a given text
// CLIENT-SIDE, independent of the backend. The match against backend output
// is the actual "are we sending the right visemes for this sentence?" check.
// ─────────────────────────────────────────────────────────────────────────────
const SLOVAK_CHAR_VISEME: Record<string, string> = {
  // Short vowels
  a: 'aa', e: 'E', i: 'ih', o: 'oh', u: 'ou', y: 'ih',
  // Long vowels
  'á': 'aa', 'é': 'E', 'í': 'ih', 'ó': 'oh', 'ú': 'ou', 'ý': 'ih',
  // Special vowels
  'ä': 'aa', 'ô': 'oh',
  // Bilabials
  p: 'PP', b: 'PP', m: 'PP',
  // Labiodentals
  f: 'FF', v: 'FF', w: 'FF',
  // Dentals / alveolars
  t: 'DD', d: 'DD', n: 'nn',
  'ť': 'DD', 'ď': 'DD', 'ň': 'nn', 'ľ': 'RR',
  // Velars
  k: 'kk', g: 'kk', h: 'kk', x: 'kk', q: 'kk',
  // Sibilants
  s: 'SS', z: 'SS', 'š': 'CH', 'ž': 'CH', 'č': 'CH',
  // Affricate single char (also expanded as 2-frame, kept here for fallback)
  c: 'SS',
  // Liquids
  r: 'RR', l: 'RR', 'ĺ': 'RR', 'ŕ': 'RR',
  // Glide
  j: 'ih',
};

const SLOVAK_DIPHTHONG: Record<string, [string, string]> = {
  ia: ['ih', 'aa'],
  ie: ['ih', 'E'],
  iu: ['ih', 'ou'],
  uo: ['ou', 'oh'],
};

const SLOVAK_AFFRICATE: Record<string, [string, string]> = {
  c:  ['DD', 'SS'],   // /ts/
  dz: ['DD', 'SS'],   // /dz/
  'dž': ['DD', 'CH'], // /dʒ/
};

const SLOVAK_DIGRAPH: Record<string, string> = {
  ch: 'kk',
};

interface ExpectedFrame {
  viseme: string;
  source: string;  // the grapheme(s) it came from — e.g. "ch", "ia", "á"
}

function expectedVisemesForText(text: string): ExpectedFrame[] {
  const out: ExpectedFrame[] = [];
  const t = text.toLowerCase();
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    // Skip non-letters but emit silence at word boundaries
    if (/\s/.test(ch)) {
      if (out.length === 0 || out[out.length - 1].viseme !== 'sil') {
        out.push({ viseme: 'sil', source: '·' });
      }
      i += 1;
      continue;
    }
    if (/[.,!?;:—–\-"„"'']/.test(ch)) {
      out.push({ viseme: 'sil', source: ch });
      i += 1;
      continue;
    }
    // Try 2-char sequences first (digraphs > diphthongs > affricates)
    const pair = t.slice(i, i + 2);
    if (SLOVAK_DIGRAPH[pair]) {
      out.push({ viseme: SLOVAK_DIGRAPH[pair], source: pair });
      i += 2; continue;
    }
    if (SLOVAK_DIPHTHONG[pair]) {
      const [v1, v2] = SLOVAK_DIPHTHONG[pair];
      out.push({ viseme: v1, source: pair }, { viseme: v2, source: pair });
      i += 2; continue;
    }
    if (SLOVAK_AFFRICATE[pair]) {
      const [v1, v2] = SLOVAK_AFFRICATE[pair];
      out.push({ viseme: v1, source: pair }, { viseme: v2, source: pair });
      i += 2; continue;
    }
    // Single-char affricates: c
    if (SLOVAK_AFFRICATE[ch]) {
      const [v1, v2] = SLOVAK_AFFRICATE[ch];
      out.push({ viseme: v1, source: ch }, { viseme: v2, source: ch });
      i += 1; continue;
    }
    if (SLOVAK_CHAR_VISEME[ch]) {
      out.push({ viseme: SLOVAK_CHAR_VISEME[ch], source: ch });
      i += 1; continue;
    }
    // Unknown character — silence
    out.push({ viseme: 'sil', source: ch });
    i += 1;
  }
  // Trim trailing sil to one
  while (out.length > 1 && out[out.length - 1].viseme === 'sil' && out[out.length - 2].viseme === 'sil') {
    out.pop();
  }
  return out;
}

// Collapse consecutive same-viseme frames from the backend timeline so we can
// compare the SEQUENCE OF PHONEMES rather than the dense frame grid (the
// backend emits ~12.5 frames/sec on the 80ms grid; multiple consecutive frames
// of the same viseme are the same phoneme, just held).
function collapseTimeline(frames: VisemeFrame[]): VisemeFrame[] {
  const out: VisemeFrame[] = [];
  for (const f of frames) {
    const last = out[out.length - 1];
    if (last && last.viseme === f.viseme) {
      // Keep the higher-weight representative
      if (f.weight > last.weight) last.weight = f.weight;
      continue;
    }
    out.push({ ...f });
  }
  return out;
}

// Levenshtein-style sequence alignment with insertion/deletion/match — returns
// match score and a paired sequence for display. Cheap O(n*m) over short
// viseme sequences (<200 typically).
function alignSequences(
  expected: ExpectedFrame[],
  actual: VisemeFrame[],
): { score: number; pairs: Array<{ expected?: ExpectedFrame; actual?: VisemeFrame; status: 'match' | 'mismatch' | 'extra' | 'missing' }> } {
  const n = expected.length;
  const m = actual.length;
  if (n === 0 && m === 0) return { score: 1, pairs: [] };
  // DP table — distance
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = expected[i - 1].viseme === actual[j - 1].viseme ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  // Backtrack
  const pairs: Array<{ expected?: ExpectedFrame; actual?: VisemeFrame; status: 'match' | 'mismatch' | 'extra' | 'missing' }> = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1].viseme === actual[j - 1].viseme) {
      pairs.unshift({ expected: expected[i - 1], actual: actual[j - 1], status: 'match' });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      pairs.unshift({ expected: expected[i - 1], actual: actual[j - 1], status: 'mismatch' });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      pairs.unshift({ expected: expected[i - 1], status: 'missing' });
      i--;
    } else {
      pairs.unshift({ actual: actual[j - 1], status: 'extra' });
      j--;
    }
  }
  const matches = pairs.filter(p => p.status === 'match').length;
  const score = Math.max(n, m) === 0 ? 1 : matches / Math.max(n, m);
  return { score, pairs };
}

const INJECT_PRESETS: Record<string, string> = {
  'Idle': '{"emotion":"neutral","intensity":0.4,"isSpeaking":false,"visemes":[{"viseme":"sil","weight":1.0}],"blink":0.0}',
  'Speaking (aa viseme)': '{"emotion":"neutral","intensity":0.5,"isSpeaking":true,"visemes":[{"viseme":"aa","weight":0.85}],"blink":0.0}',
  'Joy speaking': '{"emotion":"joy","intensity":0.9,"isSpeaking":true,"visemes":[{"viseme":"aa","weight":0.9}],"blink":0.0}',
  'agentState: searching': '{"emotion":"thinking_deep","intensity":0.6,"isSpeaking":false,"visemes":[{"viseme":"sil","weight":1.0}],"agentState":"searching","blink":0.0}',
  'ARKit frame (JawOpen)': '{"emotion":"neutral","intensity":0.5,"isSpeaking":true,"visemes":[{"viseme":"sil","weight":1.0}],"arkit":{"JawOpen":0.31,"MouthFunnel":0.12},"blink":0.0}',
};

// Known Slovak probes — short, phonetically diverse, repeatable signal for
// "did the pipeline produce sensible visemes?" comparisons run-over-run.
const PROBE_PHRASES = [
  'Ahoj, ako sa máš?',
  'Slovensko je krásna krajina.',
  'Mama mu má mlieko.',
  'Pes a mačka sa hrajú.',
];

interface VisemeFrame {
  viseme: string;
  weight: number;
  offset_ms?: number;
}

interface PipelineEntry {
  ts: string;
  stage: 'llm' | 'emotion' | 'viseme' | 'ue5';
  text?: string;
  emotion?: string;
  intensity?: number;
  viseme_count?: number;
  duration_ms?: number;
  isSpeaking?: boolean;
  // Enhanced capture for "are we sending correct visemes?" debugging
  timeline?: VisemeFrame[];        // first ~32 frames (sufficient for inspector)
  head_visemes?: VisemeFrame[];    // the `visemes` array — immediate mouth shape
  arkit_count?: number;
  arkit_sample?: Record<string, number>;
  raw?: unknown;
  sync_delta_ms?: number;          // total_duration_ms - max(offset_ms) — sync drift
  agent_state?: string;
}

// VisemeChip — single phoneme tag, colour-keyed by symbol, weight as opacity hint
function VisemeChip({ frame, showOffset }: { frame: VisemeFrame; showOffset?: boolean }) {
  const c = visemeColor(frame.viseme);
  const opacity = Math.max(0.35, Math.min(1, frame.weight));
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 4,
        padding: '2px 6px', borderRadius: 4,
        background: `${c}22`, border: `1px solid ${c}55`,
        fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: c,
        opacity,
      }}
      title={`${frame.viseme} · weight ${frame.weight.toFixed(2)}${frame.offset_ms != null ? ` · ${frame.offset_ms}ms` : ''}`}
    >
      <span style={{ fontWeight: 700 }}>{frame.viseme}</span>
      <span style={{ color: 'var(--t3)', fontSize: 8 }}>·{frame.weight.toFixed(2)}</span>
      {showOffset && frame.offset_ms != null && (
        <span style={{ color: 'var(--t3)', fontSize: 8 }}>{frame.offset_ms}ms</span>
      )}
    </span>
  );
}

function VisemeStrip({ frames, max = 16, showOffset }: { frames: VisemeFrame[]; max?: number; showOffset?: boolean }) {
  if (!frames || frames.length === 0) {
    return <span style={{ color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', fontSize: 9 }}>(no frames)</span>;
  }
  const slice = frames.slice(0, max);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {slice.map((f, i) => <VisemeChip key={i} frame={f} showOffset={showOffset} />)}
      {frames.length > max && (
        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
          +{frames.length - max} more
        </span>
      )}
    </div>
  );
}

function SyncBadge({ delta_ms }: { delta_ms: number | undefined }) {
  if (delta_ms == null) return null;
  const abs = Math.abs(delta_ms);
  const colour = abs <= 100 ? '#22c55e' : abs <= 300 ? '#f59e0b' : '#ef4444';
  const label = abs <= 100 ? 'IN SYNC' : abs <= 300 ? 'DRIFT' : 'OUT OF SYNC';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 4,
      background: `${colour}15`, border: `1px solid ${colour}55`,
      fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: colour, letterSpacing: '0.1em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colour }} />
      {label} · {delta_ms >= 0 ? '+' : ''}{delta_ms.toFixed(0)}ms
    </span>
  );
}

function ARKitBadge({ count, sample }: { count: number | undefined; sample: Record<string, number> | undefined }) {
  if (!count) {
    return (
      <span style={{
        padding: '3px 9px', borderRadius: 4,
        background: 'var(--raised)', border: '1px solid var(--border-mid)',
        fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.1em',
      }}>
        text-tier
      </span>
    );
  }
  const sampleKeys = sample ? Object.keys(sample).slice(0, 3) : [];
  return (
    <span
      title={sample ? Object.entries(sample).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ') : ''}
      style={{
        padding: '3px 9px', borderRadius: 4,
        background: '#CB8A8215', border: '1px solid #CB8A8255',
        fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: '#CB8A82', letterSpacing: '0.1em',
      }}
    >
      ARKit ✓ {count} frames {sampleKeys.length > 0 && `· ${sampleKeys.join(',')}…`}
    </span>
  );
}

function RawJsonPanel({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(false);
  const json = useMemo(() => {
    try { return JSON.stringify(payload, null, 2); } catch { return '(unserializable)'; }
  }, [payload]);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--t2)', fontFamily: 'var(--font-jetbrains)', fontSize: 9,
          letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'left',
        }}
      >
        <span>raw payload · {json.length} chars</span>
        <span style={{ color: 'var(--t3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <pre style={{
          margin: 0, padding: '10px 12px', background: 'var(--bg)',
          fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t2)',
          maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          borderTop: '1px solid var(--border)',
        }}>{json}</pre>
      )}
    </div>
  );
}

// Histogram: count visemes across the last N broadcast timelines.
function VisemeHistogram({ entries, sampleSize = 50 }: { entries: PipelineEntry[]; sampleSize?: number }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const e of entries) {
      if (e.stage !== 'ue5' || !e.timeline) continue;
      for (const f of e.timeline) {
        map.set(f.viseme, (map.get(f.viseme) ?? 0) + 1);
        total += 1;
      }
      if (total >= sampleSize * 16) break;  // ~16 frames cap per entry, bounded scan
    }
    return { map, total };
  }, [entries, sampleSize]);

  if (counts.total === 0) {
    return (
      <div style={{
        padding: '8px 12px', background: 'var(--raised)', border: '1px solid var(--border)',
        borderRadius: 8, fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        viseme distribution · no broadcasts yet
      </div>
    );
  }

  const sorted = Array.from(counts.map.entries()).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;

  return (
    <div style={{
      padding: '10px 12px', background: 'var(--raised)', border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      <div style={{
        fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 7,
      }}>
        viseme distribution · {counts.total} frames sampled
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {sorted.map(([sym, n]) => {
          const c = visemeColor(sym);
          const pct = n / max;
          return (
            <div
              key={sym}
              title={`${sym}: ${n} frames (${((n / counts.total) * 100).toFixed(1)}%)`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '4px 7px', borderRadius: 4,
                background: `${c}15`, border: `1px solid ${c}40`,
                minWidth: 36,
              }}
            >
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: c, fontWeight: 700 }}>
                {sym}
              </span>
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t2)' }}>
                {n}
              </span>
              <div style={{
                width: 28, height: 2, background: `${c}30`, borderRadius: 1, overflow: 'hidden',
              }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: c }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeSyncDelta(payload: Record<string, unknown>): number | undefined {
  const total = payload.total_duration_ms;
  const timeline = payload.viseme_timeline;
  if (typeof total !== 'number') return undefined;
  if (!Array.isArray(timeline) || timeline.length === 0) return undefined;
  let lastOffset = 0;
  for (const f of timeline) {
    if (f && typeof (f as Record<string, unknown>).offset_ms === 'number') {
      const o = (f as Record<string, unknown>).offset_ms as number;
      if (o > lastOffset) lastOffset = o;
    }
  }
  // Negative delta = timeline extends past audio (mouth keeps moving)
  // Positive delta = audio extends past timeline (silent mouth at end)
  return total - lastOffset;
}

export default function PipelineInspectorPage() {
  const [wsConnected, setWsConnected] = useState(false);
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [testText, setTestText] = useState('Ahoj, ako sa máš? Toto je test pipeline.');
  const [testing, setTesting] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const [agentState, setAgentState] = useState<string>('idle');

  const [injectorOpen, setInjectorOpen] = useState(false);
  const [injectorJson, setInjectorJson] = useState<string>(INJECT_PRESETS['Idle']);
  const [injectFeedback, setInjectFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [injecting, setInjecting] = useState(false);

  // Backtest panel — pairs an arbitrary text with the visemes the backend
  // produces, and the visemes our local Slovak mapping says SHOULD be there.
  const [backtestText, setBacktestText] = useState<string>('Ahoj ako sa máš');
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestActual, setBacktestActual] = useState<VisemeFrame[]>([]);
  const [backtestDuration, setBacktestDuration] = useState<number | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestTokens, setBacktestTokens] = useState<Array<{
    grapheme: string; viseme: string; weight: number; start_ms: number; duration_ms: number;
  }>>([]);
  // Tri-tier compare (preview/full) state
  const [triTier, setTriTier] = useState<{
    production_tier: string;
    arkit: null | { frame_count: number; total_duration_ms: number; fps: number; sample_channels: Record<string, number>; channel_count: number; audio_bytes_size: number };
  } | null>(null);

  const backtestExpected = useMemo<ExpectedFrame[]>(
    () => expectedVisemesForText(backtestText),
    [backtestText],
  );
  const backtestCollapsed = useMemo(() => collapseTimeline(backtestActual), [backtestActual]);
  const backtestAlignment = useMemo(
    () => alignSequences(backtestExpected, backtestCollapsed),
    [backtestExpected, backtestCollapsed],
  );

  async function runBacktest(text: string, includeArkit = true) {
    if (!text.trim()) return;
    setBacktestRunning(true);
    setBacktestError(null);
    try {
      // Use preview/full so we get text-tier + ARKit (when audio2lipsync model loaded)
      // plus tokens — single call replaces two.
      const res = await fetch(`${API_BASE}/api/v1/lipsync/preview/full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ text: text.trim(), include_arkit: includeArkit }),
      });
      if (!res.ok) {
        const detail = await res.text();
        setBacktestError(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
        setBacktestActual([]);
        setBacktestDuration(null);
        setBacktestTokens([]);
        setTriTier(null);
        return;
      }
      const data = (await res.json()) as {
        text_tier: {
          viseme_timeline: Array<Record<string, unknown>>;
          tokens: Array<{ grapheme: string; viseme: string; weight: number; start_ms: number; duration_ms: number }>;
          total_duration_ms: number;
          frame_count: number;
        };
        arkit_tier: null | {
          frames: Array<Record<string, unknown>>;
          frame_count: number;
          total_duration_ms: number;
          fps: number;
          sample_channels: Record<string, number>;
          channel_count: number;
          audio_bytes_size: number;
        };
        production_tier: string;
      };
      const frames: VisemeFrame[] = data.text_tier.viseme_timeline.map(f => ({
        viseme: String(f.viseme ?? '?'),
        weight: typeof f.weight === 'number' ? f.weight : 0,
        offset_ms: typeof f.start_ms === 'number' ? f.start_ms : undefined,
      }));
      setBacktestActual(frames);
      setBacktestDuration(data.text_tier.total_duration_ms);
      setBacktestTokens(data.text_tier.tokens ?? []);
      setTriTier({
        production_tier: data.production_tier,
        arkit: data.arkit_tier
          ? {
              frame_count: data.arkit_tier.frame_count,
              total_duration_ms: data.arkit_tier.total_duration_ms,
              fps: data.arkit_tier.fps,
              sample_channels: data.arkit_tier.sample_channels,
              channel_count: data.arkit_tier.channel_count,
              audio_bytes_size: data.arkit_tier.audio_bytes_size,
            }
          : null,
      });
    } catch (err) {
      setBacktestError((err as Error).message);
    } finally {
      setBacktestRunning(false);
    }
  }

  const onWSPipelineMessage = useCallback((raw: Record<string, unknown>) => {
    if (raw.type === 'connected') return;
    if (typeof raw.agentState === 'string') setAgentState(raw.agentState as string);

    const timelineRaw = (raw.viseme_timeline as Array<Record<string, unknown>> | undefined) ?? [];
    const headRaw = (raw.visemes as Array<Record<string, unknown>> | undefined) ?? [];
    const arkitFrames = raw.arkit_frames as Array<Record<string, number>> | undefined;

    // Capture first 32 frames — enough for the strip, raw JSON viewer can hold the rest.
    const timeline: VisemeFrame[] = timelineRaw.slice(0, 32).map(f => ({
      viseme: String(f.viseme ?? '?'),
      weight: typeof f.weight === 'number' ? f.weight : 0,
      offset_ms: typeof f.offset_ms === 'number' ? f.offset_ms : undefined,
    }));
    const head: VisemeFrame[] = headRaw.slice(0, 8).map(f => ({
      viseme: String(f.viseme ?? '?'),
      weight: typeof f.weight === 'number' ? f.weight : 0,
    }));

    const entry: PipelineEntry = {
      ts: new Date().toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      stage: 'ue5',
      emotion: raw.emotion as string | undefined,
      intensity: raw.intensity as number | undefined,
      viseme_count: timelineRaw.length,
      duration_ms: raw.total_duration_ms as number | undefined,
      isSpeaking: raw.isSpeaking as boolean | undefined,
      timeline,
      head_visemes: head,
      arkit_count: arkitFrames?.length,
      arkit_sample: arkitFrames && arkitFrames[0] ? arkitFrames[0] : undefined,
      raw,
      sync_delta_ms: computeSyncDelta(raw),
      agent_state: typeof raw.agentState === 'string' ? raw.agentState : undefined,
    };
    setEntries(prev => [entry, ...prev.slice(0, 49)]);
  }, []);

  const {
    state: wsState,
    reconnect: wsReconnect,
  } = useReconnectingWebSocket({
    url: `${WS_BASE}/ws/avatar`,
    onMessage: (data) => onWSPipelineMessage(data as Record<string, unknown>),
  });

  useEffect(() => {
    setWsConnected(wsState === 'connected');
  }, [wsState]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [entries]);

  const latestUE5 = useMemo(() => entries.find(e => e.stage === 'ue5'), [entries]);

  async function runPipeline(text: string) {
    if (!text.trim()) return;
    setTesting(true);

    const ts = new Date().toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEntries(prev => [{ ts, stage: 'llm', text: text.trim() }, ...prev.slice(0, 49)]);

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), stream: false, max_tokens: 100 }),
      });
      const data = await res.json();
      const ts2 = new Date().toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setEntries(prev => [
        {
          ts: ts2, stage: 'viseme',
          text: `${data.viseme_timeline?.length ?? 0} framov · ${data.audio_duration_ms ?? 0}ms`,
          viseme_count: data.viseme_timeline?.length ?? 0,
          duration_ms: data.audio_duration_ms,
        },
        {
          ts: ts2, stage: 'emotion',
          text: data.response?.slice(0, 120),
          emotion: data.emotion,
          intensity: data.intensity,
        },
        ...prev.slice(0, 48),
      ]);
    } catch {
      setEntries(prev => [{ ts, stage: 'llm', text: 'Chyba pripojenia k backendu.' }, ...prev.slice(0, 49)]);
    } finally {
      setTesting(false);
    }
  }

  const testPipeline = () => runPipeline(testText);
  const probe = (phrase: string) => { setTestText(phrase); runPipeline(phrase); };

  async function injectCommand() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(injectorJson);
    } catch (err) {
      setInjectFeedback({ ok: false, msg: `Invalid JSON: ${(err as Error).message}` });
      return;
    }
    setInjecting(true);
    setInjectFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/avatar/dev/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (res.status === 404) {
        setInjectFeedback({ ok: false, msg: 'Dev mode disabled (EDU_DEV_MODE=0)' });
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        setInjectFeedback({ ok: false, msg: `HTTP ${res.status}: ${text.slice(0, 80)}` });
        return;
      }
      const data = (await res.json()) as { success: boolean; connections: number };
      setInjectFeedback({ ok: true, msg: `Broadcast to ${data.connections} client(s)` });
    } catch (err) {
      setInjectFeedback({ ok: false, msg: (err as Error).message });
    } finally {
      setInjecting(false);
    }
  }

  const stageStyle = (stage: string) => {
    const colors: Record<string, { bg: string; border: string; text: string }> = {
      llm: { bg: '#6366f115', border: '#6366f140', text: '#6366f1' },
      emotion: { bg: '#f59e0b15', border: '#f59e0b40', text: '#f59e0b' },
      viseme: { bg: '#06b6d415', border: '#06b6d440', text: '#06b6d4' },
      ue5: { bg: '#22c55e15', border: '#22c55e40', text: '#22c55e' },
    };
    return colors[stage] ?? colors.llm;
  };

  return (
    <>
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '6px 12px', minWidth: 110,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: AGENT_STATE_COLOR[agentState] ?? '#6b7280',
            transition: 'background 200ms ease',
          }} />
          <span style={{
            fontFamily: 'var(--font-jetbrains)', fontSize: 9,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {agentState}
          </span>
        </div>
        <ConnectionStatePill state={wsState} onClick={() => wsReconnect()} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, padding: '28px 32px 40px', maxWidth: 900, width: '100%' }}>
        <PageHeader
          eyebrow="Avatar pipeline · live"
          title="Pipeline Inspector"
          description="LLM → Emócia → Viseme → UE5 Avatar"
          right={
            <a href="/avatar-debug/simulator" style={{ padding: '6px 14px', background: 'var(--raised)', border: '1px solid var(--border-mid)', borderRadius: 8, fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t2)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              → Blueprint Simulator
            </a>
          }
        />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
            background: wsConnected ? '#22c55e' : '#ef4444',
            boxShadow: wsConnected ? '0 0 6px #22c55e44' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: wsConnected ? '#22c55e' : '#ef4444', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {wsConnected ? 'UE5 WebSocket pripojený' : 'UE5 WebSocket odpojený'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {['llm', 'emotion', 'viseme', 'ue5'].map(stage => {
            const s = stageStyle(stage);
            const labels: Record<string, string> = { llm: 'LLM odpoveď', emotion: 'Emócia', viseme: 'Viseme timeline', ue5: 'UE5 Avatar' };
            return (
              <div key={stage} style={{
                flex: 1, padding: '10px 12px', background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: s.text, marginBottom: 4 }}>
                  {labels[stage]}
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>
                  {entries.filter(e => e.stage === stage).length}
                </div>
              </div>
            );
          })}
        </div>

        {/* Viseme distribution histogram — last ~50 broadcasts */}
        <VisemeHistogram entries={entries} />

        <div style={{
          padding: 14, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                Test pipeline (pošli text manuálne)
              </div>
              <input
                type="text"
                value={testText}
                onChange={e => setTestText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && testPipeline()}
                style={{
                  width: '100%', padding: '8px 10px', background: 'var(--bg)',
                  border: '1px solid var(--border-mid)', borderRadius: 8,
                  fontSize: 12, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={testPipeline}
              disabled={testing}
              style={{
                padding: '9px 18px', background: testing ? 'transparent' : 'var(--accent)',
                border: '1px solid var(--accent)', borderRadius: 8,
                fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: testing ? 'var(--accent)' : '#fff',
                cursor: testing ? 'default' : 'pointer', flexShrink: 0,
              }}
            >
              {testing ? 'Testujem…' : 'Odoslať'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>
              Probe presets:
            </span>
            {PROBE_PHRASES.map(p => (
              <button
                key={p}
                onClick={() => probe(p)}
                disabled={testing}
                style={{
                  padding: '4px 10px', background: 'var(--bg)',
                  border: '1px solid var(--border-mid)', borderRadius: 14,
                  fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t2)',
                  cursor: testing ? 'default' : 'pointer',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Backtest panel — verify input text → expected vs actual visemes */}
        <div style={{
          padding: 14, background: 'var(--raised)', border: '1px solid #6366f140', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6366f1', marginBottom: 3 }}>
                Backtest · text → visemes
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                Compares expected viseme sequence (computed client-side from Slovak grapheme map)
                with the backend&apos;s actual output (via <code style={{ fontSize: 10 }}>/api/v1/lipsync/preview</code>).
                No LLM, no TTS — pure phonetic mapping check.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                Test sentence
              </div>
              <input
                type="text"
                value={backtestText}
                onChange={e => setBacktestText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runBacktest(backtestText)}
                placeholder="Napíš slovenskú vetu…"
                style={{
                  width: '100%', padding: '8px 10px', background: 'var(--bg)',
                  border: '1px solid var(--border-mid)', borderRadius: 8,
                  fontSize: 13, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={() => runBacktest(backtestText)}
              disabled={backtestRunning}
              style={{
                padding: '9px 18px', background: backtestRunning ? 'transparent' : '#6366f1',
                border: '1px solid #6366f1', borderRadius: 8,
                fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: backtestRunning ? '#6366f1' : '#fff',
                cursor: backtestRunning ? 'default' : 'pointer', flexShrink: 0,
              }}
            >
              {backtestRunning ? 'Running…' : 'Backtest'}
            </button>
          </div>

          {backtestError && (
            <div style={{
              padding: '8px 12px', background: '#ef444415', border: '1px solid #ef444455',
              borderRadius: 8, fontSize: 11, color: '#ef4444',
              fontFamily: 'var(--font-jetbrains)',
            }}>
              ✗ {backtestError}
            </div>
          )}

          {/* Production tier badge — what UE5 actually receives during chat */}
          {triTier && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 12px', borderRadius: 8,
              background: triTier.production_tier === 'audio2lipsync' ? '#CB8A8215' : '#f59e0b15',
              border: `1px solid ${triTier.production_tier === 'audio2lipsync' ? '#CB8A8255' : '#f59e0b55'}`,
            }}>
              <span style={{
                fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: triTier.production_tier === 'audio2lipsync' ? '#CB8A82' : '#f59e0b',
                fontWeight: 700,
              }}>
                Production tier: {triTier.production_tier === 'audio2lipsync' ? 'ARKit (52 blendshapes)' : 'text fallback (14 visemes)'}
              </span>
              {triTier.arkit && (
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
                  · {triTier.arkit.frame_count} ARKit frames @ {triTier.arkit.fps}fps
                  · {triTier.arkit.channel_count} active channels
                  · {triTier.arkit.total_duration_ms}ms audio
                  · {(triTier.arkit.audio_bytes_size / 1024).toFixed(1)} KB TTS
                </span>
              )}
              {!triTier.arkit && (
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
                  · ARKit unavailable (TTS / model issue) — UE5 receives the 14-symbol fallback shown below
                </span>
              )}
            </div>
          )}

          {/* ARKit channels — the real mouth-shape drivers when Tier 1 fires */}
          {triTier?.arkit && (
            <div>
              <div style={{
                fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6,
              }}>
                ARKit blendshapes (frame 0 sample) — mouth channels highlighted
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 4, background: 'var(--bg)', padding: 10, borderRadius: 8,
                border: '1px solid var(--border)',
              }}>
                {Object.entries(triTier.arkit.sample_channels)
                  .sort((a, b) => b[1] - a[1])
                  .map(([ch, v]) => {
                    const isMouth = ch.startsWith('Mouth') || ch.startsWith('Jaw');
                    const isCheek = ch.startsWith('Cheek');
                    const isSecondary = isCheek || ch === 'TongueOut';
                    const color = isMouth ? '#CB8A82' : isSecondary ? '#06b6d4' : 'var(--t3)';
                    const barColor = isMouth ? '#CB8A82' : isSecondary ? '#06b6d4' : '#64748b';
                    return (
                      <div key={ch} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                          fontFamily: 'var(--font-jetbrains)', fontSize: 9,
                        }}>
                          <span style={{ color, fontWeight: isMouth ? 700 : 400 }}>{ch}</span>
                          <span style={{ color: 'var(--t2)' }}>{v.toFixed(3)}</span>
                        </div>
                        <div style={{ height: 3, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, v * 100)}%`, height: '100%', background: barColor }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div style={{
                marginTop: 6, fontFamily: 'var(--font-jetbrains)', fontSize: 8,
                color: 'var(--t3)',
              }}>
                Purple = mouth/jaw (primary). Cyan = cheeks / tongue (secondary). Grey = eyes / brows / nose.
                Every 16.7ms (60fps), UE5 receives a fresh blendshape vector for these channels —
                this is what makes M visibly different from P during real speech.
              </div>
            </div>
          )}

          {/* Per-letter view (D) — each grapheme with its viseme + duration */}
          {backtestTokens.length > 0 && !backtestError && (
            <div>
              <div style={{
                fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6,
              }}>
                Per-letter view — text-tier decomposition before densification
              </div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6,
                background: 'var(--bg)', padding: 10, borderRadius: 8,
                border: '1px solid var(--border)',
              }}>
                {backtestTokens.map((tok, i) => {
                  const c = visemeColor(tok.viseme);
                  const cleanGrapheme = tok.grapheme.replace(/_[12]$/, '');
                  // Highlight long-held grapheme durations vs default 90ms consonant
                  const isLong = tok.duration_ms >= 120;
                  const isShort = tok.duration_ms <= 60;
                  return (
                    <div
                      key={i}
                      title={`${cleanGrapheme} → ${tok.viseme} · ${tok.duration_ms}ms · weight ${tok.weight.toFixed(2)} · start ${tok.start_ms}ms`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        padding: '6px 10px', borderRadius: 8,
                        background: `${c}15`, border: `1px solid ${c}55`,
                        minWidth: 48,
                      }}
                    >
                      {/* Big letter (grapheme) */}
                      <span style={{
                        fontFamily: 'var(--font-jetbrains)', fontSize: 16, fontWeight: 700,
                        color: 'var(--t1)', textTransform: 'uppercase',
                      }}>
                        {cleanGrapheme}
                      </span>
                      {/* Viseme symbol */}
                      <span style={{
                        fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: c, fontWeight: 700,
                      }}>
                        {tok.viseme}
                      </span>
                      {/* Duration + weight, with hold/glide annotation */}
                      <span style={{
                        fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t3)',
                      }}>
                        {tok.duration_ms}ms · w{tok.weight.toFixed(2)}
                      </span>
                      {isLong && (
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 7, color: '#22c55e', letterSpacing: '0.1em' }}>
                          HOLD
                        </span>
                      )}
                      {isShort && (
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 7, color: '#f59e0b', letterSpacing: '0.1em' }}>
                          GLIDE
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{
                marginTop: 6, fontFamily: 'var(--font-jetbrains)', fontSize: 8,
                color: 'var(--t3)',
              }}>
                Each tile = one Slovak grapheme → its assigned viseme + duration. HOLD markers
                appear on nasals (m, n, ň, ~125ms) that linger by design; GLIDE markers on /j/
                (~50ms) that passes through quickly. The mouth shape itself is identical for
                m/p/b (all PP) — the DURATION difference is what your eye perceives as
                "different lipsync."
              </div>
            </div>
          )}

          {backtestActual.length > 0 && !backtestError && (
            <>
              {/* Score summary */}
              {(() => {
                const score = backtestAlignment.score;
                const colour = score >= 0.85 ? '#22c55e' : score >= 0.6 ? '#f59e0b' : '#ef4444';
                const matches = backtestAlignment.pairs.filter(p => p.status === 'match').length;
                const total = backtestAlignment.pairs.length;
                const mismatches = backtestAlignment.pairs.filter(p => p.status === 'mismatch').length;
                const missing = backtestAlignment.pairs.filter(p => p.status === 'missing').length;
                const extra = backtestAlignment.pairs.filter(p => p.status === 'extra').length;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 4,
                      background: `${colour}15`, border: `1px solid ${colour}55`,
                      fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: colour,
                      letterSpacing: '0.1em', fontWeight: 700,
                    }}>
                      {(score * 100).toFixed(0)}% match · {matches}/{total}
                    </span>
                    {mismatches > 0 && (
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: '#f59e0b' }}>
                        {mismatches} substitutions
                      </span>
                    )}
                    {missing > 0 && (
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: '#ef4444' }}>
                        {missing} missing
                      </span>
                    )}
                    {extra > 0 && (
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: '#06b6d4' }}>
                        {extra} extra (e.g. coarticulation, silence)
                      </span>
                    )}
                    {backtestDuration != null && (
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
                        · {backtestDuration}ms · {backtestActual.length} raw frames · {backtestCollapsed.length} unique
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Aligned sequence */}
              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>
                  Expected (top) vs Actual (bottom) — aligned
                </div>
                <div style={{
                  display: 'flex', gap: 2, flexWrap: 'wrap',
                  background: 'var(--bg)', padding: 10, borderRadius: 8,
                  border: '1px solid var(--border)',
                }}>
                  {backtestAlignment.pairs.map((p, i) => {
                    const exp = p.expected;
                    const act = p.actual;
                    const statusColor = p.status === 'match' ? '#22c55e'
                      : p.status === 'mismatch' ? '#f59e0b'
                      : p.status === 'missing' ? '#ef4444'
                      : '#06b6d4';
                    return (
                      <div
                        key={i}
                        title={`${p.status.toUpperCase()}${exp ? ` · expected ${exp.viseme} from "${exp.source}"` : ''}${act ? ` · got ${act.viseme} (w=${act.weight.toFixed(2)})` : ''}`}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center',
                          padding: '4px 5px', borderRadius: 4,
                          background: `${statusColor}10`, border: `1px solid ${statusColor}40`,
                          minWidth: 36,
                        }}
                      >
                        {/* Expected row */}
                        <span style={{
                          fontFamily: 'var(--font-jetbrains)', fontSize: 9, fontWeight: 700,
                          color: exp ? visemeColor(exp.viseme) : '#444',
                          minHeight: 11,
                        }}>
                          {exp?.viseme ?? '—'}
                        </span>
                        {/* Source grapheme */}
                        <span style={{
                          fontFamily: 'var(--font-jetbrains)', fontSize: 8,
                          color: 'var(--t3)', minHeight: 10,
                        }}>
                          {exp?.source ?? ''}
                        </span>
                        {/* Status divider */}
                        <span style={{ width: '100%', height: 1, background: statusColor }} />
                        {/* Actual row */}
                        <span style={{
                          fontFamily: 'var(--font-jetbrains)', fontSize: 9, fontWeight: 700,
                          color: act ? visemeColor(act.viseme) : '#444',
                          minHeight: 11,
                        }}>
                          {act?.viseme ?? '—'}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-jetbrains)', fontSize: 8,
                          color: 'var(--t3)', minHeight: 10,
                        }}>
                          {act ? act.weight.toFixed(2) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6, fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t3)' }}>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#22c55e', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />match</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#f59e0b', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />substitution</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#ef4444', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />missing</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#06b6d4', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />extra</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Latest broadcast detail — the headline answer to "are visemes correct?" */}
        {latestUE5 && (
          <div style={{
            padding: 14, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                latest broadcast · {latestUE5.ts}
              </span>
              <SyncBadge delta_ms={latestUE5.sync_delta_ms} />
              <ARKitBadge count={latestUE5.arkit_count} sample={latestUE5.arkit_sample} />
              {latestUE5.emotion && (
                <span style={{
                  padding: '3px 9px', borderRadius: 4,
                  background: `${EMOTION_COLOR[latestUE5.emotion] ?? '#888'}15`,
                  border: `1px solid ${EMOTION_COLOR[latestUE5.emotion] ?? '#888'}55`,
                  fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.1em',
                  color: EMOTION_COLOR[latestUE5.emotion] ?? '#888',
                }}>
                  {latestUE5.emotion} · {latestUE5.intensity?.toFixed(2)}
                </span>
              )}
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
                {latestUE5.viseme_count} frames · {latestUE5.duration_ms}ms · {latestUE5.isSpeaking ? 'speaking' : 'silent'}
              </span>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>
                Head visemes (immediate mouth)
              </div>
              <VisemeStrip frames={latestUE5.head_visemes ?? []} max={6} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>
                Timeline (first 16 of {latestUE5.viseme_count})
              </div>
              <VisemeStrip frames={latestUE5.timeline ?? []} max={16} showOffset />
            </div>
            <RawJsonPanel payload={latestUE5.raw} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <a
            href="/avatar-debug/simulator"
            style={{
              color: 'var(--accent)', fontSize: 11, fontFamily: 'var(--font-jetbrains)',
              letterSpacing: '0.06em', textDecoration: 'none',
            }}
          >
            Open Simulator →
          </a>
        </div>

        <div style={{
          background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10,
          overflow: 'hidden',
        }}>
          <button
            onClick={() => setInjectorOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--t2)', fontFamily: 'var(--font-jetbrains)', fontSize: 9,
              letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'left',
            }}
          >
            <span>🛠 Inject avatar command</span>
            <span style={{ color: 'var(--t3)', fontSize: 9 }}>{injectorOpen ? '▲' : '▼'}</span>
          </button>

          {injectorOpen && (
            <div style={{
              borderTop: '1px solid var(--border)', padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                  Preset
                </div>
                <select
                  onChange={e => {
                    setInjectorJson(INJECT_PRESETS[e.target.value] ?? '');
                    setInjectFeedback(null);
                  }}
                  defaultValue="Idle"
                  style={{
                    padding: '6px 8px', background: 'var(--bg)',
                    border: '1px solid var(--border-mid)', borderRadius: 8,
                    color: 'var(--t1)', fontFamily: 'var(--font-jetbrains)', fontSize: 10,
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  {Object.keys(INJECT_PRESETS).map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                  Payload JSON
                </div>
                <textarea
                  rows={6}
                  value={injectorJson}
                  onChange={e => { setInjectorJson(e.target.value); setInjectFeedback(null); }}
                  style={{
                    width: '100%', padding: '8px 10px', background: 'var(--bg)',
                    border: '1px solid var(--border-mid)', borderRadius: 8,
                    fontSize: 11, color: 'var(--t1)', outline: 'none',
                    boxSizing: 'border-box', resize: 'vertical',
                    fontFamily: 'var(--font-jetbrains)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={injectCommand}
                  disabled={injecting}
                  style={{
                    padding: '7px 16px', background: injecting ? 'transparent' : 'var(--accent)',
                    border: '1px solid var(--accent)', borderRadius: 8,
                    fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: injecting ? 'var(--accent)' : '#fff',
                    cursor: injecting ? 'default' : 'pointer', flexShrink: 0,
                  }}
                >
                  {injecting ? 'Injecting…' : 'Inject'}
                </button>
                {injectFeedback && (
                  <span style={{
                    fontFamily: 'var(--font-jetbrains)', fontSize: 9,
                    color: injectFeedback.ok ? 'var(--green)' : '#ef4444',
                  }}>
                    {injectFeedback.ok ? `✓ ${injectFeedback.msg}` : `✗ ${injectFeedback.msg}`}
                  </span>
                )}
              </div>

              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.06em', color: 'var(--t3)' }}>
                Pošle payload priamo na avatar_broadcaster — bez chat triggeru. Gated on EDU_DEV_MODE.
              </div>
            </div>
          )}
        </div>

        <div ref={logRef} style={{
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
          maxHeight: 480, overflowY: 'auto',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {['#ef4444', '#f59e0b', '#22c55e'].map(c => (
              <span key={c} style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
            ))}
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', color: 'var(--t3)', marginLeft: 6, textTransform: 'uppercase' }}>
              pipeline log
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t3)', marginLeft: 'auto' }}>
              {entries.length} záznamov
            </span>
          </div>

          {entries.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
              Hovor v hlasovej relácii alebo použi test input hore — pipeline udalosti sa zobrazia tu.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {entries.map((e, i) => {
              const s = stageStyle(e.stage);
              return (
                <div key={i} style={{
                  display: 'flex', gap: 10, padding: '8px 14px', alignItems: 'flex-start',
                  borderBottom: '1px solid var(--border)',
                  opacity: i === 0 ? 1 : 0.6 + (1 - i / entries.length) * 0.4,
                }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', minWidth: 56, paddingTop: 2 }}>
                    {e.ts}
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-jetbrains)',
                    fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: s.bg, color: s.text, border: `1px solid ${s.border}`,
                    minWidth: 60, textAlign: 'center', flexShrink: 0, marginTop: 1,
                  }}>
                    {e.stage}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {e.stage === 'emotion' && e.emotion && (
                      <span>
                        <span style={{ color: EMOTION_COLOR[e.emotion] ?? '#888', fontWeight: 600 }}>{e.emotion}</span>
                        <span style={{ color: 'var(--t3)' }}> · intenzita {e.intensity?.toFixed(2)}</span>
                        {e.text && <span style={{ color: 'var(--t3)' }}> · &quot;{e.text}&quot;</span>}
                      </span>
                    )}
                    {e.stage === 'viseme' && (
                      <span>{e.viseme_count} framov · {e.duration_ms}ms</span>
                    )}
                    {e.stage === 'ue5' && (
                      <>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ color: EMOTION_COLOR[e.emotion ?? 'neutral'] ?? '#888', fontWeight: 600 }}>{e.emotion}</span>
                          <span style={{ color: 'var(--t3)' }}>· {e.viseme_count} frames · {e.duration_ms}ms</span>
                          <span style={{ color: e.isSpeaking ? '#22c55e' : 'var(--t3)' }}>· {e.isSpeaking ? 'speaking' : 'silent'}</span>
                          {e.arkit_count ? (
                            <span style={{ color: '#CB8A82' }}>· ARKit×{e.arkit_count}</span>
                          ) : null}
                          {e.sync_delta_ms != null && Math.abs(e.sync_delta_ms) > 100 && (
                            <span style={{ color: Math.abs(e.sync_delta_ms) > 300 ? '#ef4444' : '#f59e0b' }}>
                              · drift {e.sync_delta_ms >= 0 ? '+' : ''}{e.sync_delta_ms.toFixed(0)}ms
                            </span>
                          )}
                        </span>
                        {e.timeline && e.timeline.length > 0 && (
                          <VisemeStrip frames={e.timeline} max={6} />
                        )}
                      </>
                    )}
                    {e.stage === 'llm' && (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {e.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
