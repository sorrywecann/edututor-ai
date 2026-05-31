'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useKBStore } from '@/stores/useKBStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { useChatStore } from '@/stores/useChatStore';
import { api } from '@/lib/api';

export function AskMode() {
  const activeKB = useKBStore((s) => s.activeKB);
  const addNote = useNotesStore((s) => s.addNote);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const handleAsk = async () => {
    if (!activeKB || !question.trim()) return;
    setLoading(true); setAnswer(''); setSources([]); setLatency(null);
    try {
      const r = await api.askKnowledgeBase(activeKB.name, question);
      setAnswer(r.answer); setSources(r.sources); setLatency(r.latency_ms);
    } catch { setAnswer('Nastala chyba. Skús to znova.'); }
    finally { setLoading(false); }
  };

  const renderCitations = (text: string) => {
    const parts = text.split(/(\[Zdroj \d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[Zdroj (\d+)\]$/);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        const src = sources[idx];
        return <span key={i} title={src ? `${src.filename} · ${Math.round((src.score as number) * 100)}%` : ''} style={{ display: 'inline', padding: '1px 5px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '4px', fontSize: '9px', color: 'var(--accent)', fontFamily: 'var(--font-jetbrains)', cursor: 'pointer', margin: '0 1px' }}>Zdroj {m[1]}</span>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {!answer && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px 0' }}>
            <Search size={32} strokeWidth={1.6} style={{ opacity: 0.4, color: 'var(--t3)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '4px' }}>Opýtaj sa komplexnú otázku</div>
              <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Automaticky prehľadá všetky tvoje zdroje</div>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px 0' }}>
            <div style={{ width: '32px', height: '32px', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Prehľadávam všetky zdroje…</div>
          </div>
        )}

        {answer && !loading && (
          <div>
            <div style={{ padding: '16px', border: '1px solid var(--atm-glass-border)', borderRadius: '12px', background: 'rgba(26, 20, 16, 0.62)', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{renderCitations(answer)}</div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                <button onClick={async () => {
                  if (!activeKB) return;
                  try { addNote(await api.saveNoteFromChat(activeKB.name, `Odpoveď — ${new Date().toLocaleString('sk')}`, answer)); } catch (e) { console.warn('[AskMode] saveNoteFromChat failed:', e); }
                }} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '9px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' }}>Uložiť</button>
                {latency && <span style={{ fontSize: '8px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', alignSelf: 'center' }}>{latency}ms</span>}
              </div>
            </div>

            {sources.length > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '6px', fontFamily: 'var(--font-jetbrains)' }}>{sources.length} zdrojov použitých</div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {sources.map((s, i) => (
                <span key={i} style={{ padding: '3px 8px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '5px', fontSize: '9px', color: 'var(--t2)', fontFamily: 'var(--font-jetbrains)' }}>
                  {s.filename as string} · {Math.round((s.score as number) * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }} style={{ display: 'flex', gap: '8px', padding: '12px 20px', borderTop: '1px solid var(--atm-glass-border)', flexShrink: 0 }}>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Napíš komplexnú otázku…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          style={{ flex: 1, padding: '10px 14px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', fontSize: '13px', color: 'var(--t1)', outline: 'none', resize: 'none', minHeight: '44px', maxHeight: '120px', lineHeight: 1.5, fontFamily: 'var(--font-inter)', transition: 'border-color 0.15s' }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        />
        <button type="submit" disabled={loading || !question.trim()}
          aria-label="Opýtať sa"
          title="Opýtať sa"
          style={{ padding: '10px 18px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading || !question.trim() ? 0.4 : 1, alignSelf: 'flex-end', transition: 'opacity 0.15s' }}>
          {loading ? '…' : '→'}
        </button>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
