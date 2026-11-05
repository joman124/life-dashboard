// lib/push.ts — send a plain-text notification to the user's phone.
//
// There is no browser push stack in this app (no service worker, no VAPID, no
// stored subscription — and the spec lists push as out of scope), so this does
// NOT try to build one. It POSTs the text to a webhook the user configures in
// STREAK_PUSH_WEBHOOK. That URL is channel-agnostic: an ntfy.sh topic
// (https://ntfy.sh/<your-topic>) works with zero app changes and no new UI —
// install ntfy, subscribe to the topic, done — and any other POST-a-string
// service (Pushover proxy, a Shortcut webhook, Slack) works the same way.
//
// Delivery is best-effort and reported, never silent: an unset webhook or a
// failed POST comes back as a typed result the caller surfaces, so a cron that
// found at-risk streaks but could not deliver shows up in the response and logs.

export type PushResult =
  | { delivered: false; reason: 'not-configured' }
  | { delivered: true; count: number }
  | { delivered: false; reason: 'error'; message: string };

/**
 * POST each message to STREAK_PUSH_WEBHOOK as a text/plain body (one request
 * per message — ntfy and friends render one notification per POST).
 */
export async function notify(messages: string[]): Promise<PushResult> {
  if (messages.length === 0) return { delivered: true, count: 0 };

  const url = process.env.STREAK_PUSH_WEBHOOK;
  if (!url) return { delivered: false, reason: 'not-configured' };

  try {
    for (const message of messages) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: message,
      });
      if (!res.ok) {
        return { delivered: false, reason: 'error', message: `webhook returned ${res.status}` };
      }
    }
    return { delivered: true, count: messages.length };
  } catch (e) {
    return { delivered: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
