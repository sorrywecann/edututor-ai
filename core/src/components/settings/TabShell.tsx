'use client';

// TabShell — shared layout primitive for every Settings tab.
// Owns the per-tab title + italic sub. Tabs render their content as children.
// All previous in-tab top-level <SectionLabel> headers were de-duplicated when
// migrating to this shell.

import React from 'react';

export function TabShell({ title, sub, children }: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{
          fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
          fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em',
          color: 'var(--ch-ink, #f4ede4)', margin: 0,
        }}>{title}</h2>
        {sub && <p style={{
          fontFamily: 'var(--font-instrument), ui-serif, Georgia, serif',
          fontStyle: 'italic', fontSize: 15, lineHeight: 1.5,
          color: 'var(--ch-ink-dim, #9a8f82)', margin: 0, maxWidth: 580,
        }}>{sub}</p>}
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {children}
      </div>
    </div>
  );
}
