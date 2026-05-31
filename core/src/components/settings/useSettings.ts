'use client';

// useSettings — shared state hook for all Settings tabs.
//
// Extracted from ChamberHardwareSetup.tsx (v0.7.7). Same source-of-truth API
// endpoints so flipping between tabs never desynchronises state:
//   GET  /api/v1/system/hardware  — hw info + recommended profile
//   GET  /api/v1/system/status    — active providers + model
//   GET  /api/v1/system/check     — per-provider availability + keys
//   POST /api/v1/system/apply     — commit recommended config
//   POST /api/v1/system/config    — save provider API keys
//   localStorage `edututor_user_prefs` — name + 4 personality dials
//   localStorage `edututor-tutor`      — selected tutor letter

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/config';
import { getPersistentUserId } from '@/lib/api';

export interface HardwareInfo {
  ram_gb: number;
  cpu_brand: string;
  is_apple_silicon: boolean;
  gpu_backend: string | null;
  ollama_models?: string[];
}
export interface ProfileRecommended {
  stt: { recommended: string };
  llm: { recommended: string; model?: string };
  tts: { recommended: string; voice?: string };
}
export interface HardwareResponse {
  hardware: HardwareInfo;
  profile: string;
  profile_label: string;
  recommended: ProfileRecommended;
}
export interface ProviderCheck { available: boolean; reason: string; fix?: string; models?: string[] }
export interface Checks {
  llm?: Record<string, ProviderCheck>;
  stt?: Record<string, ProviderCheck>;
  tts?: Record<string, ProviderCheck>;
}
export interface ActiveStatus {
  stt: string | null;
  llm: string | null;
  llm_model: string | null;
  tts: string | null;
  is_optimal?: boolean;
}

export const PROFILE_NUM: Record<string, string> = {
  'gpu-powerhouse': '04', 'apple-pro': '03',
  'cpu-strong': '02', 'cpu-base': '01', 'low-spec': '00',
};

export const PREFS_KEY = 'edututor_user_prefs';
export const TUTOR_KEY = 'edututor-tutor';
export type TutorId = 'lukas' | 'viktoria' | null;

export interface UserPrefs {
  user_name: string;
  assistant_name: string;
  formality: number;
  humor: number;
  directness: number;
  verbosity: number;
  // v0.7.0 (W5): user-supplied custom system prompt. Appended to the
  // slider-derived persona block server-side.
  custom_system_prompt?: string;
}
export const DEFAULT_PREFS: UserPrefs = {
  user_name: '', assistant_name: 'Lukáš',
  formality: 1, humor: 1, directness: 1, verbosity: 1,
  custom_system_prompt: '',
};

export interface SettingsState {
  data: HardwareResponse | null;
  status: ActiveStatus | null;
  checks: Checks | null;
  loading: boolean;
  applying: boolean;
  applied: boolean;
  tutor: TutorId;
  prefs: UserPrefs;
  setChecks: (c: Checks | null) => void;
  savePrefs: (next: UserPrefs) => void;
  pickTutor: (t: TutorId) => void;
  applyConfig: () => Promise<void>;
}

export function useSettings(): SettingsState {
  const [data, setData] = useState<HardwareResponse | null>(null);
  const [status, setStatus] = useState<ActiveStatus | null>(null);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [tutor, setTutor] = useState<TutorId>(() => {
    if (typeof window === 'undefined') return 'lukas';
    return (localStorage.getItem(TUTOR_KEY) as TutorId) || 'lukas';
  });
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);

  // Load hw + status + checks in parallel
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${API_BASE}/api/v1/system/hardware`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API_BASE}/api/v1/system/status`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API_BASE}/api/v1/system/check`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([hw, st, ch]) => {
      if (!alive) return;
      if (hw) setData(hw);
      if (st) setStatus(st);
      if (ch) setChecks(ch);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Load prefs
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const savePrefs = useCallback((next: UserPrefs) => {
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    fetch(`${API_BASE}/api/v1/user/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EduTutor-User-Id': getPersistentUserId(),
      },
      credentials: 'include',
      body: JSON.stringify(next),
    }).catch(() => { /* offline — local is source of truth */ });
  }, []);

  const pickTutor = useCallback((t: TutorId) => {
    setTutor(t);
    try { if (t) localStorage.setItem(TUTOR_KEY, t); } catch { /* ignore */ }
    if (t) savePrefs({ ...prefs, assistant_name: t === 'lukas' ? 'Lukáš' : 'Viktória' });
  }, [prefs, savePrefs]);

  const applyConfig = useCallback(async () => {
    setApplying(true); setApplied(false);
    try {
      await fetch(`${API_BASE}/api/v1/system/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      setApplied(true);
      const st = await fetch(`${API_BASE}/api/v1/system/status`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      if (st) setStatus(st);
    } catch { /* ignore */ }
    setApplying(false);
  }, []);

  return {
    data, status, checks, loading, applying, applied, tutor, prefs,
    setChecks, savePrefs, pickTutor, applyConfig,
  };
}
