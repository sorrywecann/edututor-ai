'use client';

// ChamberSidebar — the Chamber design language's minimal rail.
//
// Per docs/design-spec §4: vertical, left-anchored, ~38×38 icon buttons, no
// labels (hover reveals), tiny amber glow-bar on the active item. No chrome
// frame, no border — sits transparent on the pure-black chamber bg so the
// rail feels like part of the void, not a panel.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  MessageSquare, Library, Mic, TrendingUp,
  Plus, Settings, Sparkles, HelpCircle, History,
  type LucideIcon,
} from 'lucide-react';
// v0.6.5: useDesignVariant import removed — A/C pill gone, atmosphere being retired
import { HelpDrawer } from './HelpDrawer';
import { api, type ConversationSummary } from '@/lib/api';

// v0.7.3: chat history restored to Chamber. Atmosphere variant had a History
// rail+flyout (Sidebar.tsx:240-345) that did not get ported when Chamber was
// introduced (commit e008566f). Backend conversations + api.listConversations
// have been working the whole time; only the entry point was missing.

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Dnes · ${time}`;
  if (diffDays === 1) return `Včera · ${time}`;
  return `${d.toLocaleDateString('sk', { day: 'numeric', month: 'short' })} · ${time}`;
}

const RAIL_W = 64;

// v0.6.5: 'Hlas' (voice-lab) nav entry removed — voice selection now lives in
// HW Setup. Per user direction: drop Hlasové štúdio entirely, keep Knižnica /
// Konverzácia / Pokrok.
const NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Konverzácia', href: '/',          icon: MessageSquare },
  { label: 'Knižnica',    href: '/knowledge', icon: Library },
  { label: 'Pokrok',      href: '/progress',  icon: TrendingUp },
];

interface RailButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}

function RailButton({ icon: Icon, label, active, onClick, href }: RailButtonProps) {
  const [hover, setHover] = useState(false);
  const inner = (
    <div style={{
      position: 'relative',
      width: 38, height: 38, borderRadius: 11,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active
        ? 'rgba(232, 168, 124, 0.10)'
        : hover ? 'rgba(244, 237, 228, 0.04)' : 'transparent',
      color: active
        ? 'var(--ch-amber, #E8A87C)'
        : hover ? 'var(--ch-ink, #f4ede4)' : 'var(--ch-ink-faint, #5a5048)',
      transition: 'background 0.18s, color 0.18s',
    }}>
      {active && (
        <span style={{
          position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%)',
          width: 2, height: 16, borderRadius: 2,
          background: 'var(--ch-amber, #E8A87C)',
          boxShadow: '0 0 10px rgba(232, 168, 124, 0.55)',
        }} />
      )}
      <Icon size={17} strokeWidth={1.7} />
      {hover && (
        <span style={{
          position: 'absolute', left: 'calc(100% + 14px)', top: '50%', transform: 'translateY(-50%)',
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 50,
          background: 'rgba(15, 11, 8, 0.96)',
          color: 'var(--ch-ink, #f4ede4)',
          border: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
          borderRadius: 8,
          padding: '6px 10px', fontSize: 10.5,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
        }}>
          {label}
        </span>
      )}
    </div>
  );

  const wrap: React.CSSProperties = {
    display: 'flex', justifyContent: 'center', textDecoration: 'none',
    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
  };

  if (href) {
    return (
      <Link href={href} aria-label={label} style={wrap}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {inner}
      </Link>
    );
  }
  return (
    <button aria-label={label} onClick={onClick} style={wrap}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {inner}
    </button>
  );
}

export function ChamberSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  // v0.6.5: toggleDesign removed with the A/C pill
  const [helpOpen, setHelpOpen] = useState(false);
  // v0.8.0 W5: HW Setup is a full page at /settings/* — modal state retired.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listConversations(20).then(setSessions).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (!historyOpen) return;
    function handle(e: MouseEvent) {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [historyOpen]);

  function newSession() {
    router.push(`/?new=${Date.now()}`);
  }
  function replayOnboarding() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('edututor_onboarding_v4'); localStorage.removeItem('edututor_onboarding_v3'); localStorage.removeItem('edututor_onboarding_v2');
    localStorage.removeItem('edututor_firstrun_done_v3'); localStorage.removeItem('edututor_firstrun_done_v2'); localStorage.removeItem('edututor_firstrun_done');
    window.location.reload();
  }

  return (
    <>
      <aside style={{
        width: RAIL_W, flexShrink: 0,
        background: 'transparent',
        borderRight: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        height: '100vh',
        padding: '24px 0 18px',
        position: 'relative', zIndex: 30,
      }}>
        {/* Tiny amber brand dot — the room's pilot light */}
        <Link href="/" aria-label="EduTutor" style={{ textDecoration: 'none', marginBottom: 30 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--ch-amber, #E8A87C)',
            boxShadow: '0 0 14px rgba(232, 168, 124, 0.55)',
          }} />
        </Link>

        {/* New session + primary nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <RailButton icon={Plus} label="Nová" onClick={newSession} />
          <div style={{ height: 1, background: 'var(--ch-line, rgba(244,237,228,0.06))', margin: '8px 14px' }} />
          {NAV.map((item) => (
            <RailButton key={item.href} icon={item.icon} label={item.label}
              href={item.href} active={pathname === item.href} />
          ))}
          <RailButton icon={History} label="História"
            active={historyOpen || pathname.startsWith('/history')}
            onClick={() => setHistoryOpen(o => !o)} />
        </nav>

        <div style={{ flex: 1 }} />

        {/* Utilities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <RailButton icon={Settings} label="Nastavenia" href="/settings/prehlad"
            active={pathname.startsWith('/settings')} />
          <RailButton icon={Sparkles} label="Spustiť úvod znova" onClick={replayOnboarding} />
          <RailButton icon={HelpCircle} label="Pomoc" onClick={() => setHelpOpen(true)} />
        </div>
        {/* v0.6.5: A/C variant pill removed. Atmosphere theme is being retired
            (full deletion in Phase 3); Chamber is the only system going forward.
            Emergency rollback still available via `?design=atmosphere` URL hatch
            until the variant provider itself is removed. */}
      </aside>

      {/* History flyout — Chamber-styled port of Sidebar.tsx:278-345 */}
      {historyOpen && (
        <div
          ref={flyoutRef}
          style={{
            position: 'fixed', top: 0, left: RAIL_W, bottom: 0,
            width: 280, zIndex: 40,
            background: 'rgba(15, 11, 8, 0.97)',
            borderRight: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7)',
            display: 'flex', flexDirection: 'column',
            animation: 'fade-in-up 0.18s ease',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 18px 14px',
            borderBottom: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
          }}>
            <div style={{
              fontFamily: 'var(--font-instrument), serif',
              fontSize: 17, fontWeight: 500,
              color: 'var(--ch-ink, #f4ede4)',
              letterSpacing: '-0.01em',
            }}>
              História
            </div>
            <button onClick={() => { setHistoryOpen(false); newSession(); }} title="Nová konverzácia"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(232, 168, 124, 0.10)',
                border: '1px solid rgba(232, 168, 124, 0.32)',
                color: 'var(--ch-amber, #E8A87C)',
                borderRadius: 8, padding: '5px 10px',
                fontSize: 10.5, cursor: 'pointer',
                fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                letterSpacing: '0.10em', textTransform: 'uppercase',
              }}>
              <Plus size={12} strokeWidth={2.2} /> Nová
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {sessions.length === 0 ? (
              <div style={{
                padding: 14, fontSize: 11.5,
                color: 'var(--ch-ink-faint, #5a5048)',
                fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                letterSpacing: '0.06em',
              }}>
                Zatiaľ žiadne relácie.
              </div>
            ) : sessions.map(session => {
              const active = pathname === `/history/${session.id}`;
              return (
                <Link key={session.id} href={`/history/${session.id}`}
                  onClick={() => setHistoryOpen(false)}
                  style={{
                    display: 'block', padding: '10px 12px', borderRadius: 10,
                    marginBottom: 3, textDecoration: 'none',
                    background: active ? 'rgba(232, 168, 124, 0.10)' : 'transparent',
                    transition: 'background 0.14s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(244, 237, 228, 0.04)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    fontSize: 12.5,
                    color: active ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink, #f4ede4)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    letterSpacing: '-0.005em',
                  }}>
                    {session.preview ?? session.title}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                    fontSize: 9.5,
                    color: 'var(--ch-ink-faint, #5a5048)',
                    marginTop: 3, letterSpacing: '0.04em',
                  }}>
                    {formatDate(session.created_at)}
                    {session.message_count > 0 && ` · ${(session.message_count / 2) | 0} odpovedí`}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
