'use client';

import React from 'react';
import { logger } from '@/lib/logger';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  scope?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary so a single component crash cannot blank the entire
 * shell. Wrap the app once at the shell layout level (and optionally per
 * panel for finer-grained isolation in KB / voice-lab / etc.).
 *
 * Logs to the lib/logger sink so production crashes are visible. The
 * fallback is intentionally minimal — it should not depend on any context,
 * provider, or store, because those may be the very thing that crashed.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error(this.props.scope || 'error-boundary', { error, info });
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        style={{
          padding: 24,
          margin: 16,
          borderRadius: 8,
          border: '1px solid var(--border, #444)',
          background: 'var(--raised, #1a1a1a)',
          color: 'var(--t1, #eee)',
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 560,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Niečo sa pokazilo.
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3, #999)', marginBottom: 12 }}>
          {this.state.error?.message || 'Neznáma chyba'}
        </div>
        <button
          onClick={this.reset}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid var(--border, #444)',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          Skúsiť znova
        </button>
      </div>
    );
  }
}
