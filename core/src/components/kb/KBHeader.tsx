'use client';

import { useState, useRef, useEffect } from 'react';
import { Library } from 'lucide-react';
import { useKBStore } from '@/stores/useKBStore';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'práve teraz';
  if (mins < 60) return `pred ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `pred ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `pred ${days} d`;
}

interface KBHeaderProps {
  creating: boolean;
  kbLoading: boolean;
  newDesc: string;
  newName: string;
  onCreateAction: () => Promise<void>;
  onDeleteAction: (name: string) => Promise<void>;
  onRenameAction: (oldName: string, newName: string) => Promise<void>;
  onSelectAction: (name: string | null) => void;
  setNewDescAction: (value: string) => void;
  setNewNameAction: (value: string) => void;
  setShowCreateAction: (value: boolean) => void;
  showCreate: boolean;
}

export function KBHeader({ creating, kbLoading, newDesc, newName, onCreateAction, onDeleteAction, onRenameAction, onSelectAction, setNewDescAction, setNewNameAction, setShowCreateAction, showCreate }: KBHeaderProps) {
  const knowledgeBases = useKBStore((state) => state.knowledgeBases);
  const activeKB = useKBStore((state) => state.activeKB);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameRef.current) renameRef.current.focus();
  }, [renaming]);

  const filtered = filter.trim()
    ? knowledgeBases.filter(kb => kb.name.toLowerCase().includes(filter.toLowerCase()))
    : knowledgeBases;

  return (
    <div data-testid="kb-header" style={{ marginBottom: '24px' }}>
      <div style={{
        width: '32px', height: '3px', borderRadius: '2px',
        background: 'var(--accent)', marginBottom: '14px',
      }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--t1)' }}>Databáza znalostí</div>
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', alignSelf: 'center' }} />
        <div style={{ fontSize: '11px', color: 'var(--t3)', fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.04em' }}>
          {knowledgeBases.length} {knowledgeBases.length === 1 ? 'databáza' : knowledgeBases.length < 5 ? 'databázy' : 'databáz'}
        </div>
      </div>

      {knowledgeBases.length >= 3 && (
        <div style={{ marginBottom: '12px', maxWidth: '280px' }}>
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Hľadať databázu…"
            style={{
              width: '100%', padding: '7px 10px',
              background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)',
              borderRadius: '8px', color: 'var(--t1)', fontSize: '11px',
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', animation: 'fade-in-up 0.3s ease-out' }}>
        <button
          onClick={() => {
            setShowCreateAction(!showCreate);
            if (!showCreate) onSelectAction(null);
          }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '28px 16px', border: '1.5px dashed var(--border)', borderRadius: '12px',
            background: 'transparent', cursor: 'pointer', minHeight: '120px',
            transition: 'all 0.2s ease',
            opacity: showCreate ? 0.4 : 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'none'; }}
        >
          <span style={{ fontSize: '22px', lineHeight: 1, color: 'var(--t3)', marginBottom: '6px', transition: 'color 0.2s' }}>+</span>
          <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' }}>Nová databáza</span>
        </button>

        {kbLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ padding: '18px', border: '1px solid var(--atm-glass-border)', borderRadius: '12px', minHeight: '120px', background: 'rgba(26, 20, 16, 0.62)' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(245, 237, 216, 0.04)', borderRadius: '10px', marginBottom: '10px' }} />
                <div style={{ width: '70%', height: '12px', background: 'rgba(245, 237, 216, 0.04)', borderRadius: '4px', marginBottom: '6px' }} />
                <div style={{ width: '45%', height: '9px', background: 'rgba(245, 237, 216, 0.04)', borderRadius: '4px' }} />
              </div>
            ))
          : filtered.map((kb) => {
              const isActive = activeKB?.name === kb.name;
              return (
                <div
                  key={kb.id}
                  onClick={() => onSelectAction(kb.name)}
                  style={{
                    padding: '18px', border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '12px', cursor: 'pointer', minHeight: '120px',
                    background: isActive ? 'linear-gradient(135deg, var(--accent-dim), transparent 60%)' : 'var(--surface)',
                    transition: 'all 0.2s ease', position: 'relative',
                    transform: isActive ? 'translateY(-1px)' : 'none',
                    boxShadow: isActive ? '0 0 0 4px var(--accent-dim)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.transform = 'translateY(-1px)'; }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }
                  }}
                >
                  {/* v0.6.5: confirm before destructive delete. The previous
                      one-click × destroyed an entire KB with all docs on a
                      mis-click — no undo. window.confirm is the smallest
                      possible interruption that still prevents the
                      double-mis-click. A proper Dialog primitive arrives
                      with Chamber port in v0.6.6. */}
                  <button onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Naozaj vymazať databázu „' + kb.name + '“ aj so všetkými dokumentmi? Toto sa nedá vrátiť späť.')) {
                      onDeleteAction(kb.name);
                    }
                  }}
                    title="Vymazať databázu"
                    style={{ position: 'absolute', top: '10px', right: '10px', width: '22px', height: '22px', border: 'none', background: 'transparent', color: 'var(--t3)', cursor: 'pointer', fontSize: '13px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: 0.4 }}
                    className="kb-delete-btn"
                  >×</button>
                  <Library size={22} strokeWidth={1.7} style={{ color: 'var(--accent)', marginBottom: '8px' }} />
                  {renaming === kb.name ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') { await onRenameAction(kb.name, renameValue); setRenaming(null); }
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={() => setRenaming(null)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '100%', padding: '3px 6px', fontSize: '13px', fontWeight: 600,
                        border: '1px solid var(--accent)', borderRadius: '5px',
                        background: 'var(--bg)', color: 'var(--t1)', outline: 'none',
                      }}
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => { e.stopPropagation(); setRenaming(kb.name); setRenameValue(kb.name); }}
                      style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '3px', paddingRight: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                      title="Dvojklik pre premenovanie"
                    >{kb.name}</div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', fontFamily: 'var(--font-jetbrains)', fontSize: '8.5px', color: 'var(--t3)', letterSpacing: '0.04em', marginTop: '8px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                      {kb.document_count} dok.
                    </span>
                    <span>{kb.total_chunks} častí</span>
                  </div>
                </div>
              );
            })}
      </div>

      {showCreate && (
        <div style={{ marginTop: '10px', padding: '18px', border: '1px solid var(--atm-glass-border)', borderRadius: '12px', background: 'rgba(26, 20, 16, 0.62)', maxWidth: '420px', animation: 'kbSlideDown 0.2s ease' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t1)', marginBottom: '10px' }}>Nová databáza</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newName} onChange={(e) => setNewNameAction(e.target.value)} placeholder="Názov databázy" autoFocus
              style={{ padding: '10px 12px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '13px', color: 'var(--t1)', outline: 'none', transition: 'border-color 0.15s' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            />
            <input value={newDesc} onChange={(e) => setNewDescAction(e.target.value)} placeholder="Popis (voliteľný)"
              style={{ padding: '9px 12px', background: 'rgba(245, 237, 216, 0.04)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '12px', color: 'var(--t2)', outline: 'none', transition: 'border-color 0.15s' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateAction(false)} style={{ padding: '7px 14px', background: 'transparent', color: 'var(--t3)', border: '1px solid var(--atm-glass-border)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-mid)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >Zrušiť</button>
              <button onClick={() => void onCreateAction()} disabled={creating || !newName.trim()}
                style={{ padding: '7px 18px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: creating ? 'wait' : 'pointer', opacity: creating || !newName.trim() ? 0.5 : 1, transition: 'opacity 0.15s' }}
              >{creating ? 'Vytváram…' : 'Vytvoriť'}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes kbSlideDown { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
        .kb-delete-btn:hover { opacity:1 !important; color:#ef4444 !important; background:rgba(239,68,68,0.1) !important; }
      `}</style>
    </div>
  );
}
