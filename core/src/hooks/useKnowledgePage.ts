'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TUTORS, type TutorId } from '@/components/shell/TutorPicker';
import { api, type KnowledgeBase, type SearchResult } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import { useChatStore } from '@/stores/useChatStore';
import { useKBStore } from '@/stores/useKBStore';
const STORAGE_KEY = 'edututor_active_kb';

// v0.7.3: re-export canonical OrbState so existing imports
// `import type { OrbState } from '@/hooks/useKnowledgePage'` keep working.
// Local code in this file uses it as a type too, so import-and-export.
import type { OrbState } from '@/types/orb';
export type { OrbState };

export function useKnowledgePage() {
  const activeKB = useKBStore((state) => state.activeKB);
  const knowledgeBases = useKBStore((state) => state.knowledgeBases);
  const documents = useKBStore((state) => state.documents);
  const kbLoading = useKBStore((state) => state.isLoading);
  const setActiveKB = useKBStore((state) => state.setActiveKB);
  const setKnowledgeBases = useKBStore((state) => state.setKnowledgeBases);
  const setDocuments = useKBStore((state) => state.setDocuments);
  const setKBLoading = useKBStore((state) => state.setLoading);

  const messages = useChatStore((state) => state.messages);
  const chatLoading = useChatStore((state) => state.isStreaming);
  const currentQuery = useChatStore((state) => state.currentQuery);
  const addMessage = useChatStore((state) => state.addMessage);
  const appendToLastMessage = useChatStore((state) => state.appendToLastMessage);
  const replaceLastMessage = useChatStore((state) => state.replaceLastMessage);
  const removeLastMessage = useChatStore((state) => state.removeLastMessage);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setStreaming = useChatStore((state) => state.setStreaming);
  const setCurrentQuery = useChatStore((state) => state.setCurrentQuery);
  // v0.8.1: provider-fallback nudge state — populated when the backend reports
  // provider="fallback" / type=error on /chat/stream (text chat surfaces it
  // as a banner above the input bar instead of showing the silent fallback as
  // the assistant's reply). Cleared on the next successful turn.
  const setProviderError = useChatStore((state) => state.setProviderError);

  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  // v0.6.5 lazy-init: read the persisted tutor synchronously so the FIRST
  // render already has the right voice. Previously we defaulted to 'lukas'
  // and a useEffect overrode it from localStorage one tick later — a fast
  // double click on "Začať konverzáciu" could fire greeting + first stream
  // with the wrong voice before the override applied.
  const [selectedTutor, setSelectedTutor] = useState<TutorId>(() => {
    if (typeof window === 'undefined') return 'lukas';
    const saved = window.localStorage.getItem('edututor-tutor');
    return (saved === 'lukas' || saved === 'viktoria') ? saved : 'lukas';
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceActiveRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const tutorRef = useRef<TutorId>('lukas');
  const savedKBNameRef = useRef<string | null>(null);
  // v0.7.4: dedicated AbortController for speakAnswer's /api/v1/tts fetch.
  // stopAllVoice needs to abort the in-flight greeting download too, otherwise
  // a late-arriving blob spawns a phantom Audio() after voice mode is torn down.
  const ttsAbortRef = useRef<AbortController | null>(null);
  // v0.7.4: hoist the audio queue + playing flag out of submitQuestion's
  // closure so each new turn doesn't allocate fresh locals (which caused the
  // re-arm bug — a stale playing=true in an old closure stranded the orb).
  const audioQueueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const audioSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitQuestionRef = useRef<(question: string) => Promise<void>>(async () => {});
  const speakAnswerRef = useRef<(text: string) => Promise<void>>(async () => {});
  const startListeningRef = useRef<() => Promise<void>>(async () => {});

  const activeKBName = activeKB?.name ?? null;

  const stopAllVoice = useCallback(() => {
    voiceActiveRef.current = false;
    setVoiceActive(false);
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    // v0.7.4: abort the in-flight /api/v1/tts fetch from speakAnswer too.
    // Without this, a late-arriving greeting blob spawns a phantom Audio()
    // after the user has already moved on — overlaps with chat-stream audio.
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    // v0.7.4: hard-stop (mute + detach) instead of just pause(). pause() leaves
    // up to ~500ms of decoded PCM ringing out — that's the residual the user
    // described as "still speaks after I stop".
    if (audioRef.current) {
      try {
        audioRef.current.muted = true;
        audioRef.current.volume = 0;
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch { /* ignore */ }
      audioRef.current = null;
    }
    // v0.7.4: drop any cached safety timer + reset hoisted queue state so
    // the next session starts clean.
    if (audioSafetyRef.current) {
      clearTimeout(audioSafetyRef.current);
      audioSafetyRef.current = null;
    }
    audioQueueRef.current = [];
    playingRef.current = false;
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (recStreamRef.current) {
      recStreamRef.current.getTracks().forEach((track) => track.stop());
      recStreamRef.current = null;
    }
    setOrbState('idle');
  }, []);

  const syncActiveKB = useCallback((items: KnowledgeBase[], preferredName: string | null) => {
    setActiveKB(preferredName ? items.find((kb) => kb.name === preferredName) ?? null : null);
  }, [setActiveKB]);

  const loadKnowledgeBases = useCallback(async (preferredName?: string | null) => {
    setKBLoading(true);
    try {
      const data = await api.listKnowledgeBases();
      setKnowledgeBases(data);
      const nextName = preferredName !== undefined ? preferredName : activeKB?.name ?? savedKBNameRef.current;
      syncActiveKB(data, nextName ?? null);
    } catch {
      // silent
    } finally {
      setKBLoading(false);
    }
  }, [activeKB?.name, setKBLoading, setKnowledgeBases, syncActiveKB]);

  const resetChatState = useCallback(() => {
    clearMessages();
    setResults(null);
    setSearchTime(null);
    setCurrentQuery('');
    conversationIdRef.current = null;
  }, [clearMessages, setCurrentQuery]);

  const loadDocuments = useCallback(async (name: string) => {
    try {
      const data = await api.listDocuments(name);
      setDocuments(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found') || message.includes('404')) {
        stopAllVoice();
        setActiveKB(null);
        setDocuments([]);
        resetChatState();
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, [resetChatState, setActiveKB, setDocuments, stopAllVoice]);

  const handleTutorSelect = useCallback((id: TutorId) => {
    setSelectedTutor(id);
    tutorRef.current = id;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('edututor-tutor', id);
    }
  }, []);

  const handleSelect = useCallback((name: string | null) => {
    stopAllVoice();
    const nextKB = name
      ? useKBStore.getState().knowledgeBases.find((kb) => kb.name === name) ?? null
      : null;
    setActiveKB(nextKB);
    resetChatState();
    if (typeof window !== 'undefined') {
      if (name) {
        window.localStorage.setItem(STORAGE_KEY, name);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [resetChatState, setActiveKB, stopAllVoice]);

  const clearChat = useCallback(() => {
    stopAllVoice();
    resetChatState();
  }, [resetChatState, stopAllVoice]);

  const startListening = useCallback(async () => {
    if (!voiceActiveRef.current) return;
    // v0.6.5: backport of v0.6.4 defensive teardown from useVoiceSession.
    // In packaged Electron production the prior turn's MediaRecorder may not
    // have released the OS-level mic device by the time we re-call
    // getUserMedia, and the new request silently rejects with NotReadableError.
    // Before v0.6.5, the catch on line ~266 swallowed this and ended the
    // session — exact match to user-reported "spoke one sentence then orb
    // stuck idle" in KB Hlas mode. Now we tear down prior recorder + ctx
    // explicitly and log the error so DevTools shows the cause.
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch (e) {
        console.error('[kb-voice] startListening: prior recorder.stop() threw', e);
      }
      recorderRef.current = null;
    }
    if (recStreamRef.current) {
      try { recStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      recStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close(); } catch (e) {
        console.error('[kb-voice] startListening: prior audioCtx.close() threw', e);
      }
      audioCtxRef.current = null;
    }
    setOrbState('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recChunksRef.current.push(event.data);
        }
      };

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Float32Array(analyser.fftSize);

      const SILENCE_THRESHOLD = 0.02;
      const SILENCE_MS = 2500;
      const MIN_SPEECH_MS = 800;
      const speechStart = Date.now();
      let silenceStart: number | null = null;
      let vadDone = false;

      const stopVAD = () => {
        if (vadDone) return;
        vadDone = true;
        if (vadIntervalRef.current) {
          clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = null;
        }
        // v0.6.5: explicit graph teardown so Electron's V8 doesn't keep the
        // stream's audio tracks pinned past audioCtx.close() — that pinning
        // is what blocks the next getUserMedia call from succeeding.
        try { source.disconnect(); } catch { /* ignore */ }
        try { analyser.disconnect(); } catch { /* ignore */ }
        if (audioCtxRef.current === audioCtx) {
          audioCtx.close();
          audioCtxRef.current = null;
        }
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      };

      vadIntervalRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);
        const rms = Math.sqrt(dataArray.reduce((sum, value) => sum + value * value, 0) / dataArray.length);
        const elapsed = Date.now() - speechStart;
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now();
          if (silenceStart && Date.now() - silenceStart > SILENCE_MS && elapsed > MIN_SPEECH_MS) {
            stopVAD();
          }
        } else {
          silenceStart = null;
        }
      }, 40);

      const safetyTimeout = setTimeout(stopVAD, 15000);

      recorder.onstop = async () => {
        clearTimeout(safetyTimeout);
        stream.getTracks().forEach((track) => track.stop());
        if (!voiceActiveRef.current) return;
        const blob = new Blob(recChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) {
          if (voiceActiveRef.current) {
            startListeningRef.current();
          }
          return;
        }
        setOrbState('thinking');
        try {
          const formData = new FormData();
          formData.append('audio', blob, 'audio.webm');
          const response = await fetch(`${API_BASE}/api/v1/stt/transcribe`, { method: 'POST', body: formData });
          if (response.ok) {
            const data = await response.json();
            const text = (data.text ?? '').trim();
            if (text) {
              await submitQuestionRef.current(text);
            }
          }
        } catch {
          // silent
        }
      };

      recorder.start();
      console.error('[kb-voice] mic open (recorder.state=' + recorder.state + ')');
    } catch (err) {
      // v0.6.5: surface the failure and decide based on type.
      // NotAllowedError = user denied permission, terminal.
      // NotReadableError / AbortError / TimeoutError = OS device briefly busy,
      // retry once. Previously the empty catch silently flipped voiceActiveRef
      // to false on EVERY error type and the session died with no log — exactly
      // the "one sentence then stops" symptom in KB Hlas.
      const name = (err as { name?: string })?.name || 'UnknownError';
      const message = (err as { message?: string })?.message || String(err);
      console.error('[kb-voice] startListening: getUserMedia FAILED  name=' + name + '  msg=' + message);
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        console.error('[kb-voice] mic permission denied — ending session');
        voiceActiveRef.current = false;
        setVoiceActive(false);
        setOrbState('idle');
        return;
      }
      if (voiceActiveRef.current) {
        console.error('[kb-voice] transient mic error — retrying in 800ms');
        setTimeout(() => { if (voiceActiveRef.current) startListeningRef.current?.(); }, 800);
      }
    }
  }, []);

  const speakAnswer = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setOrbState('speaking');
    // v0.7.4: track the fetch in an AbortController so stopAllVoice can cancel
    // the greeting download if the user moves on before TTS arrives.
    if (ttsAbortRef.current) ttsAbortRef.current.abort();
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    try {
      const response = await fetch(`${API_BASE}/api/v1/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          provider: 'edge',
          voice: TUTORS[tutorRef.current].voiceId,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        setOrbState('idle');
        if (voiceActiveRef.current) {
          setTimeout(() => startListeningRef.current(), 400);
        }
        return;
      }
      const blob = await response.blob();
      // v0.7.4: re-check voice mode is still active before spawning Audio.
      // The fetch might have completed AFTER stopAllVoice was called (race
      // between abort() and the response Promise settling). Bail + don't
      // create the URL so we leak nothing.
      if (!voiceActiveRef.current) {
        setOrbState('idle');
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        if (voiceActiveRef.current) {
          setOrbState('idle');
          setTimeout(() => startListeningRef.current(), 400);
        } else {
          setOrbState('idle');
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        if (voiceActiveRef.current) {
          setOrbState('idle');
          setTimeout(() => startListeningRef.current(), 400);
        } else {
          setOrbState('idle');
        }
      };
      await audio.play();
    } catch {
      if (voiceActiveRef.current) {
        setOrbState('idle');
        setTimeout(() => startListeningRef.current(), 400);
      } else {
        setOrbState('idle');
      }
    }
  }, []);

  const submitQuestion = useCallback(async (question: string) => {
    if (!activeKBName || !question.trim()) return;
    const text = question.trim();
    setResults(null);
    setSearchTime(null);
    setStreaming(true);
    // v0.8.1: clear any stale provider-fallback nudge from a prior turn so the
    // banner doesn't outlive the failure that produced it.
    setProviderError(null);
    addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    });
    setCurrentQuery('');

    try {
      const searchResponse = await api.searchKnowledgeBase(activeKBName, text, 6, 0.4);
      setResults(searchResponse.results);
      setSearchTime(searchResponse.search_time_ms);
    } catch {
      setResults([]);
    }

    addMessage({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    });

    // v0.7.4: queue + playing flag are hook-level refs (declared near
    // audioRef). The old per-turn const declarations created a fresh closure
    // each call, so a stale playing=true left over from turn N could block
    // turn N+1's re-arm path entirely. Refs survive across turns and survive
    // re-arm cycles.
    audioQueueRef.current = [];
    playingRef.current = false;
    if (audioSafetyRef.current) {
      clearTimeout(audioSafetyRef.current);
      audioSafetyRef.current = null;
    }

    // v0.7.6 ROOT CAUSE FIX for "dual audio in KB Hlas": kill any in-flight
    // greeting TTS BEFORE we start streaming the chat response. The greeting
    // (speakAnswer in toggleVoiceMode) fires /api/v1/tts on voice-mode entry.
    // If user speaks fast enough, submitQuestion fires WHILE the greeting
    // download is still in flight OR the greeting Audio just started playing.
    // Live evidence from v0.7.5 backend.log: POST /api/v1/tts followed by
    // POST /api/v1/chat/stream within the same session. Both audios then
    // play in parallel → exact "2 zvuky" symptom. The v0.7.4 AbortController
    // existed but stopAllVoice was the only caller; submitQuestion did not
    // abort, so greeting and chat-stream raced into both being live.
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.muted = true;
        audioRef.current.volume = 0;
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch { /* ignore */ }
      audioRef.current = null;
    }

    try {
      if (!conversationIdRef.current) {
        conversationIdRef.current = useChatStore.getState().activeSessionId || crypto.randomUUID();
      }
      const activeConvId = useChatStore.getState().activeSessionId || conversationIdRef.current;
      chatAbortRef.current = new AbortController();
      const chatResponse = await fetch(`${API_BASE}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          knowledge_base: activeKBName,
          conversation_id: activeConvId,
          max_tokens: 400,
          temperature: 0.3,
          // v0.7.0 (W2): KB Hlas runs through /chat/stream but is its OWN
          // conversation surface — the UE5 main shell avatar should NOT
          // lipsync when the user is in the KB voice mode. Backend reads
          // this flag and via ContextVar skips every broadcast for the
          // duration of this turn. The KB orb in VoiceMode.tsx animates
          // locally from the chunked audio events arriving on SSE.
          broadcast_avatar: false,
          // v0.6.5: tts_voice comes from the selected tutor (Lukáš/Viktória),
          // not from a separate localStorage key that was only written by
          // ChatMode and HW Setup. Prior bug: picking Viktória in KB Voice
          // mode only changed the GREETING voice; every streamed response
          // was spoken in whatever voice HW Setup last persisted (defaulting
          // to Lukas). User experience: "I picked Viktória and she greeted
          // me, then the conversation continued in Lukáš's voice."
          tts_provider: 'edge',
          tts_voice: TUTORS[tutorRef.current].voiceId,
        }),
        signal: chatAbortRef.current.signal,
      });

      if (!chatResponse.ok || !chatResponse.body) {
        // v0.8.1: HTTP-level failure (502/503/timeout). Same Nudge treatment as
        // the in-stream provider-fallback path — don't leave an empty assistant
        // bubble; show the banner instead.
        setProviderError('Nepodarilo sa získať odpoveď. Skontroluj backend / sieť.');
        removeLastMessage();
        return;
      }

      const reader = chatResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      async function playNext() {
        if (!voiceActiveRef.current) {
          audioQueueRef.current.length = 0;
          playingRef.current = false;
          return;
        }
        if (playingRef.current || audioQueueRef.current.length === 0) return;
        playingRef.current = true;
        const audioBase64 = audioQueueRef.current.shift()!;
        try {
          const bytes = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          setOrbState('speaking');
          await new Promise<void>((resolve) => {
            let settled = false;
            const safeResolve = () => {
              if (settled) return;
              settled = true;
              if (audioSafetyRef.current) {
                clearTimeout(audioSafetyRef.current);
                audioSafetyRef.current = null;
              }
              try { URL.revokeObjectURL(url); } catch { /* ignore */ }
              resolve();
            };
            audio.onended = safeResolve;
            audio.onerror = safeResolve;
            audio.onpause = () => {
              if (!voiceActiveRef.current) safeResolve();
            };
            audio.play().catch(safeResolve);
            // v0.7.4: safety timer. Browser ENDED event sometimes never fires
            // (race on revoked-blob, decode error on a malformed chunk, audio
            // context suspended after autoplay-policy interaction loss).
            // v0.7.5: the timer MUST hard-stop the audio before resolving —
            // otherwise the <audio> element keeps playing PHYSICALLY while
            // the state machine moves on to 'idle' → 'listening' → user sees
            // orb "počúva" while still hearing speech. Resolve alone doesn't
            // stop playback; only pause + detach src does.
            // Also: re-bind safetyMs once metadata loads so long sentences
            // (>4s) don't get force-stopped prematurely. Until then we use
            // a generous 12s upper bound.
            audioSafetyRef.current = setTimeout(() => {
              try {
                audio.muted = true;
                audio.volume = 0;
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
              } catch { /* ignore */ }
              safeResolve();
            }, 12000);
            audio.addEventListener('loadedmetadata', () => {
              if (audioSafetyRef.current) clearTimeout(audioSafetyRef.current);
              const expectedMs = (audio.duration > 0 && Number.isFinite(audio.duration))
                ? audio.duration * 1000
                : 4000;
              const safetyMs = Math.max(4000, expectedMs * 2);
              audioSafetyRef.current = setTimeout(() => {
                try {
                  audio.muted = true;
                  audio.volume = 0;
                  audio.pause();
                  audio.removeAttribute('src');
                  audio.load();
                } catch { /* ignore */ }
                safeResolve();
              }, safetyMs);
            }, { once: true });
          });
        } catch {
          // silent
        }
        playingRef.current = false;
        audioRef.current = null;
        if (!voiceActiveRef.current) {
          audioQueueRef.current.length = 0;
          setOrbState('idle');
          return;
        }
        if (audioQueueRef.current.length > 0) {
          playNext();
        } else {
          // queue drained + voice still active → re-arm mic for next turn.
          // v0.7.4: this path was reachable but stranded when audio.onended
          // didn't fire; the safety timer above guarantees we get here.
          setOrbState('idle');
          setTimeout(() => startListeningRef.current(), 400);
        }
      }

      // v0.7.0 (W1): added per-read 15s stall timeout so a half-closed backend
      // connection can't hang the loop forever — symptom user reported in KB
      // Hlas was orb stuck in 'thinking' until manual stop.
      const READ_TIMEOUT_MS = 15000;
      const readWithTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
        return Promise.race([
          reader.read(),
          new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) =>
            setTimeout(() => reject(new Error('SSE read stalled >15s')), READ_TIMEOUT_MS)
          ),
        ]);
      };

      while (true) {
        const { done, value } = await readWithTimeout();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          // v0.7.0 (W1 — THE KB Hlas voice-loop fix): intercept OpenAI-style
          // [DONE] sentinel and the empty payload that follows backend's
          // 'event: end\n' separator. These would otherwise hit JSON.parse
          // and throw SyntaxError, silently swallowed by the catch below.
          // That silent swallow was the root cause of 'orb stuck on
          // thinking after first sentence' in KB Hlas — exact mirror of the
          // pre-v0.6.5 main-shell bug fixed in useVoiceSession.ts:730.
          if (payload === '[DONE]' || payload.trim() === '') continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === 'text') {
              fullText += event.delta;
              appendToLastMessage(event.delta);
            } else if (event.type === 'error') {
              // v0.8.1: backend already classified the provider failure into a
              // Slovak string (chat.py:_classify_provider_error). Surface it as
              // a terracotta Nudge banner above the input bar instead of
              // dumping it into the assistant bubble (the silent-fallback UX
              // bug we're fixing here — users assumed the AI had answered
              // when in fact the provider had collapsed to mock).
              // We still mark fullText so the post-loop "Prázdna odpoveď."
              // path doesn't fire on top of the nudge.
              const message = event.message || 'Neznáma chyba';
              const isAuthError = message.includes('401') || message.includes('Unauthorized') || message.includes('API key');
              const userMessage = isAuthError
                ? 'Neplatný API kľúč — skontroluj nastavenia v Hardware Setup.'
                : message;
              setProviderError(userMessage);
              removeLastMessage();
              fullText = userMessage;
            } else if (event.type === 'provider' && event.provider === 'fallback' && event.provider_error) {
              // v0.8.1: forward-compatible branch for when backend agent B1
              // wires the same provider/provider_error fields into the SSE
              // protocol (currently only on the non-streamed POST /api/v1/chat
              // ChatResponse). Treated identically to type:'error'.
              setProviderError(String(event.provider_error));
              removeLastMessage();
              fullText = String(event.provider_error);
            } else if (event.type === 'sentence_end' && event.audio && voiceActiveRef.current) {
              // v0.7.3 KB Voice protocol fix. Backend stopped emitting a
              // single 'sentence' event months ago (chat.py commit c705913d
              // split it into sentence_start + audio_chunk[N] + sentence_end).
              // The old `event.type === 'sentence'` branch never matched,
              // so audioQueue stayed empty, playNext() never fired, and
              // orbState was stranded on 'thinking' forever from turn 2
              // onward. The v0.7.0 W1 [DONE] sentinel fix was a band-aid
              // on the parse exception — the real stall was a missed-edge
              // state machine + dead protocol branch.
              //
              // sentence_end carries the COMPLETE per-sentence audio as
              // base64 MP3 (chat.py:1493 `audio: audio_b64`). One per
              // sentence — perfect granularity for the simple
              // new Audio(url) playback path here. The chunked audio_chunk
              // events the main shell consumes via MSE are skipped (KB
              // voice doesn't need streaming low-latency playback).
              audioQueueRef.current.push(event.audio);
              playNext();
            }
          } catch (parseErr) {
            // v0.7.0 (W1): SSE parser must log failures so future regressions
            // don't hide. Pre-v0.7.0 this was a bare catch {} which let the
            // [DONE] SyntaxError vanish into the void for months.
            console.error('[kb-voice] SSE parse failed', { line, error: parseErr });
          }
        }
      }

      if (!fullText) {
        replaceLastMessage('Prázdna odpoveď.');
      }
    } catch (err) {
      // AbortError = user-initiated stop, don't show error
      if ((err as Error)?.name !== 'AbortError') {
        // v0.8.1: surface backend-unreachable as a Nudge banner instead of
        // pretending the assistant wrote "Backend nedostupný." — same fix as
        // the provider-fallback path above.
        setProviderError('Backend nedostupný. Skontroluj, či beží tutor-service.');
        removeLastMessage();
      }
    } finally {
      chatAbortRef.current = null;
      setStreaming(false);
      // v0.7.4: defensive orb-reset. If the SSE loop ended without queueing
      // any audio AND nothing is currently playing, re-arm the mic so the
      // user can keep talking. playNext()'s safety timer guarantees the
      // happy path also reaches re-arm even when audio.onended doesn't fire.
      // Refs (not local closure vars) so we see the LIVE state — the prior
      // implementation looked at a fresh local `playing=false` and could
      // double-re-arm while playNext was still draining the queue.
      if (voiceActiveRef.current && !playingRef.current && audioQueueRef.current.length === 0) {
        setOrbState('idle');
        setTimeout(() => startListeningRef.current(), 400);
      }
    }
  }, [activeKBName, addMessage, appendToLastMessage, replaceLastMessage, removeLastMessage, setCurrentQuery, setProviderError, setStreaming]);

  const toggleVoiceMode = useCallback(() => {
    if (voiceActiveRef.current) {
      stopAllVoice();
      return;
    }
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    ctx.close();
    voiceActiveRef.current = true;
    setVoiceActive(true);
    const greeting = 'Čo by si chcel vedieť z týchto dokumentov?';
    addMessage({
      id: `assistant-greeting-${Date.now()}`,
      role: 'assistant',
      content: greeting,
      timestamp: new Date(),
    });
    speakAnswerRef.current(greeting).then(() => {
      if (voiceActiveRef.current) {
        startListeningRef.current();
      }
    });
  }, [addMessage, stopAllVoice]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createKnowledgeBase(newName.trim(), newDesc.trim() || undefined);
      await loadKnowledgeBases(activeKBName);
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
    } catch {
      alert('Nepodarilo sa vytvoriť databázu');
    } finally {
      setCreating(false);
    }
  }, [activeKBName, loadKnowledgeBases, newDesc, newName]);

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`Vymazať "${name}"?`)) return;
    try {
      await api.deleteKnowledgeBase(name);
      // v0.8.0: optimistic update — drop the deleted KB from local state
      // immediately so the "+" tile is interactive without waiting for
      // the refetch round-trip. Without this, on cold ChromaDB the user
      // saw skeleton tiles next to "+" for 300-800ms and assumed the page
      // was still loading.
      const prev = useKBStore.getState().knowledgeBases;
      setKnowledgeBases(prev.filter((kb) => kb.name !== name));
      if (activeKBName === name) {
        handleSelect(null);
      }
      // Refetch to converge with backend truth — but silently (no loading flicker)
      void api.listKnowledgeBases()
        .then((data) => setKnowledgeBases(data))
        .catch(() => { /* keep optimistic state; deletion already succeeded above */ });
    } catch {
      // silent
    }
  }, [activeKBName, handleSelect, setKnowledgeBases]);

  const handleRename = useCallback(async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    try {
      await api.renameKnowledgeBase(oldName, newName);
      if (activeKBName === oldName) {
        handleSelect(newName);
      }
      await loadKnowledgeBases(activeKBName === oldName ? newName : activeKBName);
    } catch {
      // silent
    }
  }, [activeKBName, handleSelect, loadKnowledgeBases]);

  const handleClearDocuments = useCallback(async () => {
    if (!activeKBName) return;
    if (!confirm(`Vymazať všetky dokumenty z "${activeKBName}"?`)) return;
    try {
      await api.clearKBDocuments(activeKBName);
      await loadKnowledgeBases(activeKBName);
    } catch {
      // silent
    }
  }, [activeKBName, loadKnowledgeBases]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!activeKBName || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    setUploadQueue(files.map((file) => file.name));

    for (const file of files) {
      try {
        await api.uploadDocument(activeKBName, file);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Nepodarilo sa nahrať dokument.';
        setUploadError(message);
      } finally {
        setUploadQueue((prev) => prev.filter((name) => name !== file.name));
      }
    }

    await loadDocuments(activeKBName);
    await loadKnowledgeBases(activeKBName);
    setUploading(false);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  }, [activeKBName, loadDocuments, loadKnowledgeBases]);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    if (!activeKBName) return;
    const files = Array.from(event.dataTransfer.files).filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ['pdf', 'docx', 'xlsx', 'txt', 'md'].includes(ext ?? '');
    });
    if (files.length === 0) {
      setUploadError('Podporované sú iba PDF, DOCX, XLSX, TXT a MD súbory.');
      return;
    }
    await uploadFiles(files);
  }, [activeKBName, uploadFiles]);

  const handleDeleteDocument = useCallback(async (documentId: string) => {
    if (!activeKBName) return;
    // Optimistic: remove from the visible list immediately so the user gets
    // instant feedback. We still hit the backend; if the doc is already gone
    // (404) we treat it as success and just resync the list.
    useKBStore.getState().removeDocument(documentId);
    try {
      await api.deleteDocument(activeKBName, documentId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      const alreadyGone = /not found/i.test(msg) || /404/.test(msg);
      if (!alreadyGone) {
        console.warn('[useKnowledgePage] deleteDocument failed:', error);
      }
    }
    await loadDocuments(activeKBName);
    await loadKnowledgeBases(activeKBName);
  }, [activeKBName, loadDocuments, loadKnowledgeBases]);

  const handleSearch = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    stopAllVoice();
    await submitQuestion(currentQuery);
  }, [currentQuery, stopAllVoice, submitQuestion]);

  const exportChat = useCallback(() => {
    const currentMessages = useChatStore.getState().messages;
    const header = `# ${activeKBName ?? 'Chat'}\n_${new Date().toLocaleString('sk')}_\n\n`;
    const body = currentMessages
      .map((message) => `**${message.role === 'user' ? 'Ty' : 'AI'}:**\n${message.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([header + body], { type: 'text/markdown' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${activeKBName ?? 'chat'}-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }, [activeKBName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    savedKBNameRef.current = window.localStorage.getItem(STORAGE_KEY);
    const savedTutor = window.localStorage.getItem('edututor-tutor') as TutorId | null;
    if (savedTutor) {
      setSelectedTutor(savedTutor);
      tutorRef.current = savedTutor;
    }
    loadKnowledgeBases(savedKBNameRef.current);
  }, [loadKnowledgeBases]);

  useEffect(() => {
    if (!activeKBName) {
      setDocuments([]);
      return;
    }
    loadDocuments(activeKBName);
  }, [activeKBName, loadDocuments, setDocuments]);

  useEffect(() => {
    if (!activeKBName) return;
    if (!documents.some((document) => document.status === 'processing' || document.status === 'pending')) return;
    const interval = setInterval(() => {
      loadKnowledgeBases(activeKBName);
      loadDocuments(activeKBName);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeKBName, documents, loadDocuments, loadKnowledgeBases]);

  useEffect(() => () => {
    stopAllVoice();
  }, [stopAllVoice]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopAllVoice();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [stopAllVoice]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  useEffect(() => {
    speakAnswerRef.current = speakAnswer;
  }, [speakAnswer]);

  useEffect(() => {
    submitQuestionRef.current = submitQuestion;
  }, [submitQuestion]);

  return {
    activeKB,
    activeKBName,
    chatLoading,
    currentQuery,
    creating,
    documents,
    exportChat,
    fileRef,
    handleCreate,
    handleDelete,
    handleDeleteDocument,
    handleDrop,
    handleRename,
    handleClearDocuments,
    handleSearch,
    handleSelect,
    handleTutorSelect,
    kbLoading,
    knowledgeBases,
    messages,
    newDesc,
    newName,
    orbState,
    results,
    searchTime,
    selectedTutor,
    setCurrentQuery,
    setNewDesc,
    setNewName,
    setShowCreate,
    showCreate,
    clearChat,
    submitQuestion,
    toggleVoiceMode,
    uploadError,
    uploading,
    uploadFiles,
    uploadQueue,
    voiceActive,
  };
}
