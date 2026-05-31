'use client';

// MozogTab — hosts the MasterPromptSection that was previously embedded
// inside PERSONA. v0.8.4: wrapped in TabShell so the title/sub style matches
// the other 7 tabs and the editor itself gets the full content column.

import { MasterPromptSection } from './MasterPromptSection';
import { TabShell } from './TabShell';

export function MozogTab() {
  return (
    <TabShell title="Mozog" sub="Tvoje vlastné pravidlá pre tutora.">
      <MasterPromptSection />
    </TabShell>
  );
}
