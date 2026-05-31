import { create } from 'zustand';

export type NoteSourceType = 'manual' | 'ai_generated' | 'saved_from_chat';

export interface Note {
  id: string;
  knowledge_base_id: string;
  title: string;
  content: string;
  source_type: NoteSourceType;
  source_message_id: string | null;
  source_references: string | null;
  created_at: string;
  updated_at: string;
}

interface NotesState {
  notes: Note[];
  isLoading: boolean;
  editingNote: Note | null;

  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  removeNote: (id: string) => void;
  setEditingNote: (note: Note | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  isLoading: false,
  editingNote: null,

  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  updateNote: (id, updates) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    })),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  setEditingNote: (note) => set({ editingNote: note }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
