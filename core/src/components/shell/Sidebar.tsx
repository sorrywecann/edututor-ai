'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import {
  MessageSquare, Library, Mic, TrendingUp,
  Activity, Workflow, History, Plus, Settings, HelpCircle, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ConversationSummary } from '@/lib/api';
import { HelpDrawer } from './HelpDrawer';
import { API_BASE } from '@/lib/config';
// v0.6.5: useDesignVariant import removed — A/C pill gone, atmosphere being retired

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_MAIN: NavItem[] = [
  { label: 'Konverzácia',       href: '/',          icon: MessageSquare },
  { label: 'Databáza znalostí', href: '/knowledge', icon: Library },
  // v0.6.5: voice-lab nav entry removed — voice selection is in HW Setup tab
  { label: 'Pokrok',            href: '/progress',  icon: TrendingUp },
];

const NAV_DIAG: NavItem[] = [
  { label: 'Výkonnosť',          href: '/performance',  icon: Activity },
  { label: 'Pipeline Inspector', href: '/avatar-debug', icon: Workflow },
];

interface SidebarProps {
  systemOnline?: boolean;
  onClose?: () => void;
}

interface SystemStatus {
  stt: string | null;
  llm: string | null;
  llm_model: string | null;
  tts: string | null;
}

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

const RAIL_W = 76;

// A single icon button in the rail with a hover-revealed label that slides
// out to the right. Active state gets an amber pill + amber glyph.
function RailButton({
  icon: Icon, label, active, onClick, href, small,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  small?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const size = small ? 38 : 44;

  const inner = (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '13px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--accent-soft)' : hover ? 'var(--subtle)' : 'transparent',
        color: active ? 'var(--accent)' : hover ? 'var(--t1)' : 'var(--t2)',
        transition: 'background 0.18s, color 0.18s',
      }}
    >
      {active && (
        <span style={{
          position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: 18, borderRadius: 3,
          background: 'var(--accent)',
          boxShadow: '0 0 8px rgba(var(--accent-r), 0.6)',
        }} />
      )}
      <Icon size={small ? 16 : 19} strokeWidth={1.9} />

      {hover && (
        <span style={{
          position: 'absolute', left: 'calc(100% + 12px)', top: '50%', transform: 'translateY(-50%)',
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 50,
          background: 'var(--raised-2)', color: 'var(--t1)',
          border: '1px solid var(--border-mid)', borderRadius: 8,
          padding: '6px 10px', fontSize: 11.5, fontFamily: 'var(--font-inter)',
          letterSpacing: '-0.005em', boxShadow: 'var(--shadow-soft)',
          animation: 'fade-in-up 0.14s ease',
        }}>
          {label}
        </span>
      )}
    </div>
  );

  const wrapStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'center', textDecoration: 'none',
    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
  };

  if (href) {
    return (
      <Link href={href} aria-label={label} style={wrapStyle}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {inner}
      </Link>
    );
  }
  return (
    <button aria-label={label} onClick={onClick} style={wrapStyle}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {inner}
    </button>
  );
}

