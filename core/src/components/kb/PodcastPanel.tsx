'use client';

import { useState } from 'react';
import { Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { usePodcastJob } from '@/hooks/usePodcastJob';

type PodcastFormat = 'summary' | 'deep_dive' | 'qa';

const FORMAT_LABELS: Record<PodcastFormat, string> = {
  summary: 'Súhrn',
  deep_dive: 'Hĺbková analýza',
  qa: 'Otázky a odpovede',
};

const VOICE_OPTIONS = [
  { id: 'sk-SK-LukasNeural',    label: 'Lukáš (sk-SK)',   provider: 'edge' },
  { id: 'sk-SK-ViktoriaNeural', label: 'Viktória (sk-SK)', provider: 'edge' },
  { id: 'en-US-AriaNeural',     label: 'Aria (en-US)',    provider: 'edge' },
  { id: 'en-US-GuyNeural',      label: 'Guy (en-US)',     provider: 'edge' },
] as const;

interface PodcastPanelProps {
  /** Knowledge base identifier. */
  kbId: string;
  /** Pre-selected document IDs from the parent KB workspace (read-only). */
  sourceIds: string[];
  /** Pre-selected note IDs from the parent KB workspace (read-only). */
  noteIds: string[];
  /** Optional close handler. */
  onClose?: () => void;
}

function pluralDocs(n: number): string {
  if (n === 1) return 'dokument';
  if (n >= 2 && n <= 4) return 'dokumenty';
  return 'dokumentov';
}

function pluralNotes(n: number): string {
  if (n === 1) return 'poznámka';
  if (n >= 2 && n <= 4) return 'poznámky';
  return 'poznámok';
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(26, 20, 16, 0.62)',
  border: '1px solid var(--atm-glass-border)',
  borderRadius: 14,
  overflow: 'hidden',
  width: '100%',
  maxWidth: 480,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 20px',
  borderBottom: '1px solid var(--atm-glass-border)',
  background: 'rgba(245, 237, 216, 0.04)',
};

const headerTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--t1)',
  letterSpacing: '-0.02em',
};

const closeBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  background: 'transparent',
  border: '1px solid var(--atm-glass-border)',
  borderRadius: 8,
  color: 'var(--t3)',
  fontSize: 12,
  cursor: 'pointer',
  lineHeight: 1,
};

const bodyStyle: React.CSSProperties = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains)',
  fontSize: 9,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--t3)',
  marginBottom: 8,
  display: 'block',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 32px 9px 12px',
  background: 'rgba(245, 237, 216, 0.04)',
  border: '1px solid rgba(245, 237, 216, 0.09)',
  borderRadius: 8,
  color: 'var(--t1)',
  fontSize: 12,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
};

const sourcesLineStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--t2)',
  background: 'rgba(245, 237, 216, 0.04)',
  border: '1px solid var(--atm-glass-border)',
  borderRadius: 8,
  padding: '8px 12px',
};

const generateBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '-0.01em',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '4px 0',
};

function radioButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 6px',
    background: active ? 'var(--accent-dim)' : 'var(--raised)',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    borderRadius: 8,
    color: active ? 'var(--accent)' : 'var(--t2)',
    fontSize: 11,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 150ms ease',
    letterSpacing: '-0.01em',
  };
}

/**
 * PodcastPanel — form + status + player + transcript for on-demand podcast generation.
 * Rendered conditionally by ChatMode (Task 8). Matches VOID DARK inline-style aesthetic.
 */
