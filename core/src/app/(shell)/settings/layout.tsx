'use client';

// Settings page shell — replaces the old ChamberHardwareSetup modal with a
// full-route experience. Each tab is its own URL segment.
//
// Layout:
//   ≥1024px → vertical left rail (tabs) + content
//   <1024px → horizontal top bar (tabs) + content
//
// Esc anywhere in the page navigates back (parity with the old modal Esc).
// The old "Hotovo" footer was removed in v0.8.4 — Esc + Topbar back-button
// + natural tab navigation are sufficient.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Topbar } from '@/components/shell/Topbar';
import { SettingsProvider, useSettingsCtx } from '@/components/settings/SettingsContext';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { Loading } from '@/components/settings/primitives';

interface TabDef { slug: string; num: string; label: string; }

const TABS: TabDef[] = [
  { slug: 'prehlad',    num: '01', label: 'Prehľad' },
  { slug: 'detaily',    num: '02', label: 'Detaily' },
  { slug: 'instalacia', num: '03', label: 'Inštalácia' },
  { slug: 'llm',        num: '04', label: 'LLM' },
  { slug: 'hlas',       num: '05', label: 'Hlas' },
  { slug: 'pocuvanie',  num: '06', label: 'Počúvanie' },
  { slug: 'persona',    num: '07', label: 'Persona' },
  { slug: 'mozog',      num: '08', label: 'Mozog' },
];

function useMatchMedia(query: string, fallback = false) {
  const [matches, setMatches] = useState(fallback);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

function useIsWide(breakpoint = 1024) {
  return useMatchMedia(`(min-width: ${breakpoint}px)`, true);
}

// Responsive horizontal padding for the settings container.
//   <1024px → narrow phone/tablet layout (handled by isWide=false)
//   1024–1400px → fluid, full width, padding 32px
//   ≥1400px → fluid, full width, padding 56px
//
// v0.8.5: NO max-width cap above 1024px. User wants true fullscreen — content
// uses 100% width minus padding at every wide viewport. The old 1400px cap at
// ≥1600px was removed because it made HW Setup look "windowed" on large
// monitors instead of using the whole desk.
function useResponsivePad() {
  const wider = useMatchMedia('(min-width: 1400px)', false);
  return {
    hPad: wider ? 56 : 32,
  };
}

function TabLink({ tab, vertical, active }: { tab: TabDef; vertical: boolean; active: boolean }) {
  return (
    <Link
      href={`/settings/${tab.slug}`}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ch-ink, #f4ede4)';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ch-ink-dim, #9a8f82)';
      }}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'baseline', gap: 8,
        padding: vertical ? '10px 14px' : '0 0 14px',
        textDecoration: 'none',
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink-dim, #9a8f82)',
        fontWeight: active ? 600 : 400,
        background: vertical && active ? 'rgba(232,168,124,0.06)' : 'transparent',
        borderRadius: vertical ? 8 : 0,
        transition: 'color 0.18s, background 0.18s',
      }}
    >
      <span style={{
        fontSize: 9.5, opacity: active ? 0.85 : 0.55,
        color: active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink-faint, #5a5048)',
      }}>{tab.num}</span>
      {tab.label}
      {active && !vertical && (
        <span style={{
          position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
          background: 'var(--ch-amber, #E8A87C)',
          borderRadius: 2,
          boxShadow: '0 0 10px rgba(232,168,124,0.45)',
        }} />
      )}
      {active && vertical && (
        <span style={{
          position: 'absolute', left: 0, top: 8, bottom: 8, width: 2,
          background: 'var(--ch-amber, #E8A87C)',
          borderRadius: 2,
          boxShadow: '0 0 10px rgba(232,168,124,0.45)',
        }} />
      )}
    </Link>
  );
}

function LayoutBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const wide = useIsWide();
  const { hPad } = useResponsivePad();
  const { loading } = useSettingsCtx();

  // Esc → router.back() (parity with the old modal's Esc-to-close)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  const activeSlug = TABS.find(t => pathname.startsWith(`/settings/${t.slug}`))?.slug || 'prehlad';

  return (
    <>
      <Topbar sessionTitle="Hardvérové nastavenie" />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{
          width: '100%', margin: '0 auto',
          padding: wide ? `28px ${hPad}px 24px` : '20px 18px',
          color: 'var(--ch-ink, #f4ede4)',
          fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
        }}>
          <SettingsHeader />

          {/* Tab strip — vertical rail on wide, horizontal bar on narrow */}
          <div style={{ marginTop: 24, display: wide ? 'grid' : 'block', gridTemplateColumns: wide ? '200px 1fr' : undefined, gap: wide ? 32 : 0 }}>
            {wide ? (
              <nav style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                paddingRight: 8,
                borderRight: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
              }}>
                {TABS.map(t => (
                  <TabLink key={t.slug} tab={t} vertical active={activeSlug === t.slug} />
                ))}
              </nav>
            ) : (
              <nav style={{
                display: 'flex', gap: 22, overflowX: 'auto',
                borderBottom: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
                marginBottom: 18,
              }}>
                {TABS.map(t => (
                  <TabLink key={t.slug} tab={t} vertical={false} active={activeSlug === t.slug} />
                ))}
              </nav>
            )}

            <div style={{ minHeight: 360 }}>
              {loading ? <Loading /> : children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <LayoutBody>{children}</LayoutBody>
    </SettingsProvider>
  );
}
