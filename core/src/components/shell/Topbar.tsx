'use client';

import { useState, useEffect } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useDesignVariant } from '@/lib/designVariant';

interface TopbarProps {
  sessionTitle?: string;
  topic?: string;
  onEndSession?: () => void;
  sttModel?: string;
  llmProvider?: string;
  ttsVoice?: string;
  ttsProvider?: string;
}

const DEFAULT_TUTOR_NAME = 'Lukáš';

function useClock(): string {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const iv = setInterval(tick, 15000);
    return () => clearInterval(iv);
  }, []);
  return now;
}

// Tutor display name from saved prefs (onboarding can rename it). One tutor —
// no mode picker, no connection/debug indicators. Just a calm header.
function useTutorName(): string {
  const [name, setName] = useState(DEFAULT_TUTOR_NAME);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('edututor_user_prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.assistant_name) setName(p.assistant_name);
      }
    } catch { /* default */ }
  }, []);
  return name;
}

export function Topbar({ sessionTitle, onEndSession }: TopbarProps) {
  const clock = useClock();
  const tutorName = useTutorName();
  const { variant } = useDesignVariant();

  // Chamber kills the top bar entirely — the surface stays void, the orb is
  // the room. Atmosphere keeps its chrome.
  if (variant === 'chamber') return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: '54px',
        flexShrink: 0,
        position: 'relative',
        zIndex: 5,
      }}
    >
      {/* Left: tutor identity + quiet session label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px rgba(var(--accent-r), 0.5)' }} />
          <span style={{ color: 'var(--t1)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>{tutorName}</span>
        </span>
        {sessionTitle && (
          <>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-mid)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sessionTitle}
            </span>
          </>
        )}
      </div>

      {/* Right: clock · theme · end — minimal, calm */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--t3)', letterSpacing: '0.04em' }}>
          {clock}
        </span>
        <ThemeToggle />
        {onEndSession && (
          <button
            onClick={onEndSession}
            style={{
              padding: '6px 14px', background: 'transparent',
              border: '1px solid var(--border-mid)', borderRadius: '10px',
              fontSize: '11.5px', color: 'var(--t2)', cursor: 'pointer',
              fontFamily: 'var(--font-inter)', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--accent-r), 0.4)'; e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--t2)'; }}
          >
            Ukončiť
          </button>
        )}
      </div>
    </div>
  );
}
