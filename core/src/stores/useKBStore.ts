import { create } from 'zustand';
import { KnowledgeBase, Document } from '@/lib/api';

export type ContextMode = 'full' | 'insights' | 'off';

interface KBState {
  /* ── Active KB ── */
  activeKB: KnowledgeBase | null;
  knowledgeBases: KnowledgeBase[];

  /* ── Documents ── */
  documents: Document[];
  contextModes: Record<string, ContextMode>; // document_id → mode

  /* ── Loading ── */
  isLoading: boolean;

  /* ── Actions ── */
  setActiveKB: (kb: KnowledgeBase | null) => void;
  setKnowledgeBases: (kbs: KnowledgeBase[]) => void;
  setDocuments: (docs: Document[]) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  setContextMode: (docId: string, mode: ContextMode) => void;
  resetContextModes: () => void;
  setLoading: (loading: boolean) => void;

  /* ── Derived ── */
  getActiveDocumentIds: () => string[];
}

export const useKBStore = create<KBState>((set, get) => ({
  activeKB: null,
  knowledgeBases: [],
  documents: [],
  contextModes: {},
  isLoading: false,

  setActiveKB: (kb) => set({ activeKB: kb }),

  setKnowledgeBases: (kbs) => set({ knowledgeBases: kbs }),

  setDocuments: (docs) =>
    set({
      documents: docs,
      contextModes: Object.fromEntries(
        docs.map((d) => [d.id, (d.context_mode ?? get().contextModes[d.id] ?? 'full') as ContextMode])
      ),
    }),

  updateDocument: (id, updates) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),

  removeDocument: (id) =>
    set((s) => {
      const { [id]: _gone, ...rest } = s.contextModes;
      void _gone;
      return {
        documents: s.documents.filter((d) => d.id !== id),
        contextModes: rest,
      };
    }),

  setContextMode: (docId, mode) =>
    set((s) => ({
      contextModes: { ...s.contextModes, [docId]: mode },
    })),

  resetContextModes: () =>
    set((s) => ({
      contextModes: Object.fromEntries(s.documents.map((d) => [d.id, 'full' as ContextMode])),
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  getActiveDocumentIds: () => {
    const { contextModes } = get();
    return Object.entries(contextModes)
      .filter(([, mode]) => mode !== 'off')
      .map(([id]) => id);
  },
}));
