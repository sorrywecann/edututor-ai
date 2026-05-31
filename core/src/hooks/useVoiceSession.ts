'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { OrbState } from '@/types/orb';
import { ChatMessage } from '@/components/chat/Message';
import { useUE5Bridge } from './useUE5Bridge';
import type { VisemeFrame, ARKitFrame } from '@/lib/ue5-bridge';
import { api, getPersistentUserId } from '@/lib/api';
import { logger } from '@/lib/logger';
import { setAudioAmplitude } from '@/lib/audioAmplitude';

interface QueueItem {
  audio: HTMLAudioElement;
  visemeTimeline: VisemeFrame[];
  arkitFrames?: ARKitFrame[];
  durationMs: number;
  emotion: string;
  intensity: number;
  sentenceIdx: number;
}

import { API_BASE } from '@/lib/config';
const CONV_ID_KEY = 'edututor_conv_id';
const UE5_AUDIO = process.env.NEXT_PUBLIC_UE5_AUDIO === '1';

// Wraps reader.read() with a stall timeout — if the server stops sending
// mid-stream (half-open connection), we abort rather than hang forever.
// The setTimeout handle is cleared on read() resolution so each successful
// chunk does NOT leak a 15s timer (which previously stayed armed and fired
// rejection on an already-settled race; harmless behaviour but a real timer
// handle leak — ~thousands per long SSE stream).
function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms = 15000,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error('stream stalled')), ms);
  });
  return Promise.race([reader.read(), timeout]).finally(() => {
    if (timerId !== undefined) clearTimeout(timerId);
  });
}

