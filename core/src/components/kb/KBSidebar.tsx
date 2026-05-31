'use client';

import { useState } from 'react';
import { SourceCard } from '@/components/kb/SourceCard';
import { DocumentUpload } from '@/components/kb/DocumentUpload';
import { useKBStore } from '@/stores/useKBStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface KBSidebarProps {
  kp: ReturnType<typeof import('@/hooks/useKnowledgePage').useKnowledgePage>;
}

export function KBSidebar({ kp }: KBSidebarProps) {
  const activeKB = useKBStore((s) => s.activeKB);
  const documents = useKBStore((s) => s.documents);
  const notes = useNotesStore((s) => s.notes);
  const addNote = useNotesStore((s) => s.addNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const removeNote = useNotesStore((s) => s.removeNote);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditId(null); setTitle(''); setContent(''); setEditorOpen(true); };
  const openEdit = (id: string, t: string, c: string) => { setEditId(id); setTitle(t); setContent(c); setEditorOpen(true); };

  const handleSave = async () => {
    if (!activeKB || !title.trim()) return;
    setSaving(true);
    try {
      if (editId) { const u = await api.updateNote(activeKB.name, editId, { title, content }); updateNote(editId, u); }
      else { const c = await api.createNote(activeKB.name, { title, content, source_type: 'manual' }); addNote(c); }
      setEditorOpen(false);
    } catch (e) {
      console.warn('[KBSidebar] save note failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!activeKB) return;
    try {
      await api.deleteNote(activeKB.name, id);
      removeNote(id);
    } catch (e) {
      console.warn('[KBSidebar] delete note failed:', e);
    }
  };

  const sectionLabel = (text: string) => (
    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', padding: '16px 16px 8px' }}>{text}</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {sectionLabel(`Zdroje · ${documents.length}`)}
      <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center' }}>
        {documents.length > 0 && (
          <button
            onClick={() => {
              // v0.6.5: confirm before nuking every document in the active KB.
              if (window.confirm('Naozaj vymazať VŠETKY ' + documents.length + ' dokumentov z tejto databázy? Toto sa nedá vrátiť späť.')) {
                kp.handleClearDocuments();
              }
            }}
            title="Vymazať všetky dokumenty"
            style={{
              padding: '4px 8px', fontSize: '9px', fontFamily: 'var(--font-jetbrains)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid var(--atm-glass-border)',
              borderRadius: '5px', color: 'var(--t3)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; }}
          >
            Vyčistiť
          </button>
        )}
        <DocumentUpload fileRef={kp.fileRef} onUploadAction={kp.uploadFiles} uploadError={kp.uploadError} uploading={kp.uploading} uploadQueue={kp.uploadQueue} />
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {documents.length === 0 ? (
          <div style={{ padding: '16px', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--t3)', lineHeight: 1.6 }}>
            Pretiahnite súbory sem<br />alebo kliknite Nahrať
          </div>
        ) : documents.map((d) => (
          <SourceCard key={d.id} document={d} onDeleteAction={kp.handleDeleteDocument} />
        ))}
      </div>

      <div style={{ margin: '12px 16px', borderTop: '1px solid var(--atm-glass-border)' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px' }}>
        {sectionLabel(`Poznámky · ${notes.length}`)}
        <button onClick={openCreate} style={{ padding: '3px 8px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '5px', fontSize: '9px', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' }}>+ Nová</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {notes.length === 0 ? (
          <div style={{ padding: '16px', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--t3)', lineHeight: 1.6 }}>
            Zatiaľ žiadne poznámky.<br />Ulož odpoveď z chatu alebo vytvor novú.
          </div>
        ) : notes.map((n) => (
          <div key={n.id} style={{ padding: '10px', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', background: 'rgba(26, 20, 16, 0.62)', marginBottom: '6px', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-mid)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            onClick={() => openEdit(n.id, n.title, n.content)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px', marginBottom: '3px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{n.title}</div>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }} style={{ fontSize: '10px', color: 'var(--t3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', transition: 'color 0.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--t3)'}
              >×</button>
            </div>
            <div style={{ fontSize: '8px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {n.source_type === 'saved_from_chat' ? 'z chatu' : n.source_type === 'ai_generated' ? 'AI' : 'manuálna'}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--t3)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {n.content.slice(0, 120)}{n.content.length > 120 ? '…' : ''}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent style={{ background: 'rgba(26, 20, 16, 0.62)', border: '1px solid var(--atm-glass-border)', borderRadius: '14px', maxWidth: '480px' }}>
          <DialogHeader><DialogTitle style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>{editId ? 'Upraviť poznámku' : 'Nová poznámka'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Názov" autoFocus
              style={{ padding: '9px 12px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '13px', color: 'var(--t1)', outline: 'none' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            />
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Obsah (Markdown)" data-testid="note-editor"
              style={{ minHeight: '180px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '12px', color: 'var(--t1)', lineHeight: 1.6, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setEditorOpen(false)} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '11px', color: 'var(--t3)', cursor: 'pointer' }}>Zrušiť</button>
              <button onClick={handleSave} disabled={saving || !title.trim()} style={{ padding: '7px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving || !title.trim() ? 0.5 : 1 }}>{saving ? 'Ukladám…' : 'Uložiť'}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
