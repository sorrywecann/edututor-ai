'use client';

// AtmosphereModal — generic atmospheric modal base.
// Black-blur overlay + centred GlassCard, esc-to-close, click-outside-to-close
// (overridable), focus management on open.
//
// Use as the wrapper for HelpDrawer, the future HardwareSetup rebuild,
// confirmation dialogs, etc. Replaces the one-off modal divs scattered
// across the codebase.

import { ReactNode, useEffect, useRef } from 'react';
import { GlassCard } from './GlassCard';

interface AtmosphereModalProps {
  /** Controls visibility */
  open: boolean;
  /** Called when user requests close (esc, click-outside, close button) */
  onClose: () => void;
  /** Modal title shown at top */
  title?: ReactNode;
  /** Body content */
  children: ReactNode;
  /** Optional footer actions (buttons row) */
  actions?: ReactNode;
  /** Card maxWidth in px. Default 560 */
  width?: number;
  /** If false, clicking the backdrop does NOT close the modal. Default true. */
  dismissOnBackdrop?: boolean;
}

export function AtmosphereModal({
  open,
  onClose,
  title,
  children,
  actions,
  width = 560,
  dismissOnBackdrop = true,
}: AtmosphereModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // ESC-to-close, lock body scroll while open, autofocus the modal on open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first focusable element inside the card, or the card itself
    const card = cardRef.current;
    if (card) {
      const focusable = card.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? card).focus();
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // Only close if click started on the backdrop itself, not on a child
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      className="atm-hero"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        background: 'rgba(0,0,0,0.55)',
        animation: 'atm-quote-fade 200ms ease both',
      }}
    >
      <div ref={cardRef} tabIndex={-1} style={{ width: '100%', maxWidth: width }}>
        <GlassCard pad="lg" maxWidth={width}>
          {title && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontSize: 17,
                  fontWeight: 600,
                  color: 'var(--t1)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.3,
                }}
              >
                {title}
              </div>
              <button
                onClick={onClose}
                aria-label="Zatvoriť"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--atm-glass-border)',
                  borderRadius: 8,
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--t3)',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--atm-glass-border)';
                }}
              >
                ×
              </button>
            </div>
          )}
          <div style={{ color: 'var(--t1)' }}>{children}</div>
          {actions && (
            <div
              style={{
                marginTop: 18,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              {actions}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
