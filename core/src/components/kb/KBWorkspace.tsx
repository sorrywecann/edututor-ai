'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, Mic, GraduationCap, PanelLeft, Sparkles, type LucideIcon } from 'lucide-react';
import { KBSidebar } from '@/components/kb/KBSidebar';
import { KBStudio } from '@/components/kb/KBStudio';
import { ChatMode } from '@/components/kb/ChatMode';
import { VoiceMode } from '@/components/kb/VoiceMode';
import { AskMode } from '@/components/kb/AskMode';
import { PodcastPanel } from '@/components/kb/PodcastPanel';
import { StudyMode } from '@/components/kb/StudyMode';
import { useKBStore } from '@/stores/useKBStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { api } from '@/lib/api';
import type { StudyTool } from '@/lib/kb/studyTools';

type Mode = 'chat' | 'ask' | 'voice' | 'study';

interface KBWorkspaceProps {
  kp: ReturnType<typeof import('@/hooks/useKnowledgePage').useKnowledgePage>;
  onBack: () => void;
}

export function KBWorkspace({ kp, onBack }: KBWorkspaceProps) {
  const activeKB = useKBStore((s) => s.activeKB);
  const documents = useKBStore((s) => s.documents);
  const setNotes = useNotesStore((s) => s.setNotes);
  const notes = useNotesStore((s) => s.notes);
  const [mode, setMode] = useState<Mode>('chat');
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [studioOpen, setStudioOpen] = useState(true);
  const [podcastOpen, setPodcastOpen] = useState(false);

  useEffect(() => {
    if (activeKB) {
      api.listNotes(activeKB.name).then(setNotes).catch(() => {});
    }
  }, [activeKB?.name, setNotes]);

  const handleStudyTool = useCallback((tool: StudyTool) => {
    if (tool.prompt === '__podcast__') {
      setPodcastOpen(true);
      return;
    }
    void kp.submitQuestion(tool.prompt);
  }, [kp]);

  if (!activeKB) return null;

  const modes: { id: Mode; label: string; icon: LucideIcon }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'ask', label: 'Opýtať sa', icon: Search },
    { id: 'voice', label: 'Hlas', icon: Mic },
    { id: 'study', label: 'Štúdium', icon: GraduationCap },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Slim workspace header — KB title, mode picker, column toggles */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 22px',
        borderBottom: '1px solid var(--atm-glass-border)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          aria-label="Späť"
          style={{
            padding: '4px 10px', background: 'transparent', border: 'none',
            color: 'var(--t3)', cursor: 'pointer', fontSize: 16,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--t1)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--t3)'}
        >
          ←
        </button>

        <div style={{
          fontFamily: 'var(--font-inter)', fontSize: 14, fontWeight: 600,
          color: 'var(--t1)', letterSpacing: '-0.01em',
        }}>
          {activeKB.name}
        </div>
        <span className="atm-micro" style={{ color: 'var(--t3)' }}>
          {documents.length} {documents.length === 1 ? 'zdroj' : documents.length < 5 ? 'zdroje' : 'zdrojov'}
        </span>

        <div style={{ flex: 1 }} />

        <div style={{
          display: 'flex', gap: 2,
          background: 'rgba(245, 237, 216, 0.04)',
          border: '1px solid var(--atm-glass-border)',
          borderRadius: 8, padding: 2,
        }}>
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', border: 'none', borderRadius: 8,
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                background: mode === m.id ? 'rgba(var(--accent-r),0.18)' : 'transparent',
                color: mode === m.id ? 'var(--t1)' : 'var(--t3)',
                fontFamily: 'var(--font-inter)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <m.icon size={13} strokeWidth={1.9} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: 'var(--atm-glass-border)' }} />

        <button
          onClick={() => setSourcesOpen(v => !v)}
          title={sourcesOpen ? 'Skryť zdroje' : 'Zobraziť zdroje'}
          style={panelToggleBtn(sourcesOpen)}
        >
          <PanelLeft size={12} strokeWidth={2} /> Zdroje
        </button>
        <button
          onClick={() => setStudioOpen(v => !v)}
          title={studioOpen ? 'Skryť štúdio' : 'Zobraziť štúdio'}
          style={panelToggleBtn(studioOpen)}
        >
          <Sparkles size={12} strokeWidth={2} /> Štúdio
        </button>
      </div>

      {/* 3-column workspace — NotebookLM grammar */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: `${sourcesOpen ? '300px' : '0'} 1fr ${studioOpen ? '320px' : '0'}`,
        overflow: 'hidden',
        transition: 'grid-template-columns 250ms cubic-bezier(.4,0,.2,1)',
      }}>
        {/* Sources column */}
        <div style={{
          overflow: 'hidden',
          borderRight: sourcesOpen ? '1px solid var(--atm-glass-border)' : 'none',
          display: sourcesOpen ? 'flex' : 'none',
          flexDirection: 'column',
          minWidth: 0,
        }}>
          <KBSidebar kp={kp} />
        </div>

        {/* Center workspace */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {mode === 'chat' && <ChatMode kp={kp} />}
          {mode === 'ask' && <AskMode />}
          {mode === 'voice' && <VoiceMode kp={kp} />}
          {mode === 'study' && <StudyMode />}
        </div>

        {/* Studio column */}
        <div style={{
          overflow: 'hidden',
          borderLeft: studioOpen ? '1px solid var(--atm-glass-border)' : 'none',
          display: studioOpen ? 'flex' : 'none',
          flexDirection: 'column',
          minWidth: 0,
          background: 'rgba(245, 237, 216, 0.015)',
        }}>
          <KBStudio
            onPickAction={handleStudyTool}
            hasSources={documents.length > 0}
          />
        </div>
      </div>

      {podcastOpen && activeKB && (
        <PodcastPanel
          kbId={activeKB.id}
          sourceIds={documents.map(d => d.id)}
          noteIds={notes.map(n => n.id)}
          onClose={() => setPodcastOpen(false)}
        />
      )}
    </div>
  );
}

const panelToggleBtn = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 9px',
  background: active ? 'rgba(var(--accent-r),0.10)' : 'transparent',
  border: `1px solid ${active ? 'rgba(var(--accent-r),0.30)' : 'var(--atm-glass-border)'}`,
  borderRadius: 8,
  fontSize: 10, fontFamily: 'var(--font-jetbrains)',
  letterSpacing: '0.06em',
  color: active ? 'var(--t1)' : 'var(--t3)',
  cursor: 'pointer',
  transition: 'all 150ms',
});
