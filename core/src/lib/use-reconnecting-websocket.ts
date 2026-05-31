// core/src/lib/use-reconnecting-websocket.ts
/**
 * Vanilla React hook wrapping a WebSocket with exponential-backoff
 * reconnect, connection-state tracking, and server-heartbeat detection.
 *
 * Design constraints (grant-demo, Roland-safe):
 * - Zero new npm dependencies
 * - Connection state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
 * - Backoff: 500ms → 1s → 2s → 4s → 8s → 16s → 30s (max), ±20% jitter
 * - Heartbeat: server sends blink/every ~3-6s; if silent >15s → reconnect
 * - Queue: messages sent while disconnected are queued, flushed on reconnect
 * - Cleanup on unmount: cancel reconnect timer, close socket
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

export type WSState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface UseReconnectingWebSocketOptions {
  /** WebSocket endpoint URL (required) */
  url: string;
  /** Auto-connect on mount (default true) */
  autoConnect?: boolean;
  /** Backoff start in ms (default 500) */
  backoffStartMs?: number;
  /** Backoff max in ms (default 30_000) */
  backoffMaxMs?: number;
  /** Backoff multiplier (default 2.0) */
  backoffMultiplier?: number;
  /** Jitter fraction (default 0.2 = ±20%) */
  jitterFraction?: number;
  /** Heartbeat timeout — if no server message in this window, reconnect (default 15_000) */
  heartbeatTimeoutMs?: number;
  /** Manual ping interval in ms (default 30_000) — 0 disables */
  pingIntervalMs?: number;
  /** Called when connection state changes */
  onStateChange?: (state: WSState) => void;
  /** Called on every incoming parsed message */
  onMessage?: (data: unknown) => void;
}

export interface UseReconnectingWebSocketReturn {
  state: WSState;
  send: (data: string | object) => void;
  lastMessage: unknown | null;
  reconnect: () => void;
}

export function useReconnectingWebSocket(
  options: UseReconnectingWebSocketOptions
): UseReconnectingWebSocketReturn {
  const {
    url,
    autoConnect = true,
    backoffStartMs = 500,
    backoffMaxMs = 30_000,
    backoffMultiplier = 2.0,
    jitterFraction = 0.2,
    heartbeatTimeoutMs = 15_000,
    pingIntervalMs = 30_000,
    onStateChange,
    onMessage,
  } = options;

  const [state, setState] = useState<WSState>('disconnected');
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);

  // Refs for values needed inside callbacks / timers (no re-render needed)
  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<WSState>('disconnected');
  const backoffRef = useRef<number>(backoffStartMs);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueRef = useRef<string[]>([]);
  const lastServerMessageRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Sync React state + ref + callback
  const setBothState = useCallback(
    (s: WSState) => {
      stateRef.current = s;
      setState(s);
      onStateChange?.(s);
    },
    [onStateChange]
  );

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const startHeartbeatWatch = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    lastServerMessageRef.current = Date.now();
    heartbeatTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      const elapsed = Date.now() - lastServerMessageRef.current;
      if (elapsed >= heartbeatTimeoutMs) {
        logger.warn('ws-reconnect', `heartbeat timeout (${elapsed}ms) → reconnecting`);
        connect(true);
      }
    }, heartbeatTimeoutMs);
  }, [heartbeatTimeoutMs]);

  const startPing = useCallback(() => {
    if (pingIntervalMs <= 0) return;
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('PING');
      }
    }, pingIntervalMs);
  }, [pingIntervalMs]);

  // Core connect function (isReconnect = backoff applies)
  const connect = useCallback(
    (isReconnect = false) => {
      if (!mountedRef.current) return;
      if (wsRef.current) {
        // Close existing socket silently (use 1k code to bypass onclose handler)
        wsRef.current.close(1000);
        wsRef.current = null;
      }

      setBothState(isReconnect ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        logger.info('ws-reconnect', `connected to ${url}`);
        setBothState('connected');
        backoffRef.current = backoffStartMs;

        // Flush queued messages
        const pending = queueRef.current.splice(0);
        pending.forEach((msg) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        });

        startHeartbeatWatch();
        startPing();
      };

      ws.onclose = (e) => {
        if (!mountedRef.current) return;
        logger.info('ws-reconnect', `disconnected (code=${e.code})`);
        wsRef.current = null;
        clearTimers();

        if (stateRef.current === 'disconnected') return;

        // Initiate reconnect
        if (e.code !== 1000) {
          const delay = Math.min(
            backoffRef.current * (1 + (Math.random() * jitterFraction * 2 - jitterFraction)),
            backoffMaxMs
          );
          logger.info('ws-reconnect', `reconnect in ${Math.round(delay)}ms`);

          reconnectTimerRef.current = setTimeout(() => {
            connect(true);
          }, delay);

          backoffRef.current = Math.min(backoffRef.current * backoffMultiplier, backoffMaxMs);
        } else {
          setBothState('disconnected');
        }
      };

      ws.onerror = () => {
        // onclose always fires after onerror, so we handle reconnect there
        logger.warn('ws-reconnect', 'transport error');
      };

      ws.onmessage = (e: MessageEvent) => {
        lastServerMessageRef.current = Date.now();

        if (typeof e.data === 'string' && e.data === 'PONG') return;

        // Reset heartbeat timer on any real message
        if (heartbeatTimerRef.current) {
          clearTimeout(heartbeatTimerRef.current);
          heartbeatTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            if (Date.now() - lastServerMessageRef.current >= heartbeatTimeoutMs) {
              logger.warn('ws-reconnect', 'heartbeat timeout → reconnecting');
              connect(true);
            }
          }, heartbeatTimeoutMs);
        }

        try {
          const data = JSON.parse(e.data as string);
          setLastMessage(data);
          onMessage?.(data);
        } catch {
          // non-JSON (e.g. raw PONG handled above)
        }
      };
    },
    [
      url, backoffStartMs, backoffMaxMs, backoffMultiplier, jitterFraction,
      setBothState, clearTimers, startHeartbeatWatch, startPing, onMessage,
    ]
  );

  // Send with queue for disconnected state
  const send = useCallback(
    (data: string | object) => {
      const msg = typeof data === 'string' ? data : JSON.stringify(data);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(msg);
      } else {
        queueRef.current.push(msg);
      }
    },
    []
  );

  // Manual reconnect (resets backoff)
  const reconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    backoffRef.current = backoffStartMs;
    connect(false);
  }, [clearTimers, backoffStartMs, connect]);

  // Auto-connect on mount
  useEffect(() => {
    mountedRef.current = true;
    if (autoConnect) connect(false);

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
    // connect intentionally excluded — stable ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, autoConnect]);

  return { state, send, lastMessage, reconnect };
}
