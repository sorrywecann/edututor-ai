'use client';

import { useEffect } from 'react';

// v0.6.5: app-root error boundary. Without this, any unhandled render error
// shows a white screen in prod and the Next.js dev overlay in dev — neither
// is acceptable during a grant demo. This boundary keeps the user in the
// Chamber visual language and offers a "Try again" + "Back to chat" path.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[error-boundary] unhandled render error', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--ch-bg, #0b0705)',
        color: 'var(--ch-ink, #f4ede4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--ch-warn, #ff8a80)',
            opacity: 0.78,
            marginBottom: 18,
          }}
        >
          Niečo sa pokazilo
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-instrument-serif), Georgia, serif',
            fontSize: 32,
            fontWeight: 400,
            lineHeight: 1.15,
            margin: '0 0 14px',
            letterSpacing: '-0.01em',
          }}
        >
          Aplikácia narazila na chybu.
        </h1>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            color: 'var(--ch-ink-soft, rgba(244,237,228,0.72))',
            margin: '0 0 24px',
          }}
        >
          Skúsim sa zotaviť. Ak chyba pretrváva, otvor Sprievodcu alebo nahlás problém.
        </p>
        {error.digest && (
          <div
            style={{
              fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
              fontSize: 10,
              opacity: 0.55,
              marginBottom: 24,
            }}
          >
            ID: {error.digest}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 22px',
              background: 'var(--ch-amber, #E8A87C)',
              border: 'none',
              borderRadius: 8,
              color: '#1a1006',
              cursor: 'pointer',
              fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.06em',
            }}
          >
            Skúsiť znova
          </button>
          <a
            href="/"
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.18))',
              borderRadius: 8,
              color: 'var(--ch-ink-soft, rgba(244,237,228,0.72))',
              textDecoration: 'none',
              fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
              fontSize: 12,
              letterSpacing: '0.06em',
            }}
          >
            Späť na chat
          </a>
        </div>
      </div>
    </div>
  );
}
