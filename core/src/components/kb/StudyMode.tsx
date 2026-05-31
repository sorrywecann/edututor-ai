'use client';

import { useState, useMemo } from 'react';
import { GraduationCap } from 'lucide-react';
import { useNotesStore } from '@/stores/useNotesStore';

export function StudyMode() {
  const notes = useNotesStore((s) => s.notes);
  const studyNotes = notes.filter((n) => n.source_type === 'ai_generated');
  const flashcardNotes = studyNotes.filter((n) => n.title.toLowerCase().includes('flashcard') || n.title.toLowerCase().includes('kartič'));
  const otherNotes = studyNotes.filter((n) => !flashcardNotes.includes(n));

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      {studyNotes.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px 0' }}>
          <GraduationCap size={30} strokeWidth={1.6} style={{ opacity: 0.4, color: 'var(--t3)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '4px' }}>Zatiaľ žiadne študijné materiály</div>
            <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Použi nástroje v Chate (Kartičky, Zhrnutie…) na generovanie</div>
          </div>
        </div>
      ) : (
        <>
          {flashcardNotes.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: '12px' }}>Kartičky · {flashcardNotes.length}</div>
              {flashcardNotes.map((n) => <FlashcardDeck key={n.id} content={n.content} title={n.title} />)}
            </div>
          )}

          {otherNotes.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: '12px' }}>Materiály · {otherNotes.length}</div>
              {otherNotes.map((n) => (
                <div key={n.id} style={{ padding: '16px', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', background: 'rgba(26, 20, 16, 0.62)', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t1)', marginBottom: '8px' }}>{n.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{n.content}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FlashcardDeck({ content, title }: { content: string; title: string }) {
  const cards = useMemo(() => parseFlashcards(content), [content]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) return (
    <div style={{ padding: '14px', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', background: 'rgba(26, 20, 16, 0.62)', marginBottom: '10px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t1)', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  );

  const card = cards[currentIdx];
  const next = () => { setFlipped(false); setCurrentIdx((i) => Math.min(i + 1, cards.length - 1)); };
  const prev = () => { setFlipped(false); setCurrentIdx((i) => Math.max(i - 1, 0)); };

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--t2)', fontWeight: 500 }}>{title}</span>
        <span style={{ fontSize: '9px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)' }}>{currentIdx + 1} / {cards.length}</span>
      </div>

      <div onClick={() => setFlipped(!flipped)}
        style={{ minHeight: '140px', padding: '24px', border: `1px solid ${flipped ? 'var(--green)' : 'var(--accent)'}`, borderRadius: '12px', background: flipped ? 'rgba(var(--green-r),0.06)' : 'var(--accent-dim)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', textAlign: 'center' }}
      >
        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.08em', textTransform: 'uppercase', color: flipped ? 'var(--green)' : 'var(--accent)', marginBottom: '10px' }}>
          {flipped ? 'Odpoveď' : 'Otázka'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--t1)', lineHeight: 1.7 }}>
          {flipped ? card.answer : card.question}
        </div>
        <div style={{ fontSize: '9px', color: 'var(--t3)', marginTop: '12px' }}>Klikni pre {flipped ? 'otázku' : 'odpoveď'}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px' }}>
        <button onClick={prev} disabled={currentIdx === 0}
          style={{ padding: '6px 14px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '11px', color: currentIdx === 0 ? 'var(--t3)' : 'var(--t1)', cursor: currentIdx === 0 ? 'default' : 'pointer', transition: 'all 0.15s' }}>← Predchádzajúca</button>
        <button onClick={next} disabled={currentIdx === cards.length - 1}
          style={{ padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#000', fontWeight: 600, cursor: currentIdx === cards.length - 1 ? 'default' : 'pointer', opacity: currentIdx === cards.length - 1 ? 0.4 : 1, transition: 'all 0.15s' }}>Ďalšia →</button>
      </div>
    </div>
  );
}

function parseFlashcards(content: string): Array<{ question: string; answer: string }> {
  const cards: Array<{ question: string; answer: string }> = [];
  const lines = content.split('\n');
  let currentQ = '';
  let currentA = '';

  for (const line of lines) {
    const trimmed = line.trim();
    const qMatch = trimmed.match(/^(?:Otázka|Q|Question|\d+[\.\)]\s*)[:.]?\s*(.+)/i);
    const aMatch = trimmed.match(/^(?:Odpoveď|A|Answer)[:.]?\s*(.+)/i);

    if (qMatch) {
      if (currentQ && currentA) cards.push({ question: currentQ, answer: currentA });
      currentQ = qMatch[1]; currentA = '';
    } else if (aMatch) {
      currentA = aMatch[1];
    } else if (currentA && trimmed) {
      currentA += ' ' + trimmed;
    } else if (currentQ && !currentA && trimmed) {
      currentQ += ' ' + trimmed;
    }
  }
  if (currentQ && currentA) cards.push({ question: currentQ, answer: currentA });
  return cards;
}
