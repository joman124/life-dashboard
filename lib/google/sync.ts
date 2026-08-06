/**
 * lib/google/sync.ts — server-only Google sync orchestrator.
 *
 * syncGoogle() pulls today's data from Google and writes it into the local DB:
 *   - Calendar → today's timeline rows (source='calendar'), idempotently replaced
 *   - Calendar → Deep Work hours (events matching the focus regex) → entry upsert
 *   - Gmail    → today's inbox thread count → sync_state('today_inbox_count')
 *
 * Calendar and Gmail are fetched independently and their failures are caught
 * separately, so one API erroring (e.g. a scope problem) never blocks the other.
 * Readable error strings are returned in `errors` for the UI to surface.
 */
import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import { endOfDay, formatClock, startOfDay, todayISO } from '@/lib/dates';
import {
  replaceCalendarTimeline,
  setSyncValue,
  upsertEntry,
  type TimelineInsert,
} from '@/lib/db';

/* --------------------------------------------------------------- result shape */

export interface SyncResult {
  calendar: { events: number };
  deepWork: { hours: number } | null;
  gmail: { inboxCount: number } | null;
  lastSync: string;
  errors: { calendar?: string; gmail?: string };
}

/** Events whose title looks like focused work feed the Deep Work metric. */
const DEEP_WORK_RE = /deep work|focus|writing|build/i;

/* --------------------------------------------------------------- formatting */

/** Humanize a duration in minutes: "1h 30m", "2h", "45m", "0m". */
function humanizeDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h ${rem}m`;
  if (h > 0) return `${h}h`;
  return `${rem}m`;
}

/** Best-effort readable message from a googleapis error. */
function apiErrorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    // googleapis GaxiosError carries response.data.error{,.message}.
    const resp = (e as { response?: { data?: { error?: unknown } } }).response;
    const errData = resp?.data?.error;
    if (errData) {
      if (typeof errData === 'string') return errData;
      if (typeof errData === 'object') {
        const msg = (errData as { message?: unknown }).message;
        if (typeof msg === 'string' && msg) return msg;
      }
    }
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return 'Unknown error';
}

/* --------------------------------------------------------------- sub-syncs */

interface CalendarOutcome {
  timelineCount: number;
  deepWorkHours: number;
  deepWorkMatched: boolean;
}

async function syncCalendar(auth: Auth.OAuth2Client, today: string): Promise<CalendarOutcome> {
  const calendar = google.calendar({ version: 'v3', auth });

  // The query window is the dashboard timezone's calendar day, expressed as
  // true UTC instants. Deriving it from the host clock (setHours) would ask
  // Google for the wrong 24 hours whenever the server runs in UTC, which is
  // exactly what Vercel does.
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay(today).toISOString(),
    timeMax: endOfDay(today).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const events = res.data.items ?? [];
  const items: Omit<TimelineInsert, 'source'>[] = [];
  let deepWorkMinutes = 0;
  let deepWorkMatched = false;

  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const title = ev.summary?.trim() || '(no title)';
    const startDateTime = ev.start?.dateTime;
    const endDateTime = ev.end?.dateTime;

    // All-day events have `date` but no `dateTime`. We INCLUDE them with a
    // sentinel time of 00:00 and detail 'all day' so they still appear on the
    // timeline; they never contribute to Deep Work (no measurable duration).
    if (!startDateTime) {
      items.push({ date: today, time: '00:00', title, detail: 'all day' });
      continue;
    }

    const time = formatClock(startDateTime);
    let detail = '';
    if (endDateTime) {
      const durMin = (new Date(endDateTime).getTime() - new Date(startDateTime).getTime()) / 60000;
      detail = humanizeDuration(durMin);
      if (DEEP_WORK_RE.test(title)) {
        deepWorkMinutes += durMin;
        deepWorkMatched = true;
      }
    }
    items.push({ date: today, time, title, detail });
  }

  await replaceCalendarTimeline(today, items);

  return {
    timelineCount: items.length,
    deepWorkHours: Math.round((deepWorkMinutes / 60) * 10) / 10,
    deepWorkMatched,
  };
}

async function syncGmailInboxCount(auth: Auth.OAuth2Client, today: string): Promise<number> {
  const gmail = google.gmail({ version: 'v1', auth });

  // Gmail's date query uses YYYY/MM/DD. `after:` is midnight-inclusive of today.
  const q = `in:inbox after:${today.replace(/-/g, '/')}`;

  let count = 0;
  let pageToken: string | undefined;
  let pages = 0;
  const MAX_PAGES = 5; // cap so a huge inbox can't make sync run away
  let lastEstimate = 0;

  do {
    const res = await gmail.users.threads.list({
      userId: 'me',
      q,
      maxResults: 100,
      pageToken,
    });
    const threads = res.data.threads ?? [];
    count += threads.length;
    lastEstimate = res.data.resultSizeEstimate ?? lastEstimate;
    pageToken = res.data.nextPageToken ?? undefined;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  // If we hit the page cap there may be more; fall back to Gmail's own estimate
  // when it's larger than what we counted, so the number isn't misleadingly low.
  if (pageToken && lastEstimate > count) return lastEstimate;
  return count;
}

/* --------------------------------------------------------------- orchestrator */

export async function syncGoogle(auth: Auth.OAuth2Client): Promise<SyncResult> {
  const today = todayISO();
  const errors: SyncResult['errors'] = {};

  let calendarEvents = 0;
  let deepWork: SyncResult['deepWork'] = null;
  let gmail: SyncResult['gmail'] = null;

  // Calendar (independent failure).
  try {
    const outcome = await syncCalendar(auth, today);
    calendarEvents = outcome.timelineCount;
    // Only write Deep Work when at least one event matched. Writing 0 on a day
    // with no matching events would clobber a manually-logged value — so we skip.
    if (outcome.deepWorkMatched) {
      await upsertEntry('deep-work', today, outcome.deepWorkHours);
      deepWork = { hours: outcome.deepWorkHours };
    }
  } catch (e) {
    errors.calendar = apiErrorMessage(e);
  }

  // Gmail (independent failure).
  try {
    const inboxCount = await syncGmailInboxCount(auth, today);
    await setSyncValue('today_inbox_count', String(inboxCount));
    gmail = { inboxCount };
  } catch (e) {
    errors.gmail = apiErrorMessage(e);
  }

  const lastSync = new Date().toISOString();
  await setSyncValue('last_google_sync', lastSync);

  return {
    calendar: { events: calendarEvents },
    deepWork,
    gmail,
    lastSync,
    errors,
  };
}
