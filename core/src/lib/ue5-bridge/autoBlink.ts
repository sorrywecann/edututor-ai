// core/src/lib/ue5-bridge/autoBlink.ts

export class AutoBlink {
  private nextBlinkTime = 0;       // AudioContext time when next blink starts
  private blinkStartTime = -1;     // -1 = not blinking
  private readonly duration = 0.15; // 150ms

  /**
   * Call every animation frame with the current AudioContext time.
   * Returns a weight value 0–1 to use as Blink_Both.
   */
  getCurrentWeight(audioCtxTime: number): number {
    // Schedule the first blink
    if (this.nextBlinkTime === 0) {
      this.nextBlinkTime = audioCtxTime + 2 + Math.random() * 2;
    }

    // Trigger a new blink when scheduled
    if (audioCtxTime >= this.nextBlinkTime && this.blinkStartTime < 0) {
      this.blinkStartTime = audioCtxTime;
      this.nextBlinkTime = audioCtxTime + 3 + Math.random() * 3; // next in 3–6s
    }

    // Return triangle wave weight during blink
    if (this.blinkStartTime >= 0) {
      const elapsed = audioCtxTime - this.blinkStartTime;
      if (elapsed < this.duration) {
        const t = elapsed / this.duration;
        return t < 0.5 ? t * 2 : (1 - t) * 2; // 0→1→0
      }
      this.blinkStartTime = -1; // blink complete
    }

    return 0;
  }

  reset(): void {
    this.blinkStartTime = -1;
    this.nextBlinkTime = 0;
  }
}
