'use client';

import { useState, useEffect, useRef } from 'react';
import { api, KnowledgeBase, Document } from '@/lib/api';
import { cn, formatFileSize } from '@/lib/utils';

interface KnowledgeBaseSelectorProps {
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function KnowledgeBaseSelector({ selected, onSelect }: KnowledgeBaseSelectorProps) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDescription, setNewKbDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadKnowledgeBases();
  }, []);

  const loadKnowledgeBases = async () => {
    try {
      const data = await api.listKnowledgeBases();
      setKnowledgeBases(data);
    } catch (error) {
      console.error('Failed to load knowledge bases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocuments = async (kbName: string) => {
    if (!kbName) return;
    try {
      const data = await api.listDocuments(kbName);
      setDocuments(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found') || msg.includes('404')) {
        // KB was deleted — clear selection silently
        onSelect(null);
        setDocuments([]);
      } else {
        console.error('Failed to load documents:', error);
      }
    }
  };

  const handleCreate = async () => {
    if (!newKbName.trim()) return;
    
    setIsCreating(true);
    try {
      await api.createKnowledgeBase(newKbName.trim(), newKbDescription.trim() || undefined);
      await loadKnowledgeBases();
      setNewKbName('');
      setNewKbDescription('');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create knowledge base:', error);
      alert('Nepodarilo sa vytvoriť databázu znalostí');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Vymazať "${name}"?`)) return;
    
    try {
      await api.deleteKnowledgeBase(name);
      if (selected === name) {
        onSelect(null);
      }
      await loadKnowledgeBases();
    } catch (error) {
      console.error('Failed to delete knowledge base:', error);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!selected || files.length === 0) return;
    setIsUploading(true);
    const names = files.map(f => f.name);
    setUploadQueue(names);
    for (const file of files) {
      try {
        await api.uploadDocument(selected, file);
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
      }
      setUploadQueue(prev => prev.filter(n => n !== file.name));
    }
    await loadDocuments(selected);
    await loadKnowledgeBases();
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    await uploadFiles(files);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selected) return;
    const files = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ['pdf', 'docx', 'xlsx', 'txt', 'md'].includes(ext ?? '');
    });
    await uploadFiles(files);
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!selected) return;
    
    try {
      await api.deleteDocument(selected, docId);
      await loadDocuments(selected);
      await loadKnowledgeBases();
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const selectedKb = knowledgeBases.find(kb => kb.name === selected);

  useEffect(() => {
    if (selected) {
      loadDocuments(selected);
    }
  }, [selected]);

  // Auto-refresh while any document is processing or pending
  useEffect(() => {
    if (!selected) return;
    const hasActive = documents.some(d => d.status === 'processing' || d.status === 'pending');
    if (!hasActive) return;
    const interval = setInterval(() => {
      loadDocuments(selected);
      loadKnowledgeBases();
    }, 3000);
    return () => clearInterval(interval);
  }, [selected, documents]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-transparent border border-white/10 rounded-xl text-left hover:border-white/20 transition-colors"
        >
          <span className={cn(
            "text-sm",
            selectedKb ? "text-white" : "text-white/40"
          )}>
            {selectedKb ? selectedKb.name : 'Vybrať databázu znalostí'}
          </span>
          <svg 
            className={cn(
              "w-4 h-4 text-white/40 transition-transform",
              isOpen && "rotate-180"
            )}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-2 bg-black border border-white/10 rounded-xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <button
                onClick={() => { onSelect(null); setIsOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors",
                  !selected && "bg-white/5"
                )}
              >
                <span className="text-white/60">Žiadna</span>
              </button>

              {isLoading ? (
                <div className="px-4 py-6 text-center">
                  <span className="w-4 h-4 border border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
                </div>
              ) : knowledgeBases.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-white/30">
                  Žiadne databázy znalostí
                </div>
              ) : (
                knowledgeBases.map((kb) => (
                  <div
                    key={kb.id}
                    className={cn(
                      "flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors",
                      selected === kb.name && "bg-white/5"
                    )}
                  >
                    <button
                      onClick={() => { onSelect(kb.name); setIsOpen(false); }}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm text-white">{kb.name}</div>
                      <div className="text-xs text-white/30">
                        {kb.document_count} dok. · {kb.total_chunks} častí
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(kb.name); }}
                      className="p-2 text-white/20 hover:text-white/60 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-white/10">
              {showCreateForm ? (
                <div className="p-4 space-y-3">
                  <input
                    type="text"
                    value={newKbName}
                    onChange={(e) => setNewKbName(e.target.value)}
                    placeholder="Názov"
                    className="w-full px-3 py-2 bg-transparent border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    pattern="^[a-zA-Z0-9_-]+$"
                  />
                  <input
                    type="text"
                    value={newKbDescription}
                    onChange={(e) => setNewKbDescription(e.target.value)}
                    placeholder="Popis"
                    className="w-full px-3 py-2 bg-transparent border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreate}
                      disabled={isCreating || !newKbName.trim()}
                      className="flex-1 py-2 bg-white text-black rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {isCreating ? 'Vytváram…' : 'Vytvoriť'}
                    </button>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 border border-white/10 rounded-lg text-sm text-white/60"
                    >
                      Zrušiť
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Vytvoriť novú</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedKb && (
        <div
          className="p-4 border rounded-xl transition-colors"
          style={{ borderColor: isDragging ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)', background: isDragging ? 'rgba(245, 237, 216, 0.03)' : 'transparent' }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white/60">
              {isDragging ? 'Pretiahni sem' : 'Dokumenty'}
            </h3>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-white/5 text-sm text-white/60 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
              {isUploading ? (
                <span className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              <span>Nahrať</span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                accept=".pdf,.docx,.xlsx,.txt,.md"
                multiple
                className="hidden"
                disabled={isUploading}
              />
            </label>
          </div>
          {uploadQueue.length > 0 && (
            <div className="mb-3 space-y-1">
              {uploadQueue.map(name => (
                <div key={name} className="flex items-center gap-2 text-xs text-white/40 px-1">
                  <span className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin flex-shrink-0" />
                  <span className="truncate">{name}</span>
                </div>
              ))}
            </div>
          )}

          {documents.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-4">
              Zatiaľ žiadne dokumenty
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {documents.map((doc) => {
                const isActive = doc.status === 'pending' || doc.status === 'processing';
                const statusLabel = doc.status === 'completed'
                  ? `${doc.chunk_count} častí`
                  : doc.status === 'pending'
                   ? 'Čakám…'
                  : doc.status === 'processing'
                   ? 'Spracovávam…'
                  : doc.error_message
                  ? `Chyba: ${doc.error_message.slice(0, 40)}`
                  : 'Zlyhalo';
                return (
                <div
                  key={doc.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-colors",
                    isActive ? "bg-white/[0.07] animate-pulse" : "bg-white/5"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {doc.filename}
                    </div>
                    <div className={cn(
                      "text-xs",
                      doc.status === 'failed' ? "text-red-400/60" : isActive ? "text-white/50" : "text-white/30"
                    )}>
                      {formatFileSize(doc.file_size)} · {statusLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {isActive && (
                      <span className="w-3 h-3 border border-white/20 border-t-white/70 rounded-full animate-spin flex-shrink-0" />
                    )}
                    {doc.status === 'completed' && (
                      <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {doc.status === 'failed' && (
                      <svg className="w-4 h-4 text-red-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-1 text-white/20 hover:text-white/60 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
