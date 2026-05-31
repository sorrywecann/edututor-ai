'use client';

import { DocumentUpload } from '@/components/kb/DocumentUpload';
import { SourceCard } from '@/components/kb/SourceCard';
import { useKBStore } from '@/stores/useKBStore';

interface SourcesPanelProps {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onDeleteDocumentAction: (documentId: string) => Promise<void>;
  onUploadAction: (files: File[]) => Promise<void>;
  uploadError: string | null;
  uploading: boolean;
  uploadQueue: string[];
}

export function SourcesPanel({ fileRef, onDeleteDocumentAction, onUploadAction, uploadError, uploading, uploadQueue }: SourcesPanelProps) {
  const activeKB = useKBStore((state) => state.activeKB);
  const documents = useKBStore((state) => state.documents);

  if (!activeKB) {
    return null;
  }

  return (
    <div data-testid="sources-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>
          Dokumenty — {activeKB.name}
        </div>
        <DocumentUpload fileRef={fileRef} onUploadAction={onUploadAction} uploadError={uploadError} uploading={uploading} uploadQueue={uploadQueue} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {documents.length === 0 ? (
          <div style={{ padding: '24px', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--t3)' }}>
            Zatiaľ žiadne dokumenty. Nahraj PDF, DOCX, XLSX, TXT alebo MD.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {documents.map((document) => (
              <SourceCard key={document.id} document={document} onDeleteAction={onDeleteDocumentAction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
