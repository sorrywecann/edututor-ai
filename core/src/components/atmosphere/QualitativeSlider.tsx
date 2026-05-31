'use client';

// Qualitative slider — the CASUAL ← CORDIAL → FORMAL pattern.
// Each tick along the track gets a WORD label rather than a number, and the
// thumb is annotated with the word for its current position. Used by the
// Vibe step (personality knobs) and the future Avatar parameters page.
//
// Storage convention: value is a 0..(steps-1) integer index. Caller decides
// what to do with that index (it can map to backend env vars, etc).

import { useId, useMemo } from 'react';

interface QualitativeSliderProps {
  /** Labels along the track, in order from leftmost to rightmost. The thumb
   *  label is whichever index `value` lands on. Length should be 3–5 for
   *  readability (UNCLAW uses 3). */
  labels: string[];
  value: number;
  onChange: (v: number) => void;
  /** Optional title shown as an all-caps micro-label above the slider. */
  title?: string;
}

export function QualitativeSlider({ labels, value, onChange, title }: QualitativeSliderProps) {
  const id = useId();
  const max = labels.length - 1;
  const clamped = Math.max(0, Math.min(max, value));
  const pct = max === 0 ? 0 : (clamped / max) * 100;
  const activeLabel = labels[clamped];

  const trackTicks = useMemo(
    () => labels.map((_, i) => (max === 0 ? 0 : (i / max) * 100)),
    [labels, max],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <span className="atm-micro">{title}</span>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--atm-slider-marker)',
              fontWeight: 600,
            }}
          >
            {activeLabel}
          </span>
        </div>
      )}

      {/* Track */}
      <div
        style={{
          position: 'relative',
          height: 28,
          padding: '12px 0',
        }}
      >
        {/* Background line */}
        <div
          style={{
            position: 'absolute',
            top: 13,
            left: 0,
            right: 0,
            height: 2,
            background: 'var(--atm-slider-track)',
            borderRadius: 1,
          }}
        />
        {/* Active fill */}
        <div
          style={{
            position: 'absolute',
            top: 13,
            left: 0,
            width: `${pct}%`,
            height: 2,
            background: 'var(--atm-slider-fill)',
            borderRadius: 1,
            transition: 'width 220ms ease',
          }}
        />
        {/* Tick marks */}
        {trackTicks.map((tickPct, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: 9,
              left: `${tickPct}%`,
              width: 2,
              height: 10,
              background:
                i <= clamped ? 'var(--atm-slider-fill)' : 'var(--atm-slider-track)',
              transform: 'translateX(-1px)',
              borderRadius: 1,
            }}
          />
        ))}
        {/* Thumb */}
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: `${pct}%`,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--atm-slider-thumb)',
            transform: 'translateX(-6px)',
            transition: 'left 220ms cubic-bezier(0.32, 0.72, 0, 1)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
            pointerEvents: 'none',
          }}
        />
        {/* Invisible native range for keyboard + drag */}
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={clamped}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            opacity: 0,
            margin: 0,
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Endpoint labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--atm-slider-label)',
        }}
      >
        <span>{labels[0]}</span>
        {labels.length > 2 && labels.length % 2 === 1 && (
          <span style={{ color: 'var(--atm-slider-label)' }}>{labels[Math.floor(max / 2)]}</span>
        )}
        <span>{labels[max]}</span>
      </div>
    </div>
  );
}
