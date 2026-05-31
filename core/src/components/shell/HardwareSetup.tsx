'use client';

import { useState, useEffect, useCallback } from 'react';
import { TutorPicker, TUTORS, type TutorId } from '@/components/shell/TutorPicker';
import { BackendsPanel } from '@/components/shell/hardware-setup/BackendsPanel';
import { InstallPanel } from '@/components/shell/hardware-setup/InstallPanel';
import { PersonaPanel } from '@/components/shell/hardware-setup/PersonaPanel';

import { API_BASE } from '@/lib/config';
import { detectClientOS, clientOSToQueryString } from '@/lib/detectClientOS';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HardwareInfo {
  ram_gb: number; cpu_brand: string; is_apple_silicon: boolean;
  gpu_available: boolean; gpu_backend: string | null; gpu_name: string | null;
  gpu_vram_gb: number | null; platform: string; ollama_models: string[];
}
interface ProfileRecommended {
  stt: { recommended: string; why: string; alternatives?: string[] };
  llm: { recommended: string; model?: string; why: string; local_option?: string; alternatives?: string[] };
  tts: { recommended: string; voice?: string; why: string; local_option?: string; upgrade?: string };
  install?: string[];
  streaming_architecture?: { description: string; total_latency: string };
}
interface HardwareResponse {
  hardware: HardwareInfo; profile: string; profile_label: string;
  profile_description: string; recommended: ProfileRecommended;
}
interface ProviderCheck { available: boolean; reason: string; fix?: string; models?: string[] }
interface Checks {
  stt: Record<string, ProviderCheck>;
  llm: Record<string, ProviderCheck>;
  tts: Record<string, ProviderCheck>;
}
interface ActiveStatus {
  stt: string | null; llm: string | null; llm_model: string | null;
  tts: string | null; is_optimal: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  minimal: '#64748b', standard: '#6366f1', performance: '#CB8A82',
  power: '#f59e0b', server: '#ef4444',
};
const TIER_NUM: Record<string, string> = {
  minimal: '01', standard: '02', performance: '03', power: '04', server: '05',
};

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function MicIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="1" width="5" height="7.5" rx="2.5"/><path d="M2 6.5c0 2.76 2.24 5 5 5s5-2.24 5-5"/><line x1="7" y1="11.5" x2="7" y2="13"/></svg>;
}
function ChipIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.2"/><path d="M5.5 3V1.5M8.5 3V1.5M5.5 12.5V11M8.5 12.5V11"/><path d="M11 5.5h1.5M11 8.5h1.5M1.5 5.5H3M1.5 8.5H3"/></svg>;
}
function SpeakerIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5h2.5L8 2v10L4.5 9H2V5z"/><path d="M10 4.5c1.1.9 1.8 2.2 1.8 3.5s-.7 2.6-1.8 3.5"/></svg>;
}
function CloseIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>;
}
function CheckIcon() {
  return <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5,4.5 3.5,6.5 7.5,2"/></svg>;
}

const SERVICES = [
  { key: 'stt' as const, label: 'STT', sublabel: 'Rozpoznávanie reči', Icon: MicIcon },
  { key: 'llm' as const, label: 'LLM', sublabel: 'Jazykový model',      Icon: ChipIcon },
  { key: 'tts' as const, label: 'TTS', sublabel: 'Syntéza hlasu',       Icon: SpeakerIcon },
];

type Tab = 'overview' | 'details' | 'install' | 'providers' | 'persona';

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ check, size = 7 }: { check?: ProviderCheck; size?: number }) {
  if (!check) return null;
  const color = check.available ? '#22c55e' : '#ef4444';
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'inline-block', flexShrink: 0,
      boxShadow: check.available ? `0 0 5px ${color}70` : 'none',
    }} />
  );
}

// ─── API key field ────────────────────────────────────────────────────────────

