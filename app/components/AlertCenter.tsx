'use client';

import { useEffect, useRef, useState } from 'react';
import type { Entry, Metric } from '@/lib/types';
import { dashboardAlerts } from '@/lib/feedback';
import { formatClock } from '@/lib/dates';
import Icon from './Icon';

const KEY = 'life-alert-preferences';
interface Preferences {
  reminders: boolean;
  goals: boolean;
  browser: boolean;
  time: string;
}
const DEFAULTS: Preferences = { reminders: true, goals: true, browser: false, time: '20:00' };
export default function AlertCenter({
  metrics,
  entries,
  today,
  open,
  onClose,
  onLog,
  onCount,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
  open: boolean;
  onClose: () => void;
  onLog: () => void;
  onCount: (count: number) => void;
}) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const sentDay = useRef<string | null>(null);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      if (p && typeof p === 'object')
        setPrefs({
          reminders: typeof p.reminders === 'boolean' ? p.reminders : true,
          goals: typeof p.goals === 'boolean' ? p.goals : true,
          browser: p.browser === true,
          time:
            typeof p.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)
              ? p.time
              : '20:00',
        });
      const d: unknown = JSON.parse(localStorage.getItem(`life-alert-dismissed:${today}`) ?? '[]');
      setDismissed(Array.isArray(d) ? d.filter((v): v is string => typeof v === 'string') : []);
    } catch {
      setMessage('Preferences could not be restored on this browser.');
    }
    setReady(true);
  }, [today]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    const tick = () => setNow(new Date());
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
    };
  }, []);
  const alerts = dashboardAlerts(
    metrics,
    entries,
    today,
    prefs.reminders && formatClock(now) >= prefs.time,
  ).filter((a) => (a.kind !== 'goal' || prefs.goals) && !dismissed.includes(a.id));
  useEffect(() => {
    onCount(alerts.length);
  }, [alerts.length, onCount]);
  useEffect(() => {
    if (
      !ready ||
      !prefs.browser ||
      !('Notification' in window) ||
      Notification.permission !== 'granted'
    )
      return;
    // Only one generic notification per day/device; no personal values on a lock screen.
    const actionable = alerts.find((a) => a.kind !== 'coverage');
    if (!actionable || sentDay.current === today) return;
    try {
      const key = `life-alert-sent:${today}`;
      if (localStorage.getItem(key)) return;
      const notification = new Notification('Life Dashboard', {
        body: 'Your check-in or goal update is ready. Open Life Dashboard to take a look.',
        tag: `life-check-in:${today}`,
        icon: '/icon-192.png',
      });
      sentDay.current = today;
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* Keep the in-memory daily limit. */
      }
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      setMessage('Browser alerts are unavailable here. Your alerts are still shown in the app.');
    }
  }, [ready, prefs.browser, today, alerts]);
  function update(patch: Partial<Preferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      setMessage('Preferences apply until you close this page; device storage is unavailable.');
    }
  }
  async function enableBrowser() {
    if (!('Notification' in window) || !window.isSecureContext) {
      setMessage('This browser cannot send alerts here. In-app alerts are available below.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      update({ browser: permission === 'granted' });
      setMessage(
        permission === 'granted'
          ? 'Browser alerts enabled while this page is running.'
          : 'Browser alerts were not enabled. In-app alerts will continue.',
      );
    } catch {
      setMessage('This browser does not support page notifications. In-app alerts will continue.');
    }
  }
  if (!open) return null;
  return (
    <section className="card alert-center" aria-label="Alert center">
      <div className="section-heading">
        <div>
          <div className="eyebrow">A nudge, when it helps</div>
          <h2 className="font-display">Your alerts</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close alerts">
          <Icon name="close" />
        </button>
      </div>
      <div className="alert-list">
        {alerts.length ? (
          alerts.map((a) => (
            <div key={a.id} className={`alert-item alert-${a.kind}`}>
              <Icon name={a.kind === 'goal' ? 'trends' : 'bell'} size={18} />
              <div>
                <h3>{a.title}</h3>
                <p>{a.detail}</p>
                {a.kind === 'reminder' && (
                  <button className="text-button" onClick={onLog}>
                    Check in now →
                  </button>
                )}
              </div>
              <button
                className="icon-button"
                aria-label={`Dismiss: ${a.title}`}
                onClick={() => {
                  const next = [...dismissed, a.id];
                  setDismissed(next);
                  try {
                    localStorage.setItem(`life-alert-dismissed:${today}`, JSON.stringify(next));
                  } catch {
                    /* dismissal still works in memory */
                  }
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))
        ) : (
          <div className="alert-empty">
            <Icon name="check" />
            <p>You're all caught up. We'll surface useful nudges here.</p>
          </div>
        )}
      </div>
      <div className="alert-preferences">
        <label className="preference-row">
          <span>
            Daily check-in reminder<small>Dashboard time · UTC−7</small>
          </span>
          <input
            type="checkbox"
            checked={prefs.reminders}
            onChange={(e) => update({ reminders: e.target.checked })}
          />
        </label>
        <label className="preference-row">
          <span>Remind me at</span>
          <input
            type="time"
            className="input reminder-time"
            value={prefs.time}
            disabled={!prefs.reminders}
            onChange={(e) => {
              if (e.target.value) update({ time: e.target.value });
            }}
          />
        </label>
        <label className="preference-row">
          <span>
            Goal alerts<small>After 3 completed days outside a daily target</small>
          </span>
          <input
            type="checkbox"
            checked={prefs.goals}
            onChange={(e) => update({ goals: e.target.checked })}
          />
        </label>
        <div className="preference-row">
          <span>
            Browser notifications
            <small>
              {prefs.browser ? 'Enabled on this device' : 'Optional · permission required'}
            </small>
          </span>
          <button
            className="secondary-button"
            onClick={() => (prefs.browser ? update({ browser: false }) : void enableBrowser())}
          >
            {prefs.browser ? 'Turn off' : 'Enable'}
          </button>
        </div>
        <p className="fine-print">
          In-app alerts are always available. Browser notifications need this page running; they
          cannot deliver after it is closed. Some mobile browsers do not support them. Preferences
          are saved on this device.
        </p>
        {message && (
          <p className="fine-print" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
