// All-caps tracked micro-label — the small section header pattern.
// e.g. `NAME YOUR PRIMARY ASSISTANT`, `WHAT SHOULD I CALL YOU?`, `LLM PROVIDER`.
import { CSSProperties, ReactNode } from 'react';

interface MicroLabelProps {
  children: ReactNode;
  /** Right-side accessory (e.g. a "GET KEY ↗" link or a status pill). */
  right?: ReactNode;
  style?: CSSProperties;
}

export function MicroLabel({ children, right, style }: MicroLabelProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 6,
        ...style,
      }}
    >
      <span className="atm-micro">{children}</span>
      {right != null && <span style={{ fontSize: 10 }}>{right}</span>}
    </div>
  );
}
