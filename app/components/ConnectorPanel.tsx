'use client';

// ConnectorPanel — live connector states (no fake statuses) + JSON export.
//
// Google Calendar + Gmail (Phase 2): a single OAuth connector covering both
// APIs, driven by GET /api/connectors/google. Real status and real error
// strings are surfaced verbatim — silent failure was the artifact's main pain
// point. Apple Health (Phase 3) is still a placeholder.

import { useCallback, useEffect, useState } from 'react';

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

interface HealthState {
  token: string;
  endpoint: string;
  lastImport: string | null;
}

interface HealthImportResult {
  date: string;
  imported: { metricId: string; value: number }[];
  ignored: { key: string; reason: string }[];
  importedCount: number;
  lastImport: string;
}

/** Read a JSON {error} body, falling back to the HTTP status. */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // non-JSON error body — fall through to the status line
  }
  return `Request failed (${res.status}).`;
}

/** "Synced 2:14 PM" / "Synced Jun 21, 2:14 PM" / "Never synced". */
function humanizeSync(iso: string | null): string {
  if (!iso) return 'Never synced';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never synced';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return `Synced ${time}`;
  return `Synced ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function ConnectorPanel({ refresh }: { refresh: () => Promise<void> }) {
  const [google, setGoogle] = useState<ConnectorState | null>(null);
  const [busy, setBusy] = useState(false); // sync or disconnect in flight
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Apple Health (Phase 3) — push-webhook connector.
  const [health, setHealth] = useState<HealthState | null>(null);
  const [origin, setOrigin] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [paste, setPaste] = useState('');
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
        error: err instanceof Error ? err.message : 'Could not read connector status.',
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
      setSyncErr(err instanceof Error ? err.message : 'Sync failed.');
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
      setSyncErr(err instanceof Error ? err.message : 'Disconnect failed.');
    } finally {
      setBusy(false);
      await loadStatus();
      await refresh();
    }
  }, [loadStatus, refresh]);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors/health');
      if (!res.ok) throw new Error(await readError(res));
      setHealth((await res.json()) as HealthState);
    } catch (err) {
      setHealthErr(err instanceof Error ? err.message : 'Could not load Apple Health connector.');
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setHealthErr('Copy failed — select the text and copy it manually.');
    }
  }

  const importPaste = useCallback(async () => {
    const token = health?.token;
    if (!token || !paste.trim()) return;
    setHealthBusy(true);
    setHealthMsg(null);
    setHealthErr(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(paste);
      } catch {
        throw new Error('That isn’t valid JSON. Example: {"steps": 9336, "sleep": 7.6}');
      }
      const res = await fetch('/api/health-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        setHealthErr(await readError(res));
        return;
      }
      const r = (await res.json()) as HealthImportResult;
      const imported = r.imported.map((i) => i.metricId);
      const ignored = r.ignored.length ? ` · ignored ${r.ignored.map((i) => i.key).join(', ')}` : '';
      setHealthMsg(
        (imported.length ? `Imported ${imported.join(', ')} for ${r.date}` : `Nothing matched for ${r.date}`) +
          ignored,
      );
      setPaste('');
    } catch (err) {
      setHealthErr(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setHealthBusy(false);
      await loadHealth();
      await refresh(); // surface imported values in Today/Week/etc. without a manual reload
    }
  }, [health, paste, loadHealth, refresh]);

  const rotate = useCallback(async () => {
    setHealthBusy(true);
    setHealthErr(null);
    setHealthMsg(null);
    try {
      const res = await fetch('/api/connectors/health/rotate', { method: 'POST' });
      if (!res.ok) {
        setHealthErr(await readError(res));
        return;
      }
      const r = (await res.json()) as { token: string };
      setHealth((h) => (h ? { ...h, token: r.token } : h));
      setShowToken(true);
      setHealthMsg('Token rotated — update your Shortcut’s Authorization header.');
    } catch (err) {
      setHealthErr(err instanceof Error ? err.message : 'Could not rotate token.');
    } finally {
      setHealthBusy(false);
    }
  }, []);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch('/api/export');
      if (!res.ok) throw new Error(await readError(res));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'life-dashboard-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

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

  const primaryBtn = 'w-full rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-40';
  const primaryStyle = { background: 'var(--gold)', color: '#171107' } as const;

  return (
    <section className="card p-4">
      <div className="eyebrow">Connectors</div>

      {/* Google Calendar + Gmail — live */}
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
          <button type="button" onClick={connect} className={`mt-3 ${primaryBtn}`} style={primaryStyle}>
            Connect Google
          </button>
        )}
        {status === 'error' && (
          <button type="button" onClick={connect} className={`mt-3 ${primaryBtn}`} style={primaryStyle}>
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
              style={primaryStyle}
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

      {/* Apple Health — push webhook (iOS Shortcut) */}
      <div className="py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14px]">Apple Health</div>
            <div className="mt-0.5 text-[11.5px] text-[color:var(--muted)]">
              Auto-import via iOS Shortcut, or paste below.
            </div>
            {health?.lastImport && (
              <div className="mt-0.5 text-[11px] text-[color:var(--faint)]">
                {humanizeSync(health.lastImport).replace('Synced', 'Imported')}
              </div>
            )}
          </div>
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
          >
            Ready
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <div>
            <div className="eyebrow !text-[9.5px]">Webhook URL</div>
            <div className="mt-1 flex items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 font-mono text-[11px]"
                style={{ borderColor: 'var(--hairline)', background: 'var(--card-inset)' }}
              >
                {(origin || '…') + (health?.endpoint ?? '/api/health-import')}
              </code>
              <button
                type="button"
                onClick={() => void copy(`${origin}${health?.endpoint ?? '/api/health-import'}`, 'url')}
                className="shrink-0 rounded-lg border px-2 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
              >
                {copied === 'url' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-[10.5px] text-[color:var(--faint)]">
              On your phone, use your PC’s IP instead of localhost — see README.
            </p>
          </div>

          <div>
            <div className="eyebrow !text-[9.5px]">Bearer token</div>
            <div className="mt-1 flex items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 font-mono text-[11px]"
                style={{ borderColor: 'var(--hairline)', background: 'var(--card-inset)' }}
              >
                {health ? (showToken ? health.token : '•'.repeat(18)) : '…'}
              </code>
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="shrink-0 rounded-lg border px-2 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                onClick={() => health && void copy(health.token, 'token')}
                className="shrink-0 rounded-lg border px-2 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
              >
                {copied === 'token' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-2">
          <div className="eyebrow !text-[9.5px]">Manual import</div>
          <textarea
            className="input mt-1 font-mono text-[12px]"
            rows={2}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='{"steps": 9336, "sleep": 7.6}'
            aria-label="Health JSON to import"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void importPaste()}
              disabled={healthBusy || !paste.trim()}
              className="flex-1 rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-40"
              style={primaryStyle}
            >
              {healthBusy ? 'Importing…' : 'Import'}
            </button>
            <button
              type="button"
              onClick={() => void rotate()}
              disabled={healthBusy}
              className="rounded-xl border px-4 py-2.5 text-[14px] font-medium disabled:opacity-40"
              style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
            >
              Rotate token
            </button>
          </div>
        </div>

        {healthErr && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
            {healthErr}
          </p>
        )}
        {healthMsg && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--gold)' }} role="status">
            {healthMsg}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={exporting}
        className="mt-3 w-full rounded-xl border py-2.5 text-[14px] font-medium disabled:opacity-60"
        style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }}
      >
        {exporting ? 'Exporting…' : 'Export data (JSON)'}
      </button>
      {exportError && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {exportError}
        </p>
      )}
    </section>
  );
}
