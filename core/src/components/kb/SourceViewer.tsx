'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, type Document, type TransformationResult } from '@/lib/api';

interface SourceViewerProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourceViewer({ document, open, onOpenChange }: SourceViewerProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TransformationResult[]>([]);

  useEffect(() => {
    if (open && document.status === 'completed') {
      setLoading(true);
      api.getDocumentContent(document.id)
        .then((data) => setContent(data?.content ?? ''))
        .catch(() => setContent(''))
        .finally(() => setLoading(false));

      api.getDocumentTransformations(document.id)
        .then(setResults)
        .catch(() => {});
    }
  }, [open, document.id, document.status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', maxWidth: '680px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {document.filename}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="content" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <TabsList style={{ background: 'var(--raised)', borderRadius: '8px', padding: '3px' }}>
            <TabsTrigger value="content" style={{ fontSize: '11px', fontFamily: 'var(--font-jetbrains)' }}>Obsah</TabsTrigger>
            <TabsTrigger value="insights" style={{ fontSize: '11px', fontFamily: 'var(--font-jetbrains)' }}>Analýzy</TabsTrigger>
            <TabsTrigger value="metadata" style={{ fontSize: '11px', fontFamily: 'var(--font-jetbrains)' }}>Info</TabsTrigger>
          </TabsList>

          <TabsContent value="content" style={{ flex: 1, overflowY: 'auto', marginTop: 0, padding: '12px 0' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--t3)', fontSize: '12px' }}>Načítavam obsah…</div>
            ) : content ? (
              <pre style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-inter)', margin: 0 }}>{content.slice(0, 10000)}{content.length > 10000 ? '\n\n…' : ''}</pre>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--t3)', fontSize: '12px' }}>Obsah zatiaľ nie je dostupný.</div>
            )}
          </TabsContent>

          <TabsContent value="insights" style={{ flex: 1, overflowY: 'auto', marginTop: 0, padding: '12px 0' }}>
            {results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--t3)', fontSize: '12px' }}>
                Žiadne analýzy. Klikni na "Transformovať" na karte dokumentu.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {results.map((r) => (
                  <div key={r.id} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t1)' }}>Transformácia</span>
                      <span style={{ fontSize: '9px', color: r.status === 'completed' ? 'var(--green)' : '#ef4444', fontFamily: 'var(--font-jetbrains)' }}>{r.status}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.content.slice(0, 500)}{r.content.length > 500 ? '…' : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="metadata" style={{ flex: 1, overflowY: 'auto', marginTop: 0, padding: '12px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px', color: 'var(--t2)' }}>
              <div><span style={{ color: 'var(--t3)' }}>Typ:</span> {document.file_type.toUpperCase()}</div>
              <div><span style={{ color: 'var(--t3)' }}>Veľkosť:</span> {formatSize(document.file_size)}</div>
              <div><span style={{ color: 'var(--t3)' }}>Časti:</span> {document.chunk_count}</div>
              <div><span style={{ color: 'var(--t3)' }}>Tokeny:</span> {document.token_count}</div>
              <div><span style={{ color: 'var(--t3)' }}>Stav:</span> {document.status}</div>
              <div><span style={{ color: 'var(--t3)' }}>Kontext:</span> {document.context_mode}</div>
              <div><span style={{ color: 'var(--t3)' }}>Nahrané:</span> {new Date(document.created_at).toLocaleString('sk')}</div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
