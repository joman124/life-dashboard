'use client';

// BriefConnector — the dashboard's read feed for the Cowork morning brief.
//
// The other two connectors pull data in. This one is the only place data leaves:
// a scheduled Claude task fetches /api/brief each morning and folds the week so
// far, and today's focus, into the brief it renders before the app is opened.
//
// The panel exists to hand over three things and prove one: the URL (token
// baked in, because the fetch tool on the other end cannot set a header), the
// two lines to paste into the task, the rotate button — and a preview, so the
// endpoint is known to work before anything is wired to it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRIMARY_STYLE, SECONDARY_STYLE, errorText, humanizeSync, readError } from './shared';

interface BriefState {
  token: string;
  endpoint: string;
  lastFetch: string | null;
}

/** Masked stand-in so a shared screen never shows the token by accident. */
const MASK = '•'.repeat(18);

export default function BriefConnector() {
  const [brief, setBrief] = useState<BriefState | null>(null);
  const [origin, setOrigin] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors/brief');
      if (!res.ok) throw new Error(await readError(res));
      setBrief((await res.json()) as BriefState);
    } catch (e) {
      setErr(errorText(e, 'Could not load the morning brief connector.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const endpoint = brief?.endpoint ?? '/api/brief';

  /** The real URL, token and all. Only ever rendered when showToken is on. */
  const feedUrl = brief && origin ? `${origin}${endpoint}?token=${brief.token}` : '';

  /**
   * The two lines that go into the Cowork task. `Sections:` is the morning
   * brief's own hook for extra blocks — one titled block per entry, rendered
   * below the rest of the page — so each line names its heading and then says
   * what to fetch and what to do with it.
   */
  const sectionsText = useMemo(() => {
    const url = feedUrl || `${origin || 'https://your-dashboard'}${endpoint}?token=YOUR_TOKEN`;
    return [
      'Sections:',
      `- This week so far — fetch ${url}&format=text and summarise how each metric has gone week to date, worst gap first. Use its numbers as given.`,
      '- Focus today — from that same fetch, the focus recommendations in the order given, each in one sentence.',
    ].join('\n');
  }, [feedUrl, origin, endpoint]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setErr('Copy failed — select the text and copy it manually.');
    }
  }

  /**
   * Fetch the brief exactly as Cowork will, and show what comes back. The point
   * is not the content: it is that a 401 or an empty week shows up here, now,
   * rather than as a silently wrong page at 7am.
   */
  const runPreview = useCallback(async () => {
    if (!brief) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`${endpoint}?format=text`, {
        headers: { Authorization: `Bearer ${brief.token}` },
      });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      setPreview(await res.text());
      setMsg('The feed answered — this is what Cowork will read.');
    } catch (e) {
      setErr(errorText(e, 'Could not reach the brief endpoint.'));
    } finally {
      setBusy(false);
      await load();
    }
  }, [brief, endpoint, load]);

  const rotate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch('/api/connectors/brief/rotate', { method: 'POST' });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      const r = (await res.json()) as { token: string };
      setBrief((b) => (b ? { ...b, token: r.token } : b));
      setShowToken(true);
      setPreview(null);
      setMsg('Token rotated. The old link is dead — paste the new one into your Cowork task now.');
    } catch (e) {
      setErr(errorText(e, 'Could not rotate token.'));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="py-3" style={{ borderTop: '1px solid var(--hairline)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px]">Morning brief (Cowork)</div>
          <div className="mt-0.5 text-[11.5px] text-[color:var(--muted)]">
            Read-only feed of your week so far and today’s focus.
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--faint)]">
            {brief?.lastFetch
              ? humanizeSync(brief.lastFetch).replace('Synced', 'Last read')
              : 'Never read yet'}
          </div>
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
          <div className="eyebrow !text-[9.5px]">Feed URL (contains your token)</div>
          <div className="mt-1 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 font-mono text-[11px]"
              style={{ borderColor: 'var(--hairline)', background: 'var(--card-inset)' }}
            >
              {brief && origin
                ? showToken
                  ? feedUrl
                  : `${origin}${endpoint}?token=${MASK}`
                : '…'}
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
              onClick={() => feedUrl && void copy(feedUrl, 'url')}
              className="shrink-0 rounded-lg border px-2 py-1.5 text-[11px]"
              style={SECONDARY_STYLE}
            >
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-[color:var(--faint)]">
            {/* The token rides in the URL because the brief fetches with a tool
                that cannot set an Authorization header. Anyone holding this link
                can read your metrics — hence Rotate. */}
            {origin.includes('localhost') || origin.includes('127.0.0.1')
              ? 'This is a localhost URL — Cowork cannot reach it. Use your deployed dashboard’s URL instead.'
              : 'Anyone with this link can read your metrics. Rotate it if it ends up somewhere it should not be.'}
          </p>
        </div>

        <div>
          <div className="eyebrow !text-[9.5px]">Paste into your Cowork brief</div>
          <textarea
            className="input mt-1 font-mono text-[12px]"
            rows={6}
            readOnly
            value={showToken ? sectionsText : sectionsText.replace(/token=[^&\s]+/, `token=${MASK}`)}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Sections lines to paste into the Cowork morning brief"
          />
          <button
            type="button"
            onClick={() => void copy(sectionsText, 'sections')}
            disabled={!brief}
            className="mt-2 w-full rounded-xl border py-2 text-[13px] font-medium disabled:opacity-40"
            style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }}
          >
            {copied === 'sections' ? 'Copied' : 'Copy the two lines'}
          </button>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={busy || !brief}
          className="flex-1 rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-40"
          style={PRIMARY_STYLE}
        >
          {busy ? 'Working…' : 'Preview the feed'}
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

      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] text-[color:var(--muted)]">
          How to wire this into your morning brief
        </summary>
        {/* One action per step, naming where to start and what to look for.
            Anything the user has to do themselves is written out in full — see
            the project spec's rule on directions. */}
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] text-[color:var(--muted)]">
          <li>Tap <span className="text-[color:var(--text)]">Preview the feed</span> above. You should see your week written out. If you see a red error instead, fix that first — the brief will hit the same error.</li>
          <li>Tap <span className="text-[color:var(--text)]">Copy the two lines</span>. That copies the real link, token included, even while it shows dots on screen.</li>
          <li>Open Claude Cowork and start a new conversation.</li>
          <li>Type <span className="font-mono text-[color:var(--text)]">/morning</span> and press space.</li>
          <li>Paste the two lines after it, then send the message.</li>
          <li>Read the page it renders. It should end with a block titled “This week so far” and one titled “Focus today”. If both are missing, the fetch failed — come back and press Preview.</li>
          <li>In that same conversation, send: <span className="text-[color:var(--text)]">set this up as a recurring weekday task</span>. Claude stores the sections with it, so every morning’s brief pulls your dashboard.</li>
          <li>If you ever press <span className="text-[color:var(--text)]">Rotate token</span>, repeat steps 2 to 7 — the stored task still holds the dead link.</li>
        </ol>
      </details>

      {err && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {err}
        </p>
      )}
      {msg && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--gold)' }} role="status">
          {msg}
        </p>
      )}
      {preview && (
        <pre
          className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border p-2 font-mono text-[11px] text-[color:var(--muted)]"
          style={{ borderColor: 'var(--hairline)', background: 'var(--card-inset)' }}
        >
          {preview}
        </pre>
      )}
    </div>
  );
}
