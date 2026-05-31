'use client';

import { TUTORS, type TutorId } from '@/components/shell/TutorPicker';
import { Orb } from '@/components/voice/Orb';
import { Waveform } from '@/components/voice/Waveform';
import { useKBStore } from '@/stores/useKBStore';
import { useChatStore } from '@/stores/useChatStore';
import type { OrbState } from '@/types/orb';

// v0.6.5: voice clones panel + lipsync provider toggle removed from VoiceMode.
// Voice cloning is gated out across the app (no working OmniVoice backend in the
// lean bundle); cloud cloning (ElevenLabs) lands in a later release. The
// audio2lipsync/ARKit path is orphaned per project_arkit_orphaned memory — UE5
// uses /ws/avatar visemes, not audio2lipsync, so the toggle was a no-op anyway.

interface VoiceModeProps {
  kp: ReturnType<typeof import('@/hooks/useKnowledgePage').useKnowledgePage>;
}

const STATUS_LABELS: Record<OrbState, string> = {
  idle: 'Pripravený',
  listening: 'Počúvam…',
  thinking: 'Premýšľam…',
  speaking: 'Hovorím…',
  loading: 'Načítavam…',
};

const STATUS_COLORS: Record<OrbState, string> = {
  idle: 'var(--t3)',
  listening: 'var(--green)',
  thinking: 'var(--accent)',
  speaking: 'var(--accent)',
  loading: 'var(--accent)',
};

export function VoiceMode({ kp }: VoiceModeProps) {
  const activeKB = useKBStore((s) => s.activeKB);
  const documents = useKBStore((s) => s.documents);
  const contextModes = useKBStore((s) => s.contextModes);
  const messages = useChatStore((s) => s.messages);

  const activeCount = documents.filter((d) => (contextModes[d.id] ?? d.context_mode ?? 'full') !== 'off').length;
  const tutor = TUTORS[kp.selectedTutor];
  const lastMessages = messages.slice(-4);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', overflow: 'hidden', position: 'relative' }}>

      {!kp.voiceActive ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px', maxWidth: '400px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' }}>
            Hlasová konverzácia
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            {(Object.keys(TUTORS) as TutorId[]).map((id) => {
              const t = TUTORS[id];
              const active = id === kp.selectedTutor;
              return (
                <button key={id} onClick={() => kp.handleTutorSelect(id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px 28px', border: `1.5px solid ${active ? t.color : 'var(--border)'}`, borderRadius: '12px', background: active ? `${t.color}10` : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: active ? t.color : 'var(--raised)', border: `2px solid ${active ? t.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: active ? '#fff' : 'var(--t3)', transition: 'all 0.2s' }}>
                    {t.name[0]}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: active ? 600 : 400, color: active ? 'var(--t1)' : 'var(--t3)' }}>{t.name}</span>
                </button>
              );
            })}
          </div>

          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: '12px', lineHeight: 1.7 }}>
            Rozprávaj sa so svojimi dokumentmi<br />
            cez hlasovú konverzáciu.
          </div>

          <button onClick={kp.toggleVoiceMode}
            style={{ padding: '12px 32px', background: tutor.color, color: '#fff', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 12px ${tutor.color}40`; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="1" width="5" height="7.5" rx="2.5" /><path d="M2 6.5c0 2.76 2.24 5 5 5s5-2.24 5-5" /><line x1="7" y1="11.5" x2="7" y2="13" /></svg>
            Začať konverzáciu
          </button>

          {activeKB && (
            <div style={{ display: 'flex', gap: '10px', fontFamily: 'var(--font-jetbrains)', fontSize: '9px', color: 'var(--t3)', letterSpacing: '0.04em' }}>
              <span>{activeKB.name}</span>
              <span>·</span>
              <span>{activeCount}/{documents.length} zdrojov aktívnych</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', maxWidth: '440px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: tutor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff' }}>{tutor.name[0]}</div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t1)' }}>{tutor.name}</span>
          </div>

          <Orb state={kp.orbState} onClick={kp.toggleVoiceMode} size={140} particles={700} />
          <Waveform state={kp.orbState} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[kp.orbState], animation: kp.orbState === 'listening' ? 'pulse 1.5s ease infinite' : 'none' }} />
            <span style={{ fontSize: '12px', color: STATUS_COLORS[kp.orbState], fontWeight: 500 }}>
              {STATUS_LABELS[kp.orbState]}
            </span>
          </div>

          {lastMessages.length > 0 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', padding: '12px', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', background: 'rgba(26, 20, 16, 0.62)' }}>
              {lastMessages.map((m) => (
                <div key={m.id} style={{ fontSize: '11px', color: m.role === 'user' ? 'var(--accent)' : 'var(--t2)', lineHeight: 1.5 }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', color: 'var(--t3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: '6px' }}>
                    {m.role === 'user' ? 'Ty' : tutor.name}
                  </span>
                  {m.content.slice(0, 120)}{m.content.length > 120 ? '…' : ''}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', fontFamily: 'var(--font-jetbrains)', fontSize: '9px', color: 'var(--t3)', letterSpacing: '0.04em' }}>
            <span>{activeKB?.name}</span>
            <span>·</span>
            <span>{activeCount}/{documents.length} zdrojov</span>
          </div>

          <button onClick={kp.toggleVoiceMode}
            style={{ padding: '8px 20px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '11px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; }}
          >
            Ukončiť konverzáciu
          </button>
        </div>
      )}

      {/* v0.6.5: lipsync provider toggle + voice clones panel removed.
          See file header comment for rationale. */}

      <style>{`@keyframes pulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }`}</style>
    </div>
  );
}
