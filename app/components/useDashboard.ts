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

/** Fields an existing metric can be edited to. All optional — a partial patch. */
export interface MetricPatchInput {
  name?: string;
  emoji?: string;
  goal?: number;
  goalDirection?: Metric['goalDirection'];
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

  /**
   * Upsert an entry: optimistic local update, POST, then refresh.
   * `date` defaults to today; pass an earlier YYYY-MM-DD to backfill a day
   * that was missed.
   */
  const logEntry = useCallback(
    async (metricId: string, value: number, date: string = todayISO()) => {
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
          body: JSON.stringify({ metricId, value, date }),
        });
        setActionError(null);
      } catch (err) {
        setActionError(errorMessage(err, `Could not save the ${metricId} entry for ${date}.`));
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  /**
   * Upsert several entries for one date at once — what the quick-entry form
   * submits. Posts in parallel and refreshes ONCE, rather than the refresh-per
   * -field storm that calling logEntry in a loop would produce.
   *
   * Resolves to an error message or null. Partial failure is reported as such:
   * with five independent writes, "3 of 5 saved" is the truth and pretending
   * otherwise would leave the user believing data was stored that was not.
   */
  const logMany = useCallback(
    async (date: string, values: { metricId: string; value: number }[]): Promise<string | null> => {
      if (values.length === 0) return null;

      setEntries((prev) => {
        const next = prev.slice();
        for (const { metricId, value } of values) {
          const idx = next.findIndex((e) => e.metricId === metricId && e.date === date);
          if (idx === -1) next.push({ metricId, date, value });
          else next[idx] = { ...next[idx], value };
        }
        return next;
      });

      try {
        const results = await Promise.allSettled(
          values.map(({ metricId, value }) =>
            fetchJson<Entry>('/api/entries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ metricId, value, date }),
            }),
          ),
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          const msg = `Saved ${values.length - failed} of ${values.length} — ${failed} failed.`;
          setActionError(msg);
          return msg;
        }
        setActionError(null);
        return null;
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

  /**
   * Edit a metric's editable fields. Resolves to an error message, or null on
   * success, so the calling form can keep the user's input on failure instead
   * of discarding it.
   */
  const editMetric = useCallback(
    async (id: string, patch: MetricPatchInput): Promise<string | null> => {
      try {
        await fetchJson<Metric>(`/api/metrics/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        await refresh();
        return null;
      } catch (err) {
        return errorMessage(err, 'Could not save the metric.');
      }
    },
    [refresh],
  );

  /**
   * Permanently delete a metric and its history. Resolves to an error message,
   * or null on success. Not optimistic: a destructive action should only leave
   * the UI once the server has confirmed it.
   */
  const removeMetric = useCallback(
    async (id: string): Promise<string | null> => {
      try {
        await fetchJson<{ deleted: string }>(`/api/metrics/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        await refresh();
        return null;
      } catch (err) {
        return errorMessage(err, 'Could not delete the metric.');
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
    logMany,
    setMetricActive,
    addMetric,
    editMetric,
    removeMetric,
    dismissActionError,
  };
}

export type Dashboard = ReturnType<typeof useDashboard>;
