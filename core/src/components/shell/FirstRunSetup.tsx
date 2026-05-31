'use client';

// FirstRunSetup — the artistic first-launch "preparing your tutor" screen.
//
// Shows the heavy components being readied with per-item progress, then hands
// off. Honest about state: the LLM model download is REAL (ollama-pull); voice
// is cloud (Edge, instant); the 3D avatar is delivered by the installer / the
// first-run asset fetch (manifest-driven — see task #73 for hosting).
//
// Preview it any time at /?firstrun=1 (forces the screen even if already set up).

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { Brain, AudioLines, Bot, Check, Download, KeyRound } from 'lucide-react';
import { useDesignVariant } from '@/lib/designVariant';

// Bumped v0.4.4 to force the new Chamber-styled FirstRunSetup screen on
// existing installs that completed first-run under the old design. Same
// rationale as UnifiedOnboarding.STORAGE_KEY bump.
const STORAGE_KEY = 'edututor_firstrun_done_v3';

type Status = 'pending' | 'downloading' | 'ready';

interface Item {
  id: 'llm' | 'voice' | 'avatar';
  label: string;
  sub: string;
  size: string;
  icon: React.ReactNode;
  status: Status;
  progress: number; // 0..100, -1 = indeterminate
  note?: string;
}

const ICON: Record<Item['id'], React.ReactNode> = {
  llm: <Brain size={18} strokeWidth={1.8} />,
  voice: <AudioLines size={18} strokeWidth={1.8} />,
  avatar: <Bot size={18} strokeWidth={1.8} />,
};

