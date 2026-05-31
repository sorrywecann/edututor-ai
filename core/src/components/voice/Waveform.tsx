'use client';

import { motion } from 'framer-motion';
import type { OrbState } from '@/types/orb';

const BARS = [4, 14, 22, 9, 26, 15, 6, 20, 11, 18, 4, 14, 28, 8, 19, 12, 5, 23, 10];

const STATE_BAR_COLORS: Record<OrbState, string> = {
  idle: 'var(--t3)',
  listening: 'var(--state-listening)',
  thinking: 'var(--state-thinking)',
  speaking: 'var(--state-speaking)',
  loading: 'var(--state-thinking)',
};

interface WaveformProps {
  state: OrbState;
}

export function Waveform({ state }: WaveformProps) {
  const active = state === 'listening' || state === 'speaking';

  return (
    <motion.div
      animate={{ opacity: active ? 1 : 0.25 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2.5px',
        height: '28px',
      }}
    >
      {BARS.map((h, i) => (
        <span
          key={i}
          style={{
            width: '2.5px',
            borderRadius: '2px',
            background: STATE_BAR_COLORS[state],
            '--h': `${h}px`,
            animation: 'waveform-bar 1s ease-in-out infinite',
            animationDelay: `${i * 0.06}s`,
            animationPlayState: active ? 'running' : 'paused',
            transition: 'background 0.4s',
          } as React.CSSProperties}
        />
      ))}
    </motion.div>
  );
}
