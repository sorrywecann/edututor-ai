'use client';

import { useEffect, useRef, useState } from 'react';
import { TUTORS, type TutorId } from '@/components/shell/TutorPicker';
import { VoiceSection } from '@/components/kb/VoiceSection';
import { Nudge } from '@/components/atmosphere/Nudge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { OrbState } from '@/types/orb';
import type { SearchResult, KBSession } from '@/lib/api';
import { useChatStore } from '@/stores/useChatStore';
import { useKBStore } from '@/stores/useKBStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/config';

type LipsyncProvider = 'text' | 'audio2lipsync' | 'hybrid';
const LIPSYNC_LABELS: Record<LipsyncProvider, string> = {
  text: 'Visemes',
  audio2lipsync: 'ARKit',
  hybrid: 'Hybrid',
};
const LIPSYNC_COLORS: Record<LipsyncProvider, string> = {
  text: '#f59e0b',
  audio2lipsync: '#D4845A',
  hybrid: '#10b981',
};

const SUGGESTIONS = [
  'Zhrň mi hlavné body tohto dokumentu',
  'Aké sú kľúčové pojmy?',
  'Vysvetli to jednoducho',
  'Čo je najdôležitejšie?',
];

interface ChatPanelProps {
  clearChatAction: () => void;
  exportChatAction: () => void;
  handleSearchAction: (event: React.FormEvent) => Promise<void>;
  onTutorSelectAction: (id: TutorId) => void;
  orbState: OrbState;
  results: SearchResult[] | null;
  searchTime: number | null;
  selectedTutor: TutorId;
  submitQuestionAction: (question: string) => Promise<void>;
  toggleVoiceModeAction: () => void;
  voiceActive: boolean;
}

