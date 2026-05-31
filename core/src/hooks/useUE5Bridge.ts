// core/src/hooks/useUE5Bridge.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ue5Bridge } from '@/lib/ue5-bridge';
import type { VisemeFrame, ARKitFrame, UE5Emotion, AvatarCommand } from '@/lib/ue5-bridge';
import { AutoBlink } from '@/lib/ue5-bridge/autoBlink';
import type { OrbState } from '@/types/orb';
import { logger } from '@/lib/logger';

// Internal emotion labels → UE5 Blueprint state names
// New emotions pass through directly — Blueprint handles graceful fallback
const EMOTION_TO_UE5: Record<string, UE5Emotion> = {
  neutral:          'neutral',
  celebrating:      'joy',
  proud:            'proud',
  encouraging_mild: 'encouraging_mild',
  correcting:       'sadness',
  patient:          'patient',
  curious:          'curious',
  thinking_deep:    'thinking_deep',
  surprise:         'surprise',
};

const EMOTION_INTENSITY: Record<string, number> = {
  neutral:          0.4,
  celebrating:      0.9,
  proud:            0.8,
  encouraging_mild: 0.62,
  correcting:       0.72,
  patient:          0.58,
  curious:          0.68,
  thinking_deep:    0.75,
  surprise:         0.65,
};

const _warnedEmotions = new Set<string>();
function mapEmotion(label: string): UE5Emotion {
  const mapped = EMOTION_TO_UE5[label];
  if (mapped) return mapped;
  if (!_warnedEmotions.has(label)) {
    logger.warn('UE5Bridge.emotion', `unknown emotion '${label}' → neutral`);
    _warnedEmotions.add(label);
  }
  return 'neutral';
}

