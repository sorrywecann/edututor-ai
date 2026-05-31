'use client';

// TickSlider — extracted byte-identical 3-stop range slider used by PersonaTab.

export function TickSlider({ value, ticks, onChange }: { value: number; ticks: [string, string, string]; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ position: 'relative', padding: '8px 0' }}>
        <input
          type="range"
          min={0} max={2} step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ch-tick-slider"
          aria-label="personality tick"
        />
        <div aria-hidden style={{
          position: 'absolute', left: 7, right: 7, top: '50%',
          display: 'flex', justifyContent: 'space-between',
          pointerEvents: 'none', transform: 'translateY(-50%)',
        }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{
              width: 4, height: 4, borderRadius: '50%',
              background: value >= i ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink-faint, #5a5048)',
              opacity: value === i ? 0 : 0.55,
              transition: 'background 0.22s, opacity 0.22s',
            }} />
          ))}
        </div>
      </div>
      <div style={{
        marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--ch-ink-faint, #5a5048)',
      }}>
        <span style={{ textAlign: 'left' }}>{ticks[0]}</span>
        <span style={{ textAlign: 'center' }}>{ticks[1]}</span>
        <span style={{ textAlign: 'right' }}>{ticks[2]}</span>
      </div>
      <style>{`
        .ch-tick-slider {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          height: 22px;
          background: transparent;
          cursor: pointer;
          outline: none;
        }
        .ch-tick-slider::-webkit-slider-runnable-track {
          height: 1px;
          background: var(--ch-line-strong, rgba(244,237,228,0.12));
          border-radius: 999px;
        }
        .ch-tick-slider::-moz-range-track {
          height: 1px;
          background: var(--ch-line-strong, rgba(244,237,228,0.12));
          border-radius: 999px;
        }
        .ch-tick-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #F4B58A 0%, #E8A87C 60%, #B87A52 100%);
          border: none;
          box-shadow: 0 0 14px rgba(232,168,124,0.55);
          margin-top: -7.5px;
          cursor: grab;
          transition: transform 0.18s;
        }
        .ch-tick-slider::-webkit-slider-thumb:hover { transform: scale(1.12); }
        .ch-tick-slider::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.18); }
        .ch-tick-slider::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #F4B58A 0%, #E8A87C 60%, #B87A52 100%);
          border: none;
          box-shadow: 0 0 14px rgba(232,168,124,0.55);
          cursor: grab;
        }
        .ch-tick-slider:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 4px rgba(232,168,124,0.20), 0 0 14px rgba(232,168,124,0.55);
        }
      `}</style>
    </div>
  );
}
