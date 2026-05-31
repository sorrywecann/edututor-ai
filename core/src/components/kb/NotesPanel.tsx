'use client';

import { useState } from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { useKBStore } from '@/stores/useKBStore';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export function NotesPanel() {
  const activeKB = useKBStore((state) => state.activeKB);
  const notes = useNotesStore((state) => state.notes);
  const isLoading = useNotesStore((state) => state.isLoading);
  const addNote = useNotesStore((state) => state.addNote);
  const updateNote = useNotesStore((state) => state.updateNote);
  const removeNote = useNotesStore((state) => state.removeNote);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditId(null);
    setTitle('');
    setContent('');
    setEditorOpen(true);
  };

  const openEdit = (id: string, currentTitle: string, currentContent: string) => {
    setEditId(id);
    setTitle(currentTitle);
    setContent(currentContent);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!activeKB || !title.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await api.updateNote(activeKB.name, editId, { title, content });
        updateNote(editId, updated);
      } else {
        const created = await api.createNote(activeKB.name, { title, content, source_type: 'manual' });
        addNote(created);
      }
      setEditorOpen(false);
    } catch {
      /* silently keep modal open on error */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!activeKB) return;
    try {
      await api.deleteNote(activeKB.name, noteId);
      removeNote(noteId);
    } catch { /* ignore */ }
  };

  return (
    <div data-testid="notes-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>
          Poznámky{activeKB ? ` — ${activeKB.name}` : ''}
        </div>
        <button
          onClick={openCreate}
          style={{ padding: '4px 10px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '10px', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.06em' }}
        >
          + Nová
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '24px', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--t3)' }}>
          Načítavam…
        </div>
      ) : notes.length === 0 ? (
        <div style={{ padding: '24px', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--t3)', lineHeight: 1.7 }}>
          Žiadne poznámky.
          <br />
          Ulož odpoveď z chatu alebo vytvor novú.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{ padding: '12px', border: '1px solid var(--atm-glass-border)', borderRadius: '10px', background: 'rgba(26, 20, 16, 0.62)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {note.title}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(note.id, note.title, note.content)}
                      style={{ padding: '2px 6px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '4px', fontSize: '9px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' }}
                    >
                      Upraviť
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      style={{ padding: '2px 6px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '4px', fontSize: '9px', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-jetbrains)' }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '8px', color: 'var(--t3)', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  {note.source_type === 'saved_from_chat' ? 'z chatu' : note.source_type === 'ai_generated' ? 'AI' : 'manuálna'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.5, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {note.content.slice(0, 300)}
                  {note.content.length > 300 ? '…' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent style={{ background: 'rgba(26, 20, 16, 0.62)', border: '1px solid var(--atm-glass-border)', borderRadius: '14px', maxWidth: '520px' }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>
              {editId ? 'Upraviť poznámku' : 'Nová poznámka'}
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Názov poznámky"
              style={{ padding: '10px 12px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '13px', color: 'var(--t1)', outline: 'none', fontFamily: 'var(--font-inter)' }}
            />
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Obsah (Markdown podporovaný)"
              data-testid="note-editor"
              style={{ minHeight: '200px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '13px', color: 'var(--t1)', fontFamily: 'var(--font-inter)', lineHeight: 1.6, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setEditorOpen(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '12px', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font-inter)' }}>
                Zrušiť
              </button>
              <button onClick={handleSave} disabled={saving || !title.trim()} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1, fontFamily: 'var(--font-inter)' }}>
                {saving ? 'Ukladám…' : 'Uložiť'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
