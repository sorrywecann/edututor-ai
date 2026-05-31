'use client';

// UnifiedOnboarding — cinematic ritual onboarding for the local desktop tutor.
//
//   Welcome (intro)  →  Meno  →  Štýl  →  Pripravený
//
// Built from small modular blocks (RitualScreen / Eyebrow / Hero / Sub /
// RitualInput / VibeChoice / PrimaryBtn / StepNav) so the same atmosphere can
// be reused for other ritual flows later. No emoji clutter, no "Krok 1 z 5"
// stepper, no hardware/model picker — those live in FirstRunSetup upstream and
// Sidebar → Settings for power users.
//
// Schema is preserved: a "vibe" choice maps to the existing
// formality / humor / directness / verbosity dials, so downstream consumers
// (system-prompt builders, mode service) keep working.
//
// Default assistant name is "Tutor" — no proper name, the user can rename it
// later from settings if they want.

import { useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { API_BASE } from '@/lib/config';
import { getPersistentUserId } from '@/lib/api';
import { useDesignVariant } from '@/lib/designVariant';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { Orb } from '@/components/voice/Orb';
// Chamber design language — per docs/design-spec. See ./Chamber step
// components defined at the bottom of this file for the variant-specific UI.
import {
  ChamberShell, ChamberEyebrow, ChamberHero, ChamberSub,
  ChamberPrimary, ChamberInput, ChamberChip, ChamberCard,
  ChamberStepNav, ChamberOrb,
} from '@/components/chamber';

// Suffix bumped v2 → v3 in app v0.4.4. Older installs that completed
// onboarding under v2 left the flag in Electron's persistent localStorage;
// uninstall + reinstall of a newer app did NOT clear it, so users skipped
// onboarding on the new install and arrived at a half-configured app.
// Bumping the key forces re-onboarding once for every existing install,
// which is what we want — the onboarding has changed meaningfully since
// v2 was last shown.
const STORAGE_KEY = 'edututor_onboarding_v4';
const PREFS_KEY = 'edututor_user_prefs';
const DEFAULT_ASSISTANT_NAME = 'Tutor';

type Vibe = 'serious' | 'practical' | 'chill';

interface UserPrefs {
  user_name: string;
  assistant_name: string;
  formality: number;   // 0..2
  humor: number;
  directness: number;
  verbosity: number;
  vibe?: Vibe;
}

const DEFAULT_PREFS: UserPrefs = {
  user_name: '',
  assistant_name: DEFAULT_ASSISTANT_NAME,
  formality: 1, humor: 1, directness: 1, verbosity: 1,
  vibe: 'practical',
};

// One vibe pick → all four personality dials. Keeps the existing schema while
// collapsing the four-slider UI into one cinematic decision.
const VIBE_TO_PREFS: Record<Vibe, Pick<UserPrefs, 'formality' | 'humor' | 'directness' | 'verbosity'>> = {
  serious:   { formality: 2, humor: 0, directness: 2, verbosity: 1 },
  practical: { formality: 1, humor: 1, directness: 1, verbosity: 1 },
  chill:     { formality: 0, humor: 2, directness: 1, verbosity: 2 },
};

const VIBES: { id: Vibe; label: string; sub: string }[] = [
  { id: 'serious',   label: 'Vážny',     sub: 'Bez zbytočností.' },
  { id: 'practical', label: 'Praktický', sub: 'Vyvážený. Odporúčaný.' },
  { id: 'chill',     label: 'Pohodový',  sub: 'Hovorovo, vtipne.' },
];

// ── prefs storage helpers ────────────────────────────────────────────────────

function sanitizePrefs(input: Partial<UserPrefs> | null | undefined): UserPrefs {
  const m = { ...DEFAULT_PREFS, ...(input ?? {}) };
  return {
    user_name: m.user_name ?? '',
    assistant_name: m.assistant_name ?? DEFAULT_ASSISTANT_NAME,
    formality:  m.formality  ?? 1,
    humor:      m.humor      ?? 1,
    directness: m.directness ?? 1,
    verbosity:  m.verbosity  ?? 1,
    vibe:       m.vibe       ?? 'practical',
  };
}

function loadPrefsLocal(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? sanitizePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}

function savePrefsLocal(p: UserPrefs) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* quota / private mode */ }
}

async function loadPrefsRemote(): Promise<Partial<UserPrefs> | null> {
  try {
    const r = await fetch(`${API_BASE}/api/v1/user/preferences`, {
      credentials: 'include',
      headers: { 'X-EduTutor-User-Id': getPersistentUserId() },
    });
    if (!r.ok) return null;
    const raw = (await r.json()) as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) if (v != null) clean[k] = v;
    return clean as Partial<UserPrefs>;
  } catch { return null; }
}

