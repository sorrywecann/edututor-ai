'use client';

import type { Mode } from '@/hooks/useMode';

interface ModePickerProps {
  modes: Mode[];
  selected: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}

const SKILL_LABELS: Record<string, string> = {
  web_search: 'web',
  spaced_repetition: 'kartičky',
  memory: 'pamäť',
};

const MODE_HINTS: Record<string, string> = {
  assistant: 'Skús: Aké je dnes počasie v Bratislave?',
  tutor_practice: 'Skús: Pridaj kartičku — otázka: Čo je Python, odpoveď: programovací jazyk',
  assistant_pro: 'Skús: Zapamätaj si, že ma zaujíma astronómia.',
  tutor_practice_pro: 'Skús: Zopakuj moje kartičky a zapamätaj si, kde robím chyby.',
};

function SkillBadge({ skill }: { skill: string }) {
  const label = SKILL_LABELS[skill] ?? skill;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '9px',
      fontFamily: 'var(--font-jetbrains)',
      padding: '2px 6px',
      borderRadius: '10px',
      background: 'rgba(245, 237, 216, 0.04)',
      color: 'var(--t2)',
      border: '1px solid var(--atm-glass-border)',
      whiteSpace: 'nowrap' as const,
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  );
}

export function ModePicker({ modes, selected, onSelect, compact }: ModePickerProps) {
  const selectedMode = modes.find(m => m.id === selected) ?? modes[0];
  const hint = (selectedMode?.enabledSkills?.length ?? 0) > 0
    ? MODE_HINTS[selectedMode.id]
    : undefined;

  if (compact) {
    return (
      <>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {modes.map(m => {
            const active = m.id === selected;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                title={m.label}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: active ? m.tutorColor : 'var(--raised)',
                  border: active ? `2px solid ${m.tutorColor}` : '2px solid var(--border)',
                  color: active ? '#fff' : 'var(--t2)',
                  fontSize: '12px', fontWeight: 600,
                  fontFamily: 'var(--font-inter)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: active ? 1 : 0.55,
                }}
              >
                {m.tutorName[0]}
              </button>
            );
          })}
          <span style={{
            fontSize: '11px', color: 'var(--t2)',
            fontFamily: 'var(--font-jetbrains)',
            letterSpacing: '0.03em',
            marginLeft: '2px',
          }}>
            {selectedMode.label}
          </span>
          {selectedMode.enabledSkills.map(s => (
            <SkillBadge key={s} skill={s} />
          ))}
        </div>
        {hint && (
          <p style={{
            margin: '8px 0 0',
            fontSize: '11px',
            fontStyle: 'italic',
            color: 'var(--t2)',
            fontFamily: 'var(--font-jetbrains)',
            maxWidth: '100%',
            letterSpacing: '0.01em',
          }}>
            {hint}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {modes.map(m => {
          const active = m.id === selected;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                padding: '16px 22px',
                background: active ? `${m.tutorColor}12` : 'var(--surface)',
                border: `1.5px solid ${active ? m.tutorColor : 'var(--border)'}`,
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
                minWidth: '110px',
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: active ? m.tutorColor : 'var(--raised)',
                border: `2px solid ${active ? m.tutorColor : 'var(--border-mid)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', fontWeight: 700,
                color: active ? '#fff' : 'var(--t3)',
                fontFamily: 'var(--font-inter)',
                transition: 'all 0.15s',
              }}>
                {m.tutorName[0]}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '12px', fontWeight: active ? 600 : 400,
                  color: active ? 'var(--t1)' : 'var(--t2)',
                  fontFamily: 'var(--font-inter)',
                  lineHeight: 1.3,
                }}>
                  {m.label}
                </div>
                <div style={{
                  fontSize: '10px', color: 'var(--t3)',
                  fontFamily: 'var(--font-jetbrains)',
                  marginTop: '2px',
                  letterSpacing: '0.02em',
                }}>
                  {m.tutorName}
                </div>
              </div>
              {m.enabledSkills.length > 0 && (
                <div style={{
                  display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center',
                }}>
                  {m.enabledSkills.map(s => (
                    <SkillBadge key={s} skill={s} />
                  ))}
                </div>
              )}
              {active && (
                <span style={{
                  position: 'absolute', top: '7px', right: '9px',
                  fontSize: '8px', fontFamily: 'var(--font-jetbrains)',
                  color: m.tutorColor, letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      {hint && (
        <p style={{
          margin: '8px 0 0',
          fontSize: '11px',
          fontStyle: 'italic',
          color: 'var(--t2)',
          fontFamily: 'var(--font-jetbrains)',
          textAlign: 'center',
          maxWidth: '100%',
          letterSpacing: '0.01em',
        }}>
          {hint}
        </p>
      )}
    </>
  );
}
