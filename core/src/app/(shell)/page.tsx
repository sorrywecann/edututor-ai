'use client';

import { useSession, signIn } from 'next-auth/react';
import { AUTH_DISABLED } from '@/lib/authMode';
import { useState, useEffect, Suspense } from 'react';
import { GlassCard, MicroLabel, StatusPill, Nudge } from '@/components/atmosphere';
import { API_BASE } from '@/lib/config';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/shell/Topbar';
import { Message, type ChatMessage } from '@/components/chat/Message';
import { motion } from 'framer-motion';
import { VoiceZone } from '@/components/voice/VoiceZone';
import { AvatarContainer } from '@/components/voice/AvatarContainer';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import { useProviderSettings } from '@/hooks/useProviderSettings';
import { api } from '@/lib/api';
import type { KnowledgeBase } from '@/lib/api';

import { useToast } from '@/components/ui/Toast';
import { useMode } from '@/hooks/useMode';

function LoginPage() {
  const [email, setEmail] = useState('demo@edututor.sk');
  const [password, setPassword] = useState('edututor2026');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError('Invalid credentials.');
    }
  }

  return (
    <div
      className="atm-hero"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, overflow: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <GlassCard pad="lg" maxWidth={400}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div className="atm-micro" style={{ color: 'var(--atm-dot-active)', marginBottom: 8 }}>
              EduTutor · AI Language Platform
            </div>
            <h1 style={{
              fontFamily: 'var(--font-inter)', fontSize: 24, fontWeight: 600,
              color: 'var(--t1)', letterSpacing: '-0.02em', margin: 0,
            }}>
              Vitaj späť
            </h1>
            <p style={{ fontSize: 13, color: 'var(--t2)', margin: '6px 0 0', lineHeight: 1.55 }}>
              Prihlás sa a pokračuj v učení s Lukášom.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <MicroLabel>Email</MicroLabel>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="demo@edututor.sk" required
                style={loginInput}
              />
            </div>
            <div>
              <MicroLabel>Heslo</MicroLabel>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={loginInput}
              />
            </div>
            {error && (
              <div style={{
                fontSize: 11, color: '#ef4444', fontFamily: 'var(--font-jetbrains)',
                padding: '6px 10px', background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8,
              }}>
                ✗ {error}
              </div>
            )}
            <button
              type="submit" disabled={loading}
              style={{
                padding: '11px', background: 'var(--accent)', border: '1px solid var(--accent)',
                borderRadius: 8, fontSize: 13, fontWeight: 500,
                color: '#fff', cursor: loading ? 'default' : 'pointer',
                fontFamily: 'var(--font-inter)', marginTop: 6,
                opacity: loading ? 0.7 : 1,
                transition: 'opacity 150ms ease',
              }}
            >
              {loading ? 'Prihlasujem…' : 'Prihlásiť sa'}
            </button>
          </form>

          <div style={{
            marginTop: 18, padding: '10px 12px',
            background: 'rgba(245, 237, 216, 0.03)',
            border: '1px solid var(--atm-glass-border)', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <StatusPill kind="info" dot={false}>DEMO</StatusPill>
            <div style={{
              fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t2)',
              letterSpacing: '0.04em', lineHeight: 1.6,
            }}>
              demo@edututor.sk · edututor2026
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

const loginInput: React.CSSProperties = {
  width: '100%',
  background: 'rgba(245, 237, 216, 0.04)',
  border: '1px solid var(--atm-glass-border)',
  borderRadius: 8, padding: '10px 12px', fontSize: 13,
  color: 'var(--t1)', fontFamily: 'var(--font-inter)', outline: 'none',
  boxSizing: 'border-box',
};

function AppPage({ isNewSession }: { isNewSession?: boolean }) {
  const { mode, modes, modeId, setMode } = useMode();

  const {
    voices, sttModels, llmModels, ttsProvider, ttsVoice, sttModel, llmProvider,
    setSttModel, selectVoice, applyModeVoice, setLlmProvider, refetchLlmModels, loading: settingsLoading,
    isAnyProviderReady, switchError, clearSwitchError,
  } = useProviderSettings();

  // W2: poll system/status alongside the provider models. If the backend
  // reports no LLM AND the provider list says nothing is available, we show
  // an error banner above the input bar. Polling lightly (10s) is plenty —
  // first-run users won't notice the delay, and changes are infrequent.
  const [backendLlm, setBackendLlm] = useState<string | null>(null);
  const [backendStatusKnown, setBackendStatusKnown] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(`${API_BASE}/api/v1/system/status`);
        if (!alive) return;
        if (r.ok) {
          const d = await r.json();
          setBackendLlm(d?.llm ?? null);
          setBackendStatusKnown(true);
        } else {
          setBackendStatusKnown(true);
        }
      } catch {
        if (alive) setBackendStatusKnown(true);
      }
    }
    load();
    const iv = setInterval(load, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const { showToast } = useToast();

  useEffect(() => {
    applyModeVoice(mode.ttsVoice, mode.ttsProvider);
  }, [mode.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    orbState, messages, sessionTitle, handleOrbClick, sendTextMessage, activeKb, setActiveKb,
    persistentError, clearPersistentError,
  } = useVoiceSession(ttsProvider, ttsVoice, sttModel || undefined, isNewSession, showToast, modeId, mode.sttLanguage);

  // W2: derived banner conditions. We deliberately wait for both backend
  // status AND the provider models to have at least attempted to load before
  // claiming "no model is ready" — otherwise the banner flashes on first
  // mount while the fetches are in flight.
  const noLlmReady =
    !settingsLoading &&
    backendStatusKnown &&
    !isAnyProviderReady &&
    !backendLlm;
  function openHardware() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('edututor:open-hardware'));
    }
  }

  // Orb vs UE5-avatar is resolved entirely inside <AvatarContainer> (reads
  // ?ue5= / NEXT_PUBLIC_UE5_STREAM_URL + the user's saved preference), so the
  // page no longer branches on it — that double-decision was what made the
  // orb jump position when toggling. The page just gives it one stable stage.

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  useEffect(() => {
    api.listKnowledgeBases()
      .then(setKnowledgeBases)
      .catch(() => {/* backend offline */});
  }, []);

  useEffect(() => {
    if (knowledgeBases.length === 0) return;
    if (activeKb && !knowledgeBases.find(kb => kb.name === activeKb)) {
      setActiveKb(undefined);
    }
  }, [knowledgeBases, activeKb, setActiveKb]);

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Full-bleed avatar / orb — fills the whole surface; everything else
          floats over it as glass. No top or bottom "bars". */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(var(--accent-r), 0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <AvatarContainer state={orbState} onClick={handleOrbClick} />
      </div>

      {/* Floating top — the controls sit as glass over the avatar, no bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <Topbar
            sessionTitle={sessionTitle}
            onEndSession={handleOrbClick}
            sttModel={sttModel || undefined}
            llmProvider={llmProvider || undefined}
            ttsVoice={ttsVoice}
            ttsProvider={ttsProvider}
          />
        </div>
      </div>

      {/* Greeting (idle) — floats near the top; fades when the chat begins */}
      {messages.length === 0 && (
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, zIndex: 5, pointerEvents: 'none' }}>
          <AtmosphereWelcome />
        </div>
      )}

      {/* Recent chat — floats above the input bar */}
      {messages.length > 0 && <RecentMessages messages={messages} />}

      {/* W2: error / warning banners sit immediately above the input bar.
          Stacked, full-width, pointer-events auto so the user can act on
          them. The bottom fade below still gives the input bar its lift. */}
      {(noLlmReady || persistentError || switchError) && (
        <div style={{
          position: 'absolute', bottom: 96, left: 0, right: 0, zIndex: 11,
          display: 'flex', flexDirection: 'column', gap: 1,
          pointerEvents: 'auto',
        }}>
          {noLlmReady && (
            <Nudge
              kind="error"
              layout="banner"
              title="Žiadny model nie je pripravený"
              body="Otvor Nastavenia → Hardvér a buď vyber lokálny model alebo vlož API kľúč."
              action={{ label: 'Otvoriť nastavenia', onClick: openHardware }}
            />
          )}
          {persistentError && (
            <Nudge
              kind="warning"
              layout="banner"
              title={persistentError}
              body="Skús to znova, alebo otvor Nastavenia a prepni model."
              action={{ label: 'Otvoriť nastavenia', onClick: openHardware }}
              dismissible
              secondary={{ label: 'Zavrieť', onClick: clearPersistentError }}
            />
          )}
          {switchError && (
            <Nudge
              kind="warning"
              layout="banner"
              title="Prepnutie modelu zlyhalo"
              body={switchError}
              action={{ label: 'Otvoriť nastavenia', onClick: openHardware }}
              dismissible
              secondary={{ label: 'Zavrieť', onClick: clearSwitchError }}
            />
          )}
        </div>
      )}

      {/* Floating bottom — just the chat bar + voice dropdown + mic. The fade
          keeps the input legible over the avatar; clicks pass through to the
          avatar everywhere except the bar itself. */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        background: 'linear-gradient(to top, var(--bg) 34%, transparent)',
        pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto' }}>
          <VoiceZone
            onSendText={sendTextMessage}
            voices={voices} sttModels={sttModels} llmModels={llmModels}
            ttsVoice={ttsVoice} ttsProvider={ttsProvider} sttModel={sttModel} llmProvider={llmProvider}
            onSelectVoice={selectVoice} onSelectStt={setSttModel} onSelectLlm={setLlmProvider}
            onRefetchLlm={refetchLlmModels}
            settingsLoading={settingsLoading}
            knowledgeBases={knowledgeBases}
            activeKb={activeKb}
            onSelectKb={setActiveKb}
            orbState={orbState}
            onMicClick={handleOrbClick}
          />
        </div>
      </div>
    </div>
  );
}