async function savePrefsRemote(patch: Partial<UserPrefs>): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/user/preferences`, {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-EduTutor-User-Id': getPersistentUserId(),
      },
      body: JSON.stringify(patch),
    });
  } catch { /* localStorage is the source of truth */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modular ritual building blocks
// ─────────────────────────────────────────────────────────────────────────────

// Soft warm radial glow behind the screen contents — the "spotlight" feel.
function RitualGlow() {
  return (
    <>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle at 50% 38%, rgba(var(--accent-r), 0.18), rgba(var(--accent-r), 0) 55%)',
        animation: 'ritual-breathe 7s ease-in-out infinite',
      }} />
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 130%, rgba(var(--accent-r), 0.10), rgba(0,0,0,0) 60%)',
      }} />
    </>
  );
}

// Full-bleed cinematic frame with deep warm background + breathing glow + fade.
function RitualScreen({ children, fadeKey }: { children: ReactNode; fadeKey: string | number }) {
  return (
    <div className="atm-hero" style={{
      position: 'fixed', inset: 0, zIndex: 300, overflowY: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px',
      background: 'radial-gradient(ellipse at 50% 0%, #1a0e08 0%, #0c0805 65%)',
    }}>
      <RitualGlow />
      <div key={fadeKey} style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 560, textAlign: 'center',
        animation: 'ritual-step-in 720ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
      }}>
        {children}
      </div>
      {/* Inline animation keyframes — kept local so the component is self-contained. */}
      <style>{`
        @keyframes ritual-breathe {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.04); }
        }
        @keyframes ritual-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-jetbrains)',
      fontSize: 10.5, letterSpacing: '0.34em',
      color: 'var(--t3)', textTransform: 'uppercase',
      marginBottom: 22,
    }}>
      {children}
    </div>
  );
}

function Hero({ children }: { children: ReactNode }) {
  return (
    <h1 style={{
      fontFamily: 'var(--font-inter)',
      fontSize: 'clamp(30px, 5.4vw, 50px)',
      fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.06,
      color: 'var(--t1)', margin: 0,
    }}>
      {children}
    </h1>
  );
}

function Sub({ children, maxWidth = 420 }: { children: ReactNode; maxWidth?: number }) {
  return (
    <p style={{
      fontSize: 15.5, lineHeight: 1.55, color: 'var(--t2)',
      margin: '20px auto 0', maxWidth,
    }}>
      {children}
    </p>
  );
}

function RitualInput({
  value, onChange, placeholder, autoFocus, onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={{
        width: '100%', padding: '16px 20px', borderRadius: 14,
        textAlign: 'center', fontFamily: 'var(--font-inter)', fontSize: 18,
        color: 'var(--t1)',
        background: 'rgba(245, 232, 216, 0.03)',
        border: '1px solid var(--atm-glass-border)',
        outline: 'none',
        transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.background = 'rgba(217, 130, 85, 0.06)';
        e.currentTarget.style.boxShadow = '0 0 0 4px rgba(var(--accent-r), 0.10)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--atm-glass-border)';
        e.currentTarget.style.background = 'rgba(245, 232, 216, 0.03)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    />
  );
}

function VibeChoice({
  label, sub, active, onClick,
}: {
  label: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      flex: 1, minWidth: 0, textAlign: 'center', padding: '22px 14px',
      borderRadius: 16, cursor: 'pointer',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--atm-glass-border)'}`,
      background: active
        ? 'linear-gradient(180deg, rgba(217,130,85,0.16), rgba(217,130,85,0.04))'
        : 'rgba(245, 232, 216, 0.02)',
      boxShadow: active ? '0 8px 32px rgba(var(--accent-r), 0.18)' : 'none',
      transition: 'all 0.28s cubic-bezier(0.2, 0.7, 0.2, 1)',
      transform: active ? 'translateY(-1px)' : 'none',
    }}>
      <div style={{
        fontFamily: 'var(--font-inter)', fontSize: 16, fontWeight: 500,
        color: active ? 'var(--accent)' : 'var(--t1)',
        marginBottom: 6, letterSpacing: '-0.01em',
      }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.45 }}>
        {sub}
      </div>
    </button>
  );
}

function PrimaryBtn({
  children, onClick, disabled,
}: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '14px 32px', borderRadius: 14, cursor: disabled ? 'default' : 'pointer',
      border: `1px solid ${disabled ? 'var(--atm-glass-border)' : 'var(--accent)'}`,
      background: disabled
        ? 'transparent'
        : 'linear-gradient(180deg, #E08D5C, #C9744A)',
      color: disabled ? 'var(--t3)' : '#fff',
      fontFamily: 'var(--font-inter)', fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.005em',
      display: 'inline-flex', alignItems: 'center', gap: 9,
      boxShadow: disabled ? 'none' : '0 8px 28px rgba(var(--accent-r), 0.32)',
      transition: 'transform 0.18s, box-shadow 0.18s, opacity 0.18s',
      opacity: disabled ? 0.6 : 1,
    }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(var(--accent-r), 0.40)'; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.transform = 'translateY(0)';   e.currentTarget.style.boxShadow = '0 8px 28px rgba(var(--accent-r), 0.32)'; } }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 'none',
      color: 'var(--t3)', fontFamily: 'var(--font-inter)', fontSize: 13,
      cursor: 'pointer', padding: '8px 12px', borderRadius: 8,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      transition: 'color 0.18s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

// v0.7.8: Step union extended with three new screens.
//   'choice'      — 3-card row: Local / Cloud / Skip
//   'local-pick'  — 4-card model picker (Gemma/Llama/Qwen/Mistral)
//   'local-pull'  — progress bar while ollama pulls
// The legacy 'provider' step (API key paste) is preserved unchanged — only
// shown when user picks Cloud from 'choice'. Atmosphere variant keeps the
// old direct vibe → provider routing (no behavior change for legacy users).
type Step =
  | 'welcome' | 'name' | 'vibe'
  | 'choice' | 'local-pick' | 'local-pull'  // NEW
  | 'provider' | 'ready';