export function useUE5Bridge() {
  const rafRef = useRef<number>(0);
  const autoBlinkRef = useRef(new AutoBlink());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentEmotionRef = useRef<string>('neutral');
  const currentIntensityRef = useRef<number>(0.4);

  useEffect(() => {
    ue5Bridge.init();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ue5Bridge.disconnect();
    };
  }, []);

  /** Call when AI response arrives — sets expression before audio starts */
  const sendEmotion = useCallback((internalLabel: string) => {
    currentEmotionRef.current = internalLabel;
    currentIntensityRef.current = EMOTION_INTENSITY[internalLabel] ?? 0.4;
    ue5Bridge.sendCommand({
      emotion: mapEmotion(internalLabel),
      intensity: currentIntensityRef.current,
      isSpeaking: false,
      visemes: [{ viseme: 'sil', weight: 1.0 }],
      blink: 0,
    });
  }, []);

  /** Call on each orbState transition so avatar reflects session state */
  const sendState = useCallback((orbState: OrbState) => {
    const command: AvatarCommand = {
      emotion: mapEmotion(currentEmotionRef.current),
      intensity: currentIntensityRef.current,
      isSpeaking: orbState === 'speaking',
      visemes: [{ viseme: 'sil', weight: 1.0 }],
      blink: 0,
    };
    ue5Bridge.sendCommand(command);
  }, []);

  /**
   * Drive lipsync via AudioContext clock + rAF loop.
   * Uses AudioContext.currentTime (locked to audio device) for <50ms sync accuracy.
   * Frames are dense (8ms intervals) — O(1) index lookup instead of linear search.
   */
  const startLipsync = useCallback((
    timeline: VisemeFrame[],
    totalDurationMs: number,
    emotionLabel: string,
    intensity: number,
    sentenceIdx: number = 0,
  ) => {
    cancelAnimationFrame(rafRef.current);
    autoBlinkRef.current.reset();

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      try {
        audioCtxRef.current = new AudioContext();
      } catch (err) {
        logger.error('UE5Bridge.audio', `AudioContext creation failed: ${err}`);
        return; // No fallback possible — abort lipsync
      }
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      // Browser blocked autoplay — try to resume. May still fail if no user gesture.
      ctx.resume().catch(() => {
        logger.warn('UE5Bridge.audio', 'AudioContext suspended, lipsync timing may drift');
      });
    }
    const startTime = ctx.currentTime;
    const ue5Emotion = mapEmotion(emotionLabel);
    let frameStepMs = 40; // safe default
    if (timeline.length > 1) {
      const step = timeline[1].start_ms - timeline[0].start_ms;
      if (step > 0 && step < 200) {
        frameStepMs = step;
      } else {
        logger.warn('UE5Bridge.lipsync', `invalid frame step ${step}ms, using 40ms default`);
      }
    }

    function tick() {
      try {
        const currentMs = (ctx.currentTime - startTime) * 1000;
        const idx = Math.min(
          Math.floor(currentMs / frameStepMs),
          timeline.length - 1,
        );
        const activeFrame = idx >= 0 ? timeline[idx] : undefined;
        const blink = autoBlinkRef.current.getCurrentWeight(ctx.currentTime);

        ue5Bridge.sendCommand({
          emotion: ue5Emotion,
          intensity,
          isSpeaking: true,
          visemes: activeFrame
            ? [{ viseme: activeFrame.viseme, weight: activeFrame.weight }]
            : [{ viseme: 'sil', weight: 1.0 }],
          blink,
          audioPositionMs: Math.round(currentMs),
          sentenceIdx,
        });

        if (currentMs < totalDurationMs) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          stopLipsync();
        }
      } catch (err) {
        logger.error('UE5Bridge.lipsync', `tick failed: ${err instanceof Error ? err.message : String(err)}`);
        stopLipsync();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startARKitLipsync = useCallback((
    arkitFrames: ARKitFrame[],
    totalDurationMs: number,
    emotionLabel: string,
    intensity: number,
    sentenceIdx: number = 0,
  ) => {
    cancelAnimationFrame(rafRef.current);
    autoBlinkRef.current.reset();

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      try {
        audioCtxRef.current = new AudioContext();
      } catch (err) {
        logger.error('UE5Bridge.audio', `AudioContext creation failed: ${err}`);
        return; // No fallback possible — abort lipsync
      }
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      // Browser blocked autoplay — try to resume. May still fail if no user gesture.
      ctx.resume().catch(() => {
        logger.warn('UE5Bridge.audio', 'AudioContext suspended, lipsync timing may drift');
      });
    }
    const startTime = ctx.currentTime;
    const ue5Emotion = mapEmotion(emotionLabel);

    // Pre-compute frame step from first two frames (index math instead of find())
    let frameStepMs = 40;
    if (arkitFrames.length > 1) {
      const step = arkitFrames[1].start_ms - arkitFrames[0].start_ms;
      if (step > 0 && step < 200) frameStepMs = step;
    }

    function tick() {
      try {
        const currentMs = (ctx.currentTime - startTime) * 1000;
        const idx = Math.min(
          Math.floor(currentMs / frameStepMs),
          arkitFrames.length - 1,
        );
        const activeFrame = idx >= 0 ? arkitFrames[idx] : undefined;
        const blink = autoBlinkRef.current.getCurrentWeight(ctx.currentTime);

        ue5Bridge.sendCommand({
          emotion: ue5Emotion,
          intensity,
          isSpeaking: true,
          visemes: [{ viseme: 'sil', weight: 1.0 }],
          arkit: activeFrame?.arkit,
          blink,
          audioPositionMs: Math.round(currentMs),
          sentenceIdx,
        });

        if (currentMs < totalDurationMs) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          stopLipsync();
        }
      } catch (err) {
        logger.error('UE5Bridge.lipsync-arkit', `tick failed: ${err instanceof Error ? err.message : String(err)}`);
        stopLipsync();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopLipsync = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const blink = autoBlinkRef.current.getCurrentWeight(
      audioCtxRef.current?.currentTime ?? 0,
    );
    ue5Bridge.sendCommand({
      emotion: mapEmotion(currentEmotionRef.current),
      intensity: currentIntensityRef.current,
      isSpeaking: false,
      visemes: [{ viseme: 'sil', weight: 1.0 }],
      blink,
    });
  }, []);

  return {
    isConnected: ue5Bridge.isConnected,
    mode: ue5Bridge.mode,
    sendEmotion,
    sendState,
    startLipsync,
    startARKitLipsync,
    stopLipsync,
  };
}
