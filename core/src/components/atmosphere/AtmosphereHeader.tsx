'use client';

// Atmosphere header — clock + greeting + rotating quote.
// The mood-setting top-of-screen element from UNCLAW.
//
// Greeting auto-derives from local time in Slovak ("Dobré ráno", "Dobré
// popoludnie", "Dobrý večer", "Dobrú noc"). Quote cycles every `quoteEveryMs`
// from the supplied list, or stays static if only one quote.

import { useEffect, useState } from 'react';

interface Quote {
  text: string;
  attrib: string;
}

interface AtmosphereHeaderProps {
  /** Name to greet (e.g. the user's first name from onboarding). */
  name?: string;
  /** Quotes to cycle through. If empty, no quote line is rendered. */
  quotes?: Quote[];
  /** Override the auto-derived greeting (e.g. for a settings page). */
  greetingOverride?: string;
  /** Cycle interval, ms. Default 9000 (9s, slow enough to read). */
  quoteEveryMs?: number;
  /** App name shown in the header chrome. Default "EduTutor". */
  appName?: string;
}

const SLOVAK_QUOTES_DEFAULT: Quote[] = [
  { text: 'Vzdelanie je najmocnejšia zbraň, ktorou môžeš zmeniť svet.', attrib: 'Nelson Mandela' },
  { text: 'Nikdy sa neprestávaj učiť — pretože život ťa nikdy neprestane učiť.', attrib: '— ľudová múdrosť' },
  { text: 'AI je výkonný nástroj, ktorý pomáha ľudstvu pochopiť svet.', attrib: 'Demis Hassabis' },
  { text: 'Každá dostatočne pokročilá technológia je nerozoznateľná od mágie.', attrib: 'Arthur C. Clarke' },
];

function getGreetingSk(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'Dobrú noc';
  if (h < 11) return 'Dobré ráno';
  if (h < 17) return 'Dobré popoludnie';
  if (h < 22) return 'Dobrý večer';
  return 'Dobrú noc';
}

function formatClockSk(d: Date): string {
  return d.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' });
}

export function AtmosphereHeader({
  name,
  quotes = SLOVAK_QUOTES_DEFAULT,
  greetingOverride,
  quoteEveryMs = 9000,
  appName = 'EduTutor',
}: AtmosphereHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [quoteIdx, setQuoteIdx] = useState(0);

  // SSR-safe: only start clock on client
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  // Rotate quotes
  useEffect(() => {
    if (quotes.length <= 1) return;
    const t = setInterval(() => {
      setQuoteIdx((i) => (i + 1) % quotes.length);
    }, quoteEveryMs);
    return () => clearInterval(t);
  }, [quotes, quoteEveryMs]);

  const greeting = greetingOverride ?? (now ? getGreetingSk(now) : '');
  const clock = now ? formatClockSk(now) : '';
  const quote = quotes[quoteIdx];

  return (
    <header
      style={{
        position: 'relative',
        padding: '24px 32px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      {/* App chrome — appName centered, like UNCLAW's "UNCLAW" header */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <span className="atm-micro" style={{ letterSpacing: '0.3em' }}>
          {appName}
        </span>
      </div>

      {/* Clock — top-left */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 32,
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: 11,
          color: 'var(--atm-micro-color)',
          letterSpacing: '0.06em',
        }}
      >
        {clock}
      </div>

      {/* Greeting + quote */}
      <div style={{ paddingTop: 36, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="atm-greeting" style={{ margin: 0 }}>
          {name ? `${greeting}, ${name}.` : `${greeting}.`}
        </h1>
        {quote && (
          <div
            key={quoteIdx}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, animation: 'atm-quote-fade 600ms ease both' }}
          >
            <span className="atm-quote">&ldquo;{quote.text}&rdquo;</span>
            <span className="atm-quote-attrib">— {quote.attrib}</span>
          </div>
        )}
      </div>
    </header>
  );
}
