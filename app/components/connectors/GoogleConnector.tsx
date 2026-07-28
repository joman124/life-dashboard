'use client';

// GoogleConnector — Google Calendar + Gmail, a single OAuth connector covering
// both APIs, driven by GET /api/connectors/google.
//
// Real status and real error strings are surfaced verbatim: the artifact this
// replaced failed silently, which was its main pain point. Every state the
// connector can be in (not configured / disconnected / connected / error) has
// its own visible chip and its own action.

import { useCallback, useEffect, useState } from 'react';
import { PRIMARY_BTN, PRIMARY_STYLE, errorText, humanizeSync, readError } from './shared';

type GoogleStatus = 'not_configured' | 'disconnected' | 'connected' | 'error';

interface ConnectorState {
  configured: boolean;
  status: GoogleStatus;
  email: string | null;
  lastSync: string | null;
  todayInboxCount: number | null;
  error: string | null;
}

interface SyncResult {
  calendar?: { events: number };
  deepWork?: { hours: number } | null;
  gmail?: { inboxCount: number } | null;
  lastSync?: string;
  errors?: { calendar?: string; gmail?: string };
}

export default function GoogleConnector({ refresh }: { refresh: () => Promise<void> }) {
  const [google, setGoogle] = useState<ConnectorState | null>(null);
  const [busy, setBusy] = useState(false); // sync or disconnect in flight
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors/google');
      if (!res.ok) throw new Error(await readError(res));
      setGoogle((await res.json()) as ConnectorState);
    } catch (err) {
      setGoogle({
        configured: false,
        status: 'error',
        email: null,
        lastSync: null,
        todayInboxCount: null,
        error: errorText(err, 'Could not read connector status.'),
      });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  function connect() {
    // Full navigation (not fetch) — the browser must follow Google's consent flow.
    window.location.href = '/api/auth/google';
  }

  const sync = useCallback(async () => {
    setBusy(true);
    setSyncMsg(null);
    setSyncErr(null);
    try {
      const res = await fetch('/api/sync/google', { method: 'POST' });
      if (!res.ok) {
        setSyncErr(await readError(res));
        return;
      }
      const r = (await res.json()) as SyncResult;
      // Calendar and Gmail fail independently, so a partial failure is reported
      // as a partial failure rather than a blanket "sync failed".
      const failures: string[] = [];
      if (r.errors?.calendar) failures.push(`Calendar: ${r.errors.calendar}`);
      if (r.errors?.gmail) failures.push(`Gmail: ${r.errors.gmail}`);
      if (failures.length > 0) {
        setSyncErr(failures.join(' · '));
      } else {
        const ok: string[] = [];
        if (r.calendar) ok.push(`${r.calendar.events} event${r.calendar.events === 1 ? '' : 's'}`);
        if (r.deepWork) ok.push(`Deep Work ${r.deepWork.hours}h`);
        if (r.gmail) ok.push(`${r.gmail.inboxCount.toLocaleString('en-US')} inbox`);
        setSyncMsg(ok.length ? `Synced ${ok.join(' · ')}` : 'Synced.');
      }
    } catch (err) {
      setSyncErr(errorText(err, 'Sync failed.'));
    } finally {
      setBusy(false);
      await loadStatus();
      await refresh(); // pull fresh timeline + inbox badge + Deep Work into the dashboard
    }
  }, [loadStatus, refresh]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setSyncMsg(null);
    setSyncErr(null);
    try {
      const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
      if (!res.ok) setSyncErr(await readError(res));
    } catch (err) {
      setSyncErr(errorText(err, 'Disconnect failed.'));
    } finally {
      setBusy(false);
      await loadStatus();
      await refresh();
    }
  }, [loadStatus, refresh]);

  const status = google?.status ?? null;
  const chip =
    status === 'connected'
      ? { label: 'Connected', color: 'var(--green)', border: 'var(--green)' }
      : status === 'error'
        ? { label: 'Error', color: 'var(--red)', border: 'var(--red)' }
        : status === 'not_configured'
          ? { label: 'Not configured', color: 'var(--muted)', border: 'var(--hairline)' }
          : { label: 'Not connected', color: 'var(--muted)', border: 'var(--hairline)' };

  const subtitle =
    google === null
      ? 'Checking…'
      : status === 'connected'
        ? (google.email ?? 'Connected')
        : status === 'not_configured'
          ? 'Add Google credentials to .env.local — see README.'
          : status === 'error'
            ? (google.error ?? 'Connector error.')
            : "Today's events, Deep Work, and inbox count.";

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px]">Google Calendar + Gmail</div>
          <div
            className="mt-0.5 text-[11.5px]"
            style={{ color: status === 'error' ? 'var(--red)' : 'var(--muted)' }}
          >
            {subtitle}
          </div>
          {status === 'connected' && (
            <div className="mt-0.5 text-[11px] text-[color:var(--faint)]">
              {humanizeSync(google?.lastSync ?? null)}
              {google?.todayInboxCount != null
                ? ` · ${google.todayInboxCount.toLocaleString('en-US')} inbox today`
                : ''}
            </div>
          )}
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
          style={{ borderColor: chip.border, color: chip.color }}
        >
          {chip.label}
        </span>
      </div>

      {status === 'disconnected' && (
        <button type="button" onClick={connect} className={`mt-3 ${PRIMARY_BTN}`} style={PRIMARY_STYLE}>
          Connect Google
        </button>
      )}
      {status === 'error' && (
        <button type="button" onClick={connect} className={`mt-3 ${PRIMARY_BTN}`} style={PRIMARY_STYLE}>
          Reconnect Google
        </button>
      )}
      {status === 'connected' && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy}
            className="flex-1 rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-40"
            style={PRIMARY_STYLE}
          >
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={busy}
            className="rounded-xl border px-4 py-2.5 text-[14px] font-medium disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
          >
            Disconnect
          </button>
        </div>
      )}

      {syncErr && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {syncErr}
        </p>
      )}
      {syncMsg && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--gold)' }} role="status">
          {syncMsg}
        </p>
      )}
    </div>
  );
}
