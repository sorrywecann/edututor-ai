'use client';

// PersonaTab — extracted from ChamberHardwareSetup.tsx (PERSONA), now WITHOUT
// the MasterPromptSection. The master prompt moved to its own MOZOG tab.
//
// v0.8.5: user explicitly asked the Persona save button back. Even though
// savePrefs() already writes through on every change, the lack of a visible
// "Uložiť" button made the experience feel ephemeral — users want a button
// they can press to confirm the moment.
//
// The tab now tracks a `draft` snapshot alongside `prefs`. Edits mutate the
// draft locally; savePrefs only runs on Save. A "Uložené pred N s" indicator
// surfaces last-save time. Obnoviť reverts the draft to current prefs.

import { useEffect, useRef, useState } from 'react';
import { useSettingsCtx } from './SettingsContext';
import { SectionLabel } from './primitives';
import { TickSlider } from './TickSlider';
import { UserPrefs } from './useSettings';
import { TabShell } from './TabShell';
import { SaveBar } from './SaveBar';

const SLIDER_LABELS: { key: keyof UserPrefs; mono: string; ticks: [string, string, string] }[] = [
  { key: 'formality',  mono: 'FORMÁLNOSŤ', ticks: ['neformálne', 'srdečné', 'formálne'] },
  { key: 'humor',      mono: 'HUMOR',      ticks: ['suchý', 'vtipný', 'hravý'] },
  { key: 'directness', mono: 'PRIAMOSŤ',   ticks: ['jemné', 'úprimné', 'bez okolkov'] },
  { key: 'verbosity',  mono: 'VÝREČNOSŤ',  ticks: ['stručné', 'vyvážené', 'detailne'] },
];

function prefsEqual(a: UserPrefs, b: UserPrefs): boolean {
  return a.assistant_name === b.assistant_name
    && a.user_name === b.user_name
    && a.formality === b.formality
    && a.humor === b.humor
    && a.directness === b.directness
    && a.verbosity === b.verbosity
    && (a.custom_system_prompt ?? '') === (b.custom_system_prompt ?? '');
}

export function PersonaTab() {
  const { prefs, savePrefs } = useSettingsCtx();
  const [draft, setDraft] = useState<UserPrefs>(prefs);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const baselineRef = useRef<UserPrefs>(prefs);

  // Sync draft when prefs load from the network / localStorage after mount.
  // Only overrides the local draft while nothing is staged.
  useEffect(() => {
    if (prefsEqual(draft, baselineRef.current)) {
      setDraft(prefs);
      baselineRef.current = prefs;
    }
  }, [prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !prefsEqual(draft, baselineRef.current);

  async function handleSave() {
    setSaving(true);
    try {
      savePrefs(draft);
      baselineRef.current = draft;
      setLastSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(baselineRef.current);
  }

  return (
    <TabShell title="Persona" sub="Ako sa správa.">
      <div>
        <SectionLabel>Meno asistenta</SectionLabel>
        <input
          type="text" value={draft.assistant_name}
          onChange={(e) => setDraft({ ...draft, assistant_name: e.target.value })}
          onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-amber, #E8A87C)'; }}
          onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'var(--ch-line-strong, rgba(244,237,228,0.12))'; }}
          style={{
            width: '100%', marginTop: 8,
            background: 'transparent', textAlign: 'left',
            border: 'none', borderBottom: '1px solid var(--ch-line-strong, rgba(244,237,228,0.12))',
            padding: '6px 0', borderRadius: 0,
            fontFamily: 'var(--font-geist), ui-sans-serif, system-ui, sans-serif',
            fontSize: 15, color: 'var(--ch-ink, #f4ede4)', outline: 'none',
            transition: 'border-bottom-color 0.15s',
          }}
        />
      </div>

      {SLIDER_LABELS.map((s) => {
        const value = (draft[s.key] as number) ?? 1;
        const activeLabel = s.ticks[value];
        return (
          <div key={s.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{
                fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: 'var(--ch-ink-dim, #9a8f82)',
              }}>{s.mono}</span>
              <span style={{
                fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: 'var(--ch-amber, #E8A87C)', fontWeight: 500,
              }}>{activeLabel}</span>
            </div>
            <TickSlider
              value={value}
              ticks={s.ticks}
              onChange={(v) => setDraft({ ...draft, [s.key]: v })}
            />
          </div>
        );
      })}

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onReset={handleReset}
        lastSavedAt={lastSavedAt}
      />
    </TabShell>
  );
}
