'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { logger } from '@/lib/logger';
import { PageHeader } from '@/components/atmosphere';

interface VisemeFrame {
  viseme: string;
  weight: number;
  start_ms: number;
  duration_ms: number;
}

interface ARKitFrame {
  start_ms: number;
  duration_ms: number;
  arkit: Record<string, number>;
}

interface SentenceData {
  index: number;
  text: string;
  viseme_timeline: VisemeFrame[];
  arkit_frames?: ARKitFrame[];
  duration_ms: number;
  emotion: string;
  intensity: number;
}

const VISEME_COLOR: Record<string, string> = {
  PP: '#dc2626', FF: '#ea580c', TH: '#d97706', DD: '#ca8a04',
  kk: '#65a30d', CH: '#16a34a', SS: '#059669', nn: '#0891b2',
  RR: '#0284c7', aa: '#C2703F', E: '#4f46e5', ih: '#CB8A82',
  oh: '#9333ea', ou: '#c026d3', ww: '#db2777', uw: '#e11d48',
  sil: '#6b7280',
};

export default function BlueprintSimulatorPage() {
  const [sentences, setSentences] = useState<SentenceData[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [scrubMs, setScrubMs] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [testText, setTestText] = useState('Ahoj, ako sa máš dnes? Som rád že ťa vidím.');
  const [loading, setLoading] = useState(false);
  const rafRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);

  const active = sentences[activeIdx];

  // The exact lookup the v4.0 Blueprint must implement: O(1) array index
  // by audioPositionMs / frameStepMs. If this snippet is wrong, the whole
  // Blueprint contract is wrong — so this page IS the Blueprint reference.
  const lookupResult = useMemo(() => {
    if (!active) return null;
    const timeline = active.viseme_timeline;
    if (!timeline || timeline.length === 0) return null;
    const frameStepMs = timeline.length > 1
      ? timeline[1].start_ms - timeline[0].start_ms
      : 8;
    const idx = Math.min(
      Math.max(Math.floor(scrubMs / frameStepMs), 0),
      timeline.length - 1,
    );
    const frame = timeline[idx];
    const arkitFrame = active.arkit_frames?.find(
      f => scrubMs >= f.start_ms && scrubMs < f.start_ms + f.duration_ms,
    );
    return { idx, frame, frameStepMs, arkit: arkitFrame?.arkit };
  }, [active, scrubMs]);

  useEffect(() => {
    if (!autoplay || !active) return;
    playStartRef.current = performance.now() - scrubMs;
    function tick() {
      if (!active) return;
      const elapsed = performance.now() - playStartRef.current;
      if (elapsed >= active.duration_ms) {
        setScrubMs(active.duration_ms);
        setAutoplay(false);
        return;
      }
      setScrubMs(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoplay, active]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSentences() {
    setLoading(true);
    setSentences([]);
    setScrubMs(0);
    setActiveIdx(0);
    try {
      const collected: SentenceData[] = [];
      const res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: testText,
          language: 'sk',
          mode_id: 'sk',
          tts_provider: 'edge',
          tts_voice: 'sk-SK-LukasNeural',
        }),
      });
      if (!res.body) throw new Error('no stream body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const partials = new Map<number, Partial<SentenceData>>();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'sentence_start') {
              partials.set(evt.index, {
                index: evt.index,
                text: evt.text,
                viseme_timeline: evt.viseme_timeline ?? [],
                duration_ms: evt.duration_ms ?? 0,
                emotion: evt.emotion ?? 'neutral',
                intensity: evt.intensity ?? 0.4,
              });
            } else if (evt.type === 'sentence_end') {
              const p = partials.get(evt.index);
              if (p) {
                p.viseme_timeline = evt.viseme_timeline ?? p.viseme_timeline;
                p.duration_ms = evt.duration_ms ?? p.duration_ms;
                p.arkit_frames = evt.arkit_frames;
                collected.push(p as SentenceData);
                setSentences(collected.slice().sort((a, b) => a.index - b.index));
              }
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      logger.error('avatar-debug.simulator.fetch', e);
    } finally {
      setLoading(false);
    }
  }

  const arkitNonZero = lookupResult?.arkit
    ? Object.entries(lookupResult.arkit).sort((a, b) => b[1] - a[1]).slice(0, 8)
    : [];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 20, padding: '28px 32px 40px', maxWidth: 1100 }}>
      <PageHeader
        eyebrow="Avatar pipeline · simulator"
        title="Blueprint Simulator"
        description="Validate v4.0 viseme lookup logic without needing UE5 — scrub audioPositionMs to see what the Blueprint receives."
      />

      <div style={{ padding: 14, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
            Generate sentences from real backend
          </div>
          <input
            type="text"
            value={testText}
            onChange={e => setTestText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && fetchSentences()}
            style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 8, fontSize: 12, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={fetchSentences}
          disabled={loading}
          style={{ padding: '9px 18px', background: loading ? 'transparent' : 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, fontFamily: 'var(--font-jetbrains)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: loading ? 'var(--accent)' : '#fff', cursor: loading ? 'default' : 'pointer', flexShrink: 0 }}
        >
          {loading ? 'Načítavam…' : 'Fetch'}
        </button>
      </div>

      {sentences.length === 0 && !loading && (
        <div style={{ padding: '40px 20px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 10, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
          Type a sentence and click Fetch — the simulator will collect every sentence_start/sentence_end pair so you can scrub through the timeline.
        </div>
      )}

      {sentences.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sentences.map((s, i) => (
              <button
                key={s.index}
                onClick={() => { setActiveIdx(i); setScrubMs(0); setAutoplay(false); }}
                style={{ padding: '6px 12px', background: i === activeIdx ? 'var(--accent)' : 'var(--raised)', border: '1px solid var(--border-mid)', borderRadius: 8, fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.08em', color: i === activeIdx ? '#fff' : 'var(--t2)', cursor: 'pointer' }}
              >
                #{s.index} · {s.duration_ms}ms · {s.viseme_timeline.length}f{s.arkit_frames ? ' +ARKit' : ''}
              </button>
            ))}
          </div>

          {active && (
            <>
              <div style={{ padding: 14, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Sentence #{active.index} · {active.emotion} · intensity {active.intensity.toFixed(2)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--t1)', marginBottom: 14 }}>
                  &quot;{active.text}&quot;
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                  <button
                    onClick={() => { setAutoplay(!autoplay); if (scrubMs >= active.duration_ms) setScrubMs(0); }}
                    style={{ padding: '6px 14px', background: autoplay ? 'var(--accent)' : 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 8, fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: autoplay ? '#fff' : 'var(--t2)', cursor: 'pointer' }}
                  >
                    {autoplay ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'var(--t1)', minWidth: 100 }}>
                    {Math.round(scrubMs)}ms / {active.duration_ms}ms
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={active.duration_ms}
                    value={scrubMs}
                    onChange={e => { setScrubMs(Number(e.target.value)); setAutoplay(false); }}
                    style={{ flex: 1 }}
                  />
                </div>

                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.08em' }}>
                  audioPositionMs = {Math.round(scrubMs)} · sentenceIdx = {active.index}
                </div>
              </div>

              {lookupResult && (
                <div style={{ padding: 14, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Blueprint lookup result · floor({Math.round(scrubMs)} / {lookupResult.frameStepMs}) = idx {lookupResult.idx}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ width: 80, height: 80, borderRadius: 12, background: VISEME_COLOR[lookupResult.frame.viseme] ?? '#888', opacity: 0.3 + lookupResult.frame.weight * 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-jetbrains)', fontSize: 22, fontWeight: 700, color: '#fff' }}>
                      {lookupResult.frame.viseme}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'var(--t2)', marginBottom: 4 }}>
                        viseme: <strong style={{ color: 'var(--t1)' }}>{lookupResult.frame.viseme}</strong>
                      </div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'var(--t2)', marginBottom: 4 }}>
                        weight: <strong style={{ color: 'var(--t1)' }}>{lookupResult.frame.weight.toFixed(3)}</strong>
                      </div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'var(--t2)' }}>
                        frame.start_ms: {lookupResult.frame.start_ms} · duration: {lookupResult.frame.duration_ms}ms
                      </div>
                    </div>
                  </div>

                  {arkitNonZero.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t3)', marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        ARKit channels · top 8 active
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                        {arkitNonZero.map(([name, value]) => (
                          <div key={name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--font-jetbrains)', fontSize: 10 }}>
                            <span style={{ color: 'var(--t2)', minWidth: 140 }}>{name}</span>
                            <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${value * 100}%`, height: '100%', background: '#06b6d4' }} />
                            </div>
                            <span style={{ color: 'var(--t1)', minWidth: 38, textAlign: 'right' }}>{value.toFixed(3)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ padding: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t3)', marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Blueprint pseudocode · this is what your AnimGraph runs every frame
                </div>
                <pre style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t1)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
{`OnAvatarCommand(json):
  audioPositionMs = json.audioPositionMs    // optional, default -1
  sentenceIdx     = json.sentenceIdx        // optional, default -1

  IF audioPositionMs >= 0:                  // v4.0 client
    IF sentenceIdx != LastSentenceIdx:
      LastSentenceIdx = sentenceIdx
      ActiveTimeline  = json.viseme_timeline
    frameStepMs = ${lookupResult?.frameStepMs ?? 8}                        // dense ${lookupResult?.frameStepMs ?? 8}ms frames
    idx = Clamp(Floor(audioPositionMs / frameStepMs), 0, Len(ActiveTimeline)-1)
    activeFrame = ActiveTimeline[idx]       // Get(Array) — O(1) lookup
    ApplyBlendShape(activeFrame.viseme, activeFrame.weight, lerp=80ms)

  ELSE:                                     // v2/v3 fallback
    UseSelfTimingFromTotalDurationMs(json.total_duration_ms)`}
                </pre>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
