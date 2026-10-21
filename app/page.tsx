'use client';

// Life Dashboard shell — page header (greeting, date, weekly score, inbox),
// sticky five-tab bar, and the active tab's content. All data flows through
// the useDashboard hook; tab state lives in React state.

import { useEffect, useState } from 'react';
import { formatDateLong, hourOfDay, isoWeek, todayISO } from '@/lib/dates';
import { useDashboard } from './components/useDashboard';
import Today from './components/tabs/Today';
import Week from './components/tabs/Week';
import Trends from './components/tabs/Trends';
import Streaks from './components/tabs/Streaks';
import Track from './components/tabs/Track';
import Icon from './components/Icon';
import AlertCenter from './components/AlertCenter';

// Date-sensitive HTML must be rendered per request rather than frozen at build time.
export const dynamic = 'force-dynamic';

type TabId = 'today' | 'week' | 'trends' | 'streaks' | 'track';

const TABS: { id: TabId; label: string; name: string }[] = [
  { id: 'today', label: 'Today', name: 'Today' },
  { id: 'week', label: 'Week', name: 'Week' },
  { id: 'trends', label: 'Trends', name: 'Trends' },
  { id: 'streaks', label: 'Streaks', name: 'Streaks' },
  { id: 'track', label: 'Settings', name: 'Track' },
];

/**
 * Time-of-day greeting, resolved in the dashboard timezone (UTC-7).
 *
 * It reads the same clock on the server and in the browser, which is the whole
 * point: this used to call getHours() on whichever machine ran it, so the
 * server rendered a UTC greeting, hydration was told to leave the mismatch
 * alone, and the wrong half of the day stuck on screen.
 */
function greeting(): string {
  const h = hourOfDay();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
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
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const tick = () => {
      const next = todayISO();
      if (next !== today) {
        setToday(next);
        void dash.refresh();
      }
    };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [dash.refresh, today]);
  function openCheckIn() {
    setTab('today');
    setAlertsOpen(false);
    window.setTimeout(
      () =>
        document
          .getElementById('daily-check-in')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    );
  }

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

  const week = isoWeek(today);
  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#dashboard-content">
        Skip to dashboard
      </a>
      <header className="app-header">
        <button
          type="button"
          className="brand"
          onClick={() => setTab('today')}
          aria-label="Life Dashboard home"
        >
          <span className="brand-mark">
            l<span>•</span>
          </span>
          <span>
            life<span className="brand-divider"> / </span>
            <small>dashboard</small>
          </span>
        </button>
        <div className="header-actions">
          <span className="header-week">
            Week {week}
            <span className="status-dot" />A little better, every day
          </span>
          <button
            className={`icon-button alert-button ${alertsOpen ? 'is-active' : ''}`}
            aria-label={`Alerts${alertCount ? `, ${alertCount} new` : ''}`}
            aria-expanded={alertsOpen}
            aria-controls="alerts-region"
            onClick={() => setAlertsOpen((v) => !v)}
          >
            <Icon name="bell" />
            {alertCount > 0 && <span className="alert-badge">{alertCount}</span>}
          </button>
        </div>
      </header>
      <nav role="tablist" aria-label="Dashboard sections" className="dashboard-nav">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            aria-label={t.name}
            aria-controls="dashboard-content"
            tabIndex={t.id === tab ? 0 : -1}
            onClick={() => {
              setTab(t.id);
              window.scrollTo({ top: 0 });
            }}
            onKeyDown={(e) => {
              const direction = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              const next = direction
                ? (i + direction + TABS.length) % TABS.length
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? TABS.length - 1
                    : null;
              if (next !== null) {
                e.preventDefault();
                setTab(TABS[next].id);
                document.getElementById(`tab-${TABS[next].id}`)?.focus();
              }
            }}
          >
            <Icon name={t.id} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            {formatDateLong(today)} <span>·</span> Your personal rhythm
          </p>
          <h1 className="font-display">
            {tab === 'today'
              ? greeting()
              : tab === 'week'
                ? 'A week in perspective.'
                : tab === 'trends'
                  ? 'Find your patterns.'
                  : tab === 'streaks'
                    ? 'Keep showing up.'
                    : 'Make it yours.'}
          </h1>
          <p className="intro-description">
            {tab === 'today'
              ? 'A moment to check in. A clearer way forward.'
              : tab === 'week'
                ? 'Notice your progress. Choose your next small win.'
                : tab === 'trends'
                  ? 'Your data, with the context it deserves.'
                  : tab === 'streaks'
                    ? 'Consistency is built one small action at a time.'
                    : 'Track what matters, on your terms.'}
          </p>
        </div>
        <button className="primary-button intro-log" onClick={openCheckIn}>
          <Icon name="plus" size={18} />
          Check in
        </button>
      </div>
      <div id="alerts-region">
        {!dash.loading && (
          <AlertCenter
            metrics={dash.metrics}
            entries={dash.entries}
            today={today}
            open={alertsOpen}
            onClose={() => setAlertsOpen(false)}
            onLog={openCheckIn}
            onCount={setAlertCount}
          />
        )}
      </div>
      <main
        id="dashboard-content"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.id}`}
        tabIndex={0}
        className={`dashboard-content ${tab === 'today' ? '' : 'secondary-content'}`}
      >
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
            lastGoogleSync={dash.syncState.lastGoogleSync}
            inboxCount={dash.syncState.todayInboxCount}
            inboxDigest={dash.syncState.inboxDigest}
            onLog={dash.logEntry}
            onSaveAll={dash.logMany}
            refresh={dash.refresh}
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
      <footer className="app-footer">
        <span>life / dashboard</span>
        <span>Progress, with perspective.</span>
      </footer>
    </div>
  );
}