type Choice = 'local' | 'cloud' | 'skip' | null;

interface LocalModel {
  id: string;        // ollama tag, e.g. 'gemma3:4b'
  label: string;     // user-visible 'Gemma 3 · 4B'
  sizeGB: number;    // 3.3
  etaMin: number;    // ~ minutes at 10 MB/s
  blurb: string;     // Slovak one-liner
  recommended?: boolean;
}

const LOCAL_MODELS: LocalModel[] = [
  { id: 'gemma3:4b',   label: 'Gemma 3 · 4B',   sizeGB: 3.3, etaMin: 5, blurb: 'Rýchly, vyvážený', recommended: true },
  { id: 'llama3.2:3b', label: 'Llama 3.2 · 3B', sizeGB: 2.0, etaMin: 3, blurb: 'Najmenší, najrýchlejší' },
  { id: 'qwen2.5:7b',  label: 'Qwen 2.5 · 7B',  sizeGB: 4.5, etaMin: 7, blurb: 'Najlepší pre slovenčinu' },
  { id: 'mistral:7b',  label: 'Mistral · 7B',   sizeGB: 4.4, etaMin: 7, blurb: 'Detailnejšie odpovede' },
];

interface PullProgress {
  model: string;
  status: 'running' | 'done' | 'error';
  percent: number;
  bytesDone: number;
  bytesTotal: number;
  speed: string;
  eta: string;
  error: string | null;
}

// Detect which cloud provider a key belongs to by its prefix. Lets the user
// just paste the key without picking a provider explicitly.
function detectProvider(key: string): 'openai' | 'anthropic' | 'groq' | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('gsk_'))     return 'groq';
  if (k.startsWith('sk-'))      return 'openai';
  return null;
}