export function ChatPanel({ clearChatAction, exportChatAction, handleSearchAction, onTutorSelectAction, orbState, results, searchTime, selectedTutor, submitQuestionAction, toggleVoiceModeAction, voiceActive }: ChatPanelProps) {
  const activeKB = useKBStore((state) => state.activeKB);
  const documents = useKBStore((state) => state.documents);
  const contextModes = useKBStore((state) => state.contextModes);
  const messages = useChatStore((state) => state.messages);
  const currentQuery = useChatStore((state) => state.currentQuery);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const setCurrentQuery = useChatStore((state) => state.setCurrentQuery);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const clearMessages = useChatStore((state) => state.clearMessages);
  // v0.8.1: same provider-fallback nudge as ChatMode — ChatPanel hosts the
  // text input on the KB ask-mode surface, so it also needs to render the
  // banner above its own input row.
  const providerError = useChatStore((state) => state.providerError);
  const setProviderError = useChatStore((state) => state.setProviderError);
  const addNote = useNotesStore((state) => state.addNote);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const [sessions, setSessions] = useState<KBSession[]>([]);
  const [lipsyncProvider, setLipsyncProvider] = useState<LipsyncProvider>('audio2lipsync');
  const activeSourceCount = documents.filter((d) => (contextModes[d.id] ?? d.context_mode ?? 'full') !== 'off').length;

  useEffect(() => {
    if (activeKB) { api.listKBSessions(activeKB.name).then(setSessions).catch(() => {}); }
  }, [activeKB?.name]);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/lipsync/status`)
      .then((r) => r.json())
      .then((d) => { if (d?.active) setLipsyncProvider(d.active); })
      .catch(() => {});
  }, []);

  const cycleLipsync = async () => {
    const order: LipsyncProvider[] = ['audio2lipsync', 'text', 'hybrid'];
    const next = order[(order.indexOf(lipsyncProvider) + 1) % order.length];
    try {
      const r = await fetch(`${API_BASE}/api/v1/lipsync/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: next }),
      });
      if (r.ok) setLipsyncProvider(next);
    } catch {}
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  if (!activeKB) return null;

  const renderWithCitations = (text: string) => {
    const parts = text.split(/(\[Zdroj \d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[Zdroj (\d+)\]$/);
      if (match) {
        const idx = parseInt(match[1], 10) - 1;
        const chunks = useChatStore.getState().contextChunks;
        const chunk = chunks[idx];
        return <span key={i} title={chunk ? `${chunk.filename} · s.${chunk.page ?? '?'} · ${Math.round(chunk.score * 100)}% zhoda` : 'Zdroj'} style={{ display: 'inline-block', padding: '1px 6px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '4px', fontSize: '10px', color: 'var(--accent)', fontFamily: 'var(--font-jetbrains)', cursor: 'pointer', verticalAlign: 'baseline', margin: '0 2px' }}>Zdroj {match[1]}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div data-testid="chat-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, border: '1px solid var(--atm-glass-border)', borderRadius: '14px', background: 'rgba(26, 20, 16, 0.62)', overflow: 'hidden' }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: '4px' }}>
              Opýtaj sa dokumentov
            </div>
            <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
              Aktívny kontext · {activeSourceCount}/{documents.length || 0} zdrojov
            </div>
          </div>
          {messages.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px 3px 4px', background: `${TUTORS[selectedTutor].color}14`, border: `1px solid ${TUTORS[selectedTutor].color}30`, borderRadius: '20px' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: TUTORS[selectedTutor].color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#fff' }}>{TUTORS[selectedTutor].name[0]}</div>
              <span style={{ fontSize: '9px', fontWeight: 500, color: TUTORS[selectedTutor].color, fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em' }}>{TUTORS[selectedTutor].name}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Session switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger style={{ padding: '4px 10px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '10px', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.06em' }}>
              {sessions.find((s) => s.id === activeSessionId)?.name ?? 'Relácie'} ▾
            </DropdownMenuTrigger>
            <DropdownMenuContent style={{ background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', padding: '6px', minWidth: '180px' }}>
              {sessions.map((s) => (
                <DropdownMenuItem key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', color: s.id === activeSessionId ? 'var(--accent)' : 'var(--t1)', cursor: 'pointer' }}
                  onClick={async () => {
                    setActiveSession(s.id);
                    clearMessages();
                    try {
                      const resp = await api.getConversationMessages(s.id);
                      if (resp?.messages) {
                        useChatStore.getState().setMessages(resp.messages.map((m: {role:string;content:string}, i: number) => ({ id: `${s.id}-${i}`, role: m.role as 'user'|'assistant', content: m.content, timestamp: new Date() })));
                      }
                    } catch {}
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{ fontSize: '9px', color: 'var(--t3)', marginLeft: '12px' }}>{s.message_count}</span>
                </DropdownMenuItem>
              ))}
              {sessions.length > 0 && <div style={{ borderTop: '1px solid var(--atm-glass-border)', margin: '4px 0' }} />}
              <DropdownMenuItem style={{ padding: '6px 10px', borderRadius: '8px', fontSize: '11px', color: 'var(--accent)', cursor: 'pointer' }}
                onClick={async () => {
                  if (!activeKB) return;
                  const s = await api.createKBSession(activeKB.name, `Relácia ${sessions.length + 1}`);
                  setSessions((prev) => [s, ...prev]);
                  setActiveSession(s.id);
                  clearMessages();
                }}
              >+ Nová relácia</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {messages.length > 0 && (
            <>
              <button onClick={exportChatAction} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '9px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' }}>↓ Export</button>
              <button onClick={clearChatAction} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '9px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' }}>+ Nový</button>
            </>
          )}
        </div>
      </div>

      {/* ── MESSAGES ── */}
      <div ref={chatScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 18px' }}>
        {messages.length === 0 && !isStreaming && (
          <VoiceSection mode="picker" onTutorSelectAction={onTutorSelectAction} orbState={orbState} selectedTutor={selectedTutor} toggleVoiceModeAction={toggleVoiceModeAction} />
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ padding: '10px 14px', background: msg.role === 'user' ? 'var(--accent-dim)' : 'var(--surface)', border: `1px solid ${msg.role === 'user' ? 'rgba(var(--accent-r), 0.2)' : 'var(--border)'}`, borderRadius: '10px', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
              {msg.role === 'user' ? 'Ty' : `${TUTORS[selectedTutor].name} · z tvojich dokumentov`}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--t1)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{renderWithCitations(msg.content)}</div>
            {msg.role === 'assistant' && msg.content && (
              <button onClick={async () => {
                try { addNote(await api.saveNoteFromChat(activeKB.name, `Odpoveď — ${new Date().toLocaleString('sk')}`, msg.content)); } catch (e) { console.warn('[ChatPanel] saveNoteFromChat failed:', e); }
              }} style={{ marginTop: '8px', padding: '3px 8px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '9px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; }}
              >Uložiť</button>
            )}
          </div>
        ))}
        {isStreaming && (
          <div style={{ padding: '10px 14px', background: 'rgba(26, 20, 16, 0.62)', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', alignSelf: 'flex-start', maxWidth: '90%' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>{TUTORS[selectedTutor].name} · hľadá v dokumentoch…</div>
            <div style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>{[0,1,2].map((n) => <span key={n} style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--t3)', opacity:0.4, display:'inline-block', animation:`pulse 1s ease-in-out ${n*0.2}s infinite` }} />)}</div>
          </div>
        )}
      </div>

      {/* ── RESULTS + SUGGESTIONS ── */}
      {results !== null && results.length > 0 && (
        <details style={{ padding: '0 18px 8px' }}>
          <summary style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8.5px', color: 'var(--t3)', letterSpacing: '0.1em', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}>{results.length} zdrojov{searchTime != null && ` · ${searchTime.toFixed(0)}ms`}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={`${r.document_id ?? '?'}-${i}`} style={{ padding: '8px 10px', background: 'rgba(26, 20, 16, 0.62)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '8px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)' }}>{typeof r.metadata?.source === 'string' ? r.metadata.source : 'neznámy'}{typeof r.metadata?.page === 'number' && ` · s.${r.metadata.page}`}</span>
                  <span style={{ fontSize: '8px', color: r.score >= 0.75 ? 'var(--green)' : r.score >= 0.6 ? 'var(--accent)' : 'var(--t3)', fontFamily: 'var(--font-jetbrains)' }}>{(r.score*100).toFixed(0)}%</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.5 }}>{r.content.length > 150 ? `${r.content.slice(0, 150)}…` : r.content}</div>
              </div>
            ))}
          </div>
        </details>
      )}
      {messages.length === 0 && !isStreaming && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 18px 10px' }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void submitQuestionAction(s)} style={{ padding: '6px 12px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '16px', fontSize: '11px', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font-inter)', transition: 'border-color 0.15s, color 0.15s, background 0.15s', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.background = 'var(--raised)'; }}
            >{s}</button>
          ))}
        </div>
      )}

      {/* ── VOICE + INPUT ── */}
      {voiceActive && <VoiceSection mode="active" onTutorSelectAction={onTutorSelectAction} orbState={orbState} selectedTutor={selectedTutor} toggleVoiceModeAction={toggleVoiceModeAction} />}
      {providerError && !voiceActive && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <Nudge
            kind="error"
            layout="banner"
            dismissible
            title="LLM provider zlyhal"
            body={providerError}
            style={{ borderRadius: 10, borderLeft: '1px solid var(--accent)', borderRight: '1px solid var(--accent)' }}
            action={{ label: 'Zavrieť', onClick: () => setProviderError(null) }}
          />
        </div>
      )}
      <div className="chat-footer" style={{ display: voiceActive ? 'none' : 'flex', flexDirection: 'column', gap: '6px', padding: '10px 14px 12px', borderTop: '1px solid var(--atm-glass-border)' }}>
        <form onSubmit={(e) => void handleSearchAction(e)} className="chat-input-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="button" onClick={toggleVoiceModeAction} disabled={isStreaming} title="Hovoriť" style={{ width: '36px', height: '36px', flexShrink: 0, borderRadius: '50%', border: voiceActive ? '2px solid var(--accent)' : '1px solid var(--border)', background: voiceActive ? 'var(--accent-dim)' : 'transparent', cursor: isStreaming ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: voiceActive ? 'var(--accent)' : 'var(--t3)', transition: 'all 0.2s' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="1" width="5" height="7.5" rx="2.5" /><path d="M2 6.5c0 2.76 2.24 5 5 5s5-2.24 5-5" /><line x1="7" y1="11.5" x2="7" y2="13" /></svg>
          </button>
          <input value={currentQuery} onChange={(e) => setCurrentQuery(e.target.value)} placeholder="Pýtaj sa…" style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '13px', color: 'var(--t1)', outline: 'none' }} />
          <button type="submit" disabled={isStreaming || !currentQuery.trim()} className="chat-send-btn" style={{ padding: '9px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: isStreaming ? 0.5 : 1, flexShrink: 0 }}>{isStreaming ? '…' : 'Opýtať sa'}</button>
        </form>
        <div className="chat-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={cycleLipsync} title="Prepnúť lipsync mód avatara (text vs ARKit audio vs hybrid)"
            style={{ padding: '4px 10px', background: 'rgba(245, 237, 216, 0.04)', border: `1px solid ${LIPSYNC_COLORS[lipsyncProvider]}40`, borderRadius: '8px', fontSize: '10px', color: LIPSYNC_COLORS[lipsyncProvider], cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: LIPSYNC_COLORS[lipsyncProvider] }} />
            <span>Lipsync: {LIPSYNC_LABELS[lipsyncProvider]}</span>
          </button>
        </div>
      </div>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:0.2 } 50% { opacity:0.7 } }
        @media (max-width: 520px) {
          .chat-footer { padding: 8px 10px 10px !important; }
          .chat-input-row { gap: 6px !important; }
          .chat-send-btn { padding: 9px 12px !important; font-size: 11px !important; }
        }
        @media (max-width: 380px) {
          .chat-send-btn { padding: 9px 10px !important; }
        }
      `}</style>
    </div>
  );
}
