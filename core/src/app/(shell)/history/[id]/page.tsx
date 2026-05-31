'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Topbar } from '@/components/shell/Topbar';
import { api } from '@/lib/api';
import type { ConversationMessages } from '@/lib/api';
import { PageHeader, EmptyState, GlassCard, StatusPill } from '@/components/atmosphere';
import { MessageSquare } from 'lucide-react';

export default function HistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ConversationMessages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getConversationMessages(id)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const title = data?.title ?? 'Konverzácia';
  const turns = data ? Math.floor(data.count / 2) : 0;

  return (
    <>
      <Topbar sessionTitle={title} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px 56px' }}>
        <PageHeader
          eyebrow={`História · ${data?.created_at ? new Date(data.created_at).toLocaleString('sk') : 'načítava sa'}`}
          title={title}
          description={`${turns} ${turns === 1 ? 'výmena' : turns < 5 ? 'výmeny' : 'výmen'} otázok a odpovedí. Konverzácia je iba na čítanie.`}
          right={data ? <StatusPill kind="info" dot={false}>{turns} {turns === 1 ? 'výmena' : turns < 5 ? 'výmeny' : 'výmen'}</StatusPill> : null}
        />

        <div style={{ marginTop: 28, maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
          {loading && (
            <GlassCard pad="md">
              <div style={{ color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Načítava sa…
              </div>
            </GlassCard>
          )}

          {error && (
            <GlassCard pad="md">
              <div style={{ color: '#ef4444', fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}>
                ✗ {error}
              </div>
            </GlassCard>
          )}

          {data && data.messages.length === 0 && (
            <GlassCard pad="md">
              <EmptyState
                icon={<MessageSquare size={22} strokeWidth={1.7} />}
                title="Žiadne správy v tejto relácii"
                description="Konverzácia bola založená, ale nezachytili sme žiadne výmeny."
              />
            </GlassCard>
          )}

          {data && data.messages.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.messages.map((msg, i) => {
                const isAI = msg.role === 'assistant';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      flexDirection: isAI ? 'row' : 'row-reverse',
                    }}
                  >
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: isAI ? 'rgba(var(--accent-r), 0.14)' : 'rgba(245, 237, 216, 0.04)',
                        border: `1px solid ${isAI ? 'rgba(var(--accent-r), 0.30)' : 'var(--atm-glass-border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginTop: 2,
                        fontFamily: 'var(--font-jetbrains)', fontSize: 9, fontWeight: 600,
                        color: isAI ? 'var(--accent)' : 'var(--t2)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {isAI ? 'L' : 'TY'}
                    </div>
                    <div
                      className="atm-glass"
                      style={{
                        padding: '12px 16px',
                        maxWidth: 'min(720px, 80%)',
                        borderRadius: isAI ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                        background: isAI ? 'rgba(var(--accent-r),0.06)' : 'rgba(245, 237, 216, 0.04)',
                        borderColor: isAI ? 'rgba(var(--accent-r), 0.18)' : 'var(--atm-glass-border)',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-jetbrains)', fontSize: 8.5,
                          letterSpacing: '0.12em', textTransform: 'uppercase',
                          color: isAI ? 'rgba(var(--accent-r), 0.65)' : 'var(--t3)',
                          marginBottom: 6,
                        }}
                      >
                        {isAI ? 'Lukáš' : 'Ty'}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-inter)', fontSize: 14, lineHeight: 1.65,
                          color: 'var(--t1)', letterSpacing: '-0.005em',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
