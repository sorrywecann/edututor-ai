'use client';

import { useCallback } from 'react';

export type TutorId = 'lukas' | 'viktoria';

export const TUTORS: Record<TutorId, { name: string; voiceId: string; color: string }> = {
  lukas:    { name: 'Lukáš',    voiceId: 'sk-SK-LukasNeural',    color: '#D4845A' }, // amber
  viktoria: { name: 'Viktória', voiceId: 'sk-SK-ViktoriaNeural', color: '#CB8A82' }, // warm rose
};

interface TutorPickerProps {
  selected: TutorId;
  onSelect: (id: TutorId) => void;
  compact?: boolean;
}

export function TutorPicker({ selected, onSelect, compact }: TutorPickerProps) {
  const ids = Object.keys(TUTORS) as TutorId[];

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {ids.map(id => {
          const t = TUTORS[id];
          const active = id === selected;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              title={t.name}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: active ? t.color : 'var(--raised)',
                border: active ? `2px solid ${t.color}` : '2px solid var(--border)',
                color: active ? '#fff' : 'var(--t2)',
                fontSize: '13px', fontWeight: 600,
                fontFamily: 'var(--font-inter)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: active ? 1 : 0.6,
              }}
            >
              {t.name[0]}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
      {ids.map(id => {
        const t = TUTORS[id];
        const active = id === selected;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
              padding: '20px 28px',
              background: 'rgba(26, 20, 16, 0.62)',
              border: active ? `2px solid ${t.color}` : '2px solid var(--border)',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              position: 'relative',
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: active ? t.color : 'var(--raised)',
              border: `2px solid ${active ? t.color : 'var(--border-mid)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', fontWeight: 700, color: active ? '#fff' : 'var(--t2)',
              fontFamily: 'var(--font-inter)',
              transition: 'all 0.15s',
            }}>
              {t.name[0]}
            </div>
            <span style={{
              fontSize: '13px', fontWeight: 500,
              color: active ? 'var(--t1)' : 'var(--t2)',
              fontFamily: 'var(--font-inter)',
            }}>
              {t.name}
            </span>
            {active && (
              <span style={{
                position: 'absolute', top: '8px', right: '10px',
                fontSize: '9px', fontFamily: 'var(--font-jetbrains)',
                color: t.color, letterSpacing: '0.04em',
              }}>
                Vybraný
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
