// core/src/lib/ue5-bridge/WebSocketServerAdapter.ts
/**
 * Connects Next.js to the FastAPI /ws/avatar WebSocket endpoint.
 * Activated by adding ?ue5ws=ws://localhost:8000/ws/avatar to the URL.
 *
 * Use case: UE5 and Next.js running on the same machine, no Pixel Streaming.
 * Both the browser AND UE5 Blueprint connect to /ws/avatar.
 * The backend broadcasts to all connected clients.
 *
 * Includes exponential-backoff reconnect (500ms→30s, ±20% jitter),
 * heartbeat detection (server blink pulses every ~3-6s), and message
 * queueing during disconnected periods.
 */
import type { AvatarCommand, UE5Message, IAdapter } from './types';
import { logger } from '@/lib/logger';

type AdapterState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const BACKOFF_START = 500;
const BACKOFF_MAX = 30_000;
const BACKOFF_MULTIPLIER = 2.0;
const JITTER_FRACTION = 0.2;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const MAX_QUEUE_SIZE = 100;

export class WebSocketServerAdapter implements IAdapter {
  private ws: WebSocket | null = null;
  private messageHandler: ((msg: UE5Message) => void) | null = null;
  private stateHandler: ((s: AdapterState) => void) | null = null;
  private queue: string[] = [];
  private state: AdapterState = 'disconnected';
  private backoff: number = BACKOFF_START;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastServerMessage: number = 0;
  private destroyed = false;

  constructor(private readonly url: string) {}

  onStateChange(handler: (s: AdapterState) => void): void {
    this.stateHandler = handler;
  }

  onConnectionChange(handler: (connected: boolean) => void): void {
    this.stateHandler = (s) => handler(s === 'connected');
  }

  connect(): void {
    this.destroyed = false;
    this.doCoonnect(false);
  }

  private doCoonnect(isReconnect: boolean): void {
    if (this.destroyed) return;
    this.clearTimers();

    this.setState(isReconnect ? 'reconnecting' : 'connecting');
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      if (this.destroyed) return;
      logger.info('UE5Bridge.ws', `connected to ${this.url}`);
      this.setState('connected');
      this.backoff = BACKOFF_START;

      const pending = this.queue.splice(0);
      pending.forEach((msg) => {
        if (this.ws!.readyState === WebSocket.OPEN) this.ws!.send(msg);
      });

      this.startHeartbeatWatch();
    };

    this.ws.onclose = (e) => {
      if (this.destroyed) return;
      logger.info('UE5Bridge.ws', `disconnected (code=${e.code})`);
      this.ws = null;
      this.clearTimers();

      if (this.state === 'disconnected') return;

      if (e.code !== 1000) {
        const delay = Math.min(
          this.backoff * (1 + (Math.random() * JITTER_FRACTION * 2 - JITTER_FRACTION)),
          BACKOFF_MAX
        );
        logger.info('UE5Bridge.ws', `reconnect in ${Math.round(delay)}ms`);
        this.reconnectTimer = setTimeout(() => this.doCoonnect(true), delay);
        this.backoff = Math.min(this.backoff * BACKOFF_MULTIPLIER, BACKOFF_MAX);
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      logger.warn('UE5Bridge.ws', 'transport error');
      // onclose fires after onerror — reconnect handled there
    };

    this.ws.onmessage = (e: MessageEvent) => {
      this.lastServerMessage = Date.now();

      if (typeof e.data === 'string' && e.data === 'PONG') return;

      if (this.heartbeatTimer) {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(() => {
          if (this.destroyed) return;
          if (Date.now() - this.lastServerMessage >= HEARTBEAT_TIMEOUT_MS) {
            logger.warn('UE5Bridge.ws', 'heartbeat timeout → reconnecting');
            this.doCoonnect(true);
          }
        }, HEARTBEAT_TIMEOUT_MS);
      }

      try {
        const msg = JSON.parse(e.data as string) as UE5Message;
        if (msg.type === 'avatar_ready' || msg.type === 'speech_complete') {
          this.messageHandler?.(msg);
        }
      } catch { /* ignore malformed */ }
    };
  }

  private setState(s: AdapterState): void {
    this.state = s;
    this.stateHandler?.(s);
  }

  private startHeartbeatWatch(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.lastServerMessage = Date.now();
    this.heartbeatTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (Date.now() - this.lastServerMessage >= HEARTBEAT_TIMEOUT_MS) {
        logger.warn('UE5Bridge.ws', 'heartbeat timeout → reconnecting');
        this.doCoonnect(true);
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.heartbeatTimer) { clearTimeout(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  sendCommand(command: AvatarCommand): void {
    const msg = JSON.stringify(command);
    if (msg.length > 14_000) {
      // Backend enforces 16KB hard limit (ws_avatar.py:118). Bail early to
      // avoid silent server-side drop (which closes the socket with code 1009).
      logger.warn('UE5Bridge.ws', `dropping oversized message (${msg.length}B > 14KB)`);
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        // FIFO eviction — drop oldest so newest viseme/emotion wins
        this.queue.shift();
      }
      this.queue.push(msg);
    }
  }

  onMessage(handler: (msg: UE5Message) => void): void {
    this.messageHandler = handler;
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearTimers();
    this.ws?.close(1000);
    this.ws = null;
    this.queue = [];
    this.setState('disconnected');
  }
}
