import Link from 'next/link';

// v0.6.5: app-root 404 page. Without this, Next.js falls back to its
// unbranded default which is jarring when the user follows a stale link
// (e.g. /voice-lab from an old screenshot since v0.6.5 removed that route).

export default function NotFound() {
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
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--ch-amber, #E8A87C)',
            opacity: 0.78,
            marginBottom: 18,
          }}
        >
          404 · stránka neexistuje
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-instrument-serif), Georgia, serif',
            fontSize: 38,
            fontWeight: 400,
            lineHeight: 1.1,
            margin: '0 0 14px',
            letterSpacing: '-0.01em',
          }}
        >
          Tu nič nie je.
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--ch-ink-soft, rgba(244,237,228,0.72))',
            margin: '0 0 28px',
          }}
        >
          Možno si klikol na starý odkaz alebo sa stránka presunula. Skús sa vrátiť na hlavnú konverzáciu.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 22px',
            border: '1px solid var(--ch-amber, #E8A87C)',
            borderRadius: 8,
            color: 'var(--ch-amber, #E8A87C)',
            textDecoration: 'none',
            fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
            fontSize: 12,
            letterSpacing: '0.08em',
          }}
        >
          Späť na konverzáciu
        </Link>
      </div>
    </div>
  );
}
