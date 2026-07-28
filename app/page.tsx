'use client';

// Life Dashboard shell — page header (greeting, date, weekly score, inbox),
// sticky five-tab bar, and the active tab's content. All data flows through
// the useDashboard hook; tab state lives in React state.

import { useEffect, useState } from 'react';
import { formatDateLong, todayISO } from '@/lib/dates';
import { useDashboard } from './components/useDashboard';
import { weeklyScore } from './components/data';
import Today from './components/tabs/Today';
import Week from './components/tabs/Week';
import Trends from './components/tabs/Trends';
import Streaks from './components/tabs/Streaks';
import Track from './components/tabs/Track';

type TabId = 'today' | 'week' | 'trends' | 'streaks' | 'track';

const TABS: { id: TabId; label: string; name: string }[] = [
  { id: 'today', label: 'Today', name: 'Today' },
  { id: 'week', label: 'Week', name: 'Week' },
  { id: 'trends', label: 'Trends', name: 'Trends' },
  { id: 'streaks', label: '🔥', name: 'Streaks' },
  { id: 'track', label: '⚙', name: 'Track' },
];

function greeting(): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  const name = (process.env.NEXT_PUBLIC_USER_NAME ?? '').trim();
  return `Good ${part}${name ? `, ${name}` : ''}.`;
}

/** Turn a Google OAuth redirect code into readable banner text. */
function mapGoogleError(code: string): string {
  if (code === 'not_configured') {
    return "Google isn't configured yet — add credentials to .env.local (see README).";
  }
  if (code === 'access_denied') return 'You declined Google access.';
  return code; // URLSearchParams has already decoded any %-encoded message
}

interface Banner {
  kind: 'success' | 'error';
  text: string;
}

export default function Page() {
  const dash = useDashboard();
  const [tab, setTab] = useState<TabId>('today');
  const [banner, setBanner] = useState<Banner | null>(null);

  // Handle the OAuth callback redirect (/?connector=google&status|error=…):
  // show a banner, jump to the Track tab, then strip the query so a reload
  // doesn't replay it. Runs once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connector') === 'google') {
      if (params.get('status') === 'connected') {
        setBanner({ kind: 'success', text: 'Google connected.' });
        setTab('track');
      } else {
        const error = params.get('error');
        if (error) {
          setBanner({ kind: 'error', text: mapGoogleError(error) });
          setTab('track');
        }
      }
    }
    if (params.has('connector')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the banner after a few seconds.
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(id);
  }, [banner]);

  const today = todayISO();
  const score = weeklyScore(dash.metrics, dash.entries, today);
  const inbox = dash.syncState.todayInboxCount;
  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="mx-auto min-h-screen max-w-[480px]">
      <header className="flex items-start justify-between gap-3 px-4 pb-4 pt-6">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-tight" suppressHydrationWarning>
            {greeting()}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-[color:var(--muted)]" suppressHydrationWarning>
              {formatDateLong(today)}
            </p>
            <span
              className="rounded-full border px-2 py-px text-[10.5px]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--faint)' }}
              title="Today's Gmail inbox count — updates when you sync Google"
            >
              {inbox === null ? '— inbox' : `${inbox.toLocaleString('en-US')} inbox`}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1" title="Weekly score">
          <div
            className="grid h-12 w-12 place-items-center rounded-full border"
            style={{ borderColor: 'var(--gold-dim)' }}
          >
            <span className="font-display text-[17px]" style={{ color: 'var(--gold)' }}>
              {dash.loading ? '–' : score}
            </span>
          </div>
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--faint)]">
            Week
          </span>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Dashboard sections"
        className="sticky top-0 z-20 border-b"
        style={{
          borderColor: 'var(--hairline)',
          background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div className="grid grid-cols-5">
          {TABS.map((t) => {
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={t.name}
                onClick={() => setTab(t.id)}
                className="relative py-3 text-[13px] font-medium"
                style={{ color: isActive ? 'var(--gold)' : 'var(--muted)' }}
              >
                {t.label}
                {isActive && (
                  <span
                    className="absolute inset-x-4 bottom-0 h-[2px] rounded-full"
                    style={{ background: 'var(--gold)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <main role="tabpanel" aria-label={activeTab.name} className="px-4 pb-16 pt-4">
        {banner && (
          <div
            className="card mb-3 flex items-start justify-between gap-3 p-3"
            role="status"
            style={{ borderColor: banner.kind === 'success' ? 'var(--gold-dim)' : 'var(--red)' }}
          >
            <p
              className="text-[13px]"
              style={{ color: banner.kind === 'success' ? 'var(--gold)' : 'var(--red)' }}
            >
              {banner.text}
            </p>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="shrink-0 text-[12px] text-[color:var(--muted)]"
            >
              Dismiss
            </button>
          </div>
        )}
        {dash.loadError && (
          <div
            className="card card-gold mb-3 p-4"
            style={{ borderColor: 'var(--red)' }}
            role="alert"
          >
            <p className="text-[13px]" style={{ color: 'var(--red)' }}>
              {dash.loadError}
            </p>
            <button
              type="button"
              onClick={() => void dash.refresh()}
              className="mt-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text)' }}
            >
              Retry
            </button>
          </div>
        )}
        {dash.actionError && (
          <div className="card mb-3 flex items-start justify-between gap-3 p-3" role="alert">
            <p className="text-[12px]" style={{ color: 'var(--red)' }}>
              {dash.actionError}
            </p>
            <button
              type="button"
              onClick={dash.dismissActionError}
              className="shrink-0 text-[12px] text-[color:var(--muted)]"
            >
              Dismiss
            </button>
          </div>
        )}

        {dash.loading ? (
          <div className="space-y-3" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card h-28 animate-pulse opacity-60" />
            ))}
          </div>
        ) : tab === 'today' ? (
          <Today
            metrics={dash.metrics}
            entries={dash.entries}
            timeline={dash.timeline}
            today={today}
            onLog={(metricId, value, date) => void dash.logEntry(metricId, value, date)}
          />
        ) : tab === 'week' ? (
          <Week metrics={dash.metrics} entries={dash.entries} today={today} />
        ) : tab === 'trends' ? (
          <Trends metrics={dash.metrics} entries={dash.entries} today={today} />
        ) : tab === 'streaks' ? (
          <Streaks metrics={dash.metrics} entries={dash.entries} today={today} />
        ) : (
          <Track
            metrics={dash.metrics}
            onToggle={(id, active) => void dash.setMetricActive(id, active)}
            onAdd={dash.addMetric}
            onEdit={dash.editMetric}
            onDelete={dash.removeMetric}
            refresh={dash.refresh}
          />
        )}
      </main>
    </div>
  );
}
