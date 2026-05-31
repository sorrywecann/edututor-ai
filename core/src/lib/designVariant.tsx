'use client';

// DesignVariant — a top-level switch between the two design languages we keep
// side-by-side so we can compare them with all functionality intact.
//
//   atmosphere  — the original warm "Living Room" design (current default).
//   chamber     — the new "private mentor chamber" per docs/design-spec, with
//                 pure black, single amber accent, Geist + Instrument Serif,
//                 and a particle-style orb.
//
// Persists via localStorage and reflects on <html data-design-variant="…">
// so CSS in globals.css can scope chamber-only rules without React gymnastics.

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export type DesignVariant = 'atmosphere' | 'chamber';
// v2 — bumped when the default flipped from atmosphere → chamber so any
// previously-saved variant choice doesn't pin you to the old default.
// Users who actually want atmosphere can flip via the A/C pill in the sidebar.
const STORAGE_KEY = 'edututor_design_variant_v2';
// Chamber is the default surface; atmosphere stays available as the A/C
// fallback in the sidebar. Per the design direction, fresh launches should
// feel like the new "private mentor chamber" immediately — pages that aren't
// Chamber-ified yet (voice-lab, knowledge, progress, sidebar chrome) will
// look atmosphere-styled in the meantime until they're ported.
const DEFAULT_VARIANT: DesignVariant = 'chamber';

interface DesignVariantValue {
  variant: DesignVariant;
  setVariant: (v: DesignVariant) => void;
  toggle: () => void;
}

const Ctx = createContext<DesignVariantValue>({
  variant: DEFAULT_VARIANT,
  setVariant: () => {},
  toggle: () => {},
});

export function DesignVariantProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<DesignVariant>(DEFAULT_VARIANT);

  // Hydrate from localStorage on mount + react to ?design=chamber|atmosphere
  // query so designs are linkable for screenshots / handoff.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('design');
      if (q === 'chamber' || q === 'atmosphere') {
        setVariantState(q);
        localStorage.setItem(STORAGE_KEY, q);
        return;
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'chamber' || saved === 'atmosphere') setVariantState(saved);
    } catch { /* private mode / quota */ }
  }, []);

  // Mirror onto the html element so CSS can scope chamber-only rules.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.designVariant = variant;
  }, [variant]);

  const setVariant = useCallback((v: DesignVariant) => {
    setVariantState(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback(() => {
    setVariantState((prev) => {
      const next: DesignVariant = prev === 'atmosphere' ? 'chamber' : 'atmosphere';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ variant, setVariant, toggle }}>{children}</Ctx.Provider>;
}

export function useDesignVariant() {
  return useContext(Ctx);
}