async function saveCloudKey(provider: string, key: string): Promise<{ ok: boolean; msg?: string }> {
  try {
    const body: Record<string, string> = {};
    if (provider === 'openai')    body.openai_api_key    = key;
    if (provider === 'anthropic') body.anthropic_api_key = key;
    if (provider === 'groq')      body.groq_api_key      = key;
    const res = await fetch(`${API_BASE}/api/v1/system/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-EduTutor-User-Id': getPersistentUserId() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, msg: `HTTP ${res.status}` };
    const json = await res.json().catch(() => ({}));
    return { ok: true, msg: json.message || 'OK' };
  } catch (e) { return { ok: false, msg: e instanceof Error ? e.message : String(e) }; }
}

export function UnifiedOnboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('welcome');
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  // v0.7.8: state for the new choice → local-pick → local-pull flow.
  const [choice, setChoice] = useState<Choice>(null);
  const [pickedModel, setPickedModel] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { variant } = useDesignVariant();

  // v0.7.8: progress polling — only active while step === 'local-pull'.
  // Cleanup on step change + unmount so we never leak intervals.
  useEffect(() => {
    if (step !== 'local-pull' || !pickedModel) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/system/ollama-pull/status?model=${encodeURIComponent(pickedModel)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        if (d.success) {
          setPullProgress({
            model: d.model,
            status: d.status,
            percent: d.percent ?? 0,
            bytesDone: d.bytes_done ?? 0,
            bytesTotal: d.bytes_total ?? 0,
            speed: d.speed ?? '',
            eta: d.eta ?? '',
            error: d.error ?? null,
          });
        }
      } catch { /* network blip — next tick retries */ }
    };
    void tick();
    pollRef.current = setInterval(tick, 900);
    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [step, pickedModel]);

  // Gate: show once. ?reset_onboarding=1 (or the sidebar's "Spustiť úvod znova")
  // clears the gate and re-shows the ritual from the top.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset_onboarding') === '1') {
      localStorage.removeItem(STORAGE_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete('reset_onboarding');
      window.history.replaceState({}, '', url.toString());
    }
    if (localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, []);

  // Load prefs (local first, merge backend on top — no network blocking).
  useEffect(() => {
    const local = loadPrefsLocal();
    setPrefs(local);
    loadPrefsRemote().then((remote) => {
      if (remote) {
        const merged = sanitizePrefs({ ...local, ...remote });
        setPrefs(merged);
        savePrefsLocal(merged);
      }
    });
  }, []);

  const updatePrefs = useCallback((patch: Partial<UserPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefsLocal(next);
      return next;
    });
    void savePrefsRemote(patch);
  }, []);

  const pickVibe = (v: Vibe) => updatePrefs({ vibe: v, ...VIBE_TO_PREFS[v] });

  function finish() {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  // ── Step 0 — Welcome (intro / manifesto) ───────────────────────────────────
  if (step === 'welcome') {
    if (variant === 'chamber') {
      return <ChamberStepWelcome onStart={() => setStep('name')} />;
    }
    // v0.8.5: a single quiet wordmark BETWEEN the Orb and the entry button.
    // Pure minimalism — Instrument Serif italic, all-lowercase, ink-dim.
    // Layout: [Orb] 24px [edututor] 28px [Vstúpiť →].
    return (
      <RitualScreen fadeKey="welcome">
        <div style={{ margin: '0 auto', width: 'fit-content' }}>
          <Orb size={300} hero state="idle" />
        </div>

        <div style={{ height: 24 }} />

        <div style={{
          fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
          fontStyle: 'italic', fontWeight: 400,
          fontSize: 22, letterSpacing: '-0.005em',
          color: 'var(--t3)',
          lineHeight: 1,
        }}>
          edututor
        </div>

        <div style={{ height: 28 }} />

        <PrimaryBtn onClick={() => setStep('name')}>
          Vstúpiť <ArrowRight size={16} />
        </PrimaryBtn>
      </RitualScreen>
    );
  }

  // ── Step 1 — Meno ──────────────────────────────────────────────────────────
  if (step === 'name') {
    const userNameOk = (prefs.user_name ?? '').trim().length > 0;
    const next = () => userNameOk && setStep('vibe');
    if (variant === 'chamber') {
      return (
        <ChamberStepName
          value={prefs.user_name}
          onChange={(v) => updatePrefs({ user_name: v })}
          onBack={() => setStep('welcome')}
          onNext={next}
        />
      );
    }
    return (
      <RitualScreen fadeKey="name">
        <Eyebrow>Krok 1 z 3 — Meno</Eyebrow>
        <Hero>Ako sa voláš?</Hero>
        <Sub>Tutor použije toto meno v konverzácii.</Sub>

        <div style={{ marginTop: 40, marginBottom: 36, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
          <RitualInput
            value={prefs.user_name}
            onChange={(v) => updatePrefs({ user_name: v })}
            placeholder="Tvoje meno"
            autoFocus
            onEnter={next}
          />
        </div>

        <StepNav
          onBack={() => setStep('welcome')}
          right={
            <PrimaryBtn onClick={next} disabled={!userNameOk}>
              Pokračovať <ArrowRight size={16} />
            </PrimaryBtn>
          }
        />
      </RitualScreen>
    );
  }

  // ── Step 2 — Štýl ──────────────────────────────────────────────────────────
  if (step === 'vibe') {
    if (variant === 'chamber') {
      return (
        <ChamberStepVibe
          value={prefs.vibe}
          onPick={pickVibe}
          onBack={() => setStep('name')}
          // v0.7.8: Chamber routes through new 'choice' step. Atmosphere
          // variant (below) keeps the legacy direct vibe → provider path so
          // existing atmosphere users see no behavior change.
          onNext={() => setStep('choice')}
        />
      );
    }
    return (
      <RitualScreen fadeKey="vibe">
        <Eyebrow>Krok 2 z 3 — Štýl</Eyebrow>
        <Hero>Aký má byť?</Hero>
        <Sub>Vždy môžeš zmeniť neskôr v nastaveniach.</Sub>

        <div style={{
          display: 'flex', gap: 12, margin: '40px 0 36px',
        }}>
          {VIBES.map((v) => (
            <VibeChoice
              key={v.id}
              label={v.label}
              sub={v.sub}
              active={prefs.vibe === v.id}
              onClick={() => pickVibe(v.id)}
            />
          ))}
        </div>

        <StepNav
          onBack={() => setStep('name')}
          right={
            <PrimaryBtn onClick={() => setStep('provider')} disabled={!prefs.vibe}>
              Pokračovať <ArrowRight size={16} />
            </PrimaryBtn>
          }
        />
      </RitualScreen>
    );
  }

  // ── v0.7.8: Step 3 (Chamber only) — 3-card choice (Local / Cloud / Skip) ─
  if (step === 'choice' && variant === 'chamber') {
    return (
      <ChamberStepChoice
        onBack={() => setStep('vibe')}
        onPick={(c) => {
          setChoice(c);
          if (c === 'local') setStep('local-pick');
          else if (c === 'cloud') setStep('provider');
          else setStep('ready'); // skip
        }}
      />
    );
  }
  // Atmosphere variant has no 'choice' step — if somehow reached, route
  // straight to provider so the flow can complete.
  if (step === 'choice') {
    setStep('provider');
    return null;
  }

  // ── v0.7.8: Step 3a (Chamber only) — local model picker ─────────────────
  if (step === 'local-pick' && variant === 'chamber') {
    return (
      <ChamberStepLocalPicker
        picked={pickedModel}
        onPick={setPickedModel}
        onBack={() => setStep('choice')}
        onStartPull={async () => {
          if (!pickedModel) return;
          // Fire-and-forget — backend dedupes if already running. We advance
          // to local-pull immediately; the polling effect picks up progress.
          try {
            await fetch(`${API_BASE}/api/v1/system/ollama-pull`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: pickedModel }),
            });
          } catch { /* if POST fails the status poll will show 'not_tracked' and UI surfaces it */ }
          setPullProgress(null);
          setStep('local-pull');
        }}
      />
    );
  }
  if (step === 'local-pick') { setStep('choice'); return null; }

  // ── v0.7.8: Step 3b (Chamber only) — download progress ───────────────────
  if (step === 'local-pull' && variant === 'chamber') {
    return (
      <ChamberStepDownloading
        model={pickedModel}
        progress={pullProgress}
        onBack={() => setStep('local-pick')}
        onContinueAnyway={() => setStep('ready')}
        onDone={() => setStep('ready')}
        onRetry={() => setStep('local-pick')}
      />
    );
  }
  if (step === 'local-pull') { setStep('ready'); return null; }

  // ── Step 2.5 — Provider (cloud API key, optional) ─────────────────────────
  // Added v0.4.5 because users with cloud-only setups (no local Ollama or
  // want a stronger model) had no place in the welcome flow to paste a key.
  // FirstRunSetup only shows the key panel as a fallback when local LLM is
  // unavailable — so users with a working Ollama never saw it. This step
  // makes the option explicit + skippable.
  if (step === 'provider') {
    if (variant === 'chamber') {
      return (
        <ChamberStepProvider
          // v0.7.8: Chamber back goes to the new 'choice' step. Atmosphere
          // (below) keeps the legacy vibe back-target.
          onBack={() => setStep('choice')}
          onNext={() => setStep('ready')}
        />
      );
    }
    return <ProviderStep onBack={() => setStep('vibe')} onNext={() => setStep('ready')} />;
  }

  // ── Step 3 — Pripravený ────────────────────────────────────────────────────
  if (variant === 'chamber') {
    // v0.7.8: back routes depend on which choice the user took.
    //   'local' → local-pull (so user can see download progress they left)
    //   'cloud' → provider (so user can re-paste / fix key)
    //   'skip' / null → choice (re-pick)
    const readyBack = () => {
      if (choice === 'local') setStep('local-pull');
      else if (choice === 'cloud') setStep('provider');
      else setStep('choice');
    };
    return (
      <ChamberStepReady
        prefs={prefs}
        onBack={readyBack}
        onFinish={finish}
      />
    );
  }
  return (
    <RitualScreen fadeKey="ready">
      <Eyebrow>Krok 3 z 3 — Pripravený</Eyebrow>
      <Hero>
        Hotovo.<br />
        <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>Tutor je pripravený.</span>
      </Hero>
      <Sub maxWidth={420}>
        Hovor, pýtaj sa, počúvaj. Vždy ťa počuje.
      </Sub>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        margin: '32px auto 44px',
        padding: '10px 18px', borderRadius: 999,
        background: 'rgba(143, 203, 118, 0.08)',
        border: '1px solid rgba(143, 203, 118, 0.22)',
        fontSize: 12, color: 'var(--green)', fontFamily: 'var(--font-inter)',
      }}>
        <Check size={13} strokeWidth={2.4} />
        Hardvér a model sú nastavené automaticky
      </div>

      <div>
        <PrimaryBtn onClick={finish}>
          Začať konverzáciu <ArrowRight size={16} />
        </PrimaryBtn>
      </div>
    </RitualScreen>
  );
}

// ── Provider step — atmosphere variant ─────────────────────────────────────

function ProviderStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const provider = detectProvider(key);

  async function saveAndContinue() {
    if (!key.trim() || !provider) { onNext(); return; }
    setSaving(true); setMsg(null);
    const r = await saveCloudKey(provider, key.trim());
    setSaving(false);
    if (r.ok) { setMsg('✓ Uložené'); setTimeout(onNext, 400); }
    else { setMsg(`✗ ${r.msg || 'Neplatný kľúč'}`); }
  }

  return (
    <RitualScreen fadeKey="provider">
      <Eyebrow>Krok 3 — Cloud kľúč (voliteľné)</Eyebrow>
      <Hero>Máš API kľúč?</Hero>
      <Sub maxWidth={460}>
        Vlož OpenAI, Anthropic alebo Groq kľúč pre silnejší model.
        Alebo preskoč — použijeme lokálny model (Ollama).
      </Sub>

      <div style={{ marginTop: 36, marginBottom: 24, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
        <RitualInput
          value={key}
          onChange={setKey}
          placeholder="sk-... · sk-ant-... · gsk_..."
          autoFocus
        />
        <div style={{
          marginTop: 10, fontSize: 11, color: 'var(--t3)',
          fontFamily: 'var(--font-inter)', minHeight: 14, textAlign: 'left',
        }}>
          {provider ? provider : (key.trim() ? '' : '')}
          {msg && <span style={{ marginLeft: 12, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red, #d97757)' }}>{msg}</span>}
        </div>
      </div>

      <StepNav
        onBack={onBack}
        right={
          <PrimaryBtn onClick={saveAndContinue} disabled={saving}>
            {key.trim() ? (saving ? 'Ukladám…' : 'Uložiť a pokračovať') : 'Preskočiť'} <ArrowRight size={16} />
          </PrimaryBtn>
        }
      />
    </RitualScreen>
  );
}

// ── Step navigation row (back ghost + right slot) ───────────────────────────

function StepNav({ onBack, right }: { onBack: () => void; right: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      maxWidth: 380, margin: '0 auto',
    }}>
      <GhostBtn onClick={onBack}>
        <ArrowLeft size={14} /> Späť
      </GhostBtn>
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chamber variant — all four onboarding screens.
//
// Per docs/design-spec: pure black, single amber, Geist display, Instrument
// Serif italic for emotional accents, particle-constellation orb at the
// centre of every important moment. Each step is tiny because the heavy
// lifting lives in @/components/chamber primitives.
// ─────────────────────────────────────────────────────────────────────────────

function ChamberStepWelcome({ onStart }: { onStart: () => void }) {
  const [exiting, setExiting] = useState(false);
  const handleStart = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    // Brief orb fade before advancing — keeps the moment immersive.
    window.setTimeout(() => { onStart(); }, 380);
  }, [exiting, onStart]);

  return (
    <ChamberShell>
      <div
        style={{
          margin: '0 auto',
          width: 'fit-content',
          opacity: exiting ? 0 : 1,
          transform: exiting ? 'scale(0.92)' : 'scale(1)',
          transition: 'opacity 380ms ease, transform 380ms ease',
        }}
      >
        <ChamberOrb size={320} hero state="idle" />
      </div>

      {/* v0.8.5: minimal wordmark between Orb and entry button. Same fade-out
          on advance as the orb. Instrument Serif italic, lowercase, quiet. */}
      <div style={{ height: 24 }} />
      <div
        style={{
          fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
          fontStyle: 'italic', fontWeight: 400,
          fontSize: 22, letterSpacing: '-0.005em',
          color: 'var(--ch-ink-dim, #9a8f82)',
          lineHeight: 1,
          opacity: exiting ? 0 : 1,
          transition: 'opacity 380ms ease',
        }}
      >
        edututor
      </div>
      <div style={{ height: 28 }} />

      <ChamberPrimary onClick={handleStart}>Vstúpiť →</ChamberPrimary>
    </ChamberShell>
  );
}

function ChamberStepName({
  value, onChange, onBack, onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const ok = value.trim().length > 0;
  return (
    <ChamberShell>
      <ChamberEyebrow>Krok 1 z 3 · Meno</ChamberEyebrow>

      <div style={{ margin: '0 auto 28px', width: 'fit-content' }}>
        <ChamberOrb size={150} state="idle" particles={700} />
      </div>

      <ChamberHero>Ako sa voláš?</ChamberHero>
      <ChamberSub>Tutor použije toto meno v konverzácii.</ChamberSub>

      <div style={{ margin: '40px auto 40px', maxWidth: 380 }}>
        <ChamberInput
          value={value}
          onChange={onChange}
          placeholder="Tvoje meno"
          autoFocus
          onEnter={() => ok && onNext()}
        />
      </div>

      <ChamberStepNav
        onBack={onBack}
        total={4} current={0}
        right={
          <ChamberPrimary onClick={onNext} disabled={!ok}>
            Pokračovať →
          </ChamberPrimary>
        }
      />
    </ChamberShell>
  );
}

function ChamberStepVibe({
  value, onPick, onBack, onNext,
}: {
  value: Vibe | undefined;
  onPick: (v: Vibe) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <ChamberShell>
      <ChamberEyebrow>Krok 2 z 3 · Charakter</ChamberEyebrow>

      <ChamberHero>Aký má byť?</ChamberHero>
      <ChamberSub>Vždy môžeš zmeniť neskôr.</ChamberSub>

      <div style={{
        display: 'flex', gap: 12,
        margin: '40px 0 40px',
      }}>
        {VIBES.map((v) => (
          <ChamberCard
            key={v.id}
            active={value === v.id}
            onClick={() => onPick(v.id)}
          >
            <div style={{
              fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
              fontSize: 17, fontWeight: 500, marginBottom: 8,
              letterSpacing: '-0.01em',
              color: value === v.id ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink, #f4ede4)',
            }}>
              {v.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
              fontStyle: 'italic', fontSize: 13,
              color: 'var(--ch-ink-dim, #9a8f82)', lineHeight: 1.45,
            }}>
              {v.sub}
            </div>
          </ChamberCard>
        ))}
      </div>

      <ChamberStepNav
        onBack={onBack}
        total={4} current={1}
        right={
          <ChamberPrimary onClick={onNext} disabled={!value}>
            Pokračovať →
          </ChamberPrimary>
        }
      />
    </ChamberShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// v0.7.8 — Chamber step: 3-card choice (Local / Cloud / Skip)
// ─────────────────────────────────────────────────────────────────────────────
function ChamberStepChoice({
  onBack, onPick,
}: { onBack: () => void; onPick: (c: Exclude<Choice, null>) => void }) {
  const cards: Array<{
    id: Exclude<Choice, null>; title: string; tagline: string; lines: string[]; accent: boolean;
  }> = [
    { id: 'local', title: 'Lokálny model', tagline: 'OFFLINE · ZADARMO', lines: ['Stiahneme model na tvoj PC', '3 – 5 min', 'Beží bez internetu'], accent: true },
    { id: 'cloud', title: 'Cloud API',     tagline: 'RÝCHLE · SILNÉ',    lines: ['OpenAI · Anthropic · Groq', 'Vyžaduje API kľúč', 'Najrýchlejšie odpovede'], accent: false },
    { id: 'skip',  title: 'Preskočiť',     tagline: 'NESKÔR',            lines: ['Nastav v Settings → Hardvér', 'Tutor zatiaľ povie ako ho zapnúť', 'Môžeš vstúpiť hneď'], accent: false },
  ];
  return (
    <ChamberShell>
      <ChamberEyebrow>Krok 3 z 4 · Model</ChamberEyebrow>
      <div style={{ marginTop: 28 }}>
        <ChamberHero accent="model?">Ktorý chceš použiť</ChamberHero>
      </div>
      <ChamberSub maxWidth={500}>
        Lokálny beží offline a je zadarmo. Cloud je rýchlejší, ale potrebuje kľúč.
        Alebo preskoč a nastav neskôr.
      </ChamberSub>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
        margin: '36px auto 28px', maxWidth: 720,
      }}>
        {cards.map((c) => (
          <ChamberCard key={c.id} active={false} onClick={() => onPick(c.id)}>
            <div style={{
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              fontSize: 9.5, letterSpacing: '0.20em', textTransform: 'uppercase',
              color: c.accent ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink-faint, #5a5048)',
              marginBottom: 8,
            }}>{c.tagline}</div>
            <div style={{
              fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
              fontSize: 17, fontWeight: 500, marginBottom: 10, letterSpacing: '-0.01em',
              color: 'var(--ch-ink, #f4ede4)',
            }}>{c.title}</div>
            <div style={{
              fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
              fontStyle: 'italic', fontSize: 12.5, lineHeight: 1.55,
              color: 'var(--ch-ink-dim, #9a8f82)',
            }}>
              {c.lines.map((ln, i) => <div key={i}>{ln}</div>)}
            </div>
          </ChamberCard>
        ))}
      </div>

      <ChamberStepNav onBack={onBack} total={4} current={3} right={null} />
    </ChamberShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// v0.7.8 — Chamber step: 4-model picker (Gemma / Llama / Qwen / Mistral)
// ─────────────────────────────────────────────────────────────────────────────
function ChamberStepLocalPicker({
  picked, onPick, onBack, onStartPull,
}: {
  picked: string | null;
  onPick: (id: string) => void;
  onBack: () => void;
  onStartPull: () => void;
}) {
  return (
    <ChamberShell>
      <ChamberEyebrow>Krok 3 z 4 · Lokálny model</ChamberEyebrow>
      <div style={{ marginTop: 28 }}>
        <ChamberHero accent="stiahnutie">Vyber model na</ChamberHero>
      </div>
      <ChamberSub maxWidth={500}>
        Stiahne sa raz a beží lokálne. Veľkosť a rýchlosť závisia od tvojho zariadenia.
      </ChamberSub>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14,
        margin: '36px auto 28px', maxWidth: 640,
      }}>
        {LOCAL_MODELS.map((m) => {
          const active = picked === m.id;
          return (
            <ChamberCard key={m.id} active={active} onClick={() => onPick(m.id)}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8,
              }}>
                <div style={{
                  fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
                  fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em',
                  color: active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink, #f4ede4)',
                }}>{m.label}</div>
                <div style={{
                  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                  fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'var(--ch-ink-dim, #9a8f82)',
                }}>{m.sizeGB} GB · ~{m.etaMin} min</div>
              </div>
              <div style={{
                fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
                fontStyle: 'italic', fontSize: 12.5,
                color: 'var(--ch-ink-dim, #9a8f82)',
              }}>
                {m.blurb}{m.recommended && <span style={{ color: 'var(--ch-amber, #E8A87C)', marginLeft: 8 }}>· odporúčaný</span>}
              </div>
            </ChamberCard>
          );
        })}
      </div>

      <ChamberStepNav
        onBack={onBack}
        total={4} current={3}
        right={
          <ChamberPrimary onClick={onStartPull} disabled={!picked}>
            Stiahnuť a pokračovať →
          </ChamberPrimary>
        }
      />
    </ChamberShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// v0.7.8 — Chamber step: download progress bar with polling
// ─────────────────────────────────────────────────────────────────────────────
function ChamberStepDownloading({
  model, progress, onBack, onContinueAnyway, onDone, onRetry,
}: {
  model: string | null;
  progress: PullProgress | null;
  onBack: () => void;
  onContinueAnyway: () => void;
  onDone: () => void;
  onRetry: () => void;
}) {
  // Auto-advance once status === 'done'.
  useEffect(() => {
    if (progress?.status === 'done') {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
  }, [progress?.status, onDone]);

  const modelLabel = LOCAL_MODELS.find((m) => m.id === model)?.label ?? model ?? '—';
  const pct = progress?.percent ?? 0;
  const fmtGB = (b: number) => (b / (1 << 30)).toFixed(1) + ' GB';
  const isError = progress?.status === 'error';

  return (
    <ChamberShell>
      <ChamberEyebrow>Sťahujem · {modelLabel}</ChamberEyebrow>
      <div style={{ marginTop: 28, marginBottom: 32 }}>
        <ChamberHero accent={isError ? 'zlyhalo' : `${pct} %`}>{isError ? 'Sťahovanie' : ''}</ChamberHero>
      </div>

      <div style={{ maxWidth: 520, margin: '12px auto 24px' }}>
        {/* Progress bar */}
        <div style={{
          position: 'relative',
          width: '100%', height: 10, borderRadius: 999,
          background: 'rgba(244,237,228,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`,
            background: isError
              ? 'linear-gradient(90deg, #ff8a80, #d97757)'
              : 'linear-gradient(90deg, #F4B58A, #E8A87C, #B87A52)',
            transition: 'width 0.4s ease',
            boxShadow: isError ? 'none' : '0 0 12px rgba(232,168,124,0.5)',
          }} />
        </div>

        {/* Stats line */}
        <div style={{
          marginTop: 14,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 11.5, letterSpacing: '0.10em',
          color: 'var(--ch-ink-dim, #9a8f82)',
          textAlign: 'center',
        }}>
          {isError ? (
            <span style={{ color: 'var(--ch-warn, #d97757)' }}>
              {progress?.error || 'Neznáma chyba'}
            </span>
          ) : progress?.bytesTotal ? (
            <>
              {fmtGB(progress.bytesDone)} / {fmtGB(progress.bytesTotal)}
              {progress.speed && <span> · {progress.speed}</span>}
              {progress.eta && <span> · ~{progress.eta} zostáva</span>}
            </>
          ) : (
            <span style={{ opacity: 0.7 }}>Pripravujem sťahovanie…</span>
          )}
        </div>
      </div>

      <p style={{
        fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
        fontStyle: 'italic', fontSize: 13.5,
        color: 'var(--ch-ink-dim, #9a8f82)',
        maxWidth: 460, margin: '0 auto 32px', lineHeight: 1.6,
      }}>
        Po dokončení môžeš ihneď začať. Alebo pokračuj — model dokončí na pozadí.
      </p>

      <ChamberStepNav
        onBack={isError ? onRetry : onBack}
        total={4} current={3}
        right={
          isError ? (
            <ChamberPrimary onClick={onRetry}>
              Vybrať iný model →
            </ChamberPrimary>
          ) : (
            <ChamberPrimary onClick={onContinueAnyway}>
              Pokračovať beztiaľ →
            </ChamberPrimary>
          )
        }
      />
    </ChamberShell>
  );
}