function KeyInput({
  label, placeholder, value, onChange, onSave, saving, saved, error,
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; onSave: () => void;
  saving: boolean; saved: boolean; error: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="password"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '8px 10px',
            background: 'var(--bg)', border: '1px solid var(--atm-glass-border)',
            borderRadius: 8, fontSize: 11,
            fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em',
            color: 'var(--t1)', outline: 'none',
          }}
          onKeyDown={e => e.key === 'Enter' && onSave()}
        />
        <button
          onClick={onSave}
          disabled={saving || !value.trim()}
          style={{
            padding: '8px 14px', flexShrink: 0,
            background: saved ? '#22c55e18' : 'var(--raised)',
            border: `1px solid ${saved ? '#22c55e40' : 'var(--border)'}`,
            borderRadius: 8,
            fontFamily: 'var(--font-jetbrains)', fontSize: 9,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: saved ? '#22c55e' : 'var(--t2)',
            cursor: saving || !value.trim() ? 'default' : 'pointer',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          {saving ? '…' : saved ? <><CheckIcon /> Uložené</> : 'Uložiť'}
        </button>
      </div>
      {error && (
        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: '#ef4444', letterSpacing: '0.04em' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TUTOR_STORAGE_KEY = 'edututor-tutor';

export function HardwareSetup({ onDismiss, isFirstRun = false }: { onDismiss: () => void; isFirstRun?: boolean }) {
  const [tutor, setTutorLocal] = useState<TutorId>(() => (typeof window !== 'undefined' ? localStorage.getItem(TUTOR_STORAGE_KEY) as TutorId : null) || 'lukas');
  const handleTutorChange = useCallback((id: TutorId) => {
    setTutorLocal(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(TUTOR_STORAGE_KEY, id);
  }, []);
  const [data,     setData]     = useState<HardwareResponse | null>(null);
  const [checks,   setChecks]   = useState<Checks | null>(null);
  const [status,   setStatus]   = useState<ActiveStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [tab,      setTab]      = useState<Tab>('overview');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Apply
  const [applying, setApplying] = useState(false);
  const [applied,  setApplied]  = useState<{ stt?: string; llm?: string; tts?: string; warnings?: string[] } | null>(null);

  // Copy install
  const [copied,   setCopied]   = useState(false);

  // API keys
  const [openaiKey,    setOpenaiKey]    = useState('');
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [savedOpenai,  setSavedOpenai]  = useState(false);
  const [keyError,     setKeyError]     = useState('');

  const [anthropicKey,    setAnthropicKey]    = useState('');
  const [savingAnthropic, setSavingAnthropic] = useState(false);
  const [savedAnthropic,  setSavedAnthropic]  = useState(false);
  const [anthropicError,  setAnthropicError]  = useState('');

  const [groqKey,    setGroqKey]    = useState('');
  const [savingGroq, setSavingGroq] = useState(false);
  const [savedGroq,  setSavedGroq]  = useState(false);
  const [groqError,  setGroqError]  = useState('');

  // Lipsync
  const [lipsyncProvider, setLipsyncProvider] = useState<string>('text');
  const [lipsyncSidecarOk, setLipsyncSidecarOk] = useState(false);
  const [switchingLipsync, setSwitchingLipsync] = useState(false);

  async function refreshLipsyncStatus() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/lipsync/status`);
      if (r.ok) {
        const d = await r.json();
        setLipsyncProvider(d.active || 'text');
        setLipsyncSidecarOk(d.providers?.audio2lipsync?.available ?? false);
      }
    } catch {}
  }

  async function switchLipsync(provider: string) {
    setSwitchingLipsync(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/lipsync/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await r.json();
      if (d.success) {
        setLipsyncProvider(provider);
      }
    } catch {}
    setSwitchingLipsync(false);
  }

  // Emotion detection backend
  const [emotionBackend, setEmotionBackend] = useState<string>('regex');
  const [bertAvailable, setBertAvailable] = useState(false);
  const [bertReason, setBertReason] = useState<string>('');
  const [switchingEmotion, setSwitchingEmotion] = useState(false);

  async function refreshEmotionStatus() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/emotion/status`);
      if (r.ok) {
        const d = await r.json();
        setEmotionBackend(d.active || 'regex');
        setBertAvailable(d.backends?.bert?.available ?? false);
        setBertReason(d.backends?.bert?.reason || '');
      }
    } catch {}
  }

  async function switchEmotion(backend: string) {
    setSwitchingEmotion(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/emotion/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend }),
      });
      const d = await r.json();
      if (d.success) {
        setEmotionBackend(backend);
      }
    } catch {}
    setSwitchingEmotion(false);
  }

  // Custom LLM providers
  interface LLMModel { id: string; name: string; provider: string; available: boolean }
  const [llmModels, setLlmModels] = useState<LLMModel[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [provName, setProvName] = useState('');
  const [provUrl, setProvUrl] = useState('');
  const [provKey, setProvKey] = useState('');
  const [provModel, setProvModel] = useState('');
  const [provSaving, setProvSaving] = useState(false);
  const [provError, setProvError] = useState('');
  const [presetTemplate, setPresetTemplate] = useState<string>('');

  async function refetchLlmModels() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/llm/models`);
      if (r.ok) {
        const d = await r.json();
        setLlmModels(d.models || []);
      }
    } catch {}
  }

  useEffect(() => {
    if (tab === 'providers') {
      refetchLlmModels();
      refreshLipsyncStatus();
      refreshEmotionStatus();
    }
  }, [tab]);

  const PRESETS: { id: string; name: string; url: string; placeholderModel: string }[] = [
    { id: 'openrouter',  name: 'OpenRouter',   url: 'https://openrouter.ai/api/v1',           placeholderModel: 'anthropic/claude-3.5-sonnet' },
    { id: 'anthropic',   name: 'Anthropic',    url: 'https://api.anthropic.com/v1',           placeholderModel: 'claude-3-5-sonnet-20241022' },
    { id: 'openai',      name: 'OpenAI',       url: 'https://api.openai.com/v1',              placeholderModel: 'gpt-4o-mini' },
    { id: 'groq',        name: 'Groq',         url: 'https://api.groq.com/openai/v1',         placeholderModel: 'llama-3.3-70b-versatile' },
    { id: 'together',    name: 'Together AI',  url: 'https://api.together.xyz/v1',            placeholderModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
    { id: 'mistral',     name: 'Mistral AI',   url: 'https://api.mistral.ai/v1',              placeholderModel: 'mistral-large-latest' },
    { id: 'deepseek',    name: 'DeepSeek',     url: 'https://api.deepseek.com/v1',            placeholderModel: 'deepseek-chat' },
    { id: 'xai',         name: 'xAI (Grok)',   url: 'https://api.x.ai/v1',                    placeholderModel: 'grok-2-latest' },
    { id: 'gemini',      name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', placeholderModel: 'gemini-2.0-flash-exp' },
    { id: 'deepinfra',   name: 'DeepInfra',    url: 'https://api.deepinfra.com/v1/openai',    placeholderModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
    { id: 'fireworks',   name: 'Fireworks',    url: 'https://api.fireworks.ai/inference/v1',  placeholderModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct' },
    { id: 'perplexity',  name: 'Perplexity',   url: 'https://api.perplexity.ai',              placeholderModel: 'llama-3.1-sonar-large-128k-online' },
    { id: 'cerebras',    name: 'Cerebras',     url: 'https://api.cerebras.ai/v1',             placeholderModel: 'llama3.3-70b' },
    { id: 'custom',      name: 'Vlastný',      url: '',                                       placeholderModel: '' },
  ];

  function applyPreset(presetId: string) {
    setPresetTemplate(presetId);
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    if (preset.id !== 'custom') {
      setProvName(preset.name);
      setProvUrl(preset.url);
      setProvModel(preset.placeholderModel);
    }
  }

  async function saveProvider() {
    if (!provName.trim() || !provUrl.trim() || !provModel.trim()) {
      setProvError('Vyplň všetky polia okrem API kľúča.');
      return;
    }
    setProvSaving(true);
    setProvError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_llm_name: provName.trim(),
          custom_llm_url: provUrl.trim(),
          custom_llm_key: provKey.trim() || undefined,
          custom_llm_model: provModel.trim(),
        }),
      });
      const d = await res.json();
      if (d.success) {
        setProvName(''); setProvUrl(''); setProvKey(''); setProvModel('');
        setPresetTemplate(''); setShowAddProvider(false);
        await refetchLlmModels();
        window.dispatchEvent(new Event('edututor:providers-changed'));
      } else {
        setProvError(d.error || 'Uloženie zlyhalo.');
      }
    } catch {
      setProvError('Backend je nedostupný.');
    } finally {
      setProvSaving(false);
    }
  }

  async function activateProvider(providerId: string) {
    try {
      await fetch(`${API_BASE}/api/v1/llm/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId }),
      });
      const st = await fetch(`${API_BASE}/api/v1/system/status`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (st) setStatus(st);
    } catch {}
  }


  // ── Fetch hardware + checks + status in parallel ───────────────────────────
  useEffect(() => {
    const osHint = clientOSToQueryString(detectClientOS());
    Promise.all([
      fetch(`${API_BASE}/api/v1/system/hardware${osHint}`).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/v1/system/check`).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/v1/system/status`).then(r => r.ok ? r.json() : null),
    ])
      .then(([hw, ch, st]) => {
        if (hw) setData(hw); else setError(true);
        if (ch) setChecks(ch);
        if (st) setStatus(st);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Re-fetch checks + status
  async function refreshChecks() {
    const [ch, st] = await Promise.all([
      fetch(`${API_BASE}/api/v1/system/check`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_BASE}/api/v1/system/status`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (ch) setChecks(ch);
    if (st) setStatus(st);
  }

  // ── Save OpenAI key ─────────────────────────────────────────────────────────
  async function saveOpenaiKey() {
    if (!openaiKey.trim()) return;
    setSavingOpenai(true);
    setKeyError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openai_api_key: openaiKey.trim() }),
      });
      const result = await res.json();
      if (!result.success) {
        setKeyError(result.error || 'Uloženie kľúča zlyhalo.');
      } else {
        setSavedOpenai(true);
        await refreshChecks();
        await refetchLlmModels();
        window.dispatchEvent(new Event('edututor:providers-changed'));
        setTimeout(() => setSavedOpenai(false), 3000);
      }
    } catch {
      setKeyError('Backend je nedostupný.');
    } finally {
      setSavingOpenai(false);
    }
  }

  async function saveAnthropicKey() {
    if (!anthropicKey.trim()) return;
    setSavingAnthropic(true);
    setAnthropicError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropic_api_key: anthropicKey.trim() }),
      });
      const result = await res.json();
      if (!result.success) {
        setAnthropicError(result.error || 'Uloženie kľúča zlyhalo.');
      } else {
        setSavedAnthropic(true);
        await refreshChecks();
        await refetchLlmModels();
        window.dispatchEvent(new Event('edututor:providers-changed'));
        setTimeout(() => setSavedAnthropic(false), 3000);
      }
    } catch {
      setAnthropicError('Backend je nedostupný.');
    } finally {
      setSavingAnthropic(false);
    }
  }

  async function saveGroqKey() {
    if (!groqKey.trim()) return;
    setSavingGroq(true);
    setGroqError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/system/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groq_api_key: groqKey.trim() }),
      });
      const result = await res.json();
      if (!result.success) {
        setGroqError(result.error || 'Uloženie kľúča zlyhalo.');
      } else {
        setSavedGroq(true);
        await refreshChecks();
        await refetchLlmModels();
        window.dispatchEvent(new Event('edututor:providers-changed'));
        setTimeout(() => setSavedGroq(false), 3000);
      }
    } catch {
      setGroqError('Backend je nedostupný.');
    } finally {
      setSavingGroq(false);
    }
  }

  // ── Apply config ────────────────────────────────────────────────────────────
  async function applyConfig() {
    if (!data || applying) return;
    setApplying(true);
    setApplied(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/system/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: data.profile }),
      });
      const result = await res.json();
      setApplied({ stt: result.applied?.stt, llm: result.applied?.llm, tts: result.applied?.tts, warnings: result.warnings });
      // Refresh status so the "Currently active" strip updates
      const st = await fetch(`${API_BASE}/api/v1/system/status`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (st) setStatus(st);
    } catch {
      setApplied({ warnings: ['Backend je nedostupný.'] });
    } finally {
      setApplying(false);
    }
  }

  function copyInstall() {
    if (!data?.recommended.install) return;
    navigator.clipboard.writeText(data.recommended.install.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const accent   = data ? (TIER_COLOR[data.profile] ?? '#6366f1') : '#6366f1';
  const tierNum  = data ? (TIER_NUM[data.profile]   ?? '—') : '—';

  // Is OpenAI recommended but key missing?
  const openaiRecommended = data?.recommended.llm.recommended === 'openai';
  const openaiAvailable   = checks?.llm?.openai?.available ?? true;
  const showKeyInput      = openaiRecommended && !openaiAvailable && !savedOpenai;

  // Is ANY LLM available?
  const anyLlmAvailable = checks
    ? Object.values(checks.llm).some(c => c.available)
    : true;

  // Is current config already optimal? (server-computed, cleared if user just applied)
  const isOptimal = (status?.is_optimal ?? false) && !applied;

  return (
    <div
      className="atm-hero"
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div
        className="atm-glass"
        style={{
          width: 600, maxHeight: '86vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >

        {/* ── Header ── */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--atm-glass-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                border: `1px solid ${accent}40`, background: `${accent}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, letterSpacing: '0.04em', color: accent, fontWeight: 600 }}>{tierNum}</span>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.025em' }}>
                  {isFirstRun ? 'Vitaj v EduTutore' : 'Hardvérové nastavenie'}
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginTop: 2 }}>
                  {loading ? 'Analyzujem systém…'
                    : error ? 'Backend je offline'
                    : isFirstRun ? `Zistené: ${data?.hardware.cpu_brand} — skontroluj konfiguráciu`
                    : `${data?.profile_label} · ${data?.hardware.cpu_brand}`}
                </div>
              </div>
            </div>
            <button onClick={onDismiss} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--t3)', transition: 'all 0.15s', flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}>
              <CloseIcon />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex' }}>
            {([
              { id: 'overview' as Tab, label: 'Prehľad' },
              { id: 'details' as Tab, label: 'Detaily' },
              { id: 'install' as Tab, label: 'Inštalácia' },
              { id: 'providers' as Tab, label: 'Providery' },
              { id: 'persona' as Tab, label: 'Persona' },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
                borderBottom: tab === t.id ? `1.5px solid ${accent}` : '1.5px solid transparent',
                marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 24px' }}>

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 12, color: 'var(--t3)' }}>
              <div style={{ width: 20, height: 20, border: '1.5px solid var(--atm-glass-border)', borderTopColor: 'var(--t2)', borderRadius: '50%', animation: 'hw-spin 0.7s linear infinite' }} />
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Analyzujem hardvér</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--atm-glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--t3)" strokeWidth="1.3" strokeLinecap="round"><circle cx="7" cy="7" r="6"/><line x1="7" y1="4" x2="7" y2="7.5"/><circle cx="7" cy="10" r="0.6" fill="var(--t3)" stroke="none"/></svg>
              </div>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>Backend je offline</span>
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em' }}>Najprv spusti tutor-service</span>
            </div>
          )}

          {/* ── Overview ── */}
          {!loading && !error && data && tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Hardware strip */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Pamäť',   value: `${data.hardware.ram_gb} GB` },
                  { label: 'Procesor', value: data.hardware.is_apple_silicon ? 'Apple Silicon' : data.hardware.cpu_brand.split(' ').slice(-2).join(' ') },
                  { label: 'Výpočet', value: data.hardware.gpu_available ? (data.hardware.gpu_backend?.toUpperCase() ?? 'GPU') : 'iba CPU' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '10px 12px', background: 'rgba(245, 237, 216, 0.04)', borderRadius: 8, border: '1px solid var(--atm-glass-border)' }}>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.01em' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Profile row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: `${accent}0d`, border: `1px solid ${accent}28`, borderRadius: 8, borderLeft: `2.5px solid ${accent}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: accent }}>Profil: {data.profile_label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 1 }}>{data.profile_description}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 18, color: `${accent}40`, fontWeight: 700, letterSpacing: '-0.05em', userSelect: 'none' }}>{tierNum}</div>
              </div>

              {/* Tutor selection */}
              <div style={{ padding: '14px', background: 'rgba(245, 237, 216, 0.04)', borderRadius: 8, border: '1px solid var(--atm-glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>Vyber si tutora</div>
                <TutorPicker selected={tutor} onSelect={handleTutorChange} />
              </div>

              {/* Currently active strip */}
              {status && (status.stt || status.llm) && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px',
                  background: status.is_optimal ? '#22c55e0a' : 'var(--raised)',
                  border: `1px solid ${status.is_optimal ? '#22c55e28' : 'var(--border)'}`,
                  borderRadius: 8,
                }}>
                  <div style={{ flex: 1, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {([
                      { label: 'STT', value: status.stt },
                      { label: 'LLM', value: status.llm ? status.llm + (status.llm_model ? ` · ${status.llm_model}` : '') : null },
                      { label: 'TTS', value: status.tts },
                    ] as { label: string; value: string | null }[]).filter(x => x.value).map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</span>
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9.5, color: 'var(--t2)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', flexShrink: 0 }}>
                    Aktívne
                  </span>
                  {status.is_optimal && (
                    <span style={{
                      padding: '2px 8px', background: '#22c55e18', border: '1px solid #22c55e30',
                      borderRadius: 4, fontFamily: 'var(--font-jetbrains)', fontSize: 7.5,
                      letterSpacing: '0.12em', textTransform: 'uppercase', color: '#22c55e', flexShrink: 0,
                    }}>Optimálne</span>
                  )}
                </div>
              )}

              {/* Advanced disclosure — the technical model recommendations are
                  hidden by default so the panel stays calm for normal users. */}
              <button
                onClick={() => setShowAdvanced(a => !a)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px', width: '100%',
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--t3)',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {showAdvanced ? 'Skryť technické detaily' : 'Technické detaily'}
                <span style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: 10 }}>▾</span>
              </button>

              {showAdvanced && (
                <>
              {/* Service cards with live status */}
              {SERVICES.map(({ key, label, sublabel, Icon }) => {
                const rec   = data.recommended[key];
                const check = checks?.[key]?.[rec.recommended];
                return (
                  <div key={key} style={{
                    display: 'flex', gap: 14, padding: '13px 14px',
                    background: 'rgba(245, 237, 216, 0.04)', borderRadius: 8,
                    border: '1px solid var(--atm-glass-border)', borderLeft: `2px solid ${accent}50`,
                    alignItems: 'flex-start',
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--atm-glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', flexShrink: 0, background: 'rgba(26, 20, 16, 0.62)' }}>
                      <Icon />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, fontWeight: 600 }}>{label}</span>
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.06em', color: 'var(--t3)' }}>{sublabel}</span>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--t1)', letterSpacing: '-0.01em', marginBottom: 3 }}>{rec.recommended}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.55 }}>{rec.why}</div>
                      {/* Live status line */}
                      {checks && check && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          <StatusDot check={check} size={6} />
                          <span style={{
                            fontFamily: 'var(--font-jetbrains)', fontSize: 8.5,
                            letterSpacing: '0.04em',
                            color: check.available ? '#22c55e' : '#f59e0b',
                          }}>
                            {check.reason}
                          </span>
                          {!check.available && check.fix && (
                            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, color: 'var(--t3)', letterSpacing: '0.02em' }}>
                              — {check.fix}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Streaming note */}
              {data.recommended.streaming_architecture && (
                <div style={{ padding: '12px 14px', background: `${accent}08`, border: `1px solid ${accent}20`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, display: 'inline-block' }} />
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>Plne streamovaný pipeline je dostupný</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>{data.recommended.streaming_architecture.description}</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t2)', marginTop: 6, letterSpacing: '0.04em' }}>Cieľová odozva — {data.recommended.streaming_architecture.total_latency}</div>
                </div>
              )}

              {/* Local models — one calm line, not a wall of chips. Details
                  live in the Inštalácia tab; setup is a single download link. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'rgba(245, 237, 216, 0.04)', borderRadius: 8, border: '1px solid var(--atm-glass-border)' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>Lokálne modely</span>
                <span style={{ flex: 1 }} />
                {data.hardware.ollama_models.length > 0 ? (
                  <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>
                    {data.hardware.ollama_models.length} {data.hardware.ollama_models.length === 1 ? 'model pripravený' : data.hardware.ollama_models.length < 5 ? 'modely pripravené' : 'modelov pripravených'} · Ollama
                  </span>
                ) : (
                  <a href="https://ollama.com/download" target="_blank" rel="noreferrer"
                    style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                    Stiahnuť Ollama →
                  </a>
                )}
              </div>

                </>
              )}

              {/* ── Apply section ── */}
              <div style={{ padding: '14px', background: `${accent}08`, border: `1px solid ${accent}20`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* API key inputs — only when needed */}
                {showKeyInput && (
                  <div style={{ paddingBottom: 12, borderBottom: `1px solid ${accent}20`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5 }}>
                      Tento profil vyžaduje API kľúč pre LLM.
                    </div>
                    <KeyInput
                      label="OpenAI API kľúč"
                      placeholder="sk-proj-..."
                      value={openaiKey}
                      onChange={setOpenaiKey}
                      onSave={saveOpenaiKey}
                      saving={savingOpenai}
                      saved={savedOpenai}
                      error={keyError}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--t1)', letterSpacing: '-0.01em', marginBottom: 2 }}>
                      {isOptimal ? 'Konfigurácia je optimálna' : anyLlmAvailable ? 'Použiť odporúčanú konfiguráciu' : 'Vyžaduje sa nastavenie'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--t3)', letterSpacing: '0.04em' }}>
                      {isOptimal
                        ? 'Beží najlepšia konfigurácia pre tento hardvér'
                        : anyLlmAvailable
                        ? 'Prepne STT · LLM · TTS na optimálne nastavenia pre tento počítač'
                        : 'Pridaj API kľúč alebo spusti Ollama na pokračovanie'}
                    </div>
                  </div>
                  <button
                    onClick={anyLlmAvailable ? applyConfig : undefined}
                    disabled={applying || !anyLlmAvailable}
                    style={{
                      padding: '7px 18px', flexShrink: 0,
                      background: applying ? 'transparent' : isOptimal ? 'var(--raised)' : anyLlmAvailable ? accent : 'var(--raised)',
                      border: `1px solid ${applying ? accent : isOptimal ? 'var(--border)' : anyLlmAvailable ? accent : 'var(--border)'}`,
                      borderRadius: 8,
                      fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: applying ? accent : isOptimal ? 'var(--t3)' : anyLlmAvailable ? '#fff' : 'var(--t3)',
                      cursor: applying || !anyLlmAvailable ? 'default' : 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {applying && <span style={{ width: 8, height: 8, border: `1.5px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'hw-spin 0.7s linear infinite' }} />}
                    {applying ? 'Aplikujem…' : isOptimal ? 'Znova použiť' : anyLlmAvailable ? 'Použiť' : 'Čakám'}
                  </button>
                </div>

                {/* Result */}
                {applied && (
                  <div style={{ borderTop: `1px solid ${accent}20`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(applied.warnings ?? []).filter(w => !w.startsWith('STT model will download')).length > 0
                      ? (applied.warnings ?? []).filter(w => !w.startsWith('STT model will download')).map((w, i) => (
                          <div key={i} style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: '#f59e0b', letterSpacing: '0.04em' }}>↳ {w}</div>
                        ))
                      : (
                          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: '#22c55e', letterSpacing: '0.04em' }}>
                            Aktívne — STT: {applied.stt} · LLM: {applied.llm} · TTS: {applied.tts}
                          </div>
                        )}
                    {/* Download warning shown separately, in amber but non-blocking */}
                    {(applied.warnings ?? []).filter(w => w.startsWith('STT model will download')).map((w, i) => (
                      <div key={`dl-${i}`} style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: '#f59e0b', letterSpacing: '0.04em', lineHeight: 1.5 }}>
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── Details tab ── */}
          {!loading && !error && data && tab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SERVICES.map(({ key, label, Icon }) => {
                const d = data.recommended[key] as Record<string, unknown>;
                return (
                  <div key={key} style={{ padding: '14px 16px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: 8, borderLeft: `2px solid ${accent}50` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--atm-glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent }}>
                        <Icon />
                      </div>
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>{label}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(d).map(([k, v]) => v ? (
                        <div key={k} style={{ display: 'flex', gap: 16 }}>
                          <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em', minWidth: 100, paddingTop: 1, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: 11, color: 'var(--t2)', flex: 1, lineHeight: 1.6 }}>{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Install tab ── */}
          {!loading && !error && data && tab === 'install' && (
            <InstallPanel
              installLines={data.recommended.install || []}
              copied={copied}
              accent={accent}
              onCopy={copyInstall}
            />
          )}

          {/* ── Persona tab ── (own fetches; not gated on hardware load) */}
          {tab === 'persona' && <PersonaPanel accent={accent} />}

          {/* ── Providers tab ── */}
          {!loading && !error && tab === 'providers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.65 }}>
                Pridaj API kľúče pre cloud providery alebo nakonfiguruj vlastný LLM endpoint.
              </div>

              {/* Native API keys */}
              <div style={{ padding: 14, background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                  API kľúče
                </div>
                <KeyInput
                  label="OpenAI"
                  placeholder="sk-proj-..."
                  value={openaiKey}
                  onChange={setOpenaiKey}
                  onSave={saveOpenaiKey}
                  saving={savingOpenai}
                  saved={savedOpenai}
                  error={keyError}
                />
                <KeyInput
                  label="Anthropic"
                  placeholder="sk-ant-..."
                  value={anthropicKey}
                  onChange={setAnthropicKey}
                  onSave={saveAnthropicKey}
                  saving={savingAnthropic}
                  saved={savedAnthropic}
                  error={anthropicError}
                />
                <KeyInput
                  label="Groq"
                  placeholder="gsk_..."
                  value={groqKey}
                  onChange={setGroqKey}
                  onSave={saveGroqKey}
                  saving={savingGroq}
                  saved={savedGroq}
                  error={groqError}
                />
              </div>

              <BackendsPanel
                accent={accent}
                lipsyncProvider={lipsyncProvider}
                lipsyncSidecarOk={lipsyncSidecarOk}
                switchingLipsync={switchingLipsync}
                onSwitchLipsync={switchLipsync}
                emotionBackend={emotionBackend}
                bertAvailable={bertAvailable}
                bertReason={bertReason}
                switchingEmotion={switchingEmotion}
                onSwitchEmotion={switchEmotion}
              />

              {/* Active LLM list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                  Aktívne providery
                </div>
                {llmModels.filter(m => m.available).length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                    Žiadne dostupné providery — pridaj nový alebo over API kľúče.
                  </div>
                )}
                {llmModels.filter(m => m.available).map(m => {
                  const isActive = status?.llm === m.id || (status?.llm === 'ollama' && m.id.startsWith('ollama:'));
                  const badge = m.provider === 'local' ? { text: 'LOCAL', color: '#22c55e' } :
                                m.provider === 'cloud' ? { text: 'CLOUD', color: '#6366f1' } :
                                m.provider === 'custom' ? { text: 'CUSTOM', color: accent } : null;
                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: '10px 12px',
                        background: isActive ? `${accent}10` : 'var(--raised)',
                        border: `1px solid ${isActive ? `${accent}40` : 'var(--border)'}`,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        transition: 'all 0.15s',
                      }}
                    >
                      {badge && (
                        <span style={{
                          padding: '2px 7px',
                          background: `${badge.color}22`,
                          color: badge.color,
                          fontFamily: 'var(--font-jetbrains)',
                          fontSize: 8,
                          letterSpacing: '0.1em',
                          borderRadius: 3,
                          flexShrink: 0,
                        }}>
                          {badge.text}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.id}
                        </div>
                      </div>
                      <button
                        onClick={() => activateProvider(m.id)}
                        disabled={isActive}
                        style={{
                          padding: '5px 11px',
                          background: isActive ? 'transparent' : 'var(--bg)',
                          border: `1px solid ${isActive ? `${accent}50` : 'var(--border)'}`,
                          borderRadius: 5,
                          fontFamily: 'var(--font-jetbrains)',
                          fontSize: 8.5,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: isActive ? accent : 'var(--t2)',
                          cursor: isActive ? 'default' : 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.15s',
                        }}
                      >
                        {isActive ? 'Aktívny' : 'Použiť'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add provider button */}
              {!showAddProvider && (
                <button
                  onClick={() => setShowAddProvider(true)}
                  style={{
                    padding: '11px 14px',
                    background: 'transparent',
                    border: `1.5px dashed ${accent}50`,
                    borderRadius: 8,
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: accent,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = accent; (e.currentTarget as HTMLButtonElement).style.background = `${accent}08`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${accent}50`; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  + Pridať vlastný LLM provider
                </button>
              )}

              {/* Add form */}
              {showAddProvider && (
                <div style={{
                  padding: 14,
                  background: 'rgba(245, 237, 216, 0.04)',
                  border: `1px solid ${accent}30`,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>
                      Nový provider
                    </span>
                    <button
                      onClick={() => { setShowAddProvider(false); setProvError(''); }}
                      style={{
                        width: 22, height: 22,
                        background: 'transparent',
                        border: '1px solid var(--atm-glass-border)',
                        borderRadius: 5,
                        color: 'var(--t3)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  {/* Preset selector */}
                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>
                      Šablóna
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {PRESETS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => applyPreset(p.id)}
                          style={{
                            padding: '5px 10px',
                            background: presetTemplate === p.id ? `${accent}20` : 'var(--bg)',
                            border: `1px solid ${presetTemplate === p.id ? accent : 'var(--border)'}`,
                            borderRadius: 5,
                            fontFamily: 'var(--font-jetbrains)',
                            fontSize: 9,
                            color: presetTemplate === p.id ? accent : 'var(--t2)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                      Názov
                    </div>
                    <input
                      type="text"
                      value={provName}
                      onChange={e => setProvName(e.target.value)}
                      placeholder="Together AI"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'var(--bg)',
                        border: '1px solid var(--atm-glass-border)',
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'var(--t1)',
                        fontFamily: 'var(--font-inter)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                      Base URL
                    </div>
                    <input
                      type="text"
                      value={provUrl}
                      onChange={e => setProvUrl(e.target.value)}
                      placeholder="https://api.together.xyz/v1"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'var(--bg)',
                        border: '1px solid var(--atm-glass-border)',
                        borderRadius: 8,
                        fontSize: 10.5,
                        color: 'var(--t1)',
                        fontFamily: 'var(--font-jetbrains)',
                        letterSpacing: '0.02em',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                      API kľúč
                    </div>
                    <input
                      type="password"
                      value={provKey}
                      onChange={e => setProvKey(e.target.value)}
                      placeholder="••••••••••••••••"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'var(--bg)',
                        border: '1px solid var(--atm-glass-border)',
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'var(--t1)',
                        fontFamily: 'var(--font-jetbrains)',
                        letterSpacing: '0.04em',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
                      Model
                    </div>
                    <input
                      type="text"
                      value={provModel}
                      onChange={e => setProvModel(e.target.value)}
                      placeholder="meta-llama/Llama-3.1-70B-Instruct-Turbo"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'var(--bg)',
                        border: '1px solid var(--atm-glass-border)',
                        borderRadius: 8,
                        fontSize: 10.5,
                        color: 'var(--t1)',
                        fontFamily: 'var(--font-jetbrains)',
                        letterSpacing: '0.02em',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {provError && (
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9.5, color: '#ef4444', letterSpacing: '0.04em' }}>
                      {provError}
                    </div>
                  )}

                  <button
                    onClick={saveProvider}
                    disabled={provSaving}
                    style={{
                      padding: '9px 14px',
                      background: provSaving ? 'transparent' : accent,
                      border: `1px solid ${accent}`,
                      borderRadius: 8,
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: provSaving ? accent : '#fff',
                      cursor: provSaving ? 'default' : 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    {provSaving && <span style={{ width: 9, height: 9, border: `1.5px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'hw-spin 0.7s linear infinite' }} />}
                    {provSaving ? 'Ukladám…' : 'Uložiť a aktivovať'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--atm-glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.1em', color: 'var(--t3)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data ? `${data.hardware.ram_gb}GB · ${data.hardware.is_apple_silicon ? 'Apple Silicon' : data.hardware.platform}` : '—'}
            </span>
            <button
              onClick={() => { window.location.href = '/?reset_onboarding=1'; }}
              title="Znova spustí úvodného sprievodcu nastavením od začiatku"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = accent; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; }}
            >
              ↺ Spustiť nastavenie znova
            </button>
          </div>
          <button onClick={onDismiss} style={{ padding: '7px 18px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: 8, fontSize: 11.5, fontWeight: 500, color: 'var(--t2)', cursor: 'pointer', letterSpacing: '-0.01em', transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}>
            Hotovo
          </button>
        </div>
      </div>

      <style>{`@keyframes hw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
