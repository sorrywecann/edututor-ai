'use client';

import { useState, useEffect, useCallback } from 'react';

import { API_BASE } from '@/lib/config';
const MODE_STORAGE_KEY = 'edututor-mode-id';
const MODE_CHANGE_EVENT = 'edututor-mode-change';

export interface Mode {
  id: string;
  label: string;
  description: string;
  uiLocale: string;
  sttLanguage: string;
  ttsVoice: string;
  ttsProvider: string;
  tutorName: string;
  tutorColor: string;
  availableVoices: string[];
  nativeLanguage?: string;
  targetLanguage?: string;
  nativeTtsVoice?: string;
  nativeTtsProvider?: string;
  enabledSkills: string[];
}

const FALLBACK_MODES: Mode[] = [
  {
    id: 'sk',
    label: 'Po slovensky',
    description: 'Slovenský tutor, slovenský hlas',
    uiLocale: 'sk',
    sttLanguage: 'sk',
    ttsVoice: 'sk-SK-LukasNeural',
    ttsProvider: 'edge',
    tutorName: 'Lukáš',
    tutorColor: '#D4845A',
    availableVoices: ['sk-SK-LukasNeural', 'sk-SK-ViktoriaNeural'],
    enabledSkills: [],
  },
  {
    id: 'en',
    label: 'In English',
    description: 'English tutor, premium voice',
    uiLocale: 'en',
    sttLanguage: 'en',
    ttsVoice: 'af_heart',
    ttsProvider: 'kokoro',
    tutorName: 'Alex',
    tutorColor: '#10b981',
    availableVoices: ['af_heart', 'af_bella', 'am_michael'],
    enabledSkills: [],
  },
  {
    id: 'learn-en-from-sk',
    label: 'Učím sa angličtinu',
    description: 'Vysvetlenia po slovensky, precvičuje angličtinu',
    uiLocale: 'sk',
    sttLanguage: 'auto',
    ttsVoice: 'af_heart',
    ttsProvider: 'kokoro',
    tutorName: 'Alex',
    tutorColor: '#f59e0b',
    availableVoices: ['af_heart', 'am_michael'],
    nativeLanguage: 'sk',
    targetLanguage: 'en',
    nativeTtsVoice: 'sk-SK-LukasNeural',
    nativeTtsProvider: 'edge',
    enabledSkills: [],
  },
];

function camelizeMode(raw: Record<string, unknown>): Mode {
  return {
    id: raw.id as string,
    label: raw.label as string,
    description: raw.description as string,
    uiLocale: raw.ui_locale as string,
    sttLanguage: raw.stt_language as string,
    ttsVoice: raw.tts_voice as string,
    ttsProvider: raw.tts_provider as string,
    tutorName: raw.tutor_name as string,
    tutorColor: raw.tutor_color as string,
    availableVoices: (raw.available_voices as string[]) ?? [],
    nativeLanguage: raw.native_language as string | undefined,
    targetLanguage: raw.target_language as string | undefined,
    nativeTtsVoice: raw.native_tts_voice as string | undefined,
    nativeTtsProvider: raw.native_tts_provider as string | undefined,
    enabledSkills: (raw.enabled_skills as string[]) ?? [],
  };
}

function getSavedModeId(): string {
  if (typeof window === 'undefined') return 'sk';
  return localStorage.getItem(MODE_STORAGE_KEY) || 'sk';
}

export function useMode() {
  const [modes, setModes] = useState<Mode[]>(FALLBACK_MODES);
  const [modeId, setModeIdState] = useState<string>(getSavedModeId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/modes`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown>[] | null) => {
        if (data?.length) setModes(data.map(camelizeMode));
      })
      .catch((e) => { console.warn('[useMode] modes fetch failed:', e); })
      .finally(() => setLoading(false));
  }, []);

  // Sync mode across components via custom event
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handleModeChange(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      setModeIdState(id);
    }
    window.addEventListener(MODE_CHANGE_EVENT, handleModeChange);
    return () => window.removeEventListener(MODE_CHANGE_EVENT, handleModeChange);
  }, []);

  const setMode = useCallback((id: string) => {
    setModeIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(MODE_STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent(MODE_CHANGE_EVENT, { detail: id }));
    }
  }, []);

  const mode = modes.find(m => m.id === modeId) ?? modes[0];

  return { mode, modes, modeId, setMode, loading };
}
