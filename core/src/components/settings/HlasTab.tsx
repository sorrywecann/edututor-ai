'use client';

// HlasTab — TTS provider picker + cloud BYOK + local install. v0.9.x.
//
// Reads /api/v1/tts/providers for the dispatch list + availability. Per-
// provider config:
//   • ElevenLabs → API key row → POST /api/v1/system/config { elevenlabs_api_key }
//   • Azure TTS  → key + region pair  → POST /api/v1/system/config { azure_speech_key, azure_speech_region }
//   • OpenAI TTS → info row (reuses LLM tab's OPENAI_API_KEY — no second input)
//   • Piper      → InstallButton wired to POST /api/v1/tts/install/start
//                  + EventSource on /api/v1/tts/install/stream
//   • Kokoro     → hidden (KOKORO_LANG_MAP has no `sk` entry per contract)

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { PillBtn } from './primitives';
import { ProviderKeyRow } from './ProviderKeyRow';
import { useSettingsCtx } from './SettingsContext';
import { TabShell } from './TabShell';
import { SaveBar, SaveStatusPill } from './SaveBar';

interface TTSProviderInfo {
  id: string;
  label: string;
  available: boolean;
  needs_key?: string | null;
  voices?: { id: string; name: string; lang: string }[];
}

interface Voice { id: string; name: string; lang: string; provider: string }

// Display order + Slovak label/blurb for each known provider. Actual list is
// driven by the backend response so new providers appear automatically.
const PROVIDER_META: Record<string, { label: string; blurb: string; defaultVoice?: string }> = {
  edge:      { label: 'Edge TTS',  blurb: 'Microsoft Edge cloud voices. Zdarma, neutrálna kvalita.', defaultVoice: 'sk-SK-LukasNeural' },
  elevenlabs:{ label: 'ElevenLabs', blurb: 'Premium klonovanie hlasov. Najlepšia kvalita.' },
  omnivoice: { label: 'OmniVoice', blurb: 'Lokálne klonovanie hlasu, 646 jazykov.', defaultVoice: 'omnivoice_sk' },
  piper:     { label: 'Piper',     blurb: 'Lokálne offline modely. Stabilné, nízka latencia.', defaultVoice: 'sk_SK-lili-medium' },
  openai:    { label: 'OpenAI TTS', blurb: 'OpenAI cloud TTS. Vyžaduje API kľúč.' },
  google:    { label: 'Google TTS', blurb: 'Google Cloud TTS. Vyžaduje credentials.json.' },
  azure:     { label: 'Azure TTS',  blurb: 'Azure Cognitive Speech. Audio-anchored visemes.' },
  // kokoro intentionally absent — hidden when target lang is Slovak.
};

// Providers that are hidden in the Slovak build because no SK voice exists
// in the contract dispatch table. Re-enable if we ever ship a non-SK UI.
const HIDDEN_PROVIDERS = new Set<string>(['kokoro']);

// Fallback when /tts/providers endpoint isn't up (old backend).
const FALLBACK_PROVIDERS: TTSProviderInfo[] = [
  { id: 'edge',       label: 'Edge TTS',   available: true },
  { id: 'elevenlabs', label: 'ElevenLabs', available: false, needs_key: 'elevenlabs_api_key' },
  { id: 'azure',      label: 'Azure TTS',  available: false, needs_key: 'azure_speech_key' },
  { id: 'openai',     label: 'OpenAI TTS', available: false, needs_key: 'openai_api_key' },
  { id: 'piper',      label: 'Piper',      available: false },
];

const PIPER_DEFAULT_VOICE = 'sk_SK-lili-medium';

