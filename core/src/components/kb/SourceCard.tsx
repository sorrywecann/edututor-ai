'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SourceViewer } from '@/components/kb/SourceViewer';
import { api, type Document } from '@/lib/api';
import { useKBStore, type ContextMode } from '@/stores/useKBStore';

const CONTEXT_OPTIONS: { label: string; value: ContextMode }[] = [
  { label: 'Aktívny', value: 'full' }, { label: 'Vypnutý', value: 'off' },
];

interface SourceCardProps { document: Document; onDeleteAction: (id: string) => Promise<void>; }

export function SourceCard({ document, onDeleteAction }: SourceCardProps) {
  const contextMode = useKBStore((s) => s.contextModes[document.id] ?? document.context_mode ?? 'full');
  const setContextMode = useKBStore((s) => s.setContextMode);
  const updateDocument = useKBStore((s) => s.updateDocument);
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const processing = document.status === 'pending' || document.status === 'processing';
  const completed = document.status === 'completed';
  const failed = document.status === 'failed';
  const statusColor = completed ? 'var(--green)' : failed ? '#ef4444' : 'var(--accent)';
  const statusText = completed
    ? `${document.chunk_count} častí`
    : processing
      ? 'Spracovávam…'
      : 'Chyba — klikni pre detail';

  const handleContextChange = async (next: string) => {
    if (!next || next === contextMode) return;
    const prev = contextMode;
    setSaving(true); setContextMode(document.id, next as ContextMode); updateDocument(document.id, { context_mode: next as ContextMode });
    try { await api.updateDocumentContextMode(document.id, next); } catch { setContextMode(document.id, prev); updateDocument(document.id, { context_mode: prev }); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="source-card"
      title={failed && document.error_message ? document.error_message : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: `1px solid ${processing ? 'var(--accent)' : failed ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, borderRadius: '8px', background: processing ? 'var(--accent-dim)' : failed ? 'rgba(239,68,68,0.05)' : 'var(--surface)', transition: 'all 0.15s', cursor: 'pointer' }}
      onClick={() => {
        if (failed && document.error_message) {
          alert(`Súbor "${document.filename}" sa nepodarilo spracovať:\n\n${document.error_message}`);
          return;
        }
        setViewerOpen(true);
      }}
      onMouseEnter={(e) => { if (!processing && !failed) e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
      onMouseLeave={(e) => { if (!processing && !failed) e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <FileText size={15} strokeWidth={1.8} style={{ flexShrink: 0, color: 'var(--t2)' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.filename}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontSize: '8px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em' }}>{statusText}</span>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
        <ToggleGroup type="single" value={contextMode} onValueChange={(v) => void handleContextChange(v)} disabled={saving}
        style={{ display: 'flex', gap: '2px' }}>
        {CONTEXT_OPTIONS.map((o) => {
          const sel = contextMode === o.value || (o.value === 'full' && contextMode === 'insights');
          return <ToggleGroupItem key={o.value} value={o.value} aria-label={o.label}
            style={{ padding: '2px 7px', borderRadius: '4px', border: 'none', background: sel ? (o.value === 'full' ? 'rgba(var(--green-r),0.15)' : 'rgba(239,68,68,0.1)') : 'transparent', color: sel ? (o.value === 'full' ? 'var(--green)' : '#ef4444') : 'var(--t3)', fontSize: '7px', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em', textTransform: 'uppercase', transition: 'all 0.12s', height: '20px' }}
          >{o.label}</ToggleGroupItem>;
        })}
        </ToggleGroup>
      </div>

      <button onClick={(e) => { e.stopPropagation(); void onDeleteAction(document.id); }}
        style={{ width: '16px', height: '16px', border: 'none', background: 'transparent', color: 'var(--t3)', cursor: 'pointer', fontSize: '10px', flexShrink: 0, transition: 'color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px' }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--t3)'}
      >×</button>

      <SourceViewer document={document} open={viewerOpen} onOpenChange={setViewerOpen} />
    </div>
  );
}