function ChamberStepProvider({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const provider = detectProvider(key);

  async function saveAndContinue() {
    if (!key.trim() || !provider) { onNext(); return; }
    setSaving(true); setMsg(null);
    const r = await saveCloudKey(provider, key.trim());
    setSaving(false);
    if (r.ok) { setMsg('✓ Uložené'); setTimeout(onNext, 400); }
    else { setMsg(`✗ ${r.msg || 'Neplatný kľúč'}`); }
  }

  return (
    <ChamberShell>
      <ChamberEyebrow>Krok 3 · Cloud kľúč (voliteľné)</ChamberEyebrow>
      <div style={{ marginTop: 28 }}>
        <ChamberHero accent="kľúč?">Máš API</ChamberHero>
      </div>
      <ChamberSub maxWidth={460}>
        Vlož OpenAI, Anthropic alebo Groq kľúč pre silnejší model. Alebo preskoč — použijeme lokálny.
      </ChamberSub>

      <div style={{ marginTop: 32, marginBottom: 12, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
        <ChamberInput
          value={key}
          onChange={setKey}
          placeholder="sk-… · sk-ant-… · gsk_…"
          autoFocus
        />
        <div style={{
          marginTop: 10,
          fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase',
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          color: 'var(--ch-ink-dim, #a09080)', minHeight: 14, textAlign: 'left',
        }}>
          {provider ? provider.toUpperCase() : (key.trim() ? '' : '')}
          {msg && <span style={{ marginLeft: 12, color: msg.startsWith('✓') ? 'var(--ch-ok, #7ea88a)' : 'var(--ch-warn, #d97757)' }}>{msg}</span>}
        </div>
      </div>

      <ChamberStepNav
        onBack={onBack}
        total={4} current={2}
        right={
          <ChamberPrimary onClick={saveAndContinue} disabled={saving}>
            {key.trim() ? (saving ? 'Ukladám…' : 'Uložiť a pokračovať →') : 'Preskočiť →'}
          </ChamberPrimary>
        }
      />
    </ChamberShell>
  );
}

function ChamberStepReady({
  prefs, onBack, onFinish,
}: {
  prefs: UserPrefs;
  onBack: () => void;
  onFinish: () => void;
}) {
  const vibeLabel = VIBES.find((v) => v.id === prefs.vibe)?.label ?? '—';
  const userName = (prefs.user_name ?? '').trim() || 'priateľ';
  return (
    <ChamberShell>
      <ChamberEyebrow>Krok 3 z 3 · Hotovo</ChamberEyebrow>

      <div style={{ margin: '0 auto', width: 'fit-content' }}>
        <ChamberOrb size={200} hero state="idle" />
      </div>

      <div style={{ marginTop: 32 }}>
        <ChamberHero accent="pripravený.">Tutor je</ChamberHero>
      </div>

      <p style={{
        fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
        fontStyle: 'italic',
        fontSize: 18, lineHeight: 1.5,
        color: 'var(--ch-ink-soft, #d8cdb8)',
        margin: '22px auto 0', maxWidth: 440,
      }}>
        Hovor, pýtaj sa, počúvaj. Vždy ťa počuje.
      </p>

      {/* Quiet summary card */}
      <div style={{
        margin: '32px auto 0', maxWidth: 380,
        padding: '18px 22px', borderRadius: 14,
        background: 'var(--ch-bg-card, #15100a)',
        border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px',
        textAlign: 'left',
      }}>
        {[
          ['MENO',     userName],
          ['CHARAKTER', vibeLabel],
          ['JAZYK',    'slovenčina'],
          ['REŽIM',    'lokálne · súkromné'],
        ].map(([k, v]) => (
          <ChamberSummaryRow key={k as string} label={k as string} value={v as string} />
        ))}
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        margin: '24px auto 36px',
        padding: '8px 16px', borderRadius: 999,
        background: 'rgba(126, 168, 138, 0.08)',
        border: '1px solid rgba(126, 168, 138, 0.22)',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 10.5, color: 'var(--ch-ok, #7ea88a)',
        letterSpacing: '0.20em', textTransform: 'uppercase',
      }}>
        ● HARDVÉR · MODEL · NASTAVENÉ AUTOMATICKY
      </div>

      <ChamberStepNav
        onBack={onBack}
        total={4} current={3}
        right={
          <ChamberPrimary onClick={onFinish}>
            Vstúpiť do miestnosti →
          </ChamberPrimary>
        }
      />
    </ChamberShell>
  );
}

// Two-column row inside the Ready step's summary card.
function ChamberSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: 'var(--ch-ink-faint, #5a5048)',
        alignSelf: 'center',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        fontSize: 14, color: 'var(--ch-ink, #f4ede4)',
        alignSelf: 'center',
      }}>
        {value}
      </div>
    </>
  );
}
