'use client';

// app/components/useDashboard.ts — the single data hook behind the dashboard.
// Fetches metrics + entries (days=31) + today's timeline + sync-state on
// mount, exposes refresh(), and re-fetches after every mutation.

import { useCallback, useEffect, useState } from 'react';
import type { Entry, Metric, TimelineItem } from '@/lib/types';
import { todayISO } from '@/lib/dates';

export interface SyncState {
  lastGoogleSync: string | null;
  todayInboxCount: number | null;
}

export interface NewMetricInput {
  name: string;
  unit: Metric['unit'];
  goal: number;
  goalDirection: Metric['goalDirection'];
  emoji?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return body as T;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useDashboard() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [syncState, setSyncState] = useState<SyncState>({
    lastGoogleSync: null,
    todayInboxCount: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, e, t, s] = await Promise.all([
        fetchJson<Metric[]>('/api/metrics'),
        fetchJson<Entry[]>('/api/entries?days=31'),
        fetchJson<TimelineItem[]>(`/api/timeline?date=${todayISO()}`),
        fetchJson<SyncState>('/api/sync-state'),
      ]);
      setMetrics(m);
      setEntries(e);
      setTimeline(t);
      setSyncState(s);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load dashboard data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Upsert today's entry: optimistic local update, POST, then refresh. */
  const logEntry = useCallback(
    async (metricId: string, value: number) => {
      const date = todayISO();
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.metricId === metricId && e.date === date);
        if (idx === -1) return [...prev, { metricId, date, value }];
        const next = prev.slice();
        next[idx] = { ...next[idx], value };
        return next;
      });
      try {
        await fetchJson<Entry>('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metricId, value }),
        });
        setActionError(null);
      } catch (err) {
        setActionError(errorMessage(err, `Could not save today's ${metricId} entry.`));
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  /** Toggle a metric active/inactive: optimistic, PATCH, then refresh. */
  const setMetricActive = useCallback(
    async (id: string, active: boolean) => {
      setMetrics((prev) => prev.map((m) => (m.id === id ? { ...m, active } : m)));
      try {
        await fetchJson<Metric>(`/api/metrics/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active }),
        });
        setActionError(null);
      } catch (err) {
        setActionError(errorMessage(err, `Could not update "${id}".`));
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  /** Create a custom metric. Resolves to an error message, or null on success. */
  const addMetric = useCallback(
    async (input: NewMetricInput): Promise<string | null> => {
      try {
        await fetchJson<Metric>('/api/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        await refresh();
        return null;
      } catch (err) {
        return errorMessage(err, 'Could not add the metric.');
      }
    },
    [refresh],
  );

  const dismissActionError = useCallback(() => setActionError(null), []);

  return {
    metrics,
    entries,
    timeline,
    syncState,
    loading,
    loadError,
    actionError,
    refresh,
    logEntry,
    setMetricActive,
    addMetric,
    dismissActionError,
  };
}

export type Dashboard = ReturnType<typeof useDashboard>;