export function HlasTab() {
  const { checks, setChecks } = useSettingsCtx();
  const [providers, setProviders] = useState<TTSProviderInfo[] | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoices, setSelectedVoices] = useState<Record<string, string>>({});
  const [defaultProvider, setDefaultProvider] = useState<string>('edge');
  // v0.8.5: tab-level last-saved indicator so the user gets persistent
  // confirmation after any per-row save (ElevenLabs / Azure / OpenAI / Piper).
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [defaultSaved, setDefaultSaved] = useState(false);

  function refreshChecks() {
    fetch(`${API_BASE}/api/v1/system/check`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(ch => { if (ch) setChecks(ch); });
  }

  // Tab-level onSaved — child rows call this after a successful save.
  function bumpSaved() {
    setLastSavedAt(Date.now());
    refreshChecks();
  }

  // When user clicks the default-provider radio we POST it to the backend.
  // Mirrors the LLM tab's instant-apply behaviour.
  async function applyDefaultProvider(id: string) {
    setDefaultProvider(id);
    try {
      await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_tts_provider: id }),
      });
      setDefaultSaved(true);
      setLastSavedAt(Date.now());
    } catch { /* offline — silent */ }
  }

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/tts/providers`)
      .then(r => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.providers)) {
          setProviders(d.providers as TTSProviderInfo[]);
          if (d.default) setDefaultProvider(String(d.default));
        } else if (Array.isArray(d)) {
          setProviders(d as TTSProviderInfo[]);
        } else {
          setProviders(FALLBACK_PROVIDERS);
        }
      })
      .catch(() => setProviders(FALLBACK_PROVIDERS));

    fetch(`${API_BASE}/api/v1/tts/voices`)
      .then(r => (r.ok ? r.json() : []))
      .then((vs: Voice[]) => { if (Array.isArray(vs)) setVoices(vs); })
      .catch(() => {});
  }, []);

  function voicesFor(providerId: string): Voice[] {
    return voices.filter(v => v.provider === providerId);
  }

  function previewVoice(_providerId: string, _voiceId?: string) {
    // Placeholder — voice preview wiring lives in a separate W6 piece.
  }

  const list = (providers ?? FALLBACK_PROVIDERS).filter(p => !HIDDEN_PROVIDERS.has(p.id));

  return (
    <TabShell title="Hlas" sub="Ako tvoj tutor znie.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {list.map(p => {
          const meta = PROVIDER_META[p.id] || { label: p.label, blurb: '' };
          const available = p.available;
          const providerVoices = voicesFor(p.id);
          const selected = selectedVoices[p.id] ?? meta.defaultVoice ?? providerVoices[0]?.id ?? '';

          const statusText = available ? 'Pripojené' : 'Nepripojené';
          const statusColor = available ? 'var(--ch-ok, #7ea88a)' : 'var(--ch-ink-faint, #5a5048)';
          const dotColor = available ? 'var(--ch-ok, #7ea88a)' : 'transparent';
          const dotBorder = available ? 'none' : '1px solid var(--ch-ink-faint, #5a5048)';

          return (
            <div key={p.id} style={{
              padding: '16px 18px', borderRadius: 12,
              border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
              background: 'rgba(244,237,228,0.02)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <input type="radio" name="tts-default" value={p.id}
                    checked={defaultProvider === p.id}
                    onChange={() => applyDefaultProvider(p.id)}
                    disabled={!available}
                    style={{ marginRight: 8, accentColor: 'var(--ch-amber, #E8A87C)' }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
                    fontSize: 14, fontWeight: 500,
                    color: 'var(--ch-ink, #f4ede4)',
                  }}>{meta.label}</span>
                  <div style={{
                    marginTop: 4,
                    fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
                    fontSize: 11.5, color: 'var(--ch-ink-dim, #9a8f82)', lineHeight: 1.5,
                  }}>
                    {meta.blurb}
                  </div>
                </div>
                <span style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                  fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: statusColor,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: dotColor, border: dotBorder,
                  }} />
                  {statusText}
                </span>
              </div>

              {providerVoices.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select
                    value={selected}
                    onChange={(e) => setSelectedVoices(prev => ({ ...prev, [p.id]: e.target.value }))}
                    style={{
                      flex: 1, padding: '7px 11px', boxSizing: 'border-box',
                      background: 'rgba(244,237,228,0.02)',
                      border: '1px solid var(--ch-line, rgba(244,237,228,0.08))',
                      borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
                      fontSize: 12.5, color: 'var(--ch-ink, #f4ede4)', outline: 'none',
                    }}
                  >
                    {providerVoices.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <PillBtn onClick={() => previewVoice(p.id, selected)} small>
                    Ukážka
                  </PillBtn>
                </div>
              )}

              {/* Per-provider config affordance. */}
              {p.id === 'elevenlabs' && (
                <ProviderKeyRow
                  label="API kľúč"
                  placeholder="Vlož ElevenLabs API kľúč"
                  field="elevenlabs_api_key"
                  connected={!!checks?.tts?.elevenlabs?.available}
                  onSaved={bumpSaved}
                />
              )}

              {p.id === 'azure' && (
                <AzureKeyRow
                  connected={!!checks?.tts?.azure?.available}
                  onSaved={bumpSaved}
                />
              )}

              {p.id === 'openai' && <OpenAIReuseRow />}

              {p.id === 'piper' && (
                <PiperInstallRow
                  installed={available}
                  onInstalled={bumpSaved}
                />
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: 11, color: 'var(--ch-ink-faint, #5a5048)', lineHeight: 1.55,
      }}>
        <span>Predvolený provider je vyznačený rádiom vľavo. Ukážka prehrá krátku frázu vybraným hlasom (pripravujeme).</span>
        <SaveStatusPill
          visible={defaultSaved}
          ttlMs={3000}
          onExpire={() => setDefaultSaved(false)}
        />
      </div>

      {/* Tab-level SaveBar: per-row "Overiť" buttons write keys through
          immediately, but the user explicitly asked for a visible bottom
          "Uložiť" affordance. This SaveBar re-runs /system/check and
          broadcasts providers-changed so the chat page picks up the latest
          state — and shows persistent "Uložené pred N s" confirmation. */}
      <SaveBar
        dirty={lastSavedAt == null}
        saving={false}
        onSave={() => {
          refreshChecks();
          setLastSavedAt(Date.now());
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('edututor:providers-changed'));
          }
        }}
        lastSavedAt={lastSavedAt}
      />
    </TabShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AzureKeyRow — two-input variant of ProviderKeyRow (key + region).
// Posts both fields in a single /system/config call.
// ─────────────────────────────────────────────────────────────────────────────
function AzureKeyRow({ connected, onSaved }: { connected: boolean; onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [region, setRegion] = useState('westeurope');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!key.trim()) return;
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          azure_speech_key: key.trim(),
          azure_speech_region: region.trim() || 'westeurope',
        }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.success !== false) {
        setKey('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        onSaved();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('edututor:providers-changed'));
        }
      } else {
        setErr((data && data.error) || 'Kľúč zlyhal');
      }
    } catch { setErr('Spojenie zlyhalo'); }
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    background: 'transparent', textAlign: 'left',
    border: 'none', borderBottom: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
    padding: '8px 0', borderRadius: 0,
    fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
    fontSize: 13, color: 'var(--ch-ink, #f4ede4)', outline: 'none',
    transition: 'border-bottom-color 0.15s', width: '100%',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr auto', alignItems: 'center', gap: 18 }}>
      <div>
        <div style={{
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 10.5, letterSpacing: '0.20em', textTransform: 'uppercase',
          color: 'var(--ch-ink-dim, #9a8f82)',
        }}>
          Azure kľúč
        </div>
        <div style={{
          marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: connected ? 'var(--ch-ok, #7ea88a)' : 'var(--ch-ink-faint, #5a5048)',
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: connected ? 'var(--ch-ok, #7ea88a)' : 'transparent',
            border: connected ? 'none' : '1px solid var(--ch-ink-faint, #5a5048)',
          }} />
          {connected ? 'Pripojené' : 'Nepripojené'}
        </div>
      </div>
      <input
        type="password" value={key} placeholder="Subscription Key"
        onChange={(e) => { setKey(e.target.value); setErr(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-amber, #E8A87C)'; }}
        onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-line-strong, rgba(244,237,228,0.12))'; }}
        style={inputStyle}
      />
      <input
        type="text" value={region} placeholder="westeurope"
        onChange={(e) => { setRegion(e.target.value); setErr(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-amber, #E8A87C)'; }}
        onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-line-strong, rgba(244,237,228,0.12))'; }}
        style={inputStyle}
      />
      <PillBtn onClick={save} disabled={saving || !key.trim()} small>
        {saving ? 'Overujem…' : saved ? '✓ Uložené' : 'Overiť'}
      </PillBtn>
      {err && <div style={{ gridColumn: '2 / -1', fontSize: 11, color: 'var(--ch-warn, #D4845A)' }}>{err}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAIReuseRow — pure-info row. No input; reuses OPENAI_API_KEY from LLM tab.
// ─────────────────────────────────────────────────────────────────────────────
function OpenAIReuseRow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', borderRadius: 8,
      background: 'rgba(232,168,124,0.05)',
      border: '1px solid rgba(232,168,124,0.18)',
    }}>
      <span style={{
        flexShrink: 0, marginTop: 1,
        width: 5, height: 5, borderRadius: '50%',
        background: 'var(--ch-amber, #E8A87C)',
        boxShadow: '0 0 6px rgba(232,168,124,0.55)',
      }} />
      <div style={{
        fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: 12, color: 'var(--ch-ink-dim, #9a8f82)', lineHeight: 1.55,
      }}>
        Použije rovnaký kľúč ako OpenAI LLM. Nastav v záložke <span style={{ color: 'var(--ch-ink, #f4ede4)' }}>LLM</span>.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PiperInstallRow — single amber CTA → 1px progress line. Wires to
// POST /api/v1/tts/install/start then EventSource on /api/v1/tts/install/stream
// (matches the locked v0.9.x contract; events: progress / done / error).
// ─────────────────────────────────────────────────────────────────────────────
function PiperInstallRow({ installed, onInstalled }: { installed: boolean; onInstalled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState<string>('');
  const [bytesDone, setBytesDone] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [speed, setSpeed] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => { esRef.current?.close(); esRef.current = null; };
  }, []);

  function attachStream(taskId: string) {
    try { esRef.current?.close(); } catch { /* noop */ }
    const url = `${API_BASE}/api/v1/tts/install/stream?task_id=${encodeURIComponent(taskId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('progress', (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (typeof d.percent === 'number') setPercent(d.percent);
        if (typeof d.bytes_done === 'number') setBytesDone(d.bytes_done);
        if (typeof d.bytes_total === 'number') setBytesTotal(d.bytes_total);
        if (typeof d.speed === 'string') setSpeed(d.speed);
        if (typeof d.stage === 'string') setStage(d.stage);
      } catch { /* ignore malformed */ }
    });
    es.addEventListener('done', () => {
      setPercent(100); setDone(true); setBusy(false);
      es.close(); esRef.current = null;
      onInstalled();
    });
    es.addEventListener('error', (e: MessageEvent) => {
      let msg = 'Sťahovanie zlyhalo';
      try { const d = JSON.parse((e as MessageEvent).data); if (d?.error) msg = String(d.error); } catch { /* ignore */ }
      setErr(msg); setBusy(false);
      es.close(); esRef.current = null;
    });
  }

  async function startInstall() {
    setBusy(true); setErr(null); setDone(false);
    setPercent(0); setStage(''); setBytesDone(0); setBytesTotal(0); setSpeed('');
    try {
      const r = await fetch(`${API_BASE}/api/v1/tts/install/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'piper', voice: PIPER_DEFAULT_VOICE }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || data?.success === false || !data?.task_id) {
        setErr((data && data.error) || 'Nepodarilo sa spustiť');
        setBusy(false);
        return;
      }
      attachStream(String(data.task_id));
    } catch {
      setErr('Spojenie zlyhalo'); setBusy(false);
    }
  }

  const isReady = installed || done;

  // Stage label in Slovak.
  const stageLabel = stage === 'downloading' ? 'Sťahujem'
    : stage === 'extracting' ? 'Rozbaľujem'
    : stage === 'verifying' ? 'Overujem' : '';

  const fmtMB = (b: number) => `${(b / (1 << 20)).toFixed(1)} MB`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto',
        alignItems: 'center', gap: 18,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 10.5, letterSpacing: '0.20em', textTransform: 'uppercase',
            color: 'var(--ch-ink-dim, #9a8f82)',
          }}>
            Slovenský hlas
          </div>
          <div style={{
            marginTop: 4,
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 11.5,
            color: isReady ? 'var(--ch-ok, #7ea88a)' : 'var(--ch-ink-dim, #9a8f82)',
          }}>
            {PIPER_DEFAULT_VOICE}
          </div>
        </div>

        {isReady ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--ch-ok, #7ea88a)',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ch-ok, #7ea88a)' }} />
            ✓ Nainštalované
          </span>
        ) : (
          <PillBtn onClick={startInstall} disabled={busy} small>
            {busy ? 'Sťahujem…' : 'Nainštalovať'}
          </PillBtn>
        )}
      </div>

      {(busy || err) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* 1px progress line — mirrors ChamberStepDownloading minimalism. */}
          <div style={{
            position: 'relative', width: '100%', height: 1,
            background: 'rgba(244,237,228,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${err ? 100 : percent}%`,
              background: err
                ? 'var(--ch-warn, #D4845A)'
                : 'linear-gradient(90deg, #F4B58A, #E8A87C, #B87A52)',
              transition: 'width 0.4s ease',
              boxShadow: err ? 'none' : '0 0 8px rgba(232,168,124,0.45)',
            }} />
          </div>
          <div style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 10.5, letterSpacing: '0.10em',
            color: err ? 'var(--ch-warn, #D4845A)' : 'var(--ch-ink-dim, #9a8f82)',
          }}>
            {err ? err : (
              <>
                {stageLabel ? `${stageLabel} · ` : ''}{percent}%
                {bytesTotal > 0 && <> · {fmtMB(bytesDone)} / {fmtMB(bytesTotal)}</>}
                {speed && <> · {speed}</>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
