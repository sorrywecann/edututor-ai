import { create } from 'zustand';

export interface CitationChunk {
  chunk_id: string;
  document_id: string;
  filename: string;
  page: number | null;
  chunk_index: number;
  content_preview: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: CitationChunk[];
  timestamp: Date;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeSessionId: string | null;
  contextChunks: CitationChunk[];
  currentQuery: string;
  /**
   * v0.8.1: pre-translated Slovak error string surfaced by backend's chat
   * endpoint when the active LLM provider fails and the response falls back.
   * Backend ChatResponse (chat.py:684+) returns
   *   { provider: "fallback", provider_error: "<Slovak text>" }
   * which the host UI renders via the atmosphere <Nudge kind="error"
   * layout="banner"> primitive instead of placing the silent fallback as the
   * assistant's reply. Cleared on the next successful chat turn or when the
   * user dismisses the banner.
   */
  providerError: string | null;

  addMessage: (msg: ChatMessage) => void;
  appendToLastMessage: (delta: string) => void;
  replaceLastMessage: (content: string) => void;
  removeLastMessage: () => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setStreaming: (streaming: boolean) => void;
  setActiveSession: (id: string | null) => void;
  setContextChunks: (chunks: CitationChunk[]) => void;
  setCitationsOnLastMessage: (citations: CitationChunk[]) => void;
  setCurrentQuery: (query: string) => void;
  setProviderError: (msg: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  activeSessionId: null,
  contextChunks: [],
  currentQuery: '',
  providerError: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastMessage: (delta) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + delta };
      }
      return { messages: msgs };
    }),

  replaceLastMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last) {
        msgs[msgs.length - 1] = { ...last, content };
      }
      return { messages: msgs };
    }),

  // v0.8.1: drop the trailing assistant placeholder when the backend reports
  // a provider fallback — we surface the error in the Nudge banner instead,
  // so we don't want a silent empty AI bubble hanging in the transcript.
  removeLastMessage: () =>
    set((s) => {
      if (s.messages.length === 0) return { messages: s.messages };
      return { messages: s.messages.slice(0, -1) };
    }),

  setMessages: (msgs) => set({ messages: msgs }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setContextChunks: (chunks) => set({ contextChunks: chunks }),
  setCurrentQuery: (currentQuery) => set({ currentQuery }),

  setProviderError: (providerError) => set({ providerError }),

  setCitationsOnLastMessage: (citations) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, citations };
      }
      return { messages: msgs };
    }),

  clearMessages: () => set({ messages: [], contextChunks: [], currentQuery: '', providerError: null }),
}));
