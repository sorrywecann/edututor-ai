/**
 * EduTutor.AI - API Client
 */

import { API_BASE } from './config';

export interface ConversationResponse {
  conversation_id: string;
  room_name: string;
  token: string;
  server_url: string;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  status: string;
  created_at: string | null;
  message_count: number;
  preview: string | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationMessages {
  conversation_id: string;
  title: string;
  created_at: string | null;
  messages: ConversationMessage[];
  count: number;
}

/** Returns a persistent UUID for this browser — created once, reused across sessions. */
export function getPersistentUserId(): string {
  const KEY = 'edututor_user_id';
  if (typeof window === 'undefined') return 'server';
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  return id;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  total_chunks: number;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  chunk_count: number;
  token_count: number;
  context_mode: 'full' | 'insights' | 'off';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  document_id: string | null;
  chunk_index: number | null;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total_results: number;
  search_time_ms: number;
}

export interface VoiceClone {
  id: string;
  name: string;
  engine: string;
  filename: string;
  duration_s: number;
  size_bytes: number;
}

export interface Note {
  id: string;
  knowledge_base_id: string;
  title: string;
  content: string;
  source_type: 'manual' | 'ai_generated' | 'saved_from_chat';
  source_message_id: string | null;
  source_references: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title: string;
  content?: string;
  source_type?: string;
  source_message_id?: string | null;
  source_references?: string | null;
}

export interface KBSession {
  id: string;
  name: string;
  message_count: number;
  is_pinned: boolean;
  created_at: string;
}

export interface TransformationTemplate {
  id: string;
  name: string;
  prompt: string;
  icon: string;
  is_default: boolean;
  created_at: string;
}

export interface TransformationResult {
  id: string;
  document_id: string;
  template_id: string;
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  is_stale: boolean;
  created_at: string;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
}

export interface UserStats {
  session_count: number;
  total_turns: number;
  total_words: number;
  user_messages: number;
  user_words: number;
  streak_days: number;
  avg_turns_per_session: number;
  last_session_at: string | null;
  activity: { date: string; sessions: number }[];
  recent_topics: string[];
}

export interface HealthStatus {
  status: string;
  version: string;
  timestamp: string;
  services: Record<string, string>;
}

export interface STTModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  model_id: string;
  languages: string[];
}

export interface STTModelsResponse {
  models: STTModel[];
  current: string;
}

export interface LLMModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  available: boolean;
}

export interface LLMModelsResponse {
  models: LLMModel[];
  current: string;
}