export function Sidebar({ systemOnline = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  // v0.8.0 W5: HW Setup is a full page at /settings/* — modal state retired.
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);
  // v0.6.5: variant + toggleDesign removed with the A/C pill

  function handleNewSession() {
    router.push(`/?new=${Date.now()}`);
    onClose?.();
  }

  // Replay the full onboarding (Welcome → first-run readiness → setup). Clears
  // the localStorage gates and reloads so both overlays re-show — the desktop
  // app has no address bar for the ?reset_onboarding=1 / ?firstrun=1 flags.
  function replayOnboarding() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('edututor_onboarding_v4'); localStorage.removeItem('edututor_onboarding_v3'); localStorage.removeItem('edututor_onboarding_v2');
    localStorage.removeItem('edututor_firstrun_done_v3'); localStorage.removeItem('edututor_firstrun_done_v2'); localStorage.removeItem('edututor_firstrun_done');
    window.location.reload();
  }

  useEffect(() => {
    api.listConversations(20).then(setSessions).catch(() => {});
  }, [pathname]);

  // W2 → v0.8.0 W5: HW Setup is now the /settings page. The Nudge / other
  // surfaces still dispatch `edututor:open-hardware`; the listener now
  // navigates instead of opening a modal.
  useEffect(() => {
    function handle() { router.push('/settings/prehlad'); }
    window.addEventListener('edututor:open-hardware', handle);
    return () => window.removeEventListener('edututor:open-hardware', handle);
  }, [router]);

  useEffect(() => {
    function loadStatus() {
      fetch(`${API_BASE}/api/v1/system/status`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setStatus(d); })
        .catch(() => {});
    }
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <>
      <aside
        style={{
          width: RAIL_W,
          flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          height: '100vh',
          padding: '16px 0 14px',
          position: 'relative',
          zIndex: 30,
          transition: 'background 0.4s ease',
        }}
      >
        {/* Monogram */}
        <Link href="/" aria-label="EduTutor" style={{ textDecoration: 'none' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '13px',
            background: 'linear-gradient(150deg, var(--accent), #B8633D)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 19,
            color: '#fff', letterSpacing: '-0.03em',
            boxShadow: '0 6px 18px rgba(var(--accent-r), 0.35)',
          }}>
            E
          </div>
        </Link>

        {onClose && (
          <button onClick={onClose} aria-label="Zavrieť"
            style={{
              position: 'absolute', top: 8, right: 8, background: 'transparent',
              border: 'none', color: 'var(--t3)', fontSize: 18, cursor: 'pointer', lineHeight: 1,
            }}>×</button>
        )}

        {/* Primary nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 26 }}>
          {NAV_MAIN.map(item => (
            <RailButton key={item.href} icon={item.icon} label={item.label}
              href={item.href} active={pathname === item.href} />
          ))}

          <div style={{ height: 1, background: 'var(--border)', margin: '8px 14px', opacity: 0.7 }} />

          <RailButton icon={History} label="História"
            active={historyOpen || pathname.startsWith('/history')}
            onClick={() => setHistoryOpen(o => !o)} />
          <RailButton icon={Plus} label="Nová konverzácia" onClick={handleNewSession} />
        </nav>

        <div style={{ flex: 1 }} />

        {/* Diagnostics + utilities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_DIAG.map(item => (
            <RailButton key={item.href} icon={item.icon} label={item.label}
              href={item.href} active={pathname === item.href} small />
          ))}
          <RailButton icon={Settings} label="Nastavenie hardvéru" href="/settings/prehlad"
            active={pathname.startsWith('/settings')} small />
          <RailButton icon={Sparkles} label="Spustiť úvod znova" onClick={replayOnboarding} small />
          <RailButton icon={HelpCircle} label="Sprievodca platformou" onClick={() => setHelpOpen(true)} small />
        </div>

        {/* v0.6.5: A/C variant pill removed. Atmosphere theme is being retired
            (full deletion in Phase 3); Chamber is the only system going forward.
            Emergency rollback still available via `?design=atmosphere` URL hatch
            until the variant provider itself is removed. */}

        {/* Online status dot */}
        <div
          title={systemOnline ? `LLM · ${status?.llm_model || status?.llm || '—'}` : 'Služby sú offline'}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: systemOnline ? 'var(--green)' : '#ef4444',
            boxShadow: systemOnline ? '0 0 7px rgba(var(--green-r), 0.6)' : 'none',
            animation: 'status-blink 2.6s ease-in-out infinite',
          }} />
        </div>
      </aside>

      {/* History flyout */}
      {historyOpen && (
        <div
          ref={flyoutRef}
          style={{
            position: 'fixed', top: 0, left: RAIL_W, bottom: 0,
            width: 280, zIndex: 40,
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lift)',
            display: 'flex', flexDirection: 'column',
            animation: 'fade-in-up 0.18s ease',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 18px 14px', borderBottom: '1px solid var(--border)',
          }}>
            <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>
              História
            </div>
            <button onClick={handleNewSession} title="Nová konverzácia"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-r), 0.3)',
                color: 'var(--accent)', borderRadius: 8, padding: '5px 10px',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-inter)',
              }}>
              <Plus size={13} strokeWidth={2.2} /> Nová
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {sessions.length === 0 ? (
              <div style={{ padding: 10, fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)' }}>
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
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    transition: 'background 0.14s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--subtle)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    fontSize: 12.5, color: active ? 'var(--t1)' : 'var(--t2)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    letterSpacing: '-0.005em',
                  }}>
                    {session.preview ?? session.title}
                  </div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9.5, color: 'var(--t3)', marginTop: 3 }}>
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