export function useVoiceSession(
  ttsProvider: string = 'edge',
  ttsVoice: string = 'sk-SK-ViktoriaNeural',
  sttModel?: string,
  isNewSession?: boolean,
  onError?: (msg: string) => void,
  modeId: string = 'sk',
  sttLanguage: string = 'sk',
) {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string>('Nová konverzácia');

  const bridge = useUE5Bridge();

  const conversationIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isActiveRef = useRef(false);
  const ttsProviderRef = useRef(ttsProvider);
  const ttsVoiceRef = useRef(ttsVoice);
  const sttModelRef = useRef(sttModel);
  const modeIdRef = useRef(modeId);
  const sttLanguageRef = useRef(sttLanguage);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Web Audio plumbing for the audio-reactive orb ────────────────────────
  // Every TTS audio element we play is routed through a shared AnalyserNode;
  // an rAF loop reads its RMS amplitude and writes to the module-level signal
  // in @/lib/audioAmplitude so orbs can read it in their own rAF (no React
  // re-renders). Separate from `audioCtxRef` (which is the mic VAD context,
  // torn down between turns) — playback analysis lives the whole session.
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Web Audio's getByteTimeDomainData requires Uint8Array<ArrayBuffer> (not
  // ArrayBufferLike) under TS 5.7+; spelling out the generic keeps types happy.
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const sourceNodeMap = useRef<WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>>(new WeakMap());
  const activeKbRef = useRef<string | undefined>(undefined);
  const [activeKb, setActiveKbState] = useState<string | undefined>(undefined);
  // W2: a sticky human-readable error that survives the transient toast.
  // Cleared when the NEXT successful chat-stream completes. Surfaced as a
  // <Nudge kind="warning" layout="banner"> in the main shell.
  const [persistentError, setPersistentError] = useState<string | null>(null);

  const audioQueueRef = useRef<QueueItem[]>([]);
  const isPlayingQueueRef = useRef(false);

  // Legacy per-sentence buffer (browsers without MediaSource support, or when
  // sentence_end ``audio`` field is used by older backends). Each entry
  // collects base64 MP3 fragments until sentence_end fires; cleared on
  // session-end / errors so a half-baked previous turn cannot leak.
  const streamingBuffersRef = useRef<Map<number, string[]>>(new Map());

  // MediaSource-backed live streaming state per sentence index. When MSE is
  // supported, audio_chunk events appendBuffer() immediately, so playback can
  // start ~150-300ms before sentence_end fires (i.e. before the LLM finishes
  // synthesizing the FULL sentence audio). pendingChunks queues fragments
  // that arrived while sourceBuffer was still in 'updating' state. ``ended``
  // marks that sentence_end fired so we can call endOfStream() once the
  // queue drains. The Audio element is enqueued onto audioQueueRef at
  // sentence_start time so playback order matches arrival order.
  type StreamingMSEState = {
    audio: HTMLAudioElement;
    mediaSource: MediaSource;
    sourceBuffer: SourceBuffer | null;
    pendingChunks: ArrayBuffer[];
    ended: boolean;
    enqueued: boolean;
    visemeTimeline: VisemeFrame[];
    arkitFrames: ARKitFrame[] | undefined;
    durationMs: number;
    emotion: string;
    intensity: number;
  };
  const streamingMSERef = useRef<Map<number, StreamingMSEState>>(new Map());

  // Per-sentence sentence_start arrival time, used to measure MSE buffer-fill
  // latency: time from "browser receives sentence_start SSE" to "browser
  // receives first audio_chunk SSE". This is the delay UE5_BROADCAST_DELAY_MS
  // (server-side, default 180ms) is calibrated to compensate for. If the
  // measured value diverges from the configured delay by more than the
  // tolerance below, we log a console warning so the operator can retune.
  const sentenceStartTimingRef = useRef<Map<number, number>>(new Map());
  const SYNC_DELAY_TARGET_MS = 180;
  const SYNC_DELAY_TOLERANCE_MS = 80;

  function _mseSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const MS = (window as unknown as { MediaSource?: typeof MediaSource }).MediaSource;
    return !!MS && typeof MS.isTypeSupported === 'function' && MS.isTypeSupported('audio/mpeg');
  }

  function _drainSourceBufferQueue(state: StreamingMSEState) {
    if (!state.sourceBuffer || state.sourceBuffer.updating) return;
    if (state.pendingChunks.length === 0) {
      if (state.ended && state.mediaSource.readyState === 'open') {
        try { state.mediaSource.endOfStream(); } catch { /* already ended */ }
      }
      return;
    }
    const next = state.pendingChunks.shift()!;
    try {
      state.sourceBuffer.appendBuffer(next);
    } catch {
      // QuotaExceededError or InvalidStateError — disable streaming for this
      // sentence; the legacy sentence_end ``audio`` field will play it intact.
      state.pendingChunks.length = 0;
    }
  }

  function addMessage(role: 'ai' | 'user', text: string, highlight?: string): ChatMessage {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      text,
      highlight,
    };
    setMessages(prev => [...prev.slice(-19), msg]);
    return msg;
  }

  const silenceCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  // Voice watchdog. v0.5.3 user feedback: "It only shoots one sentence and
  // then it stops it doesn't listen". The loop SHOULD restart listening via
  // playNextInQueue + the stream-end branch, but if any state ref gets stuck
  // (isPlayingQueueRef stays true, audio.onended never fires, etc.) the
  // session silently hangs in 'speaking' or 'idle'. The watchdog polls every
  // 3s: if voice is active but nothing is playing AND the recorder isn't
  // recording AND it's been quiet for >12s, force-restart listening. Self-
  // heals any stuck state without rewriting the working loop.
  const lastVoiceActivityRef = useRef<number>(Date.now());
  const noteVoiceActivity = () => { lastVoiceActivityRef.current = Date.now(); };
  const voiceWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function startVoiceWatchdog() {
    if (voiceWatchdogRef.current) return; // already running
    voiceWatchdogRef.current = setInterval(() => {
      if (!isActiveRef.current) return;
      const elapsedMs = Date.now() - lastVoiceActivityRef.current;

      // v0.6.2: aggressive logging so we can see EXACTLY where loop hangs
      // even in production. console.error gets through any logger silencing.
      // Reduced idle threshold from 12s to 5s — feels like "1 second of
      // silence" to the user instead of 12.
      const idle = !isStreamingRef.current
        && !isPlayingQueueRef.current
        && audioQueueRef.current.length === 0
        && (mediaRecorderRef.current?.state !== 'recording');

      const stuckSpeaking = isPlayingQueueRef.current && elapsedMs > 15000;

      if ((idle && elapsedMs > 5000) || stuckSpeaking) {
        // eslint-disable-next-line no-console
        console.error('[voice-watchdog] RESCUE  ' + (stuckSpeaking ? 'STUCK in speaking' : 'idle stalled') + ' ' + elapsedMs + 'ms · queueLen=' + audioQueueRef.current.length + ' playing=' + isPlayingQueueRef.current + ' streaming=' + isStreamingRef.current + ' recState=' + (mediaRecorderRef.current?.state ?? 'none'));
        try {
          audioQueueRef.current.forEach((it) => { try { it.audio.pause(); it.audio.removeAttribute('src'); it.audio.load(); } catch { /* ignore */ } });
        } catch { /* ignore */ }
        audioQueueRef.current = [];
        isPlayingQueueRef.current = false;
        isStreamingRef.current = false;
        currentAudioRef.current = null;
        bridge.stopLipsync();
        lastVoiceActivityRef.current = Date.now();
        setOrbState('listening');
        startListeningRef.current?.();
      }
    }, 2000);
  }
  function stopVoiceWatchdog() {
    if (voiceWatchdogRef.current) {
      clearInterval(voiceWatchdogRef.current);
      voiceWatchdogRef.current = null;
    }
  }
  // True while the LLM SSE stream is still open. Sentences are spoken one at a
  // time, so the audio queue briefly empties BETWEEN sentences — we must not
  // treat that gap as "turn over" (which would flip to listening + open the
  // mic), or the orb/mic flicker rapidly mid-answer. Only conclude the turn
  // once this is false (stream finished) and the queue has drained.
  const isStreamingRef = useRef(false);

  const sendToLLMRef = useRef<((text: string) => Promise<void>) | undefined>(undefined);
  const startListeningRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const playNextInQueueRef = useRef<(() => void) | undefined>(undefined);
  const enqueueAudioRef = useRef<((base64: string, visemeTimeline: VisemeFrame[], arkitFrames: ARKitFrame[] | undefined, durationMs: number, emotion: string, intensity: number, sentenceIdx: number) => void) | undefined>(undefined);

  // ─── Audio queue ────────────────────────────────────────────────────────────

  // Proactive check-in is disabled: the avatar waits passively in 'listening'
  // for the user to speak or type, instead of nudging ("Si ešte tu?") after a
  // pause. Kept as a no-op so the call sites + cancel logic stay intact; to
  // re-enable, schedule sendToLLMRef.current?.('__silence_check__') here.
  function startSilenceCheckTimer() {
    cancelSilenceCheckTimer();
  }

  function cancelSilenceCheckTimer() {
    if (silenceCheckTimerRef.current) {
      clearTimeout(silenceCheckTimerRef.current);
      silenceCheckTimerRef.current = null;
    }
  }

  // ── Audio-reactive plumbing ─────────────────────────────────────────────────

  // Route a TTS audio element through the shared AnalyserNode so the orb can
  // pulsate with what's coming out of the speakers. Idempotent per element
  // (createMediaElementSource only works once per audio); subsequent calls are
  // no-ops. Browsers park AudioContexts that weren't created in a user gesture,
  // but the orb click that started the voice session counts so this just works.
  function routeAudioThroughAnalyser(audio: HTMLAudioElement) {
    try {
      if (!playbackCtxRef.current) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        playbackCtxRef.current = new Ctor();
      }
      const ctx = playbackCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      if (!analyserRef.current) {
        const a = ctx.createAnalyser();
        a.fftSize = 256;
        a.smoothingTimeConstant = 0.65;
        a.connect(ctx.destination);
        analyserRef.current = a;
        analyserBufRef.current = new Uint8Array(a.fftSize);
      }

      if (!sourceNodeMap.current.has(audio)) {
        const src = ctx.createMediaElementSource(audio);
        src.connect(analyserRef.current);
        sourceNodeMap.current.set(audio, src);
      }
      startAnalyserLoop();
    } catch {
      // Audio already connected or context error — fall back silently; the
      // orb will just sit at its state-driven breath without amplitude.
    }
  }

  function startAnalyserLoop() {
    if (analyserRafRef.current !== null) return;
    const tick = () => {
      const a = analyserRef.current;
      const buf = analyserBufRef.current;
      if (!a || !buf) { analyserRafRef.current = null; return; }
      a.getByteTimeDomainData(buf);
      // RMS of [-1..1] samples centered on 128.
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Slovak TTS RMS peaks around ~0.25; scale to a satisfying orb range.
      setAudioAmplitude(Math.min(1, rms * 3.5));
      analyserRafRef.current = requestAnimationFrame(tick);
    };
    analyserRafRef.current = requestAnimationFrame(tick);
  }

  function stopAnalyserLoop() {
    if (analyserRafRef.current !== null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    setAudioAmplitude(0);
  }

  function playNextInQueue() {
    // Voice session was ended (user clicked stop) — drop any pending audio
    // instead of starting it. Without this gate a queued audio element can
    // begin playing AFTER endSession() ran, because endSession clears the
    // queue but onended callbacks scheduled from before the click can still
    // invoke this function with race-condition items.
    if (!isActiveRef.current) {
      audioQueueRef.current.forEach((item) => {
        try { item.audio.pause(); item.audio.removeAttribute('src'); item.audio.load(); } catch {}
      });
      audioQueueRef.current = [];
      isPlayingQueueRef.current = false;
      return;
    }
    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      bridge.stopLipsync();
      // Mid-stream gap between sentences — keep the avatar in 'speaking' and
      // do NOT open the mic; the next sentence's audio is still on its way.
      // The turn is only concluded once the stream itself has finished.
      if (isStreamingRef.current) {
        // eslint-disable-next-line no-console
        console.log('[voice] queue empty, but stream still open — waiting for next sentence');
        return;
      }
      // eslint-disable-next-line no-console
      console.debug('[voice] queue empty + stream done — restarting listener  (active=' + isActiveRef.current + ')');
      noteVoiceActivity();
      setOrbState('listening');
      if (isActiveRef.current) {
        startListeningRef.current?.();
        startSilenceCheckTimer();
      }
      return;
    }
    isPlayingQueueRef.current = true;
    const item = audioQueueRef.current.shift()!;
    currentAudioRef.current = item.audio;
    setOrbState('speaking');
    bridge.sendEmotion(item.emotion);

    // Idempotent advance: ensures the chain always moves forward exactly once
    // per audio element. Prod Electron has been observed (v0.5.4 user report)
    // to silently drop `onended` on certain audio chunks — without this
    // safety the queue gets stuck with isPlayingQueueRef.current=true and
    // every restart path is blocked. We also fire a duration-based timer
    // that calls advance() if the natural callbacks haven't fired by then.
    let advanced = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    // v0.6.5: log advance reason so we can tell `onended` (good) from
    // `onerror` (decode/MSE failure) from `play().catch` (autoplay block /
    // src error) from safety-timeout (silent drop). Critical for diagnosing
    // the "advance fires silently on second turn" suspect (4).
    const advance = (reason: string = 'ended') => {
      if (advanced) return;
      advanced = true;
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      currentAudioRef.current = null;
      bridge.stopLipsync();
      console.debug('[voice] advance reason=' + reason + '  queueLen=' + audioQueueRef.current.length + '  streaming=' + isStreamingRef.current);
      playNextInQueueRef.current?.();
    };
    item.audio.onended = () => advance('ended');
    item.audio.onerror = () => advance('error');
    item.audio.onpause = () => {
      if (!item.audio.ended) {
        bridge.stopLipsync();
      }
    };
    // Safety timeout — advance even if onended/onerror never fire. v0.5.5
    // fix for the "one sentence then stops" production Electron bug:
    // some audio elements never fire onended (short audio, MSE preempt,
    // autoplay quirks). Without this every restart path stayed blocked.
    // v0.6.1: relaxed budget from durationMs + 3s to 2x duration (min 4s).
    // The +3s was too tight a margin for Pixel Streaming + lipsync rAF
    // — when audio is queued behind earlier audio still draining, the
    // effective playback start can lag the queue-shift by 1-2s, and the
    // +3s safety could fire mid-playback, prematurely advancing the queue.
    // 2x duration leaves real headroom; watchdog catches any stuck case.
    const safetyMs = Math.max(4000, item.durationMs * 2);
    safetyTimer = setTimeout(() => {
      if (!advanced) {
        // eslint-disable-next-line no-console
        console.warn('[voice] audio safety timeout fired after ' + safetyMs + 'ms — onended did NOT fire; force-advancing  (durationMs=' + item.durationMs + ')');
        advance('safety-timeout');
      }
    }, safetyMs);

    // audio.play() returns a Promise that resolves when the decoder is actually
    // producing samples — the true audio-start moment. Anchor the lipsync clock
    // here, not at queue-shift time, otherwise the rAF loop's startTime is set
    // 20-50ms before any sound reaches the user (mouth opens early).
    item.audio.play()
      .then(() => {
        if (item.arkitFrames && item.arkitFrames.length > 0) {
          bridge.startARKitLipsync(item.arkitFrames, item.durationMs, item.emotion, item.intensity, item.sentenceIdx);
        } else {
          bridge.startLipsync(item.visemeTimeline, item.durationMs, item.emotion, item.intensity, item.sentenceIdx);
        }
      })
      .catch((e: unknown) => {
        // v0.6.5: log the play rejection with what error+src we got. In
        // packaged Electron this can fire for autoplay-policy violations
        // (rare for media:audio), MSE decode failures, or src-revoked
        // MediaSource URLs on the second turn. Distinguishes Suspect 4.
        const msg = (e as { message?: string })?.message || String(e);
        const src = item.audio.src ? item.audio.src.slice(0, 48) : '(no src)';
        console.error('[voice] audio.play() REJECTED  src=' + src + '  err=' + msg, e);
        advance('play-reject');
      });
  }

  function enqueueAudio(base64: string, visemeTimeline: VisemeFrame[], arkitFrames: ARKitFrame[] | undefined, durationMs: number, emotion: string, intensity: number, sentenceIdx: number) {
    if (!base64) return;
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audio.muted = UE5_AUDIO;
    routeAudioThroughAnalyser(audio);
    audioQueueRef.current.push({ audio, visemeTimeline, arkitFrames, durationMs, emotion, intensity, sentenceIdx });
    if (!isPlayingQueueRef.current) playNextInQueueRef.current?.();
  }

  useEffect(() => {
    playNextInQueueRef.current = playNextInQueue;
    enqueueAudioRef.current = enqueueAudio;
  });

  // ─── Microphone + VAD ───────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (!isActiveRef.current) return;
    // v0.7.6 ROOT CAUSE FIX for runaway voice loop + dual chat-stream submit:
    // DO NOT open the microphone while audio is playing OR while a chat-stream
    // is still in flight. The prior code opened the mic immediately whenever
    // re-arm fired (after STT empty, after STT failed, after watchdog rescue,
    // after audio.onended). Result on the user's machine:
    //   1. AI's TTS plays through speakers
    //   2. Mic opens during AI speech
    //   3. Mic captures AI's own voice (acoustic echo)
    //   4. recorder.onstop → STT runs on AI speech → returns text OR empty
    //   5. If text → sendToLLM fires WHILE prior chat-stream still streaming
    //      → backend gets a second concurrent /chat/stream POST → two TTS
    //      streams → "2 zvuky pri TTS" exact match.
    //   6. If empty → 300 ms loop re-arms → step 2 → INFINITE LOOP, console
    //      floods with "[voice] STT empty — hallucination filter or silence"
    //      + "[voice] recorder.onstart fired" alternating forever.
    // Guard: if a turn is in flight OR audio is playing, defer re-arm. The
    // chat-stream's done branch (line ~994) + playNextInQueue's drained
    // branch will re-call startListening when it's safe to do so.
    if (isStreamingRef.current) {
      console.warn('[voice] startListening DEFERRED — chat-stream still in flight');
      return;
    }
    if (isPlayingQueueRef.current || audioQueueRef.current.length > 0 || currentAudioRef.current) {
      console.warn('[voice] startListening DEFERRED — audio still playing (queueLen=' + audioQueueRef.current.length + ', current=' + (currentAudioRef.current ? 'set' : 'null') + ')');
      return;
    }
    // v0.6.4 (prime voice-loop fix): also tear down prior MediaRecorder + AudioContext
    // before opening a fresh mic stream. In packaged Electron production the prior
    // turn's MediaRecorder.onstop may not have fully released the OS-level mic
    // device by the time we re-call getUserMedia, and the new request hangs or
    // rejects with NotReadableError. Previously the catch (line 507) silently
    // flipped isActiveRef=false and the session died with no log — symptom: "spoke
    // one sentence then orb stuck idle." We now log every failure mode and retry
    // transient ones instead of killing the session.
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('[voice] startListening: prior recorder.stop() threw', e);
      }
      mediaRecorderRef.current = null;
    }
    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close(); } catch (e) {
        console.warn('[voice] startListening: prior audioCtx.close() threw', e);
      }
      audioCtxRef.current = null;
    }
    // v0.6.5 (Suspect 5): noteVoiceActivity() used to fire HERE, before
    // getUserMedia. On a test machine where the second turn's getUserMedia
    // takes the 800 ms retry path, every retry would bump the activity
    // timestamp, masking the watchdog's 5-second idle threshold — so the
    // watchdog never tripped while the mic was actually closed. Moved the
    // bump to AFTER recorder.start() succeeds (below).
    setOrbState('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      // v0.6.5 (diagnostic): recorder.onstart fires when the device is REALLY
      // producing audio frames. If you see [voice] mic open but never see
      // [voice] recorder.onstart fired, the OS-level mic was acquired but the
      // device pipeline never started — usually means the prior turn's
      // recorder ghost is still holding the input. Critical signal for the
      // test machine voice loop investigation.
      recorder.onstart = () => console.debug('[voice] recorder.onstart fired  state=' + recorder.state);

      let firstDataLogged = false;
      recorder.ondataavailable = e => {
        if (!firstDataLogged && e.data.size > 0) {
          console.debug('[voice] first audio chunk  size=' + e.data.size);
          firstDataLogged = true;
        }
        if (e.data.size > 0) chunksRef.current.push(e.data);
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
        clearInterval(vadInterval);
        clearTimeout(safetyTimeout);
        // v0.6.4: explicitly disconnect graph nodes — under Electron's V8 these
        // can keep the stream's audio tracks pinned past audioCtx.close() and
        // block the next getUserMedia call.
        try { source.disconnect(); } catch { /* ignore */ }
        try { analyser.disconnect(); } catch { /* ignore */ }
        if (audioCtxRef.current === audioCtx) {
          audioCtx.close();
          audioCtxRef.current = null;
        }
        if (recorder.state === 'recording') recorder.stop();
      };

      const vadInterval = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);
        const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / dataArray.length);
        const elapsed = Date.now() - speechStart;
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now();
          if (silenceStart && Date.now() - silenceStart > SILENCE_MS && elapsed > MIN_SPEECH_MS) stopVAD();
        } else {
          silenceStart = null;
        }
      }, 40);

      const safetyTimeout = setTimeout(stopVAD, 15000);

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (!isActiveRef.current) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudioRef.current?.(blob);
      };

      recorder.start();
      console.debug('[voice] mic open (recorder.state=' + recorder.state + ')');
      // v0.6.5 (Suspect 5): bump activity NOW, after we know mic is really open.
      noteVoiceActivity();
    } catch (err) {
      // v0.6.4: surface the error and decide based on type. NotAllowedError
      // means the user denied permission — those are terminal, stop the
      // session. NotReadableError / AbortError / TimeoutError mean the OS-level
      // device is briefly unavailable — retry after backoff instead of dying.
      const name = (err as { name?: string })?.name || 'UnknownError';
      const message = (err as { message?: string })?.message || String(err);
      console.error('[voice] startListening: getUserMedia FAILED  name=' + name + '  msg=' + message);
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        console.error('[voice] mic permission denied — ending session');
        isActiveRef.current = false;
        setOrbState('idle');
        return;
      }
      // Transient: try once more after a backoff. If still failing, leave the
      // watchdog to either rescue or eventually transition to idle via its
      // poll loop (which already knows isActiveRef=true and no mic).
      if (isActiveRef.current) {
        console.warn('[voice] startListening: transient mic error — retrying in 800ms');
        setTimeout(() => { if (isActiveRef.current) startListeningRef.current?.(); }, 800);
      }
    }
  }, []);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const processAudioRef = useRef<((blob: Blob) => Promise<void>) | undefined>(undefined);

  // ─── STT ────────────────────────────────────────────────────────────────────

  async function processAudio(blob: Blob) {
    if (!isActiveRef.current) return;
    setOrbState('thinking');

    const controller = new AbortController();
    const sttTimeout = setTimeout(() => controller.abort(), 12000);

    try {
      const formData = new FormData();
      formData.append('audio', blob, 'audio.webm');
      formData.append('language', sttLanguageRef.current);
      if (conversationIdRef.current) formData.append('conversation_id', conversationIdRef.current);

      const sttRes = await fetch(`${API_BASE}/api/v1/stt/transcribe`, {
        method: 'POST',
        signal: controller.signal,
        body: formData,
      });

      clearTimeout(sttTimeout);

      if (!sttRes.ok) {
        console.error('[voice] STT non-OK  status=' + sttRes.status);
        // STT backend error — retry after short pause
        if (isActiveRef.current) setTimeout(() => startListeningRef.current?.(), 600);
        return;
      }

      const sttData = await sttRes.json();
      const userText = (sttData.text ?? '').trim();

      if (!userText) {
        console.warn('[voice] STT empty — hallucination filter or silence');
        // Empty or hallucination-filtered — retry after brief pause
        if (isActiveRef.current) setTimeout(() => startListeningRef.current?.(), 300);
        return;
      }

      console.debug('[voice] STT got text  len=' + userText.length);
      cancelSilenceCheckTimer();
      addMessage('user', userText);
      await sendToLLMRef.current?.(userText);

    } catch (err: unknown) {
      // v0.6.5 (Suspect 6): log the STT error so DevTools shows whether the
      // 12 s abort fired or whether fetch itself rejected (network error,
      // backend down, etc.). Without this the user-facing toast was the
      // ONLY signal and the loop just looped.
      const name = (err as { name?: string })?.name || 'UnknownError';
      const msg = (err as { message?: string })?.message || String(err);
      console.error('[voice] STT failed  name=' + name + '  msg=' + msg);
      clearTimeout(sttTimeout);
      onError?.('Rozpoznávanie reči zlyhalo. Skús hovoriť hlasnejšie alebo skontroluj mikrofón.');
      if (isActiveRef.current) setTimeout(() => startListeningRef.current?.(), 600);
    }
  }

  useEffect(() => {
    processAudioRef.current = processAudio;
  });

  // ─── LLM streaming ──────────────────────────────────────────────────────────

  async function sendToLLM(text: string) {
    if (!isActiveRef.current) return;
    setOrbState('thinking');

    // v0.7.4: HARD-STOP everything still playing from the previous turn before
    // we begin a new one. The previous code only cleared the ref MAPS — it
    // never paused or detached the underlying <audio> elements + their
    // attached MediaSource. Orphaned MSE <audio> elements kept playing in
    // parallel with the new turn's first sentence: exact match for the user
    // report "sometimes two voices play during the answer".
    //
    // Cascade: the orphan <audio> elements stayed wired to the shared
    // playback AudioContext analyser graph via createMediaElementSource.
    // After the next routeAudioThroughAnalyser the graph silently breaks
    // (createMediaElementSource may only be called once per element; the
    // catch at routeAudioThroughAnalyser swallows the SecurityError).
    // Subsequent audio elements decode + emit `ended` (so visemes still
    // broadcast to UE5 via /ws/avatar — lipsync looks fine) but have no
    // path to ctx.destination → user hears silence. Exact match for "then
    // voice stops working but lipsync continues."
    const hardStop = (audio: HTMLAudioElement | null | undefined) => {
      if (!audio) return;
      try {
        audio.muted = true;
        audio.volume = 0;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch { /* ignore */ }
    };
    hardStop(currentAudioRef.current);
    currentAudioRef.current = null;
    audioQueueRef.current.forEach((item) => hardStop(item.audio));
    streamingMSERef.current.forEach((state) => {
      try {
        if (state.mediaSource && state.mediaSource.readyState === 'open') {
          state.mediaSource.endOfStream();
        }
      } catch { /* ignore */ }
      hardStop(state.audio);
    });
    isPlayingQueueRef.current = false;

    // v0.7.6 ROOT CAUSE for "2 TTS pri TTS zacnu" in main shell:
    // ABORT the previous chat-stream fetch before starting a new one. Live
    // backend evidence (2026-05-30): two POSTs from different client ports
    // within milliseconds (::1:51922 + ::1:65339 at 20:11:54), each producing
    // its own TTS stream. The prior code at line 715 OVERWROTE chatAbortRef
    // without aborting the old controller — so the previous SSE reader kept
    // streaming chunks/sentence_end events that bypassed our hardStop above
    // (those audios are created AFTER hardStop runs). Two parallel
    // chat-streams = two TTS audio queues = "2 zvuky zacnu" exact match.
    //
    // Also abort any safety fetchTimeout the previous turn left hanging — a
    // leftover 45s timer would fire mid-new-turn and abort our new request.
    if (chatAbortRef.current) {
      try { chatAbortRef.current.abort(); } catch { /* ignore */ }
      chatAbortRef.current = null;
    }

    isStreamingRef.current = true;
    audioQueueRef.current = [];
    streamingBuffersRef.current.clear();
    streamingMSERef.current.clear();
    sentenceStartTimingRef.current.clear();
    const audioWasQueued = { value: false };

    const controller = new AbortController();
    chatAbortRef.current = controller;
    const fetchTimeout = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          conversation_id: conversationIdRef.current,
          knowledge_base: activeKbRef.current,
          tts_provider: ttsProviderRef.current,
          tts_voice: ttsVoiceRef.current,
          mode_id: modeIdRef.current,
        }),
      });

      clearTimeout(fetchTimeout);

      if (!res.ok || !res.body) throw new Error('stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullText = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Per-read stall timeout — if server stops sending, we don't hang forever
        const { done, value } = await readWithTimeout(reader, 15000);
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          // Session ended mid-stream — drop the remaining SSE events instead of
          // queueing more audio. Without this, sentence_start/audio_chunk events
          // already in the local buffer when endSession() ran would spawn fresh
          // MSE audio elements that play despite the user having clicked stop.
          if (!isActiveRef.current) break;
          const payload = line.slice(6);
          // v0.6.5 (PRIME voice-loop suspect 2): intercept the OpenAI-style [DONE]
          // sentinel and empty 'event: end' payload BEFORE JSON.parse. Backend
          // v0.6.4 added these to nudge Electron's net stack into closing the
          // SSE stream early. But our parser ran JSON.parse('[DONE]') → SyntaxError
          // → caught as a warn. That happened twice per turn (once for [DONE],
          // once for the empty payload after 'event: end\n'). On a slow test
          // machine the two warns interleaved with state transitions in ways
          // that could leave isStreamingRef stuck true → playNextInQueue's
          // queue-empty branch parks waiting for 'next sentence' → orb shows
          // listening but mic is closed → exact match for the user's symptom.
          if (payload === '[DONE]' || payload.trim() === '') continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === 'text') {
              fullText += event.delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'ai' && last.id.startsWith('streaming-')) {
                  return [...prev.slice(0, -1), { ...last, text: fullText }];
                }
                return [...prev, { id: `streaming-${Date.now()}`, role: 'ai' as const, text: fullText }];
              });
            } else if (event.type === 'sentence') {
              if (event.audio) audioWasQueued.value = true;
              enqueueAudioRef.current?.(
                event.audio,
                event.viseme_timeline ?? [],
                event.arkit_frames,
                event.duration_ms ?? 2000,
                event.emotion ?? 'neutral',
                event.intensity ?? 0.4,
                event.index ?? 0,
              );
            } else if (event.type === 'sentence_start') {
              sentenceStartTimingRef.current.set(event.index, performance.now());
              if (_mseSupported()) {
                const mediaSource = new MediaSource();
                const audio = new Audio();
                audio.muted = UE5_AUDIO;
                audio.src = URL.createObjectURL(mediaSource);
                routeAudioThroughAnalyser(audio);
                const state: StreamingMSEState = {
                  audio,
                  mediaSource,
                  sourceBuffer: null,
                  pendingChunks: [],
                  ended: false,
                  enqueued: false,
                  visemeTimeline: event.viseme_timeline ?? [],
                  arkitFrames: event.arkit_frames,
                  durationMs: event.duration_ms ?? 2000,
                  emotion: event.emotion ?? 'neutral',
                  intensity: event.intensity ?? 0.4,
                };
                mediaSource.addEventListener('sourceopen', () => {
                  try {
                    const sb = mediaSource.addSourceBuffer('audio/mpeg');
                    state.sourceBuffer = sb;
                    sb.addEventListener('updateend', () => _drainSourceBufferQueue(state));
                    _drainSourceBufferQueue(state);
                  } catch {
                    state.sourceBuffer = null;
                  }
                });
                streamingMSERef.current.set(event.index, state);
              } else {
                streamingBuffersRef.current.set(event.index, []);
              }
            } else if (event.type === 'audio_chunk') {
              const startTime = sentenceStartTimingRef.current.get(event.index);
              if (startTime !== undefined) {
                const fillMs = performance.now() - startTime;
                sentenceStartTimingRef.current.delete(event.index);
                const drift = Math.abs(fillMs - SYNC_DELAY_TARGET_MS);
                if (drift > SYNC_DELAY_TOLERANCE_MS) {
                  logger.warn('sync.mse-buffer-fill', {
                    sentence: event.index,
                    measuredMs: Math.round(fillMs),
                    targetMs: SYNC_DELAY_TARGET_MS,
                    driftMs: Math.round(drift),
                    suggestion: `Set backend UE5_BROADCAST_DELAY_MS=${Math.round(fillMs)} for tighter avatar-mouth sync on this network`,
                  });
                } else {
                  logger.debug('sync.mse-buffer-fill', {
                    sentence: event.index,
                    measuredMs: Math.round(fillMs),
                    targetMs: SYNC_DELAY_TARGET_MS,
                  });
                }
              }
              const mseState = streamingMSERef.current.get(event.index);
              if (mseState && event.audio) {
                const bin = atob(event.audio);
                const ab = new ArrayBuffer(bin.length);
                const view = new Uint8Array(ab);
                for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
                mseState.pendingChunks.push(ab);
                _drainSourceBufferQueue(mseState);
                if (!mseState.enqueued) {
                  mseState.enqueued = true;
                  audioWasQueued.value = true;
                  audioQueueRef.current.push({
                    audio: mseState.audio,
                    visemeTimeline: mseState.visemeTimeline,
                    arkitFrames: mseState.arkitFrames,
                    durationMs: mseState.durationMs,
                    emotion: mseState.emotion,
                    intensity: mseState.intensity,
                    sentenceIdx: event.index,
                  });
                  if (!isPlayingQueueRef.current) playNextInQueueRef.current?.();
                }
              } else {
                const buf = streamingBuffersRef.current.get(event.index);
                if (buf && event.audio) buf.push(event.audio);
              }
            } else if (event.type === 'sentence_end') {
              const mseState = streamingMSERef.current.get(event.index);
              if (mseState) {
                streamingMSERef.current.delete(event.index);
                mseState.ended = true;
                // Refine the queue item's lipsync data with audio-aligned
                // ARKit/viseme frames from sentence_end (may differ from the
                // text-derived frames captured at sentence_start). Only
                // matters if the item hasn't started playing yet.
                if (mseState.enqueued) {
                  const queued = audioQueueRef.current.find(q => q.audio === mseState.audio);
                  if (queued) {
                    queued.visemeTimeline = event.viseme_timeline ?? queued.visemeTimeline;
                    queued.arkitFrames = event.arkit_frames ?? queued.arkitFrames;
                    queued.durationMs = event.duration_ms ?? queued.durationMs;
                  }
                }
                _drainSourceBufferQueue(mseState);
                if (!mseState.enqueued && event.audio) {
                  enqueueAudioRef.current?.(
                    event.audio,
                    event.viseme_timeline ?? [],
                    event.arkit_frames,
                    event.duration_ms ?? 2000,
                    event.emotion ?? 'neutral',
                    event.intensity ?? 0.4,
                    event.index ?? 0,
                  );
                  audioWasQueued.value = true;
                }
              } else {
                const chunks = streamingBuffersRef.current.get(event.index) ?? [];
                streamingBuffersRef.current.delete(event.index);
                // sentence_end carries a backwards-compat full-audio field; prefer
                // it when present (one base64 decode beats N tiny ones and is
                // bit-identical). Falls back to concatenating chunks when only
                // the streaming protocol fired (e.g. future MediaSource client).
                const fullAudio = event.audio || chunks.join('');
                if (fullAudio) audioWasQueued.value = true;
                enqueueAudioRef.current?.(
                  fullAudio,
                  event.viseme_timeline ?? [],
                  event.arkit_frames,
                  event.duration_ms ?? 2000,
                  event.emotion ?? 'neutral',
                  event.intensity ?? 0.4,
                  event.index ?? 0,
                );
              }
            } else if (event.type === 'done') {
              // Sanity check: accumulated SSE deltas should equal backend's
              // full_text. If they don't, voice spoke content that never
              // reached chat (or vice versa) — keep the longer one so the
              // user always sees ≥ what they heard, and log the gap.
              const backendFull = typeof event.full_text === 'string' ? event.full_text : '';
              const chatFull = fullText;
              const winner = backendFull.length >= chatFull.length ? backendFull : chatFull;
              if (backendFull && backendFull !== chatFull) {
                logger.warn('sse.text-mismatch', {
                  chatChars: chatFull.length,
                  backendChars: backendFull.length,
                  deltaChars: backendFull.length - chatFull.length,
                  chatTail: chatFull.slice(-80),
                  backendTail: backendFull.slice(-80),
                });
              }
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'ai') {
                  return [...prev.slice(0, -1), { ...last, id: `ai-${Date.now()}`, text: winner || last.text }];
                }
                return prev;
              });
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (err) {
            // Don't crash the loop on a malformed event, but DO log it —
            // silently swallowing was hiding an "audio plays past chat"
            // bug because some text deltas were being parse-failed.
            logger.warn('sse.parse-failed', {
              line: line.slice(0, 200),
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Stream finished. It's now safe to conclude the turn when nothing is
      // left to play — either TTS produced no audio, or all of it already
      // drained while the stream was still open. If audio is still playing,
      // playNextInQueue will conclude the turn when the queue empties (now
      // that isStreamingRef is false).
      isStreamingRef.current = false;
      // eslint-disable-next-line no-console
      console.debug('[voice] stream END  (queueLen=' + audioQueueRef.current.length + '  playing=' + isPlayingQueueRef.current + '  active=' + isActiveRef.current + ')');
      noteVoiceActivity();
      // W2: a successful turn drains any sticky banner. We do NOT clear it
      // on stream START — only on success — so a user who retries and gets
      // another failure keeps seeing the warning.
      setPersistentError(null);
      if (isActiveRef.current && !isPlayingQueueRef.current && audioQueueRef.current.length === 0) {
        // eslint-disable-next-line no-console
        console.log('[voice] stream END: queue already drained — restart listener directly');
        setOrbState('listening');
        setTimeout(() => startListeningRef.current?.(), 300);
      }

    } catch (err) {
      clearTimeout(fetchTimeout);
      isStreamingRef.current = false;
      audioQueueRef.current = [];
      streamingBuffersRef.current.clear();
      streamingMSERef.current.clear();
      sentenceStartTimingRef.current.clear();
      isPlayingQueueRef.current = false;
      bridge.stopLipsync();
      const stalled = err instanceof Error && err.message === 'stream stalled';
      const msg = stalled
        ? 'LLM neodpovedal včas — skús to znova alebo prepni na iný model v nastaveniach.'
        : 'Pripojenie k AI zlyhalo. Skontroluj či backend beží.';
      // W2: also park a persistent (sticky) version on the hook so the main
      // shell can render a Nudge banner that survives the transient toast.
      // Phrasing is softer than the toast — the toast is "what just happened",
      // the banner is "what state we're in until the next reply works".
      const persistent = stalled
        ? 'AI odpovedala pomalšie, než som čakal'
        : 'Stratil som spojenie s backendom';
      setPersistentError(persistent);
      onError?.(msg);
      if (isActiveRef.current) {
        setOrbState('listening');
        setTimeout(() => startListeningRef.current?.(), 400);
      }
    }
  }

  useEffect(() => {
    sendToLLMRef.current = sendToLLM;
  });

  // ─── Session lifecycle ───────────────────────────────────────────────────────

  async function ensureConversation(): Promise<void> {
    if (conversationIdRef.current) return;
    const userId = getPersistentUserId();
    const fallbackId = crypto.randomUUID();
    conversationIdRef.current = fallbackId;
    try {
      const res = await fetch(`${API_BASE}/api/v1/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        conversationIdRef.current = data.conversation_id ?? data.id ?? fallbackId;
        setSessionTitle(data.title ?? 'Voice session');
      }
    } catch { /* backend offline — use fallback id */ }
    if (typeof window !== 'undefined') {
      localStorage.setItem(CONV_ID_KEY, conversationIdRef.current!);
    }
  }

  const startSession = useCallback(async () => {
    isActiveRef.current = true;
    noteVoiceActivity();
    startVoiceWatchdog();
    // eslint-disable-next-line no-console
    console.debug('[voice] session START');
    await ensureConversation();
    // Greeting goes through LLM — natural each time, follows system prompt
    await sendToLLMRef.current?.('__greeting__');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const endSession = useCallback(() => {
    isActiveRef.current = false;
    stopVoiceWatchdog();
    // eslint-disable-next-line no-console
    console.debug('[voice] session END');
    cancelSilenceCheckTimer();

    // 1. Stop the backend stream + tell UE5 to close its mouth.
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    fetch(`${API_BASE}/api/v1/avatar/stop`, { method: 'POST' }).catch(() => {});

    // 2. Stop the lipsync rAF loop (sends one final isSpeaking=false to UE5).
    bridge.stopLipsync();

    // 3. Hard-kill every audio element. Order matters: mute first so any sample
    //    already past the decoder is silenced this tick, then detach the source
    //    so the buffer can't continue playing. pause() alone leaves up to ~500ms
    //    of already-decoded PCM ringing out — that's the residual the user
    //    described as "still speaks after I stop".
    const hardStop = (audio: HTMLAudioElement | null | undefined) => {
      if (!audio) return;
      try {
        audio.muted = true;
        audio.volume = 0;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {}
    };

    hardStop(currentAudioRef.current);
    currentAudioRef.current = null;

    // Queued-but-not-yet-playing items
    audioQueueRef.current.forEach((item) => hardStop(item.audio));
    audioQueueRef.current = [];

    // Streaming MediaSource sessions (these can keep playing via their internal
    // SourceBuffer even after pause() — must call endOfStream() AND nuke src).
    streamingMSERef.current.forEach((state) => {
      try {
        if (state.mediaSource && state.mediaSource.readyState === 'open') {
          state.mediaSource.endOfStream();
        }
      } catch {}
      hardStop(state.audio);
    });
    streamingMSERef.current.clear();
    streamingBuffersRef.current.clear();
    sentenceStartTimingRef.current.clear();
    isPlayingQueueRef.current = false;
    isStreamingRef.current = false;

    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }

    // Audio-reactive: stop the analyser loop, drop amplitude to 0, and close
    // the playback AudioContext so the next session starts with a clean slate.
    stopAnalyserLoop();
    if (playbackCtxRef.current) {
      try { playbackCtxRef.current.close(); } catch { /* already closed */ }
      playbackCtxRef.current = null;
      analyserRef.current = null;
      analyserBufRef.current = null;
      sourceNodeMap.current = new WeakMap();
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (conversationIdRef.current) {
      api.endConversation(conversationIdRef.current).catch(() => {});
    }
    setOrbState('idle');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ttsProviderRef.current = ttsProvider; }, [ttsProvider]);
  useEffect(() => { ttsVoiceRef.current = ttsVoice; }, [ttsVoice]);
  useEffect(() => { sttModelRef.current = sttModel; }, [sttModel]);
  useEffect(() => { modeIdRef.current = modeId; }, [modeId]);
  useEffect(() => { sttLanguageRef.current = sttLanguage; }, [sttLanguage]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isActiveRef.current) endSession();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [endSession]);

  useEffect(() => {
    bridge.sendState(orbState);
  }, [orbState, bridge.sendState]);

  // ─── Restore session on mount ────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isNewSession) {
      localStorage.removeItem(CONV_ID_KEY);
      return;
    }
    // v0.7.7: fresh-launch detection via sessionStorage marker.
    // sessionStorage survives page reload (F5, route navigation) but NOT
    // window close + reopen — exactly what we need to distinguish
    // "user re-installed and re-launched the EXE" (fresh, start new
    // conversation) from "user navigated within the SPA" (resume).
    //
    // Without this, every fresh EXE launch auto-restored the most recent
    // conversation from edututor_conv_id, making it look like the user
    // never closed the app. Users expected a clean slate on relaunch.
    // History rail still exposes prior conversations on demand.
    const SESSION_ALIVE_KEY = 'edututor_session_alive';
    const isFreshLaunch = !sessionStorage.getItem(SESSION_ALIVE_KEY);
    sessionStorage.setItem(SESSION_ALIVE_KEY, '1');
    if (isFreshLaunch) {
      localStorage.removeItem(CONV_ID_KEY);
      return;
    }
    const savedId = localStorage.getItem(CONV_ID_KEY);
    if (!savedId) return;

    conversationIdRef.current = savedId;
    fetch(`${API_BASE}/api/v1/conversations/${savedId}/messages`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.messages?.length) return;
        setMessages(
          data.messages.map((m: { role: string; content: string }, i: number) => ({
            id: `restored-${i}`,
            role: m.role === 'assistant' ? 'ai' as const : 'user' as const,
            text: m.content,
          }))
        );
        if (data.title) setSessionTitle(data.title);
      })
      .catch(() => { /* backend offline */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Knowledge base ──────────────────────────────────────────────────────────

  const setActiveKb = useCallback((name: string | undefined) => {
    activeKbRef.current = name;
    setActiveKbState(name);
    if (typeof window !== 'undefined') {
      if (name) localStorage.setItem('edututor_active_kb', name);
      else localStorage.removeItem('edututor_active_kb');
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? (localStorage.getItem('edututor_active_kb') ?? undefined)
      : undefined;
    activeKbRef.current = saved;
    setActiveKbState(saved);

    function onStorage(e: StorageEvent) {
      if (e.key === 'edututor_active_kb') {
        const val = e.newValue ?? undefined;
        activeKbRef.current = val;
        setActiveKbState(val);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ─── Public interface ────────────────────────────────────────────────────────

  const handleOrbClick = useCallback(() => {
    if (orbState === 'idle') {
      startSession();
    } else {
      endSession();
    }
  }, [orbState, startSession, endSession]);

  async function sendTextMessage(text: string) {
    if (!text.trim()) return;
    if (!isActiveRef.current) isActiveRef.current = true;
    await ensureConversation();
    addMessage('user', text);
    await sendToLLMRef.current?.(text);
  }

  return {
    orbState, messages, sessionTitle, handleOrbClick, sendTextMessage, activeKb, setActiveKb,
    // W2 additions
    persistentError,
    clearPersistentError: () => setPersistentError(null),
  };
}