export interface PodcastResponse {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: 'summary' | 'deep_dive' | 'qa';
  voice_id: string;
  provider: string;
  duration_ms: number | null;
  audio_url: string | null;
  script: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export class ApiOfflineError extends Error {
  constructor() { super('Backend offline'); this.name = 'ApiOfflineError'; }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-EduTutor-User-Id': getPersistentUserId(),
          ...options.headers,
        },
      });
    } catch {
      // Network error (backend down, CORS preflight failure, etc.)
      throw new ApiOfflineError();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  }

  /** Like request() but returns null instead of throwing when offline. */
  private async requestSafe<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T | null> {
    try {
      return await this.request<T>(endpoint, options);
    } catch (e) {
      if (e instanceof ApiOfflineError) return null;
      throw e;
    }
  }

  // Health
  async getHealth(): Promise<HealthStatus | null> {
    return this.requestSafe('/api/v1/health');
  }

  // STT Models
  async listSTTModels(): Promise<STTModelsResponse | null> {
    return this.requestSafe('/api/v1/stt/models');
  }

  // LLM Models
  async listLLMModels(): Promise<LLMModelsResponse | null> {
    return this.requestSafe('/api/v1/llm/models');
  }

  // Conversations
  async createConversation(
    userId: string,
    knowledgeBaseId?: string
  ): Promise<ConversationResponse> {
    return this.request('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        knowledge_base_id: knowledgeBaseId,
      }),
    });
  }

  async endConversation(conversationId: string): Promise<void> {
    await this.request(`/api/v1/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  }

  async getStats(userId?: string): Promise<UserStats | null> {
    const params = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return this.requestSafe(`/api/v1/stats${params}`);
  }

  async listConversations(limit = 20): Promise<ConversationSummary[]> {
    return (await this.requestSafe<ConversationSummary[]>(`/api/v1/conversations?limit=${limit}`)) ?? [];
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessages | null> {
    return this.requestSafe(`/api/v1/conversations/${conversationId}/messages`);
  }

  // Knowledge Bases
  async listKnowledgeBases(): Promise<KnowledgeBase[]> {
    return (await this.requestSafe<KnowledgeBase[]>('/api/v1/knowledge-bases')) ?? [];
  }

  async createKnowledgeBase(
    name: string,
    description?: string
  ): Promise<KnowledgeBase> {
    return this.request('/api/v1/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async deleteKnowledgeBase(name: string): Promise<void> {
    await this.request(`/api/v1/knowledge-bases/${name}`, {
      method: 'DELETE',
    });
  }

  async renameKnowledgeBase(name: string, newName: string): Promise<KnowledgeBase> {
    return this.request(`/api/v1/knowledge-bases/${name}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName }),
    });
  }

  async clearKBDocuments(name: string): Promise<{ status: string; documents_removed: number }> {
    return this.request(`/api/v1/knowledge-bases/${name}/documents`, {
      method: 'DELETE',
    });
  }

  // Documents
  async uploadDocument(
    knowledgeBaseName: string,
    file: File
  ): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);

    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/api/v1/knowledge-bases/${knowledgeBaseName}/documents`,
        {
          method: 'POST',
          body: formData,
          headers: { 'X-EduTutor-User-Id': getPersistentUserId() },
        }
      );
    } catch {
      throw new ApiOfflineError();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Upload failed: ${response.status}`);
    }

    return response.json();
  }

  async listDocuments(knowledgeBaseName: string): Promise<Document[]> {
    return (await this.requestSafe<Document[]>(`/api/v1/knowledge-bases/${knowledgeBaseName}/documents`)) ?? [];
  }

  async getDocument(
    knowledgeBaseName: string,
    documentId: string
  ): Promise<Document | null> {
    return this.requestSafe(
      `/api/v1/knowledge-bases/${knowledgeBaseName}/documents/${documentId}`
    );
  }

  async deleteDocument(
    knowledgeBaseName: string,
    documentId: string
  ): Promise<void> {
    await this.request(
      `/api/v1/knowledge-bases/${knowledgeBaseName}/documents/${documentId}`,
      { method: 'DELETE' }
    );
  }

  async updateDocumentContextMode(documentId: string, contextMode: string): Promise<void> {
    await this.request(`/api/v1/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_mode: contextMode }),
    });
  }

  // Notes
  async listNotes(knowledgeBaseName: string): Promise<Note[]> {
    return (await this.request<Note[]>(`/api/v1/knowledge-bases/${knowledgeBaseName}/notes`)) ?? [];
  }

  async createNote(knowledgeBaseName: string, note: NoteCreate): Promise<Note> {
    return this.request(`/api/v1/knowledge-bases/${knowledgeBaseName}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
  }

  async updateNote(knowledgeBaseName: string, noteId: string, updates: NoteUpdate): Promise<Note> {
    return this.request(`/api/v1/knowledge-bases/${knowledgeBaseName}/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async deleteNote(knowledgeBaseName: string, noteId: string): Promise<void> {
    await this.request(`/api/v1/knowledge-bases/${knowledgeBaseName}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  async saveNoteFromChat(knowledgeBaseName: string, title: string, content: string, sourceReferences?: string): Promise<Note> {
    return this.request(`/api/v1/knowledge-bases/${knowledgeBaseName}/notes/from-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, source_references: sourceReferences }),
    });
  }

  // Chat Sessions
  async listKBSessions(knowledgeBaseName: string): Promise<KBSession[]> {
    return (await this.request<KBSession[]>(`/api/v1/knowledge-bases/${knowledgeBaseName}/sessions`)) ?? [];
  }

  async createKBSession(knowledgeBaseName: string, name: string): Promise<KBSession> {
    return this.request(`/api/v1/knowledge-bases/${knowledgeBaseName}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async updateKBSession(sessionId: string, name?: string, pin?: boolean): Promise<void> {
    const params = new URLSearchParams();
    if (name) params.set('name', name);
    if (pin !== undefined) params.set('pin', String(pin));
    await this.request(`/api/v1/conversations/${sessionId}?${params}`, { method: 'PATCH' });
  }

  async deleteKBSession(sessionId: string): Promise<void> {
    await this.request(`/api/v1/conversations/${sessionId}`, { method: 'DELETE' });
  }

  // Transformations
  async listTransformationTemplates(): Promise<TransformationTemplate[]> {
    return (await this.request<TransformationTemplate[]>('/api/v1/transformations/templates')) ?? [];
  }

  async applyTransformation(documentId: string, templateId: string): Promise<TransformationResult> {
    return this.request('/api/v1/transformations/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, template_id: templateId }),
    });
  }

  async getTransformationResult(resultId: string): Promise<TransformationResult> {
    return this.request(`/api/v1/transformations/results/${resultId}`);
  }

  async getDocumentTransformations(documentId: string): Promise<TransformationResult[]> {
    return (await this.request<TransformationResult[]>(`/api/v1/documents/${documentId}/transformations`)) ?? [];
  }

  async getDocumentContent(documentId: string): Promise<{ content: string } | null> {
    return this.requestSafe(`/api/v1/documents/${documentId}/content`);
  }

  // Ask mode
  async askKnowledgeBase(knowledgeBaseName: string, question: string): Promise<{ question: string; answer: string; sources: Array<Record<string, unknown>>; latency_ms: number }> {
    return this.request(`/api/v1/knowledge-bases/${knowledgeBaseName}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
  }

  // Podcast
  async generatePodcast(knowledgeBaseName: string, format: string = 'summary'): Promise<{ title: string; script: string; audio_base64: string; format: string; latency_ms: number }> {
    return this.request(`/api/v1/knowledge-bases/${knowledgeBaseName}/podcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format }),
    });
  }

  // Podcasts (v2 — job-based)
  async createPodcast(
    kbId: string,
    params: {
      source_ids?: string[];
      note_ids?: string[];
      format?: 'summary' | 'deep_dive' | 'qa';
      voice_id?: string;
      provider?: string;
      title?: string;
    }
  ): Promise<PodcastResponse> {
    return this.request(`/api/v1/knowledge-bases/${kbId}/podcasts`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getPodcast(podcastId: string): Promise<PodcastResponse> {
    return this.request(`/api/v1/podcasts/${podcastId}`);
  }

  /** Returns the audio URL for a podcast — no fetch, pure string concat. */
  getPodcastAudioUrl(podcastId: string): string {
    return `${this.baseUrl}/api/v1/podcasts/${podcastId}/audio`;
  }

  async deletePodcast(podcastId: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/v1/podcasts/${podcastId}`, { method: 'DELETE' });
  }

  // Search
  async searchKnowledgeBase(
    knowledgeBaseName: string,
    query: string,
    topK: number = 5,
    threshold: number = 0.7
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: query,
      top_k: topK.toString(),
      threshold: threshold.toString(),
    });
    
    return this.request(
      `/api/v1/knowledge-bases/${knowledgeBaseName}/query?${params}`
    );
  }

  async listVoiceClones(): Promise<VoiceClone[]> {
    try {
      return await this.request<VoiceClone[]>('/api/v1/voice-clones');
    } catch {
      return [];
    }
  }

  async deleteVoiceClone(cloneId: string): Promise<void> {
    await this.request(`/api/v1/voice-clones/${cloneId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
