// core/src/lib/ue5-bridge/types.ts

export type SlovakViseme =
  | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH' | 'SS'
  | 'nn' | 'RR' | 'aa' | 'E'  | 'ih' | 'oh' | 'ou'
  | 'ww' | 'uw' | 'sil';

// Blueprint emotion state names — sent as-is to UE5
// New emotions (encouraging_mild, proud, patient, curious, thinking_deep)
// map to their own Blueprint animation layers when the artist builds them.
// Until then, Blueprint silently falls back — no crash.
export type UE5Emotion =
  | 'neutral'
  | 'joy'
  | 'surprise'
  | 'sadness'
  | 'encouraging_mild'
  | 'proud'
  | 'patient'
  | 'curious'
  | 'thinking_deep';

// Internal labels from the backend emotion detector (9 states)
export type InternalEmotion =
  | 'neutral'
  | 'celebrating'
  | 'proud'
  | 'encouraging_mild'
  | 'correcting'
  | 'patient'
  | 'curious'
  | 'thinking_deep'
  | 'surprise';

export type AdapterMode = 'web-browser' | 'pixel-streaming' | 'ws-server' | 'mock' | 'none';

export interface ARKitChannels {
  [channel: string]: number;
}

export interface ARKitFrame {
  start_ms: number;
  duration_ms: number;
  arkit: ARKitChannels;
}

export interface AvatarCommand {
  emotion: UE5Emotion;
  intensity: number;       // 0.0–1.0
  isSpeaking: boolean;
  visemes: Array<{ viseme: SlovakViseme; weight: number }>;
  arkit?: ARKitChannels;
  blink?: number;          // 0.0–1.0 → eyeBlinkLeft + eyeBlinkRight
  eyebrowsUpDown?: number; // -1.0–1.0 → Eyebrows_Up_Down
  eyebrowsSqueeze?: number;// 0.0–1.0 → Eyebrows_Squeeze
  // v4.0 additive: audio playback clock for UE5 viseme lookup. Browser
  // sends its AudioContext.currentTime (ms since lipsync start) per rAF
  // tick so UE5 can `floor(audioPositionMs / 8)` to find the active
  // viseme in viseme_timeline instead of self-timing from receipt time.
  // Both fields are present together when isSpeaking; absent in idle/
  // emotion/state frames so v2/v2.1/v3 Blueprints see byte-identical
  // traffic when this feature is unused.
  audioPositionMs?: number;
  sentenceIdx?: number;
}

export interface VisemeFrame {
  viseme: SlovakViseme;
  weight: number;
  start_ms: number;
  duration_ms: number;
}

export interface UE5Message {
  type: 'avatar_ready' | 'speech_complete';
  capabilities?: string[];
}

export interface IAdapter {
  sendCommand(command: AvatarCommand): void;
  onMessage(handler: (msg: UE5Message) => void): void;
  disconnect(): void;
  onConnectionChange?(handler: (connected: boolean) => void): void;
}
