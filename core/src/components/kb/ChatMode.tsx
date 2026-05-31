'use client';

import { useEffect, useRef, useState } from 'react';
import { TUTORS } from '@/components/shell/TutorPicker';
import { InlineFlashcards, InlineQuiz, hasFlashcardPattern, hasQuizPattern } from '@/components/kb/SmartContent';
import { Nudge } from '@/components/atmosphere/Nudge';
import { useChatStore } from '@/stores/useChatStore';
import { useKBStore } from '@/stores/useKBStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { useProviderSettings } from '@/hooks/useProviderSettings';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import { cleanMarkdown } from '@/lib/cleanMarkdown';

// Starter suggestions for the empty chat state — keep them general (not
// auto-generation actions). Heavier actions like Summary/Flashcards/Podcast
// live in the right-rail KBStudio panel.
const STARTER_PROMPTS: { label: string; prompt: string }[] = [
  { label: 'O čom sú tieto zdroje?', prompt: 'Stručne mi opíš, o čom sú tieto dokumenty a aké hlavné témy pokrývajú.' },
  { label: 'Vysvetli kľúčový pojem', prompt: 'Vyber jeden kľúčový pojem z dokumentov a vysvetli mi ho zrozumiteľne.' },
  { label: 'Porovnaj dve veci', prompt: 'Nájdi v dokumentoch dve súvisiace veci a porovnaj ich — v čom sú podobné a v čom sa líšia.' },
  { label: 'Spýtaj sa ma niečo', prompt: 'Polož mi tri zaujímavé otázky z týchto dokumentov, ktoré ma prinútia premýšľať.' },
];

interface ChatModeProps {
  kp: ReturnType<typeof import('@/hooks/useKnowledgePage').useKnowledgePage>;
}

