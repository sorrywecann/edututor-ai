'use client';

import { useState, useEffect } from 'react';

import { API_BASE } from '@/lib/config';
import { PageHeader } from '@/components/atmosphere';

interface KnowledgeBase { name: string; document_count: number; total_chunks: number }
interface Chunk { id: string; content: string; full_length: number; source: string; page: number | null; chunk_index: number }

export default function ChunkViewerPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState('');
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/knowledge-bases`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : data.knowledge_bases ?? [];
        setKbs(list);
        if (list.length > 0) setSelectedKb(list[0].name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedKb) return;
    setLoading(true);
    fetch(`${API_BASE}/api/v1/diagnostics/rag/chunks/${selectedKb}?page=${page}&per_page=${perPage}`)
      .then(r => r.ok ? r.json() : { chunks: [], total: 0, total_pages: 0 })
      .then(d => {
        setChunks(d.chunks ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.total_pages ?? 0);
      })
      .catch(() => { setChunks([]); setTotal(0); setTotalPages(0); })
      .finally(() => setLoading(false));
  }, [selectedKb, page]);

  function handleKbChange(name: string) {
    setSelectedKb(name);
    setPage(1);
  }

  const pageBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    background: active ? 'var(--accent)' : 'transparent',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`,
    borderRadius: 5,
    fontFamily: 'var(--font-jetbrains)',
    fontSize: 10,
    color: active ? '#000' : 'var(--t3)',
    cursor: active ? 'default' : 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '32px 40px 56px', maxWidth: 920, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <PageHeader
        eyebrow="Diagnostika · chunk viewer"
        title="Chunk Viewer"
        description="Pozri sa, ako RAG rozdelil dokumenty na časti. Užitočné pre ladenie kvality odpovedí — keď chunks sú irelevantné alebo zlomené, vidíš to tu."
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 5 }}>
            Databáza znalostí
          </div>
          <select
            value={selectedKb}
            onChange={e => handleKbChange(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border-mid)',
              borderRadius: 8, fontSize: 11.5, color: 'var(--t1)', outline: 'none',
            }}
          >
            {kbs.length === 0 && <option value="">Žiadne KB</option>}
            {kbs.map(kb => (
              <option key={kb.name} value={kb.name}>{kb.name} ({kb.total_chunks} chunkov)</option>
            ))}
          </select>
        </div>
        {total > 0 && (
          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.06em', paddingBottom: 8 }}>
            {total} chunkov celkom
          </div>
        )}
      </div>

      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Načítavam…
        </div>
      )}

      {!loading && chunks.length === 0 && (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>Žiadne chunky.</div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.6, marginTop: 6 }}>
            Vyber databázu znalostí s nahranými dokumentmi.
          </div>
        </div>
      )}

      {!loading && chunks.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chunks.map(c => (
              <div key={c.id} style={{
                padding: '12px 14px',
                background: 'var(--raised)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                      #{c.chunk_index + 1}
                    </span>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.04em' }}>
                      {c.source}
                    </span>
                    {c.page != null && (
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--t3)' }}>
                        str. {c.page}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: 'var(--t3)' }}>
                    {c.full_length} znakov
                  </span>
                </div>
                <div style={{
                  fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {c.content}{c.full_length > 500 ? '…' : ''}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'center', paddingTop: 8 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ ...pageBtnStyle(false), opacity: page <= 1 ? 0.3 : 1, cursor: page <= 1 ? 'default' : 'pointer' }}
              >
                ←
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= totalPages - 3) {
                  p = totalPages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <button key={p} onClick={() => setPage(p)} style={pageBtnStyle(p === page)}>
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ ...pageBtnStyle(false), opacity: page >= totalPages ? 0.3 : 1, cursor: page >= totalPages ? 'default' : 'pointer' }}
              >
                →
              </button>
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 8.5, color: 'var(--t3)', marginLeft: 8, letterSpacing: '0.04em' }}>
                {page}/{totalPages}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
