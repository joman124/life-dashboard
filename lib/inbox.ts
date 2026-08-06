/**
 * lib/inbox.ts — PURE parsing of the stored inbox digest (no DB, no I/O).
 *
 * The Gmail sync writes the newest few inbox messages into sync_state as a JSON
 * blob stamped with the date they describe. This module is the gate on the way
 * back out, and it exists mainly for one rule: a digest whose stamp is not
 * today must not be rendered. The count beside it and the heading above it both
 * say "today", so serving yesterday's subject lines there would be a lie the
 * user has no way to detect.
 *
 * Everything else here is defensive parsing. A malformed blob returns an empty
 * list rather than throwing: the sync time and thread count rendered alongside
 * are still true and useful on their own, and one bad row should not take down
 * the dashboard load.
 */

import type { InboxMessage } from './types';

function isMessage(v: unknown): v is InboxMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Partial<InboxMessage>;
  return typeof m.from === 'string' && typeof m.subject === 'string';
}

/**
 * Read the stored digest, returning its messages only when the stamp matches
 * `today`. Missing, stale, malformed, or non-JSON input all yield [].
 */
export function parseInboxDigest(raw: string | null, today: string): InboxMessage[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];
  const blob = parsed as { date?: unknown; messages?: unknown };

  if (blob.date !== today) return [];
  if (!Array.isArray(blob.messages)) return [];

  return blob.messages.filter(isMessage).map((m) => ({
    from: m.from,
    subject: m.subject,
    // `time` is presentational; a blob missing it still has a usable row.
    time: typeof m.time === 'string' ? m.time : '',
  }));
}
