'use client';

// SaveBar — shared save-row primitive for Settings tabs.
//
// v0.8.5: the user lost visibility of "where do I save?" after the v0.8.4
// "Hotovo" footer removal. This component restores explicit Save UX per
// tab — used in PersonaTab, HlasTab (cloud BYOK section), and any future
// tab that has staged edits to commit. Tabs with instant-apply rows
// (LLM / Počúvanie) use <SaveStatusPill> instead.
//
// Visual style stays inside the warm-neutral Living Room palette:
//   • Hairline divider above (amber-tinted at 16% alpha)
//   • Mono caption on the left: "Neuložené zmeny" (amber) / "Uložené pred N s" (faint)
//   • Optional ghost-style "Obnoviť" on the right (only if onReset provided)
//   • Primary "Uložiť" via the existing PillBtn, disabled when nothing to save

import { useEffect, useState } from 'react';
import { PillBtn } from './primitives';

interface Props {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onReset?: () => void;
  lastSavedAt?: number | null; // unix ms
}

export function SaveBar({ dirty, saving, onSave, onReset, lastSavedAt }: Props) {
  const [hint, setHint] = useState<string>('');
  useEffect(() => {
    if (!lastSavedAt) { setHint(''); return; }
    function tick() {
      const sec = Math.max(0, Math.floor((Date.now() - (lastSavedAt as number)) / 1000));
      if (sec < 5) setHint('Uložené');
      else if (sec < 60) setHint(`Uložené pred ${sec} s`);
      else setHint(`Uložené pred ${Math.floor(sec / 60)} min`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'flex-end',
      paddingTop: 18, marginTop: 12,
      borderTop: '1px solid rgba(232,168,124,0.16)',
    }}>
      <span style={{
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
        color: dirty ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink-faint, #5a5048)',
      }}>
        {dirty ? 'Neuložené zmeny' : hint}
      </span>
      {onReset && <button
        onClick={onReset}
        disabled={!dirty || saving}
        style={{
          padding: '8px 14px', fontSize: 12,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          background: 'transparent', color: 'var(--ch-ink-dim, #9a8f82)',
          border: '1px solid var(--ch-line, rgba(244,237,228,0.12))',
          borderRadius: 8, cursor: dirty ? 'pointer' : 'default',
          opacity: dirty ? 1 : 0.5,
        }}
      >Obnoviť</button>}
      <PillBtn onClick={onSave} disabled={!dirty || saving}>
        {saving ? 'Ukladám…' : 'Uložiť'}
      </PillBtn>
    </div>
  );
}

// SaveStatusPill — a small mono-caption pill that fades out after `ttlMs` ms.
// Used by instant-apply rows (LLM/Počúvanie) for one-shot "Uložené" feedback.
export function SaveStatusPill({
  visible, ttlMs = 3000, label = 'Uložené', onExpire,
}: { visible: boolean; ttlMs?: number; label?: string; onExpire?: () => void }) {
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (!visible) { setShown(false); return; }
    setShown(true);
    const id = setTimeout(() => { setShown(false); onExpire?.(); }, ttlMs);
    return () => clearTimeout(id);
  }, [visible, ttlMs, onExpire]);

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999,
      background: 'rgba(126,168,138,0.12)',
      border: '1px solid rgba(126,168,138,0.28)',
      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
      fontSize: 9.5, letterSpacing: '0.20em', textTransform: 'uppercase',
      color: 'var(--ch-ok, #7ea88a)',
      opacity: shown ? 1 : 0,
      transform: shown ? 'translateY(0)' : 'translateY(-2px)',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
      pointerEvents: 'none',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'var(--ch-ok, #7ea88a)',
      }} />
      {label}
    </span>
  );
}
