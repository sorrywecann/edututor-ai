'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type PodcastResponse } from '@/lib/api';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 min hard cap

export interface UsePodcastJobResult {
  podcast: PodcastResponse | null;
  loading: boolean;
  error: string | null;
  start: (kbId: string, params: Parameters<typeof api.createPodcast>[1]) => Promise<void>;
  reset: () => void;
}

/**
 * Polls a podcast job until status is 'completed' or 'failed'.
 * Auto-stops at 5min hard cap.
 *
 * Architected by oracle ses_1e1513e5effepQMVbZMKljQot5 for podcast phase.
 */
export function usePodcastJob(): UsePodcastJobResult {
  const [podcast, setPodcast] = useState<PodcastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const poll = useCallback(async (podcastId: string) => {
    if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
      setError('Podcast generation timed out after 5 minutes');
      setLoading(false);
      return;
    }
    try {
      const updated = await api.getPodcast(podcastId);
      setPodcast(updated);
      if (updated.status === 'completed' || updated.status === 'failed') {
        setLoading(false);
        if (updated.status === 'failed') {
          setError(updated.error || 'Podcast generation failed');
        }
        return;
      }
      pollTimerRef.current = setTimeout(() => poll(podcastId), POLL_INTERVAL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, []);

  const start: UsePodcastJobResult['start'] = useCallback(async (kbId, params) => {
    stopPolling();
    setError(null);
    setLoading(true);
    pollStartRef.current = Date.now();
    try {
      const initial = await api.createPodcast(kbId, params);
      setPodcast(initial);
      if (initial.status === 'completed' || initial.status === 'failed') {
        setLoading(false);
        if (initial.status === 'failed') setError(initial.error || 'Failed');
        return;
      }
      pollTimerRef.current = setTimeout(() => poll(initial.id), POLL_INTERVAL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [poll, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setPodcast(null);
    setLoading(false);
    setError(null);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { podcast, loading, error, start, reset };
}