export function PodcastPanel({ kbId, sourceIds, noteIds, onClose }: PodcastPanelProps) {
  const { podcast, loading, error, start, reset } = usePodcastJob();
  const [format, setFormat] = useState<PodcastFormat>('summary');
  const [voiceId, setVoiceId] = useState<string>('sk-SK-LukasNeural');

  const selectedVoice = VOICE_OPTIONS.find(v => v.id === voiceId) ?? VOICE_OPTIONS[0];

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    start(kbId, {
      source_ids: sourceIds,
      note_ids: noteIds,
      format,
      voice_id: voiceId,
      provider: selectedVoice.provider,
    });
  }

  function PanelHeader({ title, badge }: { title: string; badge?: React.ReactNode }) {
    return (
      <div style={headerStyle}>
        <div style={headerTitleStyle}>
          <Radio size={14} strokeWidth={1.9} style={{ color: 'var(--accent)' }} />
          <span>{title}</span>
          {badge}
        </div>
        {onClose && (
          <button onClick={onClose} style={closeBtnStyle} aria-label="Zavrieť">
            ×
          </button>
        )}
      </div>
    );
  }

  if (podcast?.status === 'completed') {
    const audioUrl = api.getPodcastAudioUrl(podcast.id);
    const filename = `podcast-${podcast.id.slice(0, 8)}.mp3`;

    return (
      <div style={panelStyle}>
        <PanelHeader
          title="Podcast"
          badge={
            <span style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: 8,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--green)',
              background: 'rgba(61,214,140,0.10)',
              border: '1px solid rgba(61,214,140,0.2)',
              borderRadius: 4,
              padding: '2px 6px',
              marginLeft: 4,
            }}>
              Hotovo
            </span>
          }
        />
        <div style={bodyStyle}>
          {/* Native HTML5 audio player — no autoplay per browser policy + UX intent */}
          <audio
            controls
            src={audioUrl}
            preload="metadata"
            style={{
              width: '100%',
              height: 36,
              borderRadius: 8,
              /* Invert+hue-rotate makes the default chrome player look dark-themed */
              filter: 'invert(1) hue-rotate(180deg) brightness(0.9)',
            }}
          >
            Váš prehliadač nepodporuje prehrávanie audia.
          </audio>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* Download via native anchor — browser handles it, no double-fetch */}
            <a
              href={audioUrl}
              download={filename}
              style={{
                flex: 1,
                padding: '9px 12px',
                background: 'rgba(245, 237, 216, 0.04)',
                border: '1px solid rgba(245, 237, 216, 0.09)',
                borderRadius: 8,
                color: 'var(--t2)',
                fontSize: 11,
                textDecoration: 'none',
                textAlign: 'center',
                fontFamily: 'var(--font-jetbrains)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              ⇣ Stiahnuť
            </a>
            <button
              type="button"
              onClick={reset}
              style={{
                flex: 1,
                padding: '9px 12px',
                background: 'rgba(245, 237, 216, 0.04)',
                border: '1px solid rgba(245, 237, 216, 0.09)',
                borderRadius: 8,
                color: 'var(--t2)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font-jetbrains)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              🔁 Vygenerovať znova
            </button>
          </div>

          {podcast.script && (
            <>
              <div style={dividerStyle} />
              <div>
                <span style={labelStyle}>Prepis:</span>
                <div style={{
                  background: 'rgba(245, 237, 216, 0.04)',
                  border: '1px solid var(--atm-glass-border)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 12,
                  color: 'var(--t2)',
                  lineHeight: 1.65,
                  maxHeight: 220,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {podcast.script}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading || podcast?.status === 'pending' || podcast?.status === 'processing') {
    const isProcessing = podcast?.status === 'processing';

    return (
      <div style={panelStyle}>
        <PanelHeader title="Podcast" />
        {/* Spinner keyframe injection — scoped name avoids collisions */}
        <style>{`@keyframes pod-spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{
          ...bodyStyle,
          alignItems: 'center',
          padding: '36px 20px',
          gap: 14,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--accent)',
            animation: 'pod-spin 0.75s linear infinite',
          }} />

          <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>
            Generujem…
          </div>

          <div style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: isProcessing ? 'var(--accent)' : 'var(--t3)',
            transition: 'color 300ms ease',
          }}>
            {isProcessing ? 'Spracovávam…' : 'Čaká…'}
          </div>

          <div style={{
            width: '100%',
            maxWidth: 280,
            height: 3,
            background: 'rgba(245, 237, 216, 0.04)',
            borderRadius: 999,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              background: 'var(--accent)',
              borderRadius: 999,
              width: isProcessing ? '65%' : '30%',
              transition: 'width 800ms ease',
            }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || podcast?.status === 'failed') {
    const errorMsg: string = error ?? podcast?.error ?? 'Neznáma chyba';

    return (
      <div style={panelStyle}>
        <PanelHeader title="Podcast" />
        <div style={{ ...bodyStyle, alignItems: 'center', padding: '28px 20px', gap: 12 }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>⚠️</div>
          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>Chyba</div>
          <div style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: 10,
            color: 'var(--t3)',
            textAlign: 'center',
            maxWidth: 300,
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 8,
            padding: '8px 12px',
            lineHeight: 1.6,
          }}>
            {errorMsg}
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              ...generateBtnStyle,
              background: 'transparent',
              border: '1px solid rgba(245, 237, 216, 0.09)',
              color: 'var(--t2)',
              marginTop: 4,
            }}
          >
            Skús znova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <PanelHeader title="Generovať podcast" />
      <form onSubmit={handleGenerate} style={bodyStyle}>

        <div>
          <span style={labelStyle}>Formát</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(Object.keys(FORMAT_LABELS) as PodcastFormat[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={radioButtonStyle(format === f)}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span style={labelStyle}>Hlas</span>
          <select
            value={voiceId}
            onChange={e => setVoiceId(e.target.value)}
            style={selectStyle}
          >
            {VOICE_OPTIONS.map(v => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span style={labelStyle}>Zdroje</span>
          <div style={sourcesLineStyle}>
            <span style={{ color: 'var(--t1)', fontWeight: 500 }}>{sourceIds.length}</span>
            <span style={{ color: 'var(--t3)' }}> {pluralDocs(sourceIds.length)}</span>
            {noteIds.length > 0 && (
              <>
                <span style={{ color: 'var(--t3)', margin: '0 6px' }}>·</span>
                <span style={{ color: 'var(--t1)', fontWeight: 500 }}>{noteIds.length}</span>
                <span style={{ color: 'var(--t3)' }}> {pluralNotes(noteIds.length)}</span>
              </>
            )}
          </div>
        </div>

        <button type="submit" style={generateBtnStyle}>
          Generovať podcast
        </button>

      </form>
    </div>
  );
}
