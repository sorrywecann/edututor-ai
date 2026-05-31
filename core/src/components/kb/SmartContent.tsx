'use client';

import { useState, useMemo } from 'react';

interface FlashCard { question: string; answer: string; }

function parseFlashcards(text: string): FlashCard[] {
  const cards: FlashCard[] = [];
  const lines = text.split('\n');
  let q = '', a = '';

  for (const line of lines) {
    const trimmed = line.trim();
    const qMatch = trimmed.match(/^(?:Otázka|Q|Question|\d+[\.\)]\s*)[:.]?\s*(.+)/i);
    const aMatch = trimmed.match(/^(?:Odpoveď|A|Answer)[:.]?\s*(.+)/i);

    if (qMatch) {
      if (q && a) cards.push({ question: q, answer: a });
      q = qMatch[1]; a = '';
    } else if (aMatch) {
      a = aMatch[1];
    } else if (a && trimmed) {
      a += ' ' + trimmed;
    } else if (q && !a && trimmed && !trimmed.match(/^(?:Otázka|Odpoveď|Q|A)\b/i)) {
      q += ' ' + trimmed;
    }
  }
  if (q && a) cards.push({ question: q, answer: a });
  return cards;
}

function hasFlashcardPattern(text: string): boolean {
  const qCount = (text.match(/^(?:Otázka|Q|Question|\d+[\.\)]\s*)[:.]?\s*.+/gim) || []).length;
  const aCount = (text.match(/^(?:Odpoveď|A|Answer)[:.]?\s*.+/gim) || []).length;
  return qCount >= 3 && aCount >= 3;
}

export function InlineFlashcards({ content }: { content: string }) {
  const cards = useMemo(() => parseFlashcards(content), [content]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length < 3) return null;

  const card = cards[idx];
  const next = () => { setFlipped(false); setIdx((i) => Math.min(i + 1, cards.length - 1)); };
  const prev = () => { setFlipped(false); setIdx((i) => Math.max(i - 1, 0)); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '440px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', width: '100%' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--t2)' }}>{cards.length} kartičiek</span>
        <span style={{ fontSize: '9px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)' }}>{idx + 1}/{cards.length}</span>
      </div>

      <div onClick={() => setFlipped(!flipped)}
        style={{
          width: '100%', minHeight: '140px', padding: '28px 24px',
          border: `1.5px solid ${flipped ? 'var(--green)' : 'var(--accent)'}`,
          borderRadius: '14px', background: flipped ? 'rgba(var(--green-r),0.06)' : 'var(--accent-dim)',
          cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', transition: 'all 0.25s ease', userSelect: 'none',
        }}
      >
        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.1em', textTransform: 'uppercase', color: flipped ? 'var(--green)' : 'var(--accent)', marginBottom: '12px' }}>
          {flipped ? 'Odpoveď' : 'Otázka'}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--t1)', lineHeight: 1.7, fontWeight: 500 }}>
          {flipped ? card.answer : card.question}
        </div>
        <div style={{ fontSize: '8px', color: 'var(--t3)', marginTop: '14px', opacity: 0.6 }}>klikni pre {flipped ? 'otázku' : 'odpoveď'}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '12px' }}>
        <button onClick={(e) => { e.stopPropagation(); prev(); }} disabled={idx === 0}
          style={{ padding: '6px 14px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '11px', color: idx === 0 ? 'var(--t3)' : 'var(--t1)', cursor: idx === 0 ? 'default' : 'pointer', transition: 'all 0.15s' }}>←</button>

        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          {cards.map((_, i) => (
            <span key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: i === idx ? 'var(--accent)' : 'var(--border)', transition: 'all 0.15s', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setFlipped(false); setIdx(i); }} />
          ))}
        </div>

        <button onClick={(e) => { e.stopPropagation(); next(); }} disabled={idx === cards.length - 1}
          style={{ padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: '8px', fontSize: '11px', color: '#000', fontWeight: 600, cursor: idx === cards.length - 1 ? 'default' : 'pointer', opacity: idx === cards.length - 1 ? 0.4 : 1, transition: 'all 0.15s' }}>→</button>
      </div>
    </div>
  );
}

