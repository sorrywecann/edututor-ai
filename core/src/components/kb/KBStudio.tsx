'use client';

// KBStudio — right-rail action panel inspired by NotebookLM's "Studio" column.
// Renders the eight STUDY_TOOLS as a 2-col grid of cards. Clicking a card
// invokes the parent's onPick handler — typically firing the corresponding
// LLM prompt through the chat stream.

import { Sparkles } from 'lucide-react';
import { MicroLabel } from '@/components/atmosphere';
import { STUDY_TOOLS, type StudyTool } from '@/lib/kb/studyTools';

interface KBStudioProps {
  onPickAction: (tool: StudyTool) => void;
  disabled?: boolean;
  hasSources: boolean;
}

export function KBStudio({ onPickAction, disabled, hasSources }: KBStudioProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--atm-glass-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600,
          color: 'var(--t1)', letterSpacing: '-0.01em',
        }}>
          <Sparkles size={14} strokeWidth={2} style={{ color: 'var(--accent)' }} />
          Štúdio
        </div>
        <span className="atm-micro" style={{ color: 'var(--t3)' }}>{STUDY_TOOLS.length}</span>
      </div>

      <div style={{ padding: '16px 16px 4px', flexShrink: 0 }}>
        <MicroLabel>Vytvor zo zdrojov</MicroLabel>
      </div>

      <div style={{
        padding: '6px 14px 18px',
        overflowY: 'auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
        alignContent: 'start',
      }}>
        {STUDY_TOOLS.map(tool => (
          <button
            key={tool.label}
            onClick={() => onPickAction(tool)}
            disabled={disabled || !hasSources}
            title={!hasSources ? 'Najprv pridaj zdroj' : tool.description}
            style={{
              padding: '14px 12px',
              borderRadius: 10,
              background: 'rgba(245, 237, 216, 0.04)',
              border: '1px solid var(--atm-glass-border)',
              cursor: disabled || !hasSources ? 'not-allowed' : 'pointer',
              opacity: disabled || !hasSources ? 0.45 : 1,
              display: 'flex', flexDirection: 'column',
              alignItems: 'flex-start', gap: 8,
              textAlign: 'left',
              fontFamily: 'var(--font-inter)',
              transition: 'border-color 150ms, background 150ms, transform 80ms',
            }}
            onMouseEnter={e => {
              if (disabled || !hasSources) return;
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.background = 'rgba(var(--accent-r),0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--atm-glass-border)';
              e.currentTarget.style.background = 'rgba(245, 237, 216, 0.04)';
            }}
          >
            <tool.icon size={18} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, width: '100%' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t1)' }}>
                {tool.label}
              </span>
              {tool.description && (
                <span style={{ fontSize: 10.5, color: 'var(--t3)', lineHeight: 1.4 }}>
                  {tool.description}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {!hasSources && (
        <div style={{
          margin: '0 14px 16px',
          padding: '12px 14px',
          background: 'rgba(245, 237, 216, 0.03)',
          border: '1px dashed var(--atm-glass-border)',
          borderRadius: 10,
          fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.55,
        }}>
          Po pridaní zdrojov sa tu objavia akcie — zhrnutie, kvíz, kartičky, podcast a ďalšie.
        </div>
      )}
    </div>
  );
}
