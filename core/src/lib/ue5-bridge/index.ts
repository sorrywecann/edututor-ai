// core/src/lib/ue5-bridge/index.ts
import type { AvatarCommand, UE5Message, IAdapter, AdapterMode } from './types';
import { MockAdapter } from './MockAdapter';
import { UEWebBrowserAdapter } from './UEWebBrowserAdapter';
import { PixelStreamingAdapter } from './PixelStreamingAdapter';
import { WebSocketServerAdapter } from './WebSocketServerAdapter';
import { validateAvatarCommand } from './validation';

export type { AvatarCommand, UE5Message, IAdapter, AdapterMode } from './types';
export type { SlovakViseme, UE5Emotion, InternalEmotion, VisemeFrame, ARKitFrame, ARKitChannels } from './types';

function detectMode(): AdapterMode {
  if (typeof window === 'undefined') return 'none';
  const ue = (window as unknown as { ue?: { interface?: unknown } }).ue;
  if (ue?.interface) return 'web-browser';
  const params = new URLSearchParams(window.location.search);
  const wsUrl = params.get('ue5ws');
  if (wsUrl) return 'ws-server';
  const streamUrl = params.get('ue5') ?? process.env.NEXT_PUBLIC_UE5_STREAM_URL ?? null;
  if (streamUrl) return 'pixel-streaming';
  if (process.env.NODE_ENV === 'development') return 'mock';
  return 'none';
}

class UE5Bridge {
  mode: AdapterMode = 'none';
  private adapter: IAdapter | null = null;
  private pendingHandler: ((msg: UE5Message) => void) | null = null;
  private connectionListeners = new Set<(connected: boolean) => void>();
  private _connected = false;

  init(): void {
    if (this.adapter) return; // already initialized
    this.mode = detectMode();

    switch (this.mode) {
      case 'web-browser':
        this.adapter = new UEWebBrowserAdapter();
        break;
      case 'pixel-streaming': {
        const url =
          new URLSearchParams(window.location.search).get('ue5') ??
          process.env.NEXT_PUBLIC_UE5_STREAM_URL ?? '';
        const ps = new PixelStreamingAdapter(url);
        void ps.connect();
        this.adapter = ps;
        break;
      }
      case 'ws-server': {
        const wsUrl = new URLSearchParams(window.location.search).get('ue5ws') ?? '';
        const wsa = new WebSocketServerAdapter(wsUrl);
        wsa.connect();
        this.adapter = wsa;
        break;
      }
      case 'mock':
        this.adapter = new MockAdapter();
        break;
      default:
        this.adapter = null;
        return;
    }

    if (this.pendingHandler) {
      this.adapter?.onMessage(this.pendingHandler);
    }

    this.adapter?.onConnectionChange?.((connected) => this._notifyConnection(connected));
  }

  sendCommand(command: AvatarCommand): void {
    const validated = validateAvatarCommand(command);
    if (validated === null) return; // Unrecoverable, drop silently (already logged)
    this.adapter?.sendCommand(validated);
  }

  /** Subscribe to connection state changes. Returns unsubscribe fn. */
  onConnectionChange(handler: (connected: boolean) => void): () => void {
    this.connectionListeners.add(handler);
    handler(this._connected);
    return () => { this.connectionListeners.delete(handler); };
  }

  /** Internal: called by adapters when connection state changes. */
  _notifyConnection(connected: boolean): void {
    if (this._connected === connected) return;
    this._connected = connected;
    this.connectionListeners.forEach(h => {
      try { h(connected); } catch { /* listener errors must not break others */ }
    });
  }

  onMessage(handler: (msg: UE5Message) => void): void {
    this.pendingHandler = handler;
    this.adapter?.onMessage(handler);
  }

  disconnect(): void {
    this.adapter?.disconnect();
    this.adapter = null;
    this.mode = 'none';
    this.pendingHandler = null;
    this._notifyConnection(false);
  }

  get isConnected(): boolean {
    return this.mode !== 'none' && this.adapter !== null;
  }
}

export const ue5Bridge = new UE5Bridge();
