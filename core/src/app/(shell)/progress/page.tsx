'use client';

// /progress — Pokrok dashboard. A clean, readable full-page view of the
// learner's activity built on warm tokens + the atmosphere glass surface:
//   • hero metric band (the four numbers that matter)
//   • 14-day activity chart
//   • recent-sessions data table (rows link to the transcript)
//   • topics + secondary stats column
// All from existing endpoints: getStats() + listConversations().

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { api, getPersistentUserId } from '@/lib/api';
import type { UserStats, ConversationSummary } from '@/lib/api';
import { PageHeader, MicroLabel, EmptyState, MetricCard } from '@/components/atmosphere';

function formatLastSession(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'dnes';
  if (diffDays === 1) return 'včera';
  if (diffDays < 7) return `pred ${diffDays} dňami`;
  return d.toLocaleDateString('sk', { day: 'numeric', month: 'short' });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Dnes · ${time}`;
  if (diffDays === 1) return `Včera · ${time}`;
  return d.toLocaleDateString('sk', { day: 'numeric', month: 'short' });
}

function formatNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

// Warm glass surface — full-width by default (unlike GlassCard which caps 720).
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="atm-glass" style={{ padding: '20px 22px', ...style }}>{children}</div>;
}

interface HeroStat { key: keyof UserStats; label: string; suffix: string; fmt: boolean; }
const HERO: HeroStat[] = [
  { key: 'session_count', label: 'Konverzácie',     suffix: '',     fmt: false },
  { key: 'total_turns',   label: 'Odpovede tutora', suffix: '',     fmt: false },
  { key: 'streak_days',   label: 'Séria',           suffix: ' dní', fmt: false },
  { key: 'total_words',   label: 'Slová tutora',    suffix: '',     fmt: true  },
];

export default function ProgressPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getStats(getPersistentUserId()).catch(() => null),
      api.listConversations(8).catch(() => [] as ConversationSummary[]),
    ])
      .then(([s, c]) => { setStats(s); setSessions(c); })
      .finally(() => setLoading(false));
  }, []);

  const s = stats;
  const empty = !loading && s !== null && s.session_count === 0;
  const maxActivity = Math.max(1, ...(s?.activity?.map(a => a.sessions) ?? [1]));

  return (
    <>
      <Topbar sessionTitle="Pokrok" />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 40px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <PageHeader
            eyebrow="Pokrok · learning stats"
            title="Tvoj pokrok"
            description={
              <span
                style={{
                  fontFamily: 'var(--font-instrument), Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 18,
                  color: 'var(--t2)',
                  lineHeight: 1.45,
                  display: 'block',
                }}
              >
                {s?.last_session_at
                  ? `Posledná aktivita ${formatLastSession(s.last_session_at)}.`
                  : 'Začni konverzáciu a tvoj pokrok sa začne sledovať.'}
              </span>
            }
          />

          {empty ? (
            <Card style={{ maxWidth: 680 }}>
              <EmptyState
                icon={<TrendingUp size={22} strokeWidth={1.7} />}
                title="Zatiaľ žiadne dáta"
                description="Začni konverzáciu s Lukášom a tvoj pokrok sa začne sledovať automaticky."
              />
            </Card>
          ) : (
            <>
              {/* Hero metric band — v0.8.0 editorial: numbers in Instrument
                  Serif italic 54px, hairline divider under each, label below. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 28, padding: '4px 0' }}>
                {HERO.map(({ key, label, suffix, fmt }) => {
                  const raw = (s?.[key] as number) ?? 0;
                  return (
                    <MetricCard
                      key={key}
                      variant="editorial"
                      label={label}
                      value={loading ? '—' : (fmt ? formatNum(raw) : raw)}
                      unit={suffix.trim() || undefined}
                    />
                  );
                })}
              </div>

              {/* Activity chart — v0.6.5 polish: weekday letters, today
                  highlight, total annotation in header, baseline.
                  v0.8.0: two-letter weekday labels (Ne Po Ut St Št Pi So),
                  non-color today cue (accent dot under date), italic empty
                  state when total = 0. */}
              {s?.activity && s.activity.length > 0 && (() => {
                const totalSessions = s.activity.reduce((sum, d) => sum + d.sessions, 0);
                const todayIso = new Date().toISOString().slice(0, 10);
                // Slovak two-letter weekday — Ne Po Ut St Št Pi So (index 0 = Sunday).
                const weekdayShort = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
                return (
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                      <MicroLabel>Aktivita — posledných 14 dní</MicroLabel>
                      <span className="atm-tabular" style={{ fontSize: 11, color: 'var(--t2)', letterSpacing: '0.02em' }}>
                        {totalSessions} {totalSessions === 1 ? 'konverzácia' : (totalSessions >= 2 && totalSessions <= 4 ? 'konverzácie' : 'konverzácií')}
                      </span>
                    </div>
                    {totalSessions === 0 ? (
                      <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{
                          fontFamily: 'var(--font-instrument), Georgia, serif',
                          fontStyle: 'italic',
                          fontSize: 16,
                          color: 'var(--t2)',
                          lineHeight: 1.4,
                        }}>
                          Tvoja kronika sa začne dnes.
                        </span>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 7, height: 110, padding: '14px 2px 0' }}>
                        {/* Baseline 1px line so empty days have a visible floor */}
                        <div style={{ position: 'absolute', left: 2, right: 2, bottom: 26, height: 1, background: 'var(--border)', opacity: 0.5, pointerEvents: 'none' }} />
                        {s.activity.slice().reverse().map((day, i) => {
                          const h = Math.max(5, (day.sessions / maxActivity) * 88);
                          const dt = new Date(day.date);
                          const isToday = day.date === todayIso;
                          return (
                            <div key={i} title={`${dt.toLocaleDateString('sk', { day: 'numeric', month: 'numeric' })}: ${day.sessions} konverzácií`}
                              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <div style={{
                                width: '100%', maxWidth: 30, height: h, borderRadius: '5px 5px 0 0',
                                background: day.sessions > 0 ? 'var(--accent)' : 'var(--border)',
                                opacity: day.sessions > 0 ? (isToday ? 1 : 0.85) : 0.35,
                                boxShadow: isToday ? '0 0 0 1px var(--accent), 0 2px 12px rgba(232,168,124,0.28)' : 'none',
                                transition: 'height 300ms ease',
                              }} />
                              <span className="atm-tabular" style={{ fontSize: 9.5, color: isToday ? 'var(--accent)' : 'var(--t3)', fontWeight: isToday ? 600 : 400 }}>{dt.getDate()}</span>
                              {/* v0.8.0: non-color today cue — small accent
                                  dot below the date so color-blind users still
                                  see which column is today. */}
                              {isToday && (
                                <span style={{
                                  width: 4, height: 4, borderRadius: '50%',
                                  background: 'var(--accent)', marginTop: -1,
                                  display: 'block',
                                }} aria-hidden="true" />
                              )}
                              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--t3)', opacity: 0.55, letterSpacing: '0.04em' }}>{weekdayShort[dt.getDay()]}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })()}

              {/* Two-column: sessions table + topics/details */}
              <div className="pokrok-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                {/* Recent sessions data table */}
                <div className="atm-glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 18px 10px' }}><MicroLabel>Posledné relácie</MicroLabel></div>
                  {sessions.length === 0 ? (
                    <div style={{ padding: '4px 18px 20px', fontSize: 12.5, color: 'var(--t3)' }}>Zatiaľ žiadne relácie.</div>
                  ) : (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 104px 64px', gap: 10, padding: '0 18px 8px', borderBottom: '1px solid var(--border)' }}>
                        {['Téma', 'Dátum', 'Odpovede'].map((h, i) => (
                          <span key={h} style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', textAlign: i === 2 ? 'right' : 'left' }}>{h}</span>
                        ))}
                      </div>
                      {sessions.map(c => (
                        <Link key={c.id} href={`/history/${c.id}`}
                          style={{ display: 'grid', gridTemplateColumns: '1fr 104px 64px', gap: 10, padding: '11px 18px', textDecoration: 'none', alignItems: 'center', borderBottom: '1px solid var(--subtle)', transition: 'background 0.14s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--subtle)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ fontSize: 12.5, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.005em' }}>
                            {c.preview ?? c.title}
                          </span>
                          <span className="atm-tabular" style={{ fontSize: 13, color: 'var(--t3)' }}>{formatDateShort(c.created_at)}</span>
                          <span className="atm-tabular" style={{ fontSize: 13, color: 'var(--t2)', textAlign: 'right' }}>{(c.message_count / 2) | 0}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Topics + secondary stats */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Card>
                    <MicroLabel>Posledné témy</MicroLabel>
                    {s?.recent_topics && s.recent_topics.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 6 }}>
                        {s.recent_topics.map((t, i) => (
                          <span key={i} style={{
                            padding: '6px 11px', borderRadius: 999, fontSize: 12, color: 'var(--t2)',
                            background: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-r), 0.22)',
                            letterSpacing: '-0.005em',
                          }}>{t}</span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>Zatiaľ žiadne témy.</div>
                    )}
                  </Card>

                  <Card>
                    <MicroLabel>Detaily</MicroLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                      {[
                        { label: 'Tvoje otázky', value: String(s?.user_messages ?? 0) },
                        { label: 'ø na konverzáciu', value: String(s?.avg_turns_per_session ?? 0) },
                        { label: 'Tvoje slová', value: formatNum(s?.user_words ?? 0) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--subtle)' }}>
                          <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{label}</span>
                          <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 13, color: 'var(--t1)' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .pokrok-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
