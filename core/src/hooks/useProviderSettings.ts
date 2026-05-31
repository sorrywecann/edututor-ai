// core/src/hooks/useProviderSettings.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

import { API_BASE } from '@/lib/config';

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  provider: string;
}

export interface STTOption {
  id: string;
  name: string;
  description: string;
  provider: string;
}

export interface LLMOption {
  id: string;
  name: string;
  available: boolean;
  provider: string;
}

const DEFAULT_TTS_PROVIDER = 'edge';
const DEFAULT_TTS_VOICE = 'sk-SK-LukasNeural';
const DEFAULT_STT_MODEL = 'mlx-whisper-turbo';

// Honest fallbacks: the previous "wishlist" approach showed 10 STT models and
// 9 LLMs even when the backend was dead — users picked one, nothing worked,
// no error explained why. Now we ship a SHORT, USABLE fallback (Edge TTS works
// frontend-only via the backend's edge_tts package; nothing else does), and
// leave STT/LLM empty so the UI can show "Backend offline — models unknown"
// instead of pretending Whisper Large is installed when it isn't.
const FALLBACK_VOICES: VoiceOption[] = [
  // Edge TTS routes through the backend's edge_tts package — these voices
  // exist if and only if the backend is up. Listed here as a sensible
  // pre-fetch placeholder so the dropdown isn't empty during the first
  // 200ms before /api/v1/tts/voices responds.
  { id: 'sk-SK-LukasNeural',    name: 'Lukáš SK [Edge · free]',   lang: 'sk', provider: 'edge' },
  { id: 'sk-SK-ViktoriaNeural', name: 'Viktória SK [Edge · free]', lang: 'sk', provider: 'edge' },
];

// Empty fallbacks. The UI shows "backend offline" when these stay empty
// after the fetch attempt — no point listing models that aren't actually
// available on this machine. Backend's /api/v1/{stt,llm}/models replaces
// these with the real, installed inventory once it responds.
const FALLBACK_STT: STTOption[] = [];
const FALLBACK_LLM: LLMOption[] = [];

