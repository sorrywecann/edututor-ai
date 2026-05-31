// core/src/lib/ue5-bridge/PixelStreamingAdapter.ts
import type { AvatarCommand, UE5Message, IAdapter } from './types';

export class PixelStreamingAdapter implements IAdapter {
  private messageHandler: ((msg: UE5Message) => void) | null = null;
  private commandQueue: string[] = [];
  private dataChannel: RTCDataChannel | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private connectionHandler: ((connected: boolean) => void) | null = null;
  private destroyed = false;

  constructor(private streamUrl: string) {}

  async connect(): Promise<void> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.dataChannel = this.peerConnection.createDataChannel('avatarCommands', {
      ordered: true,
    });

    this.dataChannel.onopen = () => {
      this.commandQueue.forEach(msg => this.dataChannel!.send(msg));
      this.commandQueue = [];
      this.connectionHandler?.(true);
    };

    this.dataChannel.onclose = () => {
      this.connectionHandler?.(false);
      if (!this.destroyed) {
        setTimeout(() => {
          if (!this.destroyed) this.connect();
        }, 5_000);
      }
    };

    this.dataChannel.onerror = (event) => {
      console.warn('[UE5Bridge.pixelstream] DataChannel error', event);
    };

    this.dataChannel.onmessage = (event: MessageEvent) => {
      if (!this.messageHandler) return;
      try {
        const msg = JSON.parse(event.data as string) as UE5Message;
        this.messageHandler(msg);
      } catch { /* ignore */ }
    };
  }

  sendCommand(command: AvatarCommand): void {
    const msg = JSON.stringify({ type: 'avatarCommand', payload: command });
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(msg);
    } else {
      this.commandQueue.push(msg);
    }
  }

  onMessage(handler: (msg: UE5Message) => void): void {
    this.messageHandler = handler;
  }

  onConnectionChange(handler: (connected: boolean) => void): void {
    this.connectionHandler = handler;
  }

  disconnect(): void {
    this.destroyed = true;
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.dataChannel = null;
    this.peerConnection = null;
    this.messageHandler = null;
    this.commandQueue = [];
  }
}
