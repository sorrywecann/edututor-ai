// core/src/lib/ue5-bridge/validation.ts
import type { AvatarCommand, SlovakViseme, UE5Emotion } from './types';

const VALID_VISEMES: ReadonlySet<SlovakViseme> = new Set([
  'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS',
  'nn', 'RR', 'aa', 'E', 'ih', 'oh', 'ou',
  'ww', 'uw', 'sil',
]);

const VALID_EMOTIONS: ReadonlySet<UE5Emotion> = new Set([
  'neutral', 'joy', 'surprise', 'sadness',
  'encouraging_mild', 'proud', 'patient',
  'curious', 'thinking_deep',
]);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Validates and sanitizes an AvatarCommand before sending to UE5.
 * Returns null if the command is unrecoverable; otherwise returns a sanitized copy.
 * Logs a warning when fixing common issues (NaN, out-of-range, unknown viseme).
 */
export function validateAvatarCommand(cmd: AvatarCommand): AvatarCommand | null {
  // Required: emotion
  if (!VALID_EMOTIONS.has(cmd.emotion)) {
    console.warn('[UE5Bridge.validation] unknown emotion', cmd.emotion, '→ neutral');
    cmd = { ...cmd, emotion: 'neutral' };
  }

  // Required: intensity (finite, clamped 0..1)
  if (!isFiniteNumber(cmd.intensity)) {
    console.warn('[UE5Bridge.validation] non-finite intensity → 0.4');
    cmd = { ...cmd, intensity: 0.4 };
  } else if (cmd.intensity < 0 || cmd.intensity > 1) {
    cmd = { ...cmd, intensity: clamp01(cmd.intensity) };
  }

  // Required: isSpeaking
  if (typeof cmd.isSpeaking !== 'boolean') {
    return null;
  }

  // Required: visemes (non-empty, each with valid viseme + finite weight)
  if (!Array.isArray(cmd.visemes) || cmd.visemes.length === 0) {
    cmd = { ...cmd, visemes: [{ viseme: 'sil', weight: 1.0 }] };
  } else {
    const cleanVisemes = cmd.visemes
      .filter(v => v && VALID_VISEMES.has(v.viseme) && isFiniteNumber(v.weight))
      .map(v => ({ viseme: v.viseme, weight: clamp01(v.weight) }));
    if (cleanVisemes.length === 0) {
      cmd = { ...cmd, visemes: [{ viseme: 'sil', weight: 1.0 }] };
    } else {
      cmd = { ...cmd, visemes: cleanVisemes };
    }
  }

  // Optional: blink, eyebrowsUpDown, eyebrowsSqueeze — clamp if present
  if (cmd.blink !== undefined && isFiniteNumber(cmd.blink)) {
    cmd = { ...cmd, blink: clamp01(cmd.blink) };
  }
  if (cmd.eyebrowsUpDown !== undefined && isFiniteNumber(cmd.eyebrowsUpDown)) {
    const v = cmd.eyebrowsUpDown;
    cmd = { ...cmd, eyebrowsUpDown: v < -1 ? -1 : v > 1 ? 1 : v };
  }
  if (cmd.eyebrowsSqueeze !== undefined && isFiniteNumber(cmd.eyebrowsSqueeze)) {
    cmd = { ...cmd, eyebrowsSqueeze: clamp01(cmd.eyebrowsSqueeze) };
  }

  // Optional: audioPositionMs, sentenceIdx — must be finite if present
  if (cmd.audioPositionMs !== undefined && !isFiniteNumber(cmd.audioPositionMs)) {
    const { audioPositionMs, ...rest } = cmd;
    cmd = rest as AvatarCommand;
  }
  if (cmd.sentenceIdx !== undefined && !isFiniteNumber(cmd.sentenceIdx)) {
    const { sentenceIdx, ...rest } = cmd;
    cmd = rest as AvatarCommand;
  }

  return cmd;
}
