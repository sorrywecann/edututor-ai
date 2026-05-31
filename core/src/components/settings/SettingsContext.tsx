'use client';

// SettingsContext — provider for the shared useSettings() state. The
// `/settings` layout creates the state once and exposes it to every tab
// page so single-source-of-truth is preserved across navigation.

import { createContext, useContext, ReactNode } from 'react';
import { useSettings, SettingsState } from './useSettings';

const SettingsCtx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const value = useSettings();
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettingsCtx(): SettingsState {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettingsCtx must be used inside <SettingsProvider>');
  return ctx;
}
