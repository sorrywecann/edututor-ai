// MetricCard — single numeric stat tile for /performance, /progress, dashboards.
//
// Layout: MicroLabel header, large mono value with optional unit suffix,
// optional delta badge below (up/down arrow + percentage), optional one-line
// description footer.
//
// v0.8.0: optional `variant="editorial"` drops the card box and renders the
// number in Instrument Serif italic with a hairline divider — magazine
// pull-quote feel. Used on the Pokrok page hero band.

import { CSSProperties, ReactNode } from 'react';

interface MetricCardProps {
  /** Stat name — shown as MicroLabel above the value */
  label: ReactNode;
  /** The number itself — formatted as you want it (e.g. "1,245" or "98.4%") */
  value: ReactNode;
  /** Optional unit suffix shown smaller next to the value (e.g. "ms", "/s") */
  unit?: string;
  /** Optional delta indicator — { direction: 'up' | 'down' | 'flat', label: '+12%' } */
  delta?: { direction: 'up' | 'down' | 'flat'; label: string };
  /**
   * Whether direction = up is good (green) or bad (red).
   * E.g. latency up = bad; conversions up = good. Default 'up-is-good'.
   */
  polarity?: 'up-is-good' | 'up-is-bad';
  /** Optional description shown smaller below */
  description?: ReactNode;
  /**
   * Visual variant. Default ('default') renders the standard glass tile.
   * 'editorial' drops the card box and uses Instrument Serif italic for the
   * number with a hairline divider beneath it, label below. v0.8.0+.
   */
  variant?: 'default' | 'editorial';
  style?: CSSProperties;
}

function deltaColor(direction: 'up' | 'down' | 'flat', polarity: 'up-is-good' | 'up-is-bad'): string {
  if (direction === 'flat') return 'var(--t3)';
  const good = direction === 'up' ? polarity === 'up-is-good' : polarity === 'up-is-bad';
  return good ? 'var(--green)' : '#ef4444';
}

function deltaArrow(direction: 'up' | 'down' | 'flat'): string {
  return direction === 'up' ? '↑' : direction === 'down' ? '↓' : '·';
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  polarity = 'up-is-good',
  description,
  variant = 'default',
  style,
}: MetricCardProps) {
  if (variant === 'editorial') {
    return (
      <div
        style={{
          padding: '4px 0 2px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minWidth: 140,
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            className="atm-numeral"
            style={{
              fontSize: 54,
              color: 'var(--t1)',
            }}
          >
            {value}
          </span>
          {unit && (
            <span
              style={{
                fontFamily: 'var(--font-inter), sans-serif',
                fontSize: 13,
                color: 'var(--t3)',
                fontWeight: 400,
              }}
            >
              {unit}
            </span>
          )}
        </div>
        <div style={{ height: 1, background: 'var(--border)', width: '100%' }} />
        <div className="atm-micro">{label}</div>
        {delta && (
          <div
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: 10,
              color: deltaColor(delta.direction, polarity),
              letterSpacing: '0.04em',
            }}
          >
            {deltaArrow(delta.direction)} {delta.label}
          </div>
        )}
        {description && (
          <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>{description}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className="atm-glass"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 140,
        ...style,
      }}
    >
      <div className="atm-micro">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: 26,
            fontWeight: 600,
            color: 'var(--t1)',
            lineHeight: 1,
            letterSpacing: '-0.01em',
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: 11,
              color: 'var(--t3)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {delta && (
        <div
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: 10,
            color: deltaColor(delta.direction, polarity),
            letterSpacing: '0.04em',
          }}
        >
          {deltaArrow(delta.direction)} {delta.label}
        </div>
      )}
      {description && (
        <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>{description}</div>
      )}
    </div>
  );
}
