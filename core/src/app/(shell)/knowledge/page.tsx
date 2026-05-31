'use client';

import { KBHeader } from '@/components/kb/KBHeader';
import { KBWorkspace } from '@/components/kb/KBWorkspace';
import { Topbar } from '@/components/shell/Topbar';
import { useKnowledgePage } from '@/hooks/useKnowledgePage';
import { PageHeader } from '@/components/atmosphere';

export default function KnowledgePage() {
  const kp = useKnowledgePage();

  return (
    <>
      <Topbar sessionTitle="Databáza znalostí" />
      <div
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void kp.handleDrop(e)}
      >
        {!kp.activeKB ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
            <PageHeader
              eyebrow="Databáza znalostí · knowledge bases"
              title="Tvoje databázy"
              description="Nahraj dokumenty, vytvor databázy a Lukáš ich použije ako kontext počas konverzácie. Pretiahni súbor kamkoľvek na stránku alebo otvor existujúcu databázu nižšie."
              style={{ marginBottom: 22 }}
            />
            <KBHeader
              creating={kp.creating} kbLoading={kp.kbLoading} newDesc={kp.newDesc} newName={kp.newName}
              onCreateAction={kp.handleCreate} onDeleteAction={kp.handleDelete} onRenameAction={kp.handleRename} onSelectAction={kp.handleSelect}
              setNewDescAction={kp.setNewDesc} setNewNameAction={kp.setNewName} setShowCreateAction={kp.setShowCreate} showCreate={kp.showCreate}
            />
          </div>
        ) : (
          <KBWorkspace kp={kp} onBack={() => kp.handleSelect(null)} />
        )}
      </div>
    </>
  );
}
