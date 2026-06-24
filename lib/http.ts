/**
 * lib/http.ts — shared API response helpers.
 *
 * Spec rule: silent failures are bugs. Every error response is JSON
 * `{ error: "<readable message>" }` with a proper HTTP status.
 */
import { NextResponse } from 'next/server';

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function toErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === 'string' && e ? e : 'Unexpected server error';
}
