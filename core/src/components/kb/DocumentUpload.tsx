'use client';

interface DocumentUploadProps {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onUploadAction: (files: File[]) => Promise<void>;
  uploadError: string | null;
  uploading: boolean;
  uploadQueue: string[];
}

export function DocumentUpload({ fileRef, onUploadAction, uploadError, uploading, uploadQueue }: DocumentUploadProps) {
  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', background: 'var(--accent)', color: '#000', borderRadius: '8px', fontSize: '10px', fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', transition: 'all 0.15s ease' }}
        onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.opacity = '0.85'; }}
        onMouseLeave={(e) => { if (!uploading) e.currentTarget.style.opacity = '1'; }}
      >
        {uploading ? <span style={{ width: '10px', height: '10px', border: '1.5px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} /> : '↑'}
        Nahrať
        <input ref={fileRef} type="file" onChange={(e) => void onUploadAction(Array.from(e.target.files ?? []))} accept=".pdf,.docx,.xlsx,.txt,.md" multiple style={{ display: 'none' }} disabled={uploading} />
      </label>

      {uploadQueue.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {uploadQueue.map((name) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '10px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)' }}>
              <span style={{ width: '8px', height: '8px', border: '1.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
              {name}
            </div>
          ))}
        </div>
      )}

      {uploadError && (
        <div style={{ marginBottom: '8px', padding: '7px 10px', background: '#ef444412', border: '1px solid #ef444430', borderRadius: '8px', fontSize: '10px', color: '#ef4444', fontFamily: 'var(--font-jetbrains)' }}>
          {uploadError}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  );
}
