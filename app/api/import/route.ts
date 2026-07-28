/**
 * POST /api/import — restore a previously exported JSON file.
 *
 * Body: the export payload ({ metrics, entries, … }) plus an optional
 * "mode": "merge" (default) or "replace".
 *   merge   — upsert; anything the file does not mention is left alone.
 *   replace — wipe metrics and entries first, so the result is exactly the file.
 *
 * 200 { imported: { metrics, entries }, mode }
 * 400 with a message naming the offending row when validation fails.
 */
import { NextResponse } from 'next/server';
import { importData } from '@/lib/db';
import { parseImport } from '@/lib/importer';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as unknown;
    if (body === null) return jsonError('Request body must be valid JSON.', 400);

    // Read the mode before validation, since parseImport ignores extra keys.
    let mode: 'merge' | 'replace' = 'merge';
    if (typeof body === 'object' && body !== null && 'mode' in body) {
      const raw = (body as { mode?: unknown }).mode;
      if (raw !== undefined) {
        if (raw !== 'merge' && raw !== 'replace') {
          return jsonError('"mode" must be either "merge" or "replace".', 400);
        }
        mode = raw;
      }
    }

    const parsed = parseImport(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);

    const imported = await importData(parsed.data.metrics, parsed.data.entries, mode);
    return NextResponse.json({ imported, mode });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
