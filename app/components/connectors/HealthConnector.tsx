'use client';

// HealthConnector — Apple Health via a push webhook.
//
// HealthKit is on-device only and has no cloud API, so there is nothing to poll:
// an iOS Shortcut POSTs a flat JSON object to /api/health-import, authenticated
// with the bearer token shown here. This panel is where that token is revealed,
// copied, and rotated, plus a paste box for importing by hand (which is also the
// fastest way to verify the endpoint works before wiring up the Shortcut).

import { useCallback, useEffect, useState } from 'react';
import { parseLenientJson } from '@/lib/health/lenientJson';
import { PRIMARY_STYLE, SECONDARY_STYLE, errorText, humanizeSync, readError } from './shared';

interface HealthState {
  token: string;
  endpoint: string;
  lastImport: string | null;
}

interface HealthImportResult {
  date: string;
  imported: { metricId: string; value: number; note?: string }[];
  ignored: { key: string; reason: string }[];
  importedCount: number;
  lastImport: string;
}

export default function HealthConnector({ refresh }: { refresh: () => Promise<void> }) {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [origin, setOrigin] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** Per-key "why it was skipped" lines shown under the summary. */
  const [msgDetail, setMsgDetail] = useState<string[]>([]);
  /** True when something was skipped — colours the summary as a warning. */
  const [msgIsWarning, setMsgIsWarning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors/health');
      if (!res.ok) throw new Error(await readError(res));
      setHealth((await res.json()) as HealthState);
    } catch (e) {
      setErr(errorText(e, 'Could not load Apple Health connector.'));
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
      setErr('Copy failed — select the text and copy it manually.');
    }
  }

  const importPaste = useCallback(async () => {
    const token = health?.token;
    if (!token || !paste.trim()) return;
    setBusy(true);
    setMsg(null);
    setMsgDetail([]);
    setMsgIsWarning(false);
    setErr(null);
    try {
      // Tolerant of the corruptions a phone paste introduces (curly quotes,
      // non-breaking spaces, a stray code fence) and explicit about what it
      // repaired, so a Shortcut that keeps producing them can be fixed at
      // source rather than silently patched on every import.
      const parse = parseLenientJson(paste);
      if (!parse.ok) throw new Error(parse.error);
      const parsed = parse.value;
      const repairNotes = parse.repairs;
      const res = await fetch('/api/health-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      const r = (await res.json()) as HealthImportResult;
      // Report what was ignored as well as what landed — a key that silently
      // matched nothing is the failure mode this connector has to make visible.
      // A converted value (State of Mind valence → 1–10) carries its own note,
      // so "mood" reads as "mood (valence 0.6 → 8.2/10)" rather than as a
      // number with no relationship to what the Shortcut sent.
      const imported = r.imported.map((i) => (i.note ? `${i.metricId} (${i.note})` : i.metricId));
      const summary = imported.length
        ? `Imported ${imported.join(', ')} for ${r.date}`
        : `Nothing matched for ${r.date}`;

      // The REASON is the whole point of the ignored list — "ignored screenTime"
      // tells you something went wrong and nothing about what, which is barely
      // better than silence. Each skipped key is shown with why it was skipped,
      // and anything skipped makes this a warning rather than a success.
      setMsgDetail([
        // Repairs first: they explain why an import that "worked" still needs
        // attention in the Shortcut that produced it.
        ...repairNotes.map((n) => `fixed on the way in — ${n}`),
        ...r.ignored.map((i) => `${i.key} — ${i.reason}`),
      ]);
      setMsg(summary);
      setMsgIsWarning(r.ignored.length > 0);
      if (r.ignored.length === 0) setPaste('');
    } catch (e) {
      setErr(errorText(e, 'Import failed.'));
    } finally {
      setBusy(false);
      await loadHealth();
      await refresh(); // surface imported values in Today/Week/etc. without a manual reload
    }
  }, [health, paste, loadHealth, refresh]);

  const rotate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    setMsgDetail([]);
    setMsgIsWarning(false);
    try {
      const res = await fetch('/api/connectors/health/rotate', { method: 'POST' });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      const r = (await res.json()) as { token: string };
      setHealth((h) => (h ? { ...h, token: r.token } : h));
      setShowToken(true);
      setMsg('Token rotated — update your Shortcut’s Authorization header.');
    } catch (e) {
      setErr(errorText(e, 'Could not rotate token.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const endpoint = health?.endpoint ?? '/api/health-import';

  return (
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
              {(origin || '…') + endpoint}
            </code>
            <button
              type="button"
              onClick={() => void copy(`${origin}${endpoint}`, 'url')}
              className="shrink-0 rounded-lg border px-2 py-1.5 text-[11px]"
              style={SECONDARY_STYLE}
            >
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-[color:var(--faint)]">
            {/* Deployed, this URL works from anywhere. Served from localhost it
                only resolves on this machine, and the Shortcut needs the LAN IP. */}
            {origin.includes('localhost') || origin.includes('127.0.0.1')
              ? 'On your phone, use your PC’s IP instead of localhost — see README.'
              : 'Paste this straight into the Shortcut — it works on cellular, no Wi-Fi needed.'}
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
              style={SECONDARY_STYLE}
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={() => health && void copy(health.token, 'token')}
              className="shrink-0 rounded-lg border px-2 py-1.5 text-[11px]"
              style={SECONDARY_STYLE}
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
          placeholder='{"steps": 9336, "sleep": 7.6, "stateOfMind": 0.6}'
          aria-label="Health JSON to import"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void importPaste()}
            disabled={busy || !paste.trim()}
            className="flex-1 rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-40"
            style={PRIMARY_STYLE}
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
          <button
            type="button"
            onClick={() => void rotate()}
            disabled={busy}
            className="rounded-xl border px-4 py-2.5 text-[14px] font-medium disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
          >
            Rotate token
          </button>
        </div>
      </div>

      {err && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {err}
        </p>
      )}
      {msg && (
        <div className="mt-2" role="status">
          <p className="text-[12px]" style={{ color: msgIsWarning ? 'var(--red)' : 'var(--gold)' }}>
            {msg}
          </p>
          {/* One line per skipped key, each naming why. This is what turns a
              failed import into something fixable without opening devtools. */}
          {msgDetail.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {msgDetail.map((line) => (
                <li key={line} className="text-[11px] text-[color:var(--muted)]">
                  · {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
