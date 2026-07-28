'use client';

// DataPanel — own your data: export, restore, and clear.
//
// Export alone is only half a backup: a file you cannot restore is not a backup.
// This panel closes that loop and adds the reset that a seeded demo install
// needs, because until the generated 30 days are cleared the dashboard is
// reporting streaks and correlations computed from numbers that never happened.

import { useRef, useState } from 'react';
import { PRIMARY_BTN, PRIMARY_STYLE, errorText, readError } from './connectors/shared';

interface ImportResult {
  imported: { metrics: number; entries: number };
  mode: 'merge' | 'replace';
}

type Busy = 'export' | 'import' | 'reset' | null;

export default function DataPanel({ refresh }: { refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setMsg(null);
    setErr(null);
  }

  async function handleExport() {
    setBusy('export');
    reset();
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
      setMsg('Exported.');
    } catch (e) {
      setErr(errorText(e, 'Export failed.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(file: File) {
    setBusy('import');
    reset();
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('That file isn’t valid JSON.');
      }
      // The server re-validates every row; this only attaches the chosen mode.
      const body =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? { ...(parsed as Record<string, unknown>), mode: replaceMode ? 'replace' : 'merge' }
          : parsed;

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      const r = (await res.json()) as ImportResult;
      setMsg(
        `Restored ${r.imported.metrics} metric${r.imported.metrics === 1 ? '' : 's'} and ` +
          `${r.imported.entries.toLocaleString('en-US')} ` +
          `${r.imported.entries === 1 ? 'entry' : 'entries'} (${r.mode}).`,
      );
    } catch (e) {
      setErr(errorText(e, 'Import failed.'));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = ''; // allow re-picking the same file
      await refresh();
    }
  }

  async function handleReset() {
    setBusy('reset');
    reset();
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      const r = (await res.json()) as { entriesDeleted: number };
      setMsg(
        `Cleared ${r.entriesDeleted.toLocaleString('en-US')} ` +
          `${r.entriesDeleted === 1 ? 'entry' : 'entries'}. Your metrics were kept.`,
      );
      setConfirmingReset(false);
    } catch (e) {
      setErr(errorText(e, 'Reset failed.'));
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  return (
    <section className="card p-4">
      <div className="eyebrow">Your data</div>

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy !== null}
        className="mt-3 w-full rounded-xl border py-2.5 text-[14px] font-medium disabled:opacity-60"
        style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }}
      >
        {busy === 'export' ? 'Exporting…' : 'Export data (JSON)'}
      </button>

      <div className="mt-3">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Choose an export file to restore"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className="w-full rounded-xl border py-2.5 text-[14px] font-medium disabled:opacity-60"
          style={{ borderColor: 'var(--hairline)', color: 'var(--text)' }}
        >
          {busy === 'import' ? 'Restoring…' : 'Restore from a file'}
        </button>

        <label className="mt-2 flex items-start gap-2 text-[11.5px] text-[color:var(--muted)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={replaceMode}
            onChange={(e) => setReplaceMode(e.target.checked)}
          />
          <span>
            Replace everything instead of merging.
            <span className="block text-[10.5px]" style={{ color: 'var(--faint)' }}>
              {replaceMode
                ? 'Current metrics and entries are deleted first, leaving exactly the file.'
                : 'Merging keeps anything the file doesn’t mention and overwrites what it does.'}
            </span>
          </span>
        </label>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
        {confirmingReset ? (
          <div role="alertdialog" aria-label="Clear all logged history">
            <p className="text-[13px]">
              Delete <span style={{ color: 'var(--red)' }}>all logged history</span>?
            </p>
            <p className="mt-1 text-[11.5px]" style={{ color: 'var(--faint)' }}>
              Every entry and timeline event is removed. Your metrics are kept. This cannot be
              undone — export first if you want a copy.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={busy !== null}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                style={{ background: 'var(--red)', color: '#fff' }}
              >
                {busy === 'reset' ? 'Clearing…' : 'Clear history'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                disabled={busy !== null}
                className="rounded-lg border px-3 py-1.5 text-[12px] disabled:opacity-40"
                style={{ borderColor: 'var(--hairline)', color: 'var(--text)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                reset();
                setConfirmingReset(true);
              }}
              disabled={busy !== null}
              className="w-full rounded-xl border py-2.5 text-[14px] font-medium disabled:opacity-60"
              style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
            >
              Clear all logged history
            </button>
            <p className="mt-1.5 text-[10.5px]" style={{ color: 'var(--faint)' }}>
              A fresh install ships with 30 days of generated sample data. Clear it once you start
              logging for real, so streaks and correlations reflect only you.
            </p>
          </>
        )}
      </div>

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
    </section>
  );
}
