// PageHeader — eyebrow + title + description, used at the top of every
// content page. Standardises the pattern we've been hand-rolling per page.
//
// Eyebrow uses the coral accent (--atm-dot-active) by convention so users
// learn it as the "you are on this page" beacon, mirroring the StepDots
// active colour.

import { CSSProperties, ReactNode } from 'react';

interface PageHeaderProps {
  /** Small all-caps tracked label above the title (e.g. "Layer 1 · observability") */
  eyebrow?: ReactNode;
  /** Page title — short, in clear sentence case */
  title: ReactNode;
  /** One- or two-line description in the prose register */
  description?: ReactNode;
  /** Right-side accessory: button, status pill, anything */
  right?: ReactNode;
  style?: CSSProperties;
}

export function PageHeader({ eyebrow, title, description, right, style }: PageHeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div
            className="atm-micro"
            style={{ color: 'var(--atm-dot-active)', marginBottom: 6 }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--t1)',
            margin: 0,
            letterSpacing: '-0.015em',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--t2)',
              margin: '8px 0 0',
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </header>
  );
}
