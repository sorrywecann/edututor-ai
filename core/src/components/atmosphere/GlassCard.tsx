// Frosted-glass card — the UNCLAW-style bottom panel.
// Use as the container for any single-decision step.
import { CSSProperties, ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  /** Pad amount: 'sm' 16px | 'md' 22px | 'lg' 32px. Default 'md'. */
  pad?: 'sm' | 'md' | 'lg';
  /** Maximum width — narrower cards feel more focused. Default 720px. */
  maxWidth?: number | string;
  style?: CSSProperties;
}

const PAD = { sm: '16px 18px', md: '22px 26px', lg: '32px 36px' };

export function GlassCard({ children, pad = 'md', maxWidth = 720, style }: GlassCardProps) {
  return (
    <div
      className="atm-glass"
      style={{
        padding: PAD[pad],
        width: '100%',
        maxWidth,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
