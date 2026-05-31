// core/src/lib/ue5-bridge/MockAdapter.ts
import type { AvatarCommand, UE5Message, IAdapter } from './types';

export class MockAdapter implements IAdapter {
  private messageHandler: ((msg: UE5Message) => void) | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  sendCommand(command: AvatarCommand): void {
    console.log(
      '[UE5Bridge MOCK]',
      `emotion=${command.emotion}(${command.intensity.toFixed(2)})`,
      `speaking=${command.isSpeaking}`,
      `viseme=${command.visemes[0]?.viseme ?? 'sil'}`,
      command.blink !== undefined ? `blink=${command.blink.toFixed(2)}` : '',
    );
  }

  onMessage(handler: (msg: UE5Message) => void): void {
    this.messageHandler = handler;
    // Simulate UE5 avatar_ready after 500ms
    this.readyTimer = setTimeout(() => {
      handler({ type: 'avatar_ready', capabilities: ['viseme', 'emotion', 'state'] });
    }, 500);
  }

  disconnect(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.messageHandler = null;
  }

  onConnectionChange(handler: (connected: boolean) => void): void {
    setTimeout(() => handler(true), 500);
  }
}
