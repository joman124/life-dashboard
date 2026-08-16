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
 *
 * The one failure that is NOT per-source is an expired/revoked refresh token:
 * both APIs share the OAuth client, so both throw `invalid_grant` and reporting
 * them independently produced the useless "Calendar: invalid_grant · Gmail:
 * invalid_grant". That case is detected, collapsed into one actionable message,
 * and recorded in sync_state so the connector card can show `token_expired`
 * with a Reconnect button without having to call Google again.
 */
import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import type { InboxMessage } from '@/lib/types';
import { endOfDay, formatClock, startOfDay, todayISO } from '@/lib/dates';
import {
  deleteSyncValue,
  replaceCalendarTimeline,
  setSyncValue,
  upsertEntry,
  type TimelineInsert,
} from '@/lib/db';
import { authExpiredMessage, isAuthExpired } from './errors';

/**
 * sync_state key holding the reason the Google connection needs re-consent.
 * Its presence is what makes /api/connectors/google report `token_expired`;
 * it is cleared on a successful sync, on connect, and on disconnect.
 */
export const GOOGLE_AUTH_ERROR_KEY = 'google_auth_error';

/* --------------------------------------------------------------- result shape */

export interface SyncResult {
  calendar: { events: number };
  deepWork: { hours: number } | null;
  gmail: { inboxCount: number; digest: InboxMessage[] } | null;
  /** ISO timestamp of the last sync that actually retrieved something, or null. */
  lastSync: string | null;
  errors: { calendar?: string; gmail?: string; gmailDigest?: string };
  /**
   * True when the stored refresh token can no longer be used and the user must
   * reconnect. When set, `authError` carries the single message to show and the
   * per-source `errors` are omitted — they would only repeat the same cause.
   */
  authExpired: boolean;
  authError?: string;
}

/**
 * How many messages the Today brief summarises. Each one costs a metadata
 * fetch, and a summary you have to scroll is not a summary.
 */
const INBOX_DIGEST_SIZE = 6;

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

/** Read one header by name, case-insensitively. Absent → ''. */
function headerValue(
  headers: { name?: string | null; value?: string | null }[],
  name: string,
): string {
  const hit = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return hit?.value?.trim() ?? '';
}

/**
 * Reduce a From header to something worth reading in a list.
 * `"Jane Doe" <jane@x.com>` → `Jane Doe`; a bare address stays as-is.
 */
export function displayFrom(raw: string): string {
  const angled = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (angled) {
    const name = (angled[1] ?? '').trim();
    return name || (angled[2] ?? '').trim();
  }
  return raw.trim() || 'Unknown sender';
}

/**
 * The newest few inbox messages with sender, subject and arrival time.
 *
 * Deliberately separate from the count: the count is one cheap list call, this
 * is one metadata fetch per message. Kept to INBOX_DIGEST_SIZE and fetched in
 * parallel so an inbox of any size costs the same.
 */
async function fetchInboxDigest(
  gmail: ReturnType<typeof google.gmail>,
  q: string,
): Promise<InboxMessage[]> {
  const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: INBOX_DIGEST_SIZE });
  const ids = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string');

  const messages = await Promise.all(
    ids.map(async (id) => {
      // format=metadata avoids downloading bodies — we only render headers, and
      // pulling message bodies into the local DB is more of the mailbox than
      // this dashboard has any reason to hold.
      const res = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      });
      const headers = res.data.payload?.headers ?? [];
      const internal = res.data.internalDate;
      return {
        from: displayFrom(headerValue(headers, 'From')),
        subject: headerValue(headers, 'Subject') || '(no subject)',
        time: internal ? formatClock(new Date(Number(internal))) : '',
      };
    }),
  );

  return messages;
}

async function countInboxThreads(
  gmail: ReturnType<typeof google.gmail>,
  q: string,
): Promise<number> {
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
  let calendarOk = false;
  let gmailOk = false;

  // The raw throwables are kept, not just their messages, so the auth check
  // below can inspect the OAuth error body rather than string-matching prose.
  let calendarErr: unknown = null;
  let gmailErr: unknown = null;

  // Calendar (independent failure).
  try {
    const outcome = await syncCalendar(auth, today);
    calendarEvents = outcome.timelineCount;
    calendarOk = true;
    // Only write Deep Work when at least one event matched. Writing 0 on a day
    // with no matching events would clobber a manually-logged value — so we skip.
    if (outcome.deepWorkMatched) {
      await upsertEntry('deep-work', today, outcome.deepWorkHours);
      deepWork = { hours: outcome.deepWorkHours };
    }
  } catch (e) {
    calendarErr = e;
    errors.calendar = apiErrorMessage(e);
  }

  // Gmail (independent failure).
  try {
    const client = google.gmail({ version: 'v1', auth });
    // Gmail's date query uses YYYY/MM/DD. `after:` is midnight-inclusive of today.
    const q = `in:inbox after:${today.replace(/-/g, '/')}`;

    const inboxCount = await countInboxThreads(client, q);
    await setSyncValue('today_inbox_count', String(inboxCount));

    // The digest is a second, more expensive call. It is written — and its
    // failure reported — separately, so losing the subject lines never costs
    // us the count that was already fetched successfully.
    let digest: InboxMessage[] = [];
    try {
      digest = await fetchInboxDigest(client, q);
    } catch (e) {
      errors.gmailDigest = apiErrorMessage(e);
    }
    // Stamped with the date it describes: a digest left over from yesterday
    // must not be rendered as today's mail.
    await setSyncValue('today_inbox_digest', JSON.stringify({ date: today, messages: digest }));

    gmail = { inboxCount, digest };
    // The COUNT succeeded, which is what makes this sync worth stamping. A
    // failed digest is reported in errors.gmailDigest but must not mark the
    // whole Gmail sync as having retrieved nothing.
    gmailOk = true;
  } catch (e) {
    gmailErr = e;
    errors.gmail = apiErrorMessage(e);
  }

  // Shared-credential failure: both APIs use one OAuth client, so an expired or
  // revoked refresh token takes out whichever of them ran. Report it once, as
  // the thing the user has to do, and drop the duplicated per-source codes.
  const expiredFrom = isAuthExpired(calendarErr)
    ? calendarErr
    : isAuthExpired(gmailErr)
      ? gmailErr
      : null;

  if (expiredFrom !== null) {
    const authError = authExpiredMessage(expiredFrom);
    await setSyncValue(GOOGLE_AUTH_ERROR_KEY, authError);
    return {
      calendar: { events: calendarEvents },
      deepWork,
      gmail,
      // Nothing was retrieved, so the "last synced" stamp must not move — a
      // fresh timestamp next to stale data is exactly the silent failure the
      // spec forbids.
      lastSync: null,
      errors: {},
      authExpired: true,
      authError,
    };
  }

  // Credentials worked (whatever else may have failed): clear any stale expiry.
  await deleteSyncValue(GOOGLE_AUTH_ERROR_KEY);

  // Only stamp last_google_sync when at least one source actually returned.
  let lastSync: string | null = null;
  if (calendarOk || gmailOk) {
    lastSync = new Date().toISOString();
    await setSyncValue('last_google_sync', lastSync);
  }

  return {
    calendar: { events: calendarEvents },
    deepWork,
    gmail,
    lastSync,
    errors,
    authExpired: false,
  };
}
