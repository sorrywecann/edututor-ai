// core/src/lib/ue5-bridge/UEWebBrowserAdapter.ts
import type { AvatarCommand, UE5Message, IAdapter } from './types';

// UE5 Web Browser Widget injects this global
interface UEWindow {
  ue?: {
    interface?: {
      broadcast: (channel: string, data: string) => void;
    };
  };
}

export class UEWebBrowserAdapter implements IAdapter {
  private windowListener: ((event: MessageEvent) => void) | null = null;

  sendCommand(command: AvatarCommand): void {
    const ue = (window as unknown as UEWindow).ue;
    if (ue?.interface?.broadcast) {
      ue.interface.broadcast('avatarCommand', JSON.stringify(command));
    }
  }

  onMessage(handler: (msg: UE5Message) => void): void {
    this.windowListener = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data) as UE5Message;
        if (msg.type === 'avatar_ready' || msg.type === 'speech_complete') {
          handler(msg);
        }
      } catch {
        // Ignore non-JSON messages from other sources
      }
    };
    window.addEventListener('message', this.windowListener);
  }

  disconnect(): void {
    if (this.windowListener) {
      window.removeEventListener('message', this.windowListener);
      this.windowListener = null;
    }
  }

  onConnectionChange(handler: (connected: boolean) => void): void {
    handler(true);
  }
}