export function InlineQuiz({ content }: { content: string }) {
  const questions = useMemo(() => parseQuizQuestions(content), [content]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  if (questions.length < 3) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--t2)' }}>{questions.length} otázok</div>
      {questions.map((q, i) => (
        <div key={i} style={{ padding: '10px', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', background: 'rgba(26, 20, 16, 0.62)' }}>
          <div style={{ fontSize: '11px', color: 'var(--t1)', lineHeight: 1.6, marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--accent)', marginRight: '6px' }}>{i + 1}.</span>
            {q.question}
          </div>
          {revealed.has(i) ? (
            <div style={{ fontSize: '11px', color: 'var(--green)', lineHeight: 1.5, padding: '6px 8px', background: 'rgba(var(--green-r),0.06)', borderRadius: '8px', borderLeft: '2px solid var(--green)' }}>
              {q.answer}
            </div>
          ) : (
            <button onClick={() => setRevealed((prev) => new Set(prev).add(i))}
              style={{ padding: '4px 10px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '9px', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', transition: 'all 0.12s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t2)'; }}
            >Zobraziť odpoveď</button>
          )}
        </div>
      ))}
    </div>
  );
}

function parseQuizQuestions(text: string): Array<{ question: string; answer: string }> {
  const items: Array<{ question: string; answer: string }> = [];
  const lines = text.split('\n');
  let currentQ = '';
  let currentA = '';
  let collecting: 'q' | 'a' = 'q';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isNumbered = trimmed.match(/^(\d+)[\.\)]\s*(.+)/);
    const isAnswer = trimmed.match(/^(?:Odpoveď|Answer|A)[:.]?\s*(.+)/i);
    const isStarAnswer = trimmed.match(/^\*\*?Odpoveď\*?\*?[:.]?\s*(.+)/i);

    if (isNumbered && collecting === 'q' && !currentQ) {
      currentQ = isNumbered[2];
      collecting = 'q';
    } else if (isNumbered && currentQ) {
      if (currentQ && currentA) items.push({ question: currentQ, answer: currentA });
      else if (currentQ && !currentA) items.push({ question: currentQ, answer: '(odpoveď na konci)' });
      currentQ = isNumbered[2];
      currentA = '';
      collecting = 'q';
    } else if (isAnswer || isStarAnswer) {
      currentA = (isAnswer?.[1] || isStarAnswer?.[1] || '').trim();
      collecting = 'a';
    } else if (collecting === 'a' && currentA) {
      currentA += ' ' + trimmed;
    } else if (collecting === 'q' && currentQ && !currentA) {
      currentQ += ' ' + trimmed;
    }
  }
  if (currentQ && currentA) items.push({ question: currentQ, answer: currentA });
  else if (currentQ) items.push({ question: currentQ, answer: '(odpoveď na konci)' });

  const answerSection = text.match(/(?:Odpovede|Answers|Riešenia)[\s:]*\n([\s\S]+)$/i);
  if (answerSection && items.some((it) => it.answer === '(odpoveď na konci)')) {
    const answerLines = answerSection[1].split('\n').filter((l) => l.trim());
    let aIdx = 0;
    for (const item of items) {
      if (item.answer === '(odpoveď na konci)' && aIdx < answerLines.length) {
        item.answer = answerLines[aIdx].replace(/^\d+[\.\)]\s*/, '').trim();
        aIdx++;
      }
    }
  }

  return items.filter((it) => it.question.length > 10);
}

export function hasQuizPattern(text: string): boolean {
  const numbered = (text.match(/^\d+[\.\)]\s*.{10,}/gm) || []).length;
  // A real quiz (the "Otázky" tool) interleaves numbered questions with
  // explicit "Odpoveď:" answer lines. "Kľúčové body" and "Analýza" are ALSO
  // numbered lists but carry NO answer markers — without this guard they got
  // mis-rendered as a quiz with a pointless "Zobraziť odpoveď" button on every
  // item. Require evidence of actual answers so only true quizzes qualify.
  const answerMarkers = (text.match(/^\s*(?:Odpoveď|Odpovede|Answer|Answers|Riešenia)\b[:.]?/gim) || []).length;
  return numbered >= 4 && answerMarkers >= 3;
}

export { hasFlashcardPattern };
