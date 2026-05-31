'use client';

import { useRef } from 'react';
import { ProviderSettings } from './ProviderSettings';
import type { VoiceOption, STTOption, LLMOption } from '@/hooks/useProviderSettings';
import type { KnowledgeBase } from '@/lib/api';

// v0.7.0 (W4): LipsyncSelector REMOVED.
// Per audit C4 + project_arkit_orphaned memory: the ARKit/audio2lipsync path
// renders nowhere — UE5 consumes the 14 visemes only. The selector was a
// button that did nothing visible. Visemes is now the only path. The
// /lipsync/switch endpoint is left wired for backwards compat but the UI
// affordance is gone.

interface VoiceZoneProps {
  onSendText: (text: string) => void;
  voices: VoiceOption[];
  sttModels: STTOption[];
  llmModels: LLMOption[];
  ttsVoice: string;
  ttsProvider: string;
  sttModel: string;
  llmProvider: string;
  onSelectVoice: (v: VoiceOption) => void;
  onSelectStt: (id: string) => void;
  onSelectLlm: (id: string) => void;
  onRefetchLlm?: () => Promise<void>;
  settingsLoading: boolean;
  knowledgeBases?: KnowledgeBase[];
  activeKb?: string;
  onSelectKb?: (name: string | undefined) => void;
  orbState?: import('@/types/orb').OrbState;
  onMicClick?: () => void;
}

// MicButton — the round click-to-talk control on the right of the bar.
function MicButton({ state, onClick }: {
  state: import('@/types/orb').OrbState;
  onClick: () => void;
}) {
  const configs = {
    idle:      { bg: 'rgba(200,190,170,0.10)', dot: 'var(--state-idle)',      border: 'rgba(200,190,170,0.28)', glow: 'none',                              label: 'STLAČ A HOVOR' },
    listening: { bg: 'rgba(127,176,105,0.16)', dot: 'var(--state-listening)', border: 'rgba(127,176,105,0.45)', glow: '0 0 18px rgba(127,176,105,0.45)',  label: 'POČÚVAM…' },
    thinking:  { bg: 'rgba(224,164,88,0.16)',  dot: 'var(--state-thinking)',  border: 'rgba(224,164,88,0.45)',  glow: '0 0 16px rgba(224,164,88,0.40)',   label: 'PREMÝŠĽAM…' },
    speaking:  { bg: 'rgba(var(--accent-r),0.18)', dot: 'var(--state-speaking)', border: 'rgba(var(--accent-r),0.45)', glow: '0 0 18px rgba(var(--accent-r),0.50)', label: 'HOVORÍ' },
    loading:   { bg: 'rgba(224,164,88,0.16)',  dot: 'var(--state-thinking)',  border: 'rgba(224,164,88,0.45)',  glow: '0 0 16px rgba(224,164,88,0.40)',   label: 'NAČÍTAVAM…' },
  };
  const config = configs[state];
  return (
    <button
      onClick={onClick}
      title={config.label}
      aria-label={config.label}
      data-orb-state={state}
      style={{
        flexShrink: 0, width: 46, height: 46, borderRadius: '50%',
        border: `1px solid ${config.border}`, background: config.bg,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: config.glow,
        transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
        padding: 0,
      }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={config.dot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    </button>
  );
}

export function VoiceZone({
  onSendText, voices, sttModels, llmModels, ttsVoice, ttsProvider, sttModel, llmProvider,
  onSelectVoice, onSelectStt, onSelectLlm, onRefetchLlm, settingsLoading,
  knowledgeBases = [], activeKb, onSelectKb, orbState, onMicClick,
}: VoiceZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSend() {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    onSendText(text);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSend();
  }

  return (
    <div
      className="voice-zone-footer"
      style={{
        padding: '14px 24px 20px',
        display: 'flex',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div
        className="voice-zone-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          maxWidth: '760px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <ProviderSettings
          voices={voices}
          sttModels={sttModels}
          llmModels={llmModels}
          ttsVoice={ttsVoice}
          ttsProvider={ttsProvider}
          sttModel={sttModel}
          llmProvider={llmProvider}
          onSelectVoice={onSelectVoice}
          onSelectStt={onSelectStt}
          onSelectLlm={onSelectLlm}
          onRefetchLlm={onRefetchLlm}
          loading={settingsLoading}
          knowledgeBases={knowledgeBases}
          activeKb={activeKb}
          onSelectKb={onSelectKb}
        />{/* v0.7.0 (W4): no LipsyncSelector children — selector removed */}

        <input
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'rgba(var(--accent-r), 0.5)';
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-dim)';
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--atm-glass-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          placeholder="Napíš čokoľvek…"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'rgba(245, 237, 216, 0.05)',
            border: '1px solid var(--atm-glass-border)',
            borderRadius: '16px',
            padding: '14px 18px',
            fontSize: '14px',
            color: 'var(--t1)',
            fontFamily: 'var(--font-inter)',
            outline: 'none',
            letterSpacing: '-0.01em',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
        />

        {onMicClick ? (
          <MicButton state={orbState ?? 'idle'} onClick={onMicClick} />
        ) : (
          <button
            onClick={handleSend}
            aria-label="Odoslať"
            style={{
              flexShrink: 0, width: 46, height: 46, borderRadius: '50%',
              background: 'var(--accent)', border: 'none', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(var(--accent-r), 0.30)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .voice-zone-footer { padding: 10px 12px 16px !important; }
          .voice-zone-bar { gap: 8px !important; }
        }
      `}</style>
    </div>
  );
}