export function useProviderSettings() {
  const [voices, setVoices] = useState<VoiceOption[]>(FALLBACK_VOICES);
  const [sttModels, setSttModels] = useState<STTOption[]>(FALLBACK_STT);
  const [llmModels, setLlmModels] = useState<LLMOption[]>(FALLBACK_LLM);
  const [ttsProvider, _setTtsProvider] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('edututor_tts_provider') || DEFAULT_TTS_PROVIDER;
    return DEFAULT_TTS_PROVIDER;
  });
  const [ttsVoice, _setTtsVoice] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('edututor_tts_voice') || DEFAULT_TTS_VOICE;
    return DEFAULT_TTS_VOICE;
  });
  const setTtsProvider = (v: string) => { _setTtsProvider(v); if (typeof window !== 'undefined') localStorage.setItem('edututor_tts_provider', v); };
  const setTtsVoice = (v: string) => { _setTtsVoice(v); if (typeof window !== 'undefined') localStorage.setItem('edututor_tts_voice', v); };
  const [sttModel, setSttModel] = useState(DEFAULT_STT_MODEL);
  const [llmProvider, setLlmProviderState] = useState('');
  const [loading, setLoading] = useState(true);
  // W2: user-visible error from the most recent /llm/switch attempt. Stays
  // populated until the next successful switch (or the user explicitly
  // clears it via clearSwitchError) so the chat UI can surface a Nudge
  // instead of the previous silent revert.
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function refetchLlmModels() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/llm/models`);
      if (res.ok) {
        const data = await res.json();
        setLlmModels(data.models?.length ? data.models : FALLBACK_LLM);
        if (data.current) setLlmProviderState(data.current);
      }
    } catch (e) {
      console.warn('[useProviderSettings] LLM models fetch failed:', e);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [voicesRes, sttRes, llmRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/tts/voices`).catch(() => null),
          fetch(`${API_BASE}/api/v1/stt/models`).catch(() => null),
          fetch(`${API_BASE}/api/v1/llm/models`).catch(() => null),
        ]);
        if (voicesRes?.ok) {
          const data: VoiceOption[] = await voicesRes.json();
          setVoices(data.length ? data : FALLBACK_VOICES);
        } else {
          setVoices(FALLBACK_VOICES);
        }
        if (sttRes?.ok) {
          const data = await sttRes.json();
          setSttModels(data.models?.length ? data.models : FALLBACK_STT);
          if (data.current) setSttModel(data.current);
          else if (data.models?.length) setSttModel(data.models[0].id);
        } else {
          setSttModels(FALLBACK_STT);
        }
        if (llmRes?.ok) {
          const data = await llmRes.json();
          setLlmModels(data.models?.length ? data.models : FALLBACK_LLM);
          if (data.current) setLlmProviderState(data.current);
        } else {
          setLlmModels(FALLBACK_LLM);
        }
      } catch {
        setVoices(FALLBACK_VOICES);
        setSttModels(FALLBACK_STT);
        setLlmModels(FALLBACK_LLM);
      } finally {
        setLoading(false);
      }
    }
    load();

    function onProviderChange() { refetchLlmModels(); }
    window.addEventListener('edututor:providers-changed', onProviderChange);

    function onCloneSelected(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setTtsProvider(detail.provider);
        setTtsVoice(detail.voiceId);
      } else {
        setTtsProvider(DEFAULT_TTS_PROVIDER);
        setTtsVoice(DEFAULT_TTS_VOICE);
      }
    }
    window.addEventListener('edututor:voice-clone-selected', onCloneSelected);

    return () => {
      window.removeEventListener('edututor:providers-changed', onProviderChange);
      window.removeEventListener('edututor:voice-clone-selected', onCloneSelected);
    };
  }, []);

  function selectVoice(voice: VoiceOption) {
    setTtsVoice(voice.id);
    setTtsProvider(voice.provider);
  }

  const applyModeVoice = useCallback((ttsVoiceId: string, ttsProviderName: string) => {
    setTtsVoice(ttsVoiceId);
    setTtsProvider(ttsProviderName);
  }, []);

  async function setSttModelAndSwitch(id: string) {
    setSttModel(id);
    try {
      await fetch(`${API_BASE}/api/v1/stt/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: id }),
      });
    } catch { /* backend offline */ }
  }

  async function setLlmProvider(id: string) {
    const prev = llmProvider;
    setLlmProviderState(id);
    // Clear any stale error from a previous failed switch — the user is
    // trying again, so the warning shouldn't linger from the last attempt.
    setSwitchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/llm/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.success) {
          setLlmProviderState(prev);
          console.warn(`LLM switch rejected: ${data.error}`);
          // W2: surface this to the user. Previously the revert was silent
          // and the dropdown just snapped back with no explanation.
          setSwitchError(
            data.error
              ? `Nepodarilo sa prepnúť — ${data.error}. Skús ešte raz alebo vyber iný model.`
              : 'Nepodarilo sa prepnúť — skús ešte raz alebo vyber iný model.',
          );
        }
      } else {
        setSwitchError('Nepodarilo sa prepnúť — skús ešte raz alebo vyber iný model.');
      }
      await refetchLlmModels();
    } catch {
      setLlmProviderState(prev);
      setSwitchError('Nepodarilo sa prepnúť — backend neodpovedal. Skús ešte raz alebo vyber iný model.');
    }
  }

  function clearSwitchError() { setSwitchError(null); }

  // W2 derived signals — read-only views over llmModels so consumers don't
  // each have to re-implement "is anything actually configured?". The mock
  // detection is conservative: a backend that returned the fallback (no
  // real models) leaves llmModels empty, in which case state is 'unknown';
  // a backend that returned a model literally named "mock" is 'mock'.
  const isAnyProviderReady = llmModels.some(m => m.available);
  const activeProviderState: 'configured' | 'mock' | 'unknown' =
    llmModels.length === 0
      ? 'unknown'
      : (llmProvider && /mock/i.test(llmProvider)) || llmModels.some(m => /mock/i.test(m.id) && m.available && m.id === llmProvider)
      ? 'mock'
      : isAnyProviderReady
      ? 'configured'
      : 'unknown';

  return {
    voices,
    sttModels,
    llmModels,
    ttsProvider,
    ttsVoice,
    sttModel,
    llmProvider,
    setSttModel: setSttModelAndSwitch,
    selectVoice,
    applyModeVoice,
    setLlmProvider,
    refetchLlmModels,
    loading,
    // W2 additions
    switchError,
    clearSwitchError,
    isAnyProviderReady,
    activeProviderState,
  };
}