export function ChatMode({ kp }: ChatModeProps) {
  const activeKB = useKBStore((s) => s.activeKB);
  const documents = useKBStore((s) => s.documents);
  const contextModes = useKBStore((s) => s.contextModes);
  const messages = useChatStore((s) => s.messages);
  const currentQuery = useChatStore((s) => s.currentQuery);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setCurrentQuery = useChatStore((s) => s.setCurrentQuery);
  // v0.8.1: provider-fallback nudge — set by useKnowledgePage.submitQuestion
  // when the SSE /chat/stream emits type:'error' (or when backend agent B1
  // wires provider="fallback" / provider_error into the stream). Rendered as
  // a terracotta banner above the input bar so the user doesn't mistake the
  // silent fallback for a real AI answer. Auto-clears on next successful turn.
  const providerError = useChatStore((s) => s.providerError);
  const setProviderError = useChatStore((s) => s.setProviderError);
  const addNote = useNotesStore((s) => s.addNote);
  const notes = useNotesStore((s) => s.notes);
  const { voices } = useProviderSettings();
  const [selectedKey, setSelectedKey] = useState(() => {
    if (typeof window === 'undefined') return 'edge:sk-SK-LukasNeural';
    const p = localStorage.getItem('edututor_tts_provider') || 'edge';
    const v = localStorage.getItem('edututor_tts_voice') || 'sk-SK-LukasNeural';
    return `${p}:${v}`;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingAutoSave, setPendingAutoSave] = useState<string | null>(null);
  const wasStreaming = useRef(false);

  useEffect(() => {
    if (wasStreaming.current && !isStreaming && pendingAutoSave && activeKB) {
      const msgs = useChatStore.getState().messages;
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant?.content) {
        api.saveNoteFromChat(activeKB.name, pendingAutoSave, lastAssistant.content)
          .then((note) => addNote(note))
          .catch(() => {});
      }
      setPendingAutoSave(null);
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming, pendingAutoSave, activeKB, addNote]);

  const activeCount = documents.filter((d) => (contextModes[d.id] ?? d.context_mode ?? 'full') !== 'off').length;
  const tutor = TUTORS[kp.selectedTutor];

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isStreaming]);

  if (!activeKB) return null;

  const renderCitations = (text: string) => {
    const parts = cleanMarkdown(text).split(/(\[Zdroj \d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[Zdroj (\d+)\]$/);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        const chunks = useChatStore.getState().contextChunks;
        const chunk = chunks[idx];
        return <span key={i} title={chunk ? `${chunk.filename} · ${Math.round(chunk.score * 100)}%` : ''} style={{ display: 'inline', padding: '1px 5px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '4px', fontSize: '9px', color: 'var(--accent)', fontFamily: 'var(--font-jetbrains)', cursor: 'pointer', margin: '0 1px' }}>Zdroj {m[1]}</span>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {messages.length > 0 && (
        <div style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: tutor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#fff' }}>{tutor.name[0]}</div>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t2)' }}>{tutor.name}</span>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '7px', color: 'var(--t3)' }}>{activeCount}/{documents.length}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={kp.clearChat} style={{ ...chipBtn }}>+ Nový</button>
          </div>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 28, padding: '48px 24px', maxWidth: 620, width: '100%', margin: '0 auto',
          }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{
                margin: 0, fontFamily: 'var(--font-inter)',
                fontSize: 22, fontWeight: 600,
                color: 'var(--t1)', letterSpacing: '-0.015em',
              }}>
                {documents.length === 0
                  ? 'Začnime tvoju databázu…'
                  : `Pripravený na ${documents.length} ${documents.length === 1 ? 'zdroj' : 'zdrojov'}`}
              </h2>
              <p style={{
                margin: '8px 0 0', fontSize: 13, color: 'var(--t2)', lineHeight: 1.6,
              }}>
                {documents.length === 0
                  ? 'Pridaj dokumenty vľavo. Potom sa môžeš pýtať otázky alebo použiť akcie v Štúdiu vpravo.'
                  : 'Spýtaj sa hocičo o svojich zdrojoch, alebo použi Štúdio vpravo pre zhrnutia, kvízy a kartičky.'}
              </p>
            </div>

            {documents.length > 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 6, width: '100%',
              }}>
                <div className="atm-micro" style={{ color: 'var(--t3)', marginBottom: 4 }}>
                  Skús sa spýtať
                </div>
                {STARTER_PROMPTS.map(s => (
                  <button
                    key={s.label}
                    onClick={() => void kp.submitQuestion(s.prompt)}
                    disabled={isStreaming}
                    style={{
                      padding: '11px 14px',
                      background: 'rgba(245, 237, 216, 0.04)',
                      border: '1px solid var(--atm-glass-border)',
                      borderRadius: 10,
                      color: 'var(--t1)', fontSize: 13,
                      fontFamily: 'var(--font-inter)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 150ms, background 150ms',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.background = 'rgba(var(--accent-r),0.08)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--atm-glass-border)';
                      e.currentTarget.style.background = 'rgba(245, 237, 216, 0.04)';
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, msgIdx) => {
          const isLast = msgIdx === messages.length - 1;
          const stillStreaming = isLast && isStreaming && msg.role === 'assistant';

          if (stillStreaming) {
            return (
              <div key={msg.id} style={{ padding: '12px 16px', background: 'rgba(26, 20, 16, 0.62)', border: '1px solid var(--atm-glass-border)', borderRadius: '12px', alignSelf: 'flex-start', maxWidth: '95%' }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '7px', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {tutor.name}
                  <span style={{ display: 'flex', gap: '3px' }}>{[0,1,2].map((n) => <span key={n} style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', animation: `pulse 1s ease-in-out ${n * 0.15}s infinite` }} />)}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.6, opacity: 0.7 }}>
                  {(() => {
                    const cleaned = cleanMarkdown(msg.content);
                    if (!cleaned) return 'Generujem…';
                    return cleaned.length > 80 ? `${cleaned.slice(-80)}…` : cleaned;
                  })()}
                </div>
              </div>
            );
          }

          const isSmartContent = msg.role === 'assistant' && (hasFlashcardPattern(msg.content) || hasQuizPattern(msg.content));
          const isFlash = isSmartContent && hasFlashcardPattern(msg.content);
          const isQuiz = isSmartContent && !isFlash && hasQuizPattern(msg.content);

          if (isFlash || isQuiz) {
            return (
              <div key={msg.id} style={{ width: '100%', animation: 'fadeUp 0.3s ease' }}>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '7px', color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '2px' }}>
                  {tutor.name}
                </div>
                {isFlash ? <InlineFlashcards content={msg.content} /> : <InlineQuiz content={msg.content} />}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <button onClick={async () => { try { addNote(await api.saveNoteFromChat(activeKB.name, `${tutor.name} — ${new Date().toLocaleString('sk')}`, msg.content)); } catch (e) { console.warn('[ChatMode] saveNoteFromChat failed:', e); } }}
                    style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '5px', fontSize: '8px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; }}
                  >Uložiť</button>
                  <button onClick={() => { navigator.clipboard.writeText(msg.content); }}
                    style={{ padding: '3px 8px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '5px', fontSize: '8px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--t2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; }}
                  >Kopírovať</button>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} style={{ padding: '10px 14px', background: msg.role === 'user' ? 'var(--accent-dim)' : 'var(--surface)', border: `1px solid ${msg.role === 'user' ? 'rgba(var(--accent-r),0.15)' : 'var(--border)'}`, borderRadius: '12px', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: msg.role === 'user' ? '75%' : '95%', animation: 'fadeUp 0.2s ease' }}>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '7px', color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                {msg.role === 'user' ? 'Ty' : tutor.name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{renderCitations(msg.content)}</div>
              {msg.role === 'assistant' && msg.content && (
                <button onClick={async () => { try { addNote(await api.saveNoteFromChat(activeKB.name, `${tutor.name} — ${new Date().toLocaleString('sk')}`, msg.content)); } catch (e) { console.warn('[ChatMode] saveNoteFromChat failed:', e); } }}
                  style={{ marginTop: '6px', padding: '2px 7px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '5px', fontSize: '8px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; }}
                >Uložiť</button>
              )}
            </div>
          );
        })}

      </div>

      {providerError && (
        <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
          <Nudge
            kind="error"
            layout="banner"
            dismissible
            title="LLM provider zlyhal"
            body={providerError}
            style={{ borderRadius: 10, borderLeft: '1px solid var(--accent)', borderRight: '1px solid var(--accent)' }}
            // Click anywhere on the banner clears it too — see also the × in
            // the Nudge primitive, which hides it locally. Mirror that into
            // the store so the next mount stays clean.
            action={{ label: 'Zavrieť', onClick: () => setProviderError(null) }}
          />
        </div>
      )}

      <form onSubmit={(e) => void kp.handleSearch(e)} style={{ display: 'flex', gap: '6px', padding: '8px 16px 10px', alignItems: 'center', flexShrink: 0 }}>
        <select
          value={selectedKey}
          onChange={(e) => {
            const key = e.target.value;
            const [provider, ...rest] = key.split(':');
            const voiceId = rest.join(':');
            setSelectedKey(key);
            localStorage.setItem('edututor_tts_provider', provider);
            localStorage.setItem('edututor_tts_voice', voiceId);
            if (provider === 'xtts_clone' || provider === 'chatterbox') {
              fetch(`${API_BASE}/api/v1/tts/warmup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) }).catch(() => {});
            }
          }}
          style={{ padding: '8px 4px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '9px', color: 'var(--t2)', fontFamily: 'var(--font-jetbrains)', cursor: 'pointer', outline: 'none', maxWidth: '100px', flexShrink: 0 }}
        >
          {voices.map((v) => (
            <option key={`${v.provider}:${v.id}`} value={`${v.provider}:${v.id}`}>{v.name.split('—')[0].trim()}</option>
          ))}
        </select>
        <input value={currentQuery} onChange={(e) => setCurrentQuery(e.target.value)} placeholder="Napíš otázku…"
          style={{ flex: 1, padding: '9px 14px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', fontSize: '13px', color: 'var(--t1)', outline: 'none', transition: 'border-color 0.15s' }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        />
        <button type="submit" disabled={isStreaming || !currentQuery.trim()}
          aria-label="Odoslať otázku"
          title="Odoslať otázku"
          style={{ padding: '9px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: isStreaming || !currentQuery.trim() ? 0.4 : 1, transition: 'opacity 0.15s' }}>
          →
        </button>
      </form>
      <style>{`@keyframes pulse { 0%,100% { opacity:0.2 } 50% { opacity:0.8 } } @keyframes fadeUp { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  );
}

const chipBtn: React.CSSProperties = { padding: '3px 8px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '5px', fontSize: '8px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' };
