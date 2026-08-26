import { beforeEach, describe, expect, test, vi } from 'vitest';

// The token module persists through lib/db. Stub that module with an in-memory
// key/value store so the security logic here is tested in isolation, with no
// database and no filesystem.
const store = new Map<string, string>();

vi.mock('@/lib/db', () => ({
  getSyncValue: async (key: string) => store.get(key) ?? null,
  setSyncValue: async (key: string, value: string) => {
    store.set(key, value);
  },
}));

const { extractBearerToken } = await import('@/lib/apiToken');
const { getOrCreateHealthToken, verifyHealthToken, rotateHealthToken } = await import(
  '@/lib/health/token'
);
const { getOrCreateBriefToken, verifyBriefToken, rotateBriefToken } = await import(
  '@/lib/briefToken'
);

beforeEach(() => {
  store.clear();
});

describe('the two tokens are genuinely separate', () => {
  test('they are different values under different keys', () => {
    return (async () => {
      const health = await getOrCreateHealthToken();
      const brief = await getOrCreateBriefToken();

      expect(brief).not.toBe(health);
      expect(store.get('health_import_token')).toBe(health);
      expect(store.get('brief_read_token')).toBe(brief);
    })();
  });

  test('neither token opens the other endpoint', async () => {
    // The brief token is read-only by construction: it must never be able to
    // write health data, and the phone's write token must not be a read key.
    const health = await getOrCreateHealthToken();
    const brief = await getOrCreateBriefToken();

    expect(await verifyBriefToken(health)).toBe(false);
    expect(await verifyHealthToken(brief)).toBe(false);
  });

  test('rotating the brief token leaves Apple Health working', async () => {
    // Losing the morning import because a link was re-issued would be a nasty
    // surprise, and the whole reason these live under separate keys.
    const health = await getOrCreateHealthToken();
    await getOrCreateBriefToken();

    await rotateBriefToken();

    expect(await verifyHealthToken(health)).toBe(true);
  });

  test('rotating the health token leaves the brief feed working', async () => {
    await getOrCreateHealthToken();
    const brief = await getOrCreateBriefToken();

    await rotateHealthToken();

    expect(await verifyBriefToken(brief)).toBe(true);
  });
});

describe('the brief token itself', () => {
  test('is stable across reads', async () => {
    const first = await getOrCreateBriefToken();

    expect(await getOrCreateBriefToken()).toBe(first);
  });

  test('survives a URL unescaped, since it travels as a query parameter', async () => {
    const token = await getOrCreateBriefToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  test('a rotated token verifies and the old one dies immediately', async () => {
    const leaked = await getOrCreateBriefToken();
    const fresh = await rotateBriefToken();

    expect(await verifyBriefToken(leaked)).toBe(false);
    expect(await verifyBriefToken(fresh)).toBe(true);
  });

  test('fails closed before any token exists', async () => {
    expect(await verifyBriefToken('')).toBe(false);
    expect(await verifyBriefToken('anything')).toBe(false);
  });

  test('rejects a near-miss of the same length without throwing', async () => {
    const token = await getOrCreateBriefToken();
    const wrong = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);

    expect(wrong).toHaveLength(token.length);
    expect(await verifyBriefToken(wrong)).toBe(false);
    await expect(verifyBriefToken('🎈🎈🎈')).resolves.toBe(false);
  });
});

describe('extractBearerToken', () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  test('prefers the Authorization header', () => {
    expect(
      extractBearerToken(req('https://x.test/api/brief?token=from-url', { authorization: 'Bearer from-header' })),
    ).toBe('from-header');
  });

  test('accepts the scheme in any case, and trims around it', () => {
    expect(extractBearerToken(req('https://x.test/', { authorization: '  bearer   abc  ' }))).toBe(
      'abc',
    );
  });

  test('falls back to ?token= for callers that cannot set headers', () => {
    // Web-fetch tools generally cannot, which is why the brief URL carries one.
    expect(extractBearerToken(req('https://x.test/api/brief?token=abc'))).toBe('abc');
  });

  test('returns null when there is nothing to present', () => {
    expect(extractBearerToken(req('https://x.test/api/brief'))).toBeNull();
    expect(extractBearerToken(req('https://x.test/api/brief?token='))).toBeNull();
    expect(extractBearerToken(req('https://x.test/', { authorization: 'Basic abc' }))).toBeNull();
  });
});