// Single-user local/desktop: no auth gate and no useSession (there's no
// SessionProvider in that mode — see AuthProvider), so nothing fetches
// /api/auth/session and the app opens straight to the tutor.
function AuthlessRoot() {
  const searchParams = useSearchParams();
  const newKey = searchParams.get('new') ?? 'default';
  return <AppPage key={newKey} isNewSession={newKey !== 'default'} />;
}

function AuthedRoot() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const newKey = searchParams.get('new') ?? 'default';

  if (status === 'loading') return null;
  if (!session) return <LoginPage />;
  // key forces AppPage to remount (fresh session) when ?new=timestamp changes
  return <AppPage key={newKey} isNewSession={newKey !== 'default'} />;
}

function RootPageInner() {
  // AUTH_DISABLED is a build-time constant, so this branch never flips between
  // renders — each child calls its own hooks unconditionally (Rules of Hooks).
  return AUTH_DISABLED ? <AuthlessRoot /> : <AuthedRoot />;
}

export default function RootPage() {
  return (
    <Suspense>
      <RootPageInner />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RecentMessages — the last turn or two float over the lower part of the orb
// (tutor left, you right) and gently fade after a pause, so the conversation
// feels present without a panel. Full history lives in the sidebar's History
// flyout, so the avatar is never crowded.
// ─────────────────────────────────────────────────────────────────────────────
function RecentMessages({ messages }: { messages: ChatMessage[] }) {
  const recent = messages.slice(-2);
  const [dimmed, setDimmed] = useState(false);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    setDimmed(false);
    const t = setTimeout(() => setDimmed(true), 7000);
    return () => clearTimeout(t);
  }, [lastId]);

  return (
    <motion.div
      animate={{ opacity: dimmed ? 0.12 : 1 }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
      style={{
        position: 'absolute',
        bottom: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 6,
        width: '100%',
        maxWidth: 660,
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {recent.map(m => (
        <Message key={m.id} message={m} compact />
      ))}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AtmosphereWelcome — first-visit greeting above the orb. Reads the user's
// name and assistant name from localStorage user-prefs (written by onboarding)
// and shows a hint of what to do. Disappears as soon as the first message
// appears.
// ─────────────────────────────────────────────────────────────────────────────
function AtmosphereWelcome() {
  const [userName, setUserName] = useState<string>('');
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    try {
      const raw = window.localStorage.getItem('edututor_user_prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.user_name) setUserName(p.user_name);
      }
    } catch {
      /* missing or malformed prefs — fall through to defaults */
    }
  }, []);

  if (!now) return null;
  const h = now.getHours();
  // "Dobrú noc" is a farewell, not a greeting — always greet warmly.
  const greeting =
    h < 5 ? 'Dobrý večer'
    : h < 10 ? 'Dobré ráno'
    : h < 18 ? 'Dobrý deň'
    : 'Dobrý večer';

  return (
    <div
      style={{
        padding: '32px 24px 8px',
        textAlign: 'center',
        animation: 'atm-quote-fade 600ms ease both',
      }}
    >
      <h1
        className="atm-greeting"
        style={{ margin: 0, fontSize: 'clamp(22px, 3.2vw, 32px)' }}
      >
        {userName ? `${greeting}, ${userName}.` : `${greeting}.`}
      </h1>
      <div style={{ marginTop: 10, fontSize: 13.5, color: 'var(--t2)', letterSpacing: '-0.01em' }}>
        Čo sa dnes naučíme?
      </div>
    </div>
  );
}
