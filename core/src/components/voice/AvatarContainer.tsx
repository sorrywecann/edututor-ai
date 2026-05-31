// core/src/components/voice/AvatarContainer.tsx
'use client';

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import type { OrbState } from '@/types/orb';
import { Orb } from './Orb';
import { ue5Bridge } from '@/lib/ue5-bridge';
import { logger } from '@/lib/logger';

interface AvatarContainerProps {
  state: OrbState;
  onClick: () => void;
}

const PREF_KEY = 'edututor_avatar_mode'; // 'orb' | 'stream'

export function AvatarContainer({ state, onClick }: AvatarContainerProps) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [pref, setPref] = useState<'auto' | 'orb' | 'stream'>('auto');
  const [avatarConnected, setAvatarConnected] = useState(false);

  // Chamber orb size — must be deterministic on the FIRST server AND first
  // client paint (React hydration), then upgrade to viewport-derived size
  // after mount. We use `useSyncExternalStore` because it's the only React
  // primitive that guarantees `getServerSnapshot()` is what's used for BOTH
  // the SSR render and the first client render — even under React 19's
  // selective/concurrent hydration. A plain `useState + useEffect` pattern
  // can leak the post-mount computed size into the hydration window and
  // throw the dreaded "didn't match" warning.
  const orbSize = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => Math.min(window.innerWidth, window.innerHeight) * 0.55, // client
    () => 420,                                                    // server + first hydration
  );

  // Resolve the URL once on mount. ?ue5= overrides everything; otherwise
  // we look at NEXT_PUBLIC_UE5_STREAM_URL. Saved preference can force orb
  // even when a stream is configured (saves bandwidth and shows the abstract
  // orb when the user prefers it).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('ue5') ?? process.env.NEXT_PUBLIC_UE5_STREAM_URL ?? null;
    setStreamUrl(url);
    try {
      const stored = window.localStorage.getItem(PREF_KEY);
      if (stored === 'orb' || stored === 'stream') setPref(stored);
    } catch { /* private mode — keep default */ }
  }, []);

  useEffect(() => {
    ue5Bridge.onMessage(msg => {
      if (msg.type === 'avatar_ready') {
        logger.info('AvatarContainer.ue5-ready', msg.capabilities);
      }
    });

    const unsubscribe = ue5Bridge.onConnectionChange((connected) => {
      setAvatarConnected(connected);
    });
    return unsubscribe;
  }, []);

  const setPrefPersist = useCallback((p: 'orb' | 'stream') => {
    setPref(p);
    try { window.localStorage.setItem(PREF_KEY, p); } catch { /* ignore */ }
  }, []);

  // Effective rendering: stream when (url available AND pref allows it)
  const showStream = !!streamUrl && pref !== 'orb';

  // Toggle pill — anchored to the bottom of the avatar zone in BOTH stream
  // and orb modes so it doesn't jump positions when the user switches.
  // Only rendered when a stream URL is configured (no point showing it if
  // there's nothing to toggle TO).
  const togglePill = streamUrl ? (
    <div
      style={{
        position: 'absolute',
        top: 60,
        right: 24,
        zIndex: 11,
        display: 'flex',
        gap: 2,
        padding: 2,
        background: 'rgba(26, 20, 16, 0.70)',
        backdropFilter: 'blur(16px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.35)',
        border: '1px solid var(--atm-glass-border)',
        borderRadius: 999,
        fontFamily: 'var(--font-jetbrains)',
        fontSize: 9,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        pointerEvents: 'auto',
      }}
    >
      {(['stream', 'orb'] as const).map((opt) => {
        const active = showStream ? opt === 'stream' : opt === 'orb';
        return (
          <button
            key={opt}
            onClick={(e) => { e.stopPropagation(); setPrefPersist(opt); }}
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              border: 'none',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--t3)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              textTransform: 'inherit',
              fontWeight: active ? 700 : 500,
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {opt === 'stream' ? 'Avatar' : 'Orb'}
          </button>
        );
      })}
    </div>
  ) : null;

  // STREAM MODE — the UE5 avatar runs full-bleed and frameless. No CSS mask or
  // glow: the avatar's own (black) studio background fills the frame, so there's
  // nothing on the web side that can produce an edge vignette/aura. Anything
  // glow-like remaining is a light/bloom in the UE scene itself (UE-side).
  // Click-to-talk is the mic in the chat bar, so nothing occludes the face.
  if (showStream) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          src={streamUrl!}
          data-orb-state={state}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            background: '#000',
          }}
          allow="autoplay; microphone; camera"
          title="EduTutor avatar"
        />
        {togglePill}
      </div>
    );
  }

  // ORB MODE — the particle-constellation orb fills the stage, frameless.
  // Same footprint as the framed avatar above, so toggling never moves
  // anything. Audio-reactive via the shared signal that useVoiceSession
  // writes from its analyser. Size scales with the smaller viewport
  // dimension so it stays centered without overflowing. v0.7.3: single
  // canonical Orb replaces the prior variant-based GradientOrb / ChamberOrb
  // split — visual identity is the same across atmosphere and chamber.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Orb
        state={state}
        size={orbSize}
        hero
        onClick={onClick}
      />
      {togglePill}
    </div>
  );
}
