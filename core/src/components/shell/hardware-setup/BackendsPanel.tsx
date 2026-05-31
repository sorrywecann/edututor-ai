'use client';

/**
 * BackendsPanel — runtime toggles for lipsync provider and emotion-detection
 * backend. Extracted from HardwareSetup.tsx (Phase 5e) so each toggle is a
 * self-contained presentational component driven by props.
 *
 * Both toggles share the exact same visual treatment (button row with active /
 * disabled / tooltip states). The shared `<BackendToggle>` keeps that styling
 * in one place — adding a third backend toggle in the future is a one-line
 * call site.
 */

interface BackendOption {
  id: string;
  label: string;
  desc: string;
}

interface BackendToggleProps {
  title: string;
  options: ReadonlyArray<BackendOption>;
  active: string;
  disabled?: (id: string) => boolean;
  disabledReason?: (id: string) => string | undefined;
  busy: boolean;
  accent: string;
  onSelect: (id: string) => void;
}

function BackendToggle({
  title,
  options,
  active,
  disabled,
  disabledReason,
  busy,
  accent,
  onSelect,
}: BackendToggleProps) {
  return (
    <div
      style={{
        padding: 14,
        background: 'rgba(245, 237, 216, 0.04)',
        border: '1px solid var(--atm-glass-border)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-jetbrains)',
          fontSize: 8,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {options.map((opt) => {
          const isActive = active === opt.id;
          const isDisabled = disabled?.(opt.id) ?? false;
          const tooltipReason = isDisabled
            ? disabledReason?.(opt.id) || 'Nedostupné'
            : opt.desc;
          return (
            <button
              key={opt.id}
              onClick={() =>
                !isActive && !isDisabled && !busy && onSelect(opt.id)
              }
              disabled={isActive || isDisabled || busy}
              title={tooltipReason}
              aria-pressed={isActive}
              style={{
                flex: 1,
                padding: '10px 12px',
                textAlign: 'left',
                background: isActive ? `${accent}12` : 'var(--bg)',
                border: `1px solid ${isActive ? accent : 'var(--border)'}`,
                borderRadius: 8,
                cursor: isActive || isDisabled ? 'default' : 'pointer',
                opacity: isDisabled ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: isActive ? accent : isDisabled ? 'var(--t3)' : 'var(--t1)',
                  marginBottom: 2,
                }}
              >
                {opt.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: 8.5,
                  color: 'var(--t3)',
                  letterSpacing: '0.04em',
                }}
              >
                {tooltipReason}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface BackendsPanelProps {
  accent: string;
  lipsyncProvider: string;
  lipsyncSidecarOk: boolean;
  switchingLipsync: boolean;
  onSwitchLipsync: (provider: string) => void;
  emotionBackend: string;
  bertAvailable: boolean;
  bertReason: string;
  switchingEmotion: boolean;
  onSwitchEmotion: (backend: string) => void;
}

export function BackendsPanel(props: BackendsPanelProps) {
  return (
    <>
      <BackendToggle
        title="Lipsync režim"
        accent={props.accent}
        active={props.lipsyncProvider}
        busy={props.switchingLipsync}
        onSelect={props.onSwitchLipsync}
        options={[
          { id: 'text', label: 'Text → Viseme', desc: '14 tvarov, bez GPU' },
          { id: 'audio2lipsync', label: 'Audio → ARKit', desc: '52 kanálov, HuBERT AI' },
        ]}
        disabled={(id) => id === 'audio2lipsync' && !props.lipsyncSidecarOk}
        disabledReason={() => 'Sidecar nebeží'}
      />
      <BackendToggle
        title="Detekcia emócií"
        accent={props.accent}
        active={props.emotionBackend}
        busy={props.switchingEmotion}
        onSelect={props.onSwitchEmotion}
        options={[
          { id: 'regex', label: 'Regex', desc: 'rýchle, bez GPU' },
          { id: 'bert', label: 'BERT (PB2)', desc: 'fine-tuned SK model' },
        ]}
        disabled={(id) => id === 'bert' && !props.bertAvailable}
        disabledReason={() => props.bertReason || 'Model nie je dostupný'}
      />
    </>
  );
}
