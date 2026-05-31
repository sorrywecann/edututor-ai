'use client';

import { useState, useEffect } from 'react';
import { TUTORS, type TutorId } from '@/components/shell/TutorPicker';
import { Orb } from '@/components/voice/Orb';
import { Waveform } from '@/components/voice/Waveform';
import type { OrbState } from '@/types/orb';
import { API_BASE } from '@/lib/config';

type LipsyncProvider = 'text' | 'audio2lipsync' | 'hybrid';

interface VoiceSectionProps {
  mode: 'picker' | 'active';
  onTutorSelectAction: (id: TutorId) => void;
  orbState: OrbState;
  selectedTutor: TutorId;
  toggleVoiceModeAction: () => void;
}

function LipsyncToggle() {
  const [provider, setProvider] = useState<LipsyncProvider>('audio2lipsync');

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/lipsync/status`)
      .then((r) => r.json())
      .then((d) => { if (d?.active) setProvider(d.active); })
      .catch(() => {});
  }, []);

  const cycle = async () => {
    const order: LipsyncProvider[] = ['audio2lipsync', 'text', 'hybrid'];
    const next = order[(order.indexOf(provider) + 1) % order.length];
    try {
      const r = await fetch(`${API_BASE}/api/v1/lipsync/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: next }),
      });
      if (r.ok) setProvider(next);
    } catch {}
  };

  const labels: Record<LipsyncProvider, string> = {
    text: 'Visemes (text)',
    audio2lipsync: 'ARKit (audio)',
    hybrid: 'Hybrid',
  };
  const colors: Record<LipsyncProvider, string> = {
    text: '#f59e0b',
    audio2lipsync: '#D4845A',
    hybrid: '#10b981',
  };

  return (
    <button
      onClick={cycle}
      title="Prepnúť spôsob lipsyncu pre UE5 avatara"
      style={{ padding: '5px 12px', background: 'var(--raised)', border: `1px solid ${colors[provider]}`, borderRadius: '8px', fontSize: '10px', color: colors[provider], cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em', transition: 'all 0.15s' }}
    >
      👄 {labels[provider]}
    </button>
  );
}

export function VoiceSection({ mode, onTutorSelectAction, orbState, selectedTutor, toggleVoiceModeAction }: VoiceSectionProps) {
  if (mode === 'picker') {
    return (
      <div data-testid="voice-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '24px', border: '1px solid var(--border)', borderRadius: '10px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          {(Object.keys(TUTORS) as TutorId[]).map((id) => {
            const tutor = TUTORS[id];
            const active = id === selectedTutor;
            return (
              <button
                key={id}
                onClick={() => onTutorSelectAction(id)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '14px 24px', background: active ? `${tutor.color}12` : 'var(--surface)', border: `1.5px solid ${active ? tutor.color : 'var(--border)'}`, borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: active ? tutor.color : 'var(--raised)', border: `2px solid ${active ? tutor.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: active ? '#fff' : 'var(--t3)', fontFamily: 'var(--font-inter)', transition: 'all 0.15s' }}>
                  {tutor.name[0]}
                </div>
                <span style={{ fontSize: '12px', fontWeight: active ? 600 : 400, color: active ? 'var(--t1)' : 'var(--t3)', fontFamily: 'var(--font-inter)' }}>
                  {tutor.name}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--t3)', textAlign: 'center', lineHeight: 1.7 }}>
          Vyber tutora a opýtaj sa na tvoje dokumenty.
        </div>
        <LipsyncToggle />
      </div>
    );
  }

  return (
    <div data-testid="voice-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px 0 8px' }}>
      <Orb state={orbState} onClick={toggleVoiceModeAction} size={120} particles={600} />
      <Waveform state={orbState} />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={toggleVoiceModeAction}
          style={{ padding: '5px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '10px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.06em', transition: 'all 0.15s' }}
        >
          {orbState === 'speaking' ? 'Zastaviť' : 'Ukončiť'}
        </button>
        <LipsyncToggle />
      </div>
    </div>
  );
}
