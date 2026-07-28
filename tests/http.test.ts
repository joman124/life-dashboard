import { describe, expect, test } from 'vitest';
import { jsonError, toErrorMessage } from '@/lib/http';

describe('jsonError', () => {
  test('returns the given status', () => {
    expect(jsonError('Nope', 400).status).toBe(400);
    expect(jsonError('Nope', 401).status).toBe(401);
    expect(jsonError('Nope', 500).status).toBe(500);
  });

  test('serializes the message under an "error" key', async () => {
    // The client reads `body.error`; this shape is the contract that keeps
    // failures readable instead of silent.
    const body = await jsonError('Metric not found', 404).json();
    expect(body).toEqual({ error: 'Metric not found' });
  });

  test('sends JSON content type', () => {
    expect(jsonError('Nope', 400).headers.get('content-type')).toContain('application/json');
  });
});

describe('toErrorMessage', () => {
  test('unwraps an Error message', () => {
    expect(toErrorMessage(new Error('database is locked'))).toBe('database is locked');
  });

  test('unwraps a subclass of Error', () => {
    expect(toErrorMessage(new TypeError('bad type'))).toBe('bad type');
  });

  test('passes through a non-empty string', () => {
    expect(toErrorMessage('plain failure')).toBe('plain failure');
  });

  test('falls back for an Error with an empty message', () => {
    expect(toErrorMessage(new Error(''))).toBe('Unexpected server error');
  });

  test('falls back for values that carry no message', () => {
    for (const value of [null, undefined, '', 0, false, {}, []]) {
      expect(toErrorMessage(value)).toBe('Unexpected server error');
    }
  });

  test('always returns a non-empty string', () => {
    for (const value of [null, undefined, '', new Error(''), { message: 'x' }, 42]) {
      expect(toErrorMessage(value).length).toBeGreaterThan(0);
    }
  });
});
