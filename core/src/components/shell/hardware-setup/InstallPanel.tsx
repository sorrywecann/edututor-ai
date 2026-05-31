'use client';

/**
 * InstallPanel — terminal-style installation instructions for the
 * hardware-recommended provider stack. Pure presentation: takes the
 * install lines, the copy state, and the copy handler from the parent.
 *
 * Extracted from HardwareSetup.tsx (Phase 5e step 2). The terminal-window
 * styling (red/amber/green dots, $ prompt, line-by-line colorisation)
 * was 28 lines of inline JSX in the parent — now isolated so it can be
 * reused (e.g. in the future open-source-release docs page) and so the
 * parent's render method shrinks.
 */

interface InstallPanelProps {
  installLines: string[];
  copied: boolean;
  accent: string;
  onCopy: () => void;
}

export function InstallPanel({ installLines, copied, accent, onCopy }: InstallPanelProps) {
  const lines = installLines.length > 0 ? installLines : ['# Žiadna dodatočná inštalácia nie je potrebná'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.65 }}>
        Spusti tieto príkazy na inštaláciu odporúčanej konfigurácie pre tvoj hardvér.
      </div>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--atm-glass-border)', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--atm-glass-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {['#ef4444', '#f59e0b', '#22c55e'].map((c) => (
            <span
              key={c}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: c,
                display: 'inline-block',
              }}
            />
          ))}
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: 8,
              letterSpacing: '0.1em',
              color: 'var(--t3)',
              marginLeft: 6,
              textTransform: 'uppercase',
            }}
          >
            terminal
          </span>
          <button
            onClick={onCopy}
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              background: 'transparent',
              border: `1px solid ${copied ? accent : 'var(--border)'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-jetbrains)',
              fontSize: 8,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: copied ? accent : 'var(--t3)',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            {copied ? 'Skopírované' : 'Kopírovať'}
          </button>
        </div>
        <div
          style={{
            padding: '14px 16px',
            fontFamily: 'var(--font-jetbrains)',
            fontSize: 11,
            color: 'var(--t2)',
            lineHeight: 2.1,
            overflowX: 'auto',
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                color: line.startsWith('#')
                  ? 'var(--t3)'
                  : line.startsWith('pip') ||
                    line.startsWith('brew') ||
                    line.startsWith('ollama') ||
                    line.startsWith('curl')
                  ? accent
                  : 'var(--t1)',
              }}
            >
              {!line.startsWith('#') && (
                <span style={{ color: accent, marginRight: 8, userSelect: 'none' }}>$</span>
              )}
              {line}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
        Po inštalácii reštartuj backend — nové providery sa automaticky zobrazia v nastaveniach.
      </div>
    </div>
  );
}
