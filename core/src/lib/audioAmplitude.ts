// audioAmplitude — a tiny shared signal so the speaking orb pulsates with
// the actual audio that's coming out of the speakers.
//
// The voice session hook (useVoiceSession) routes every TTS audio element it
// plays through a Web Audio AnalyserNode and writes the live RMS amplitude
// (0..1) here on every rAF tick. The orbs (ChamberOrb today, OrbAvatar later)
// read it in their own rAF loops — no React state, no re-renders, just a
// number that's always current.
//
// Why a module-level let instead of a context: the orb already draws in a
// requestAnimationFrame loop; reading a getter once per frame is free, but a
// context value flowing through React state would re-render the orb 60 times
// a second. This way we get the live signal with zero render cost.

let _amplitude = 0;

/** Write the current audio amplitude. Called by useVoiceSession's analyser
 *  loop. Values are clamped to 0..1. */
export function setAudioAmplitude(v: number): void {
  if (!Number.isFinite(v)) return;
  _amplitude = v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Read the latest audio amplitude (0..1). Returns 0 when nothing is playing. */
export function getAudioAmplitude(): number {
  return _amplitude;
}
