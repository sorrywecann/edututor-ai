// core/src/lib/connection-state-pill.tsx
import type { WSState } from './use-reconnecting-websocket';
import { logger } from '@/lib/logger';

const STATE_STYLE: Record<WSState, { dot: string; label: string }> = {
  connected:     { dot: '#22c55e', label: 'Pripojené' },
  reconnecting:  { dot: '#f59e0b', label: 'Pripájam...' },
  connecting:    { dot: '#f59e0b', label: 'Pripájam...' },
  disconnected:  { dot: '#ef4444', label: 'Odpojené' },
};

export function ConnectionStatePill({ state, onClick }: {
  state: WSState;
  onClick?: () => void;
}) {
  const style = STATE_STYLE[state] ?? STATE_STYLE.disconnected;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
        else logger.info('connection-pill', `state=${state}`);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        border: 'none',
        cursor: 'pointer',
        background: 'rgba(0,0,0,0.25)',
        color: '#e5e7eb',
        lineHeight: '18px',
      }}
      title={`Avatar WebSocket: ${style.label} (klikni pre info)`}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: style.dot,
          display: 'inline-block',
          flexShrink: 0,
          boxShadow: `0 0 6px ${style.dot}`,
          ...(state === 'reconnecting' || state === 'connecting'
            ? { animation: 'pulse 1s infinite' }
            : {}),
        }}
      />
      {style.label}
    </button>
  );
}