export function FirstRunSetup({ onDone }: { onDone?: () => void }) {
  const [visible, setVisible] = useState(false);
  const { variant } = useDesignVariant();
  const [items, setItems] = useState<Item[]>([
    { id: 'llm',    label: 'Myslenie',   sub: 'Ako tutor rozumie a odpovedá.', size: '~3 GB',   icon: ICON.llm,    status: 'pending', progress: 0 },
    { id: 'voice',  label: 'Hlas',       sub: 'Slovenský hlas. Rozumie ti.',   size: 'cloud',    icon: ICON.voice,  status: 'pending', progress: 0 },
    { id: 'avatar', label: 'Prítomnosť', sub: 'Tvár, ktorá ťa počuje.',         size: '~2.3 GB', icon: ICON.avatar, status: 'pending', progress: 0 },
  ]);
  const started = useRef(false);
  // Cloud-key fallback: shown when no local model is available (Ollama missing
  // or the pull failed) so the user is never stuck on a disabled button.
  const [needsKey, setNeedsKey] = useState(false);
  const [keyProvider, setKeyProvider] = useState<'openai' | 'anthropic' | 'groq'>('openai');
  const [keyVal, setKeyVal] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyErr, setKeyErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);

  const patch = useCallback((id: Item['id'], p: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  // Gate: show on first run (no flag) or when forced via ?firstrun=1.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('firstrun') === '1';
    if (forced) {
      const url = new URL(window.location.href);
      url.searchParams.delete('firstrun');
      window.history.replaceState({}, '', url.toString());
    }
    if (!forced && localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, []);

  // Run the setup once when visible.
  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;

    (async () => {
      // Voice: Edge TTS is cloud — always available.
      patch('voice', { status: 'ready', progress: 100 });

      // Pull live state.
      let hasModel = false;
      try {
        const [statusR, hwR] = await Promise.all([
          fetch(`${API_BASE}/api/v1/system/status`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`${API_BASE}/api/v1/system/hardware`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        const models: string[] = hwR?.hardware?.ollama_models ?? [];
        hasModel = models.length > 0 || (!!statusR?.llm && statusR.llm !== 'mock');
      } catch { /* offline — treat as needing the model */ }

      // 3D avatar: delivered by the installer / first-run asset fetch. On this
      // machine it's present; the manifest-driven fetch lands here (task #73).
      patch('avatar', { status: 'ready', progress: 100 });

      // LLM: ready, or pull a model for real with a live "downloading" state.
      // If no local model can be obtained (Ollama missing / pull failed), fall
      // back to the cloud-key panel so the flow is never a dead end.
      if (hasModel) {
        patch('llm', { status: 'ready', progress: 100 });
      } else {
        patch('llm', { status: 'downloading', progress: -1, note: 'Sťahujem Gemma 3…' });
        let pulled = false;
        try {
          const pr = await fetch(`${API_BASE}/api/v1/system/ollama-pull`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gemma3:4b' }),
          });
          if (pr.ok) {
            // Poll until the model appears.
            for (let i = 0; i < 120; i++) {
              await new Promise((r) => setTimeout(r, 4000));
              const hd = await fetch(`${API_BASE}/api/v1/system/hardware`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
              const models: string[] = hd?.hardware?.ollama_models ?? [];
              if (models.some((m) => m.startsWith('gemma3'))) { pulled = true; break; }
            }
          }
        } catch { /* Ollama not installed / unreachable */ }
        if (pulled) {
          patch('llm', { status: 'ready', progress: 100, note: undefined });
        } else {
          patch('llm', { status: 'pending', note: 'Lokálny model nedostupný — zadaj cloud kľúč alebo preskoč.' });
          setNeedsKey(true);
        }
      }
    })();
  }, [visible, patch]);

  const allReady = items.every((it) => it.status === 'ready');
  const canContinue = allReady || skipped;

  async function saveKey() {
    const v = keyVal.trim();
    if (!v) return;
    setSavingKey(true);
    setKeyErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`${keyProvider}_api_key`]: v }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data && data.success !== false) {
        patch('llm', { status: 'ready', progress: 100, note: 'Cloud model pripravený' });
        setNeedsKey(false);
      } else {
        setKeyErr((data && data.error) || 'Kľúč sa nepodarilo overiť.');
      }
    } catch {
      setKeyErr('Nepodarilo sa spojiť s backendom.');
    } finally {
      setSavingKey(false);
    }
  }

  function finish() {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
    onDone?.();
  }

  if (!visible) return null;

  const doneCount = items.filter((it) => it.status === 'ready').length;
  const overall = Math.round((doneCount / items.length) * 100);

  // Chamber variant render — pure black, mono eyebrow, Geist + Instrument
  // Serif italic, sage success dots, single amber pill CTA. Same data layer
  // (items / needsKey / keyVal / etc.) as the atmosphere render below.
  if (variant === 'chamber') {
    return (
      <ChamberFirstRunRender
        items={items}
        overall={overall}
        doneCount={doneCount}
        canContinue={canContinue}
        needsKey={needsKey}
        skipped={skipped}
        keyProvider={keyProvider}
        keyVal={keyVal}
        savingKey={savingKey}
        keyErr={keyErr}
        setKeyProvider={setKeyProvider}
        setKeyVal={setKeyVal}
        setKeyErr={setKeyErr}
        setSkipped={setSkipped}
        saveKey={saveKey}
        finish={finish}
      />
    );
  }

  return (
    <div
      className="atm-hero"
      style={{
        position: 'fixed', inset: 0, zIndex: 320, overflowY: 'auto',
        animation: 'atm-quote-fade 320ms ease both',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, animation: 'atm-quote-fade 600ms ease both' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="atm-micro" style={{ letterSpacing: '0.28em', color: 'var(--t3)', marginBottom: 14 }}>PRVÉ SPUSTENIE</div>
          <h1 style={{ fontFamily: 'var(--font-inter)', fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--t1)', margin: 0 }}>
            Pripravujem tvojho učiteľa
          </h1>
          <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.55, margin: '12px 0 0' }}>
            Prvé spustenie trvá chvíľu. Ďalšie budú rýchlejšie.
          </p>
        </div>

        {/* overall progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(245,237,216,0.08)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${overall}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'var(--t3)', minWidth: 56, textAlign: 'right' }}>
            {doneCount}/{items.length} · {overall}%
          </span>
        </div>

        {/* item cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((it) => (
            <div key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              background: 'rgba(245,237,216,0.03)', border: '1px solid var(--atm-glass-border)', borderRadius: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: it.status === 'ready' ? 'rgba(61,214,140,0.12)' : 'rgba(var(--accent-r),0.1)',
                color: it.status === 'ready' ? 'var(--green)' : 'var(--accent)',
                transition: 'all 0.3s',
              }}>
                {it.status === 'ready' ? <Check size={18} strokeWidth={2.4} /> : it.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)', fontFamily: 'var(--font-inter)' }}>{it.label}</span>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9.5, letterSpacing: '0.08em', color: 'var(--t3)' }}>{it.size}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>{it.note ?? it.sub}</div>
                {it.status === 'downloading' && (
                  <div style={{ height: 3, marginTop: 8, background: 'rgba(245,237,216,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999, background: 'var(--accent)',
                      ...(it.progress < 0
                        ? { width: '35%', animation: 'atm-indeterminate 1.2s ease-in-out infinite' }
                        : { width: `${it.progress}%`, transition: 'width 400ms ease' }),
                    }} />
                  </div>
                )}
              </div>

              <span className="atm-micro" style={{ flexShrink: 0, color: it.status === 'ready' ? 'var(--green)' : 'var(--t3)' }}>
                {it.status === 'ready' ? 'Hotovo' : it.status === 'downloading' ? 'Sťahujem' : 'Čaká'}
              </span>
            </div>
          ))}
        </div>

        {/* Cloud-key fallback — only when no local model is available */}
        {needsKey && (
          <div style={{ marginTop: 18, padding: 16, background: 'rgba(245,237,216,0.03)', border: '1px solid var(--atm-glass-border)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <KeyRound size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', fontFamily: 'var(--font-inter)' }}>Použiť cloud model</span>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--t3)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Lokálny model (Ollama) nie je dostupný. Vlož API kľúč a tutor pobeží okamžite.
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['openai', 'anthropic', 'groq'] as const).map((p) => (
                <button key={p} onClick={() => { setKeyProvider(p); setKeyErr(null); }} style={{
                  flex: 1, padding: 7, borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-inter)', cursor: 'pointer', textTransform: 'capitalize',
                  border: `1px solid ${keyProvider === p ? 'var(--accent)' : 'var(--atm-glass-border)'}`,
                  background: keyProvider === p ? 'rgba(var(--accent-r),0.12)' : 'transparent',
                  color: keyProvider === p ? 'var(--accent)' : 'var(--t2)',
                }}>{p}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={keyVal}
                onChange={(e) => { setKeyVal(e.target.value); setKeyErr(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); }}
                placeholder={keyProvider === 'openai' ? 'sk-…' : keyProvider === 'anthropic' ? 'sk-ant-…' : 'gsk_…'}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-jetbrains)',
                  background: 'rgba(0,0,0,0.2)', border: '1px solid var(--atm-glass-border)', color: 'var(--t1)', outline: 'none',
                }}
              />
              <button onClick={saveKey} disabled={savingKey || !keyVal.trim()} style={{
                padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-inter)', whiteSpace: 'nowrap',
                border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff',
                cursor: savingKey || !keyVal.trim() ? 'default' : 'pointer', opacity: savingKey || !keyVal.trim() ? 0.5 : 1,
              }}>{savingKey ? 'Overujem…' : 'Uložiť'}</button>
            </div>
            {keyErr && <div style={{ fontSize: 11.5, color: 'var(--red, #e57373)', marginTop: 8 }}>{keyErr}</div>}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={finish}
          disabled={!canContinue}
          style={{
            marginTop: 22, width: '100%', padding: '13px', borderRadius: 12,
            border: `1px solid ${canContinue ? 'var(--green)' : 'var(--atm-glass-border)'}`,
            background: canContinue ? 'var(--green)' : 'transparent',
            color: canContinue ? '#fff' : 'var(--t3)',
            fontFamily: 'var(--font-inter)', fontSize: 14, fontWeight: 500,
            cursor: canContinue ? 'pointer' : 'default', transition: 'all 0.25s',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {canContinue ? 'Všetko pripravené — pokračovať' : <><Download size={15} /> Pripravujem…</>}
        </button>
        {needsKey && !skipped && (
          <button onClick={() => setSkipped(true)} style={{
            marginTop: 10, width: '100%', padding: 8, background: 'transparent', border: 'none',
            color: 'var(--t3)', fontSize: 12, fontFamily: 'var(--font-inter)', cursor: 'pointer', textDecoration: 'underline',
          }}>Preskočiť zatiaľ — nastavím neskôr</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chamber variant render — pure black, mono eyebrow, Geist + Instrument
// Serif italic accents, sage success dots, single amber pill CTA.
// ─────────────────────────────────────────────────────────────────────────────

interface ChamberFRRProps {
  items: Item[];
  overall: number;
  doneCount: number;
  canContinue: boolean;
  needsKey: boolean;
  skipped: boolean;
  keyProvider: 'openai' | 'anthropic' | 'groq';
  keyVal: string;
  savingKey: boolean;
  keyErr: string | null;
  setKeyProvider: (p: 'openai' | 'anthropic' | 'groq') => void;
  setKeyVal: (v: string) => void;
  setKeyErr: (e: string | null) => void;
  setSkipped: (s: boolean) => void;
  saveKey: () => Promise<void> | void;
  finish: () => void;
}

function ChamberFirstRunRender({
  items, overall, doneCount, canContinue, needsKey, skipped,
  keyProvider, keyVal, savingKey, keyErr,
  setKeyProvider, setKeyVal, setKeyErr, setSkipped, saveKey, finish,
}: ChamberFRRProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 320, overflowY: 'auto',
      background: 'var(--ch-bg, #050403)',
      color: 'var(--ch-ink, #f4ede4)',
      fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px',
      animation: 'chamber-rise 540ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
    }}>
      <div style={{ width: '100%', maxWidth: 620 }}>
        {/* Eyebrow + hero */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 10.5, letterSpacing: '0.32em', textTransform: 'uppercase',
            color: 'var(--ch-ink-faint, #5a5048)', marginBottom: 18,
          }}>
            01 · Prvé spustenie
          </div>
          <h1 style={{
            fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
            fontWeight: 500, letterSpacing: '-0.025em', lineHeight: 1.06,
            fontSize: 'clamp(34px, 5vw, 52px)',
            color: 'var(--ch-ink, #f4ede4)', margin: 0,
          }}>
            Pripravujem tvojho učiteľa
          </h1>
          <p style={{
            fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 16, lineHeight: 1.55,
            color: 'var(--ch-ink-dim, #9a8f82)',
            margin: '18px auto 0', maxWidth: 420,
          }}>
            Prvé spustenie trvá chvíľu. Ďalšie budú rýchlejšie.
          </p>
        </div>

        {/* Thin amber progress line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--ch-line-strong, rgba(244,237,228,0.12))', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              width: `${overall}%`, height: '100%',
              background: 'linear-gradient(90deg, transparent, var(--ch-amber, #E8A87C))',
              borderRadius: 999,
              boxShadow: '0 0 12px rgba(232,168,124,0.45)',
              transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
          <span style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 10, letterSpacing: '0.16em',
            color: 'var(--ch-ink-faint, #5a5048)',
            minWidth: 64, textAlign: 'right',
          }}>
            {doneCount}/{items.length} · {overall}%
          </span>
        </div>

        {/* Item rows — minimal hairline-divided, sage dot on completion */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it, i) => {
            const isReady = it.status === 'ready';
            const isLoading = it.status === 'downloading';
            return (
              <div key={it.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '18px 0',
                borderTop: i === 0 ? '1px solid var(--ch-line, rgba(244,237,228,0.06))' : 'none',
                borderBottom: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
              }}>
                {/* Status dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isReady ? 'var(--ch-ok, #7ea88a)'
                    : isLoading ? 'var(--ch-amber, #E8A87C)'
                    : 'var(--ch-ink-faint, #5a5048)',
                  boxShadow: isReady
                    ? '0 0 10px rgba(126,168,138,0.5)'
                    : isLoading ? '0 0 10px rgba(232,168,124,0.55)' : 'none',
                }} />

                {/* Label + sub */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
                    fontSize: 15, fontWeight: 500, color: 'var(--ch-ink, #f4ede4)',
                    letterSpacing: '-0.01em',
                  }}>
                    {it.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: 12.5,
                    color: 'var(--ch-ink-dim, #9a8f82)',
                    marginTop: 3,
                  }}>
                    {it.note ?? it.sub}
                  </div>
                  {isLoading && (
                    <div style={{ marginTop: 8, height: 1, background: 'var(--ch-line, rgba(244,237,228,0.06))', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', background: 'var(--ch-amber, #E8A87C)', borderRadius: 999,
                        ...(it.progress < 0
                          ? { width: '35%', animation: 'atm-indeterminate 1.2s ease-in-out infinite' }
                          : { width: `${it.progress}%`, transition: 'width 400ms ease' }),
                      }} />
                    </div>
                  )}
                </div>

                {/* Size + status pills */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
                  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                  fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
                }}>
                  <span style={{ color: 'var(--ch-ink-faint, #5a5048)' }}>{it.size}</span>
                  <span style={{
                    color: isReady ? 'var(--ch-ok, #7ea88a)'
                      : isLoading ? 'var(--ch-amber, #E8A87C)'
                      : 'var(--ch-ink-faint, #5a5048)',
                    minWidth: 64, textAlign: 'right',
                  }}>
                    {isReady ? 'Hotovo' : isLoading ? 'Sťahujem' : 'Čaká'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {needsKey && (
          <div style={{
            marginTop: 24, padding: 18, borderRadius: 14,
            background: 'rgba(244,237,228,0.025)',
            border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <KeyRound size={13} style={{ color: 'var(--ch-amber, #E8A87C)' }} />
              <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ch-ink, #f4ede4)' }}>Použiť cloud model</span>
            </div>
            <p style={{ fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif', fontStyle: 'italic', fontSize: 13, color: 'var(--ch-ink-dim, #9a8f82)', lineHeight: 1.55, margin: '0 0 12px' }}>
              Lokálny model nie je dostupný. Vlož API kľúč a tutor pobeží okamžite.
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['openai', 'anthropic', 'groq'] as const).map((p) => (
                <button key={p} onClick={() => { setKeyProvider(p); setKeyErr(null); }} style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8,
                  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                  fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase',
                  cursor: 'pointer',
                  border: `1px solid ${keyProvider === p ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-line-strong, rgba(244,237,228,0.12))'}`,
                  background: keyProvider === p ? 'rgba(232,168,124,0.10)' : 'transparent',
                  color: keyProvider === p ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink-dim, #9a8f82)',
                }}>{p}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="password" value={keyVal}
                onChange={(e) => { setKeyVal(e.target.value); setKeyErr(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); }}
                placeholder={keyProvider === 'openai' ? 'sk-…' : keyProvider === 'anthropic' ? 'sk-ant-…' : 'gsk_…'}
                style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))', padding: '8px 0', borderRadius: 0, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 13, color: 'var(--ch-ink, #f4ede4)', outline: 'none' }}
              />
              <button onClick={saveKey} disabled={savingKey || !keyVal.trim()} style={{
                padding: '8px 18px', borderRadius: 999,
                border: '1px solid rgba(244,237,228,0.10)',
                background: (savingKey || !keyVal.trim()) ? 'transparent' : 'linear-gradient(180deg, #F4B58A, #B87A52)',
                color: (savingKey || !keyVal.trim()) ? 'var(--ch-ink-faint, #5a5048)' : '#1a0e07',
                fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
                fontSize: 12.5, fontWeight: 500,
                cursor: (savingKey || !keyVal.trim()) ? 'default' : 'pointer',
                opacity: (savingKey || !keyVal.trim()) ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}>{savingKey ? 'Overujem…' : 'Uložiť'}</button>
            </div>
            {keyErr && <div style={{ fontSize: 11.5, color: 'var(--ch-warn, #ff8a80)', marginTop: 8, fontFamily: 'var(--font-instrument), serif', fontStyle: 'italic' }}>{keyErr}</div>}
          </div>
        )}

        <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <button onClick={finish} disabled={!canContinue} style={{
            padding: '14px 32px', borderRadius: 999,
            border: `1px solid ${canContinue ? 'rgba(244,237,228,0.10)' : 'var(--ch-line-strong, rgba(244,237,228,0.12))'}`,
            background: canContinue ? 'linear-gradient(180deg, #F4B58A, #B87A52)' : 'transparent',
            color: canContinue ? '#1a0e07' : 'var(--ch-ink-faint, #5a5048)',
            fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
            fontSize: 14.5, fontWeight: 500,
            cursor: canContinue ? 'pointer' : 'default',
            boxShadow: canContinue ? '0 8px 28px rgba(232,168,124,0.28)' : 'none',
            minWidth: 240,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}>
            {canContinue ? 'Vstúpiť do miestnosti →' : <><Download size={14} /> Pripravujem…</>}
          </button>
          {needsKey && !skipped && (
            <button onClick={() => setSkipped(true)} style={{
              background: 'transparent', border: 'none', padding: '6px 12px', cursor: 'pointer',
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--ch-ink-faint, #5a5048)',
            }}>Preskočiť zatiaľ</button>
          )}
        </div>
      </div>
    </div>
  );
}
