'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { VoiceOption, STTOption, LLMOption } from '@/hooks/useProviderSettings';
import type { KnowledgeBase } from '@/lib/api';

interface ProviderSettingsProps {
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
  loading: boolean;
  // Folded-in controls so the chat bar stays a single clean row.
  knowledgeBases?: KnowledgeBase[];
  activeKb?: string;
  onSelectKb?: (name: string | undefined) => void;
  // Extra controls rendered at the bottom of the popover (e.g. lipsync).
  children?: ReactNode;
}

function voiceShortName(voices: VoiceOption[], ttsVoice: string, ttsProvider: string): string {
  const cur = voices.find(v => v.id === ttsVoice && v.provider === ttsProvider)
    ?? voices.find(v => v.id === ttsVoice);
  if (!cur) return 'Hlas';
  return cur.name.split('—')[0].split('(')[0].trim() || 'Hlas';
}

export function ProviderSettings({
  voices,
  sttModels,
  llmModels,
  ttsVoice,
  ttsProvider,
  sttModel,
  llmProvider,
  onSelectVoice,
  onSelectStt,
  onSelectLlm,
  loading,
  knowledgeBases = [],
  activeKb,
  onSelectKb,
  children,
}: ProviderSettingsProps) {
  const [open, setOpen] = useState(false);

  const skVoices = voices.filter(v => v.lang === 'sk');
  const otherVoices = voices.filter(v => v.lang !== 'sk');
  const chipName = voiceShortName(voices, ttsVoice, ttsProvider);

  const itemStyle = (active: boolean): React.CSSProperties => ({
    textAlign: 'left',
    padding: '7px 10px',
    borderRadius: '8px',
    border: 'none',
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--t1)' : 'var(--t2)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-inter)',
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: '9px', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.12em',
    color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '6px',
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Chip trigger — the "‹ Voice ›" pill from the mockup */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Hlas a nastavenia"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: open ? 'var(--raised)' : 'var(--subtle)',
          border: `1px solid ${open ? 'var(--border-mid)' : 'var(--border)'}`,
          borderRadius: 999, padding: '7px 12px 7px 8px',
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          background: 'radial-gradient(circle at 38% 32%, #F4CDA0, var(--accent) 70%)',
          boxShadow: '0 0 8px rgba(var(--accent-r), 0.5)',
        }} />
        <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500, letterSpacing: '-0.01em', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {chipName}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--t3)', flexShrink: 0 }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              left: 0,
              background: 'var(--raised)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '16px',
              width: '320px',
              zIndex: 100,
              boxShadow: 'var(--shadow-lift)',
            }}
          >
            <div style={sectionLabel}>Hlas</div>

            {loading ? (
              <div style={{ color: 'var(--t3)', fontSize: '12px' }}>Načítavam hlasy…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '170px', overflowY: 'auto' }}>
                {skVoices.length > 0 && (
                  <div style={{ fontSize: '9px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.1em', marginBottom: '2px' }}>SLOVENČINA</div>
                )}
                {skVoices.map(v => (
                  <button key={`${v.provider}-${v.id}`} onClick={() => onSelectVoice(v)}
                    style={itemStyle(ttsVoice === v.id && ttsProvider === v.provider)}>
                    {v.name}
                  </button>
                ))}
                {otherVoices.length > 0 && (
                  <div style={{ fontSize: '9px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.1em', marginTop: '6px', marginBottom: '2px' }}>OSTATNÉ</div>
                )}
                {otherVoices.map(v => (
                  <button key={`${v.provider}-${v.id}`} onClick={() => onSelectVoice(v)}
                    style={itemStyle(ttsVoice === v.id && ttsProvider === v.provider)}>
                    {v.name}
                  </button>
                ))}
              </div>
            )}

            {/* Knowledge base — folded in from the old toolbar pill */}
            {onSelectKb && (
              <>
                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
                <div style={sectionLabel}>Databáza znalostí</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '140px', overflowY: 'auto' }}>
                  <button onClick={() => onSelectKb(undefined)} style={itemStyle(!activeKb)}>Žiadna</button>
                  {knowledgeBases.map(kb => (
                    <button key={kb.id} onClick={() => onSelectKb(kb.name)} style={itemStyle(activeKb === kb.name)}>
                      {kb.name}
                      <span style={{ color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', fontSize: 9, marginLeft: 6 }}>
                        {kb.document_count} dok.
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sttModels.length > 0 && (
              <>
                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
                <div style={sectionLabel}>STT — rozpoznávanie reči</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '130px', overflowY: 'auto' }}>
                  {sttModels.map(m => (
                    <button key={m.id} onClick={() => onSelectStt(m.id)} style={itemStyle(sttModel === m.id)}>{m.name}</button>
                  ))}
                </div>
              </>
            )}

            {llmModels.filter(m => m.available).length > 0 && (
              <>
                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
                <div style={sectionLabel}>LLM — jazykový model</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {llmModels.filter(m => m.available).map(m => (
                    <button key={m.id} onClick={() => onSelectLlm(m.id)}
                      style={{ ...itemStyle(llmProvider === m.id), display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {m.provider === 'local' && <span style={{ fontSize: '9px', background: 'rgba(127,176,105,0.18)', color: '#7FB069', padding: '1px 5px', borderRadius: '3px', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.06em' }}>LOCAL</span>}
                      {m.provider === 'custom' && <span style={{ fontSize: '9px', background: 'rgba(var(--accent-r), 0.18)', color: 'var(--accent)', padding: '1px 5px', borderRadius: '3px', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.06em' }}>CUSTOM</span>}
                      {m.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {children && (
              <>
                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
                <div style={sectionLabel}>Lipsync</div>
                {children}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
