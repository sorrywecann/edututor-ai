/**
 * Lightweight client-side logger.
 *
 * Replaces silent `catch {}` blocks scattered across the codebase. The
 * frontend currently swallows ~30+ exceptions silently, making it
 * impossible to diagnose KB upload failures, voice session breakage, or
 * provider-switch issues from the browser console.
 *
 * Usage (in catch blocks):
 *     } catch (err) {
 *       logger.warn('voice-session.start', err);
 *     }
 *
 * Tag the call site so messages are searchable. In production, this is
 * a no-op shim that can be wired to Sentry / a backend log endpoint
 * later without touching every call site.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev =
  typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function emit(level: LogLevel, scope: string, payload: unknown) {
  if (!isDev && level === 'debug') return;
  const tag = `[${scope}]`;
  switch (level) {
    case 'debug':
      console.debug(tag, payload);
      break;
    case 'info':
      console.info(tag, payload);
      break;
    case 'warn':
      console.warn(tag, payload);
      break;
    case 'error':
      console.error(tag, payload);
      break;
  }
}

export const logger = {
  debug: (scope: string, payload: unknown) => emit('debug', scope, payload),
  info: (scope: string, payload: unknown) => emit('info', scope, payload),
  warn: (scope: string, payload: unknown) => emit('warn', scope, payload),
  error: (scope: string, payload: unknown) => emit('error', scope, payload),
};
