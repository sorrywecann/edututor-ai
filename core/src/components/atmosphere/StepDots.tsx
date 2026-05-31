// Step-indicator dots — replaces the verbose "Krok N z 6" stepper.
// Current step is a wider pill in the accent colour; completed steps are
// faint white; remaining are barely visible.
interface StepDotsProps {
  total: number;
  current: number; // 0-indexed
  onJump?: (i: number) => void;
}

export function StepDots({ total, current, onJump }: StepDotsProps) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const color = isActive
          ? 'var(--atm-dot-active)'
          : isDone
          ? 'var(--atm-dot-done)'
          : 'var(--atm-dot-idle)';
        return (
          <button
            key={i}
            onClick={() => onJump?.(i)}
            disabled={!onJump}
            aria-label={`Krok ${i + 1} z ${total}`}
            style={{
              width: isActive ? 22 : 6,
              height: 6,
              borderRadius: 3,
              background: color,
              border: 'none',
              padding: 0,
              cursor: onJump ? 'pointer' : 'default',
              transition: 'all 280ms ease',
            }}
          />
        );
      })}
    </div>
  );
}
