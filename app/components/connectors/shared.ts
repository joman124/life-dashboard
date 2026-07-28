// Shared helpers for the connector and data panels.
//
// Spec rule: silent failure is a bug. readError always produces a human-readable
// string, falling back to the HTTP status rather than a generic "something went
// wrong", so the panels can surface the server's real message verbatim.

/** Read a JSON {error} body, falling back to the HTTP status line. */
export async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // non-JSON error body — fall through to the status line
  }
  return `Request failed (${res.status}).`;
}

/** Turn an unknown thrown value into a message, with a caller-supplied default. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** "Synced 2:14 PM" / "Synced Jun 21, 2:14 PM" / "Never synced". */
export function humanizeSync(iso: string | null): string {
  if (!iso) return 'Never synced';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never synced';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return `Synced ${time}`;
  return `Synced ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

export const PRIMARY_BTN = 'w-full rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-40';
export const PRIMARY_STYLE = { background: 'var(--gold)', color: '#171107' } as const;
export const SECONDARY_STYLE = { borderColor: 'var(--hairline)', color: 'var(--muted)' } as const;
