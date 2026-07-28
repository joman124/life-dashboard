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

const { getOrCreateHealthToken, rotateHealthToken, verifyHealthToken } = await import(
  '@/lib/health/token'
);

beforeEach(() => {
  store.clear();
});

describe('getOrCreateHealthToken', () => {
  test('generates and persists a token on first use', async () => {
    const token = await getOrCreateHealthToken();

    expect(token).toBeTruthy();
    expect(store.get('health_import_token')).toBe(token);
  });

  test('is idempotent — the same token comes back on every later call', async () => {
    // The token is printed in the Connectors panel and pasted into an iOS
    // Shortcut. If reading it regenerated it, every read would silently break
    // the user's already-configured Shortcut.
    const first = await getOrCreateHealthToken();
    const second = await getOrCreateHealthToken();
    const third = await getOrCreateHealthToken();

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  test('produces a URL-safe token', async () => {
    // It is used both as an Authorization header and as a ?token= query
    // parameter, so it must survive a URL without escaping.
    const token = await getOrCreateHealthToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  test('produces a token with meaningful entropy', async () => {
    // 24 random bytes → 32 base64url characters.
    const token = await getOrCreateHealthToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  test('generates a distinct token per fresh install', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) {
      store.clear();
      tokens.add(await getOrCreateHealthToken());
    }
    expect(tokens.size).toBe(20);
  });
});

describe('rotateHealthToken', () => {
  test('replaces the stored token with a new value', async () => {
    const original = await getOrCreateHealthToken();
    const rotated = await rotateHealthToken();

    expect(rotated).not.toBe(original);
    expect(store.get('health_import_token')).toBe(rotated);
  });

  test('invalidates the previous token immediately', async () => {
    // The entire point of rotation: a leaked token must stop working.
    const leaked = await getOrCreateHealthToken();
    await rotateHealthToken();

    expect(await verifyHealthToken(leaked)).toBe(false);
  });

  test('the rotated token verifies', async () => {
    await getOrCreateHealthToken();
    const rotated = await rotateHealthToken();

    expect(await verifyHealthToken(rotated)).toBe(true);
  });

  test('works even when no token exists yet', async () => {
    const token = await rotateHealthToken();
    expect(await verifyHealthToken(token)).toBe(true);
  });

  test('produces a different value on every call', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) tokens.add(await rotateHealthToken());
    expect(tokens.size).toBe(20);
  });
});

describe('verifyHealthToken', () => {
  test('accepts the stored token', async () => {
    const token = await getOrCreateHealthToken();
    expect(await verifyHealthToken(token)).toBe(true);
  });

  test('rejects a wrong token of the same length', async () => {
    const token = await getOrCreateHealthToken();
    // Flip the first character so the length still matches — this is the case
    // the constant-time comparison actually has to decide.
    const wrong = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);

    expect(wrong).toHaveLength(token.length);
    expect(await verifyHealthToken(wrong)).toBe(false);
  });

  test('rejects a token differing only in its final character', async () => {
    const token = await getOrCreateHealthToken();
    const wrong = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');

    expect(await verifyHealthToken(wrong)).toBe(false);
  });

  test('rejects tokens of differing length without throwing', async () => {
    // crypto.timingSafeEqual throws on unequal-length buffers, so the length
    // check must come first or an attacker could crash the route at will.
    const token = await getOrCreateHealthToken();

    for (const wrong of ['', 'short', token + 'x', token.slice(0, -1)]) {
      await expect(verifyHealthToken(wrong)).resolves.toBe(false);
    }
  });

  test('rejects everything when no token is stored', async () => {
    // Fail closed: an uninitialized install must not accept a blank token.
    expect(await verifyHealthToken('')).toBe(false);
    expect(await verifyHealthToken('anything')).toBe(false);
  });

  test('is case-sensitive', async () => {
    const token = await getOrCreateHealthToken();
    const flipped = token
      .split('')
      .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
      .join('');

    // Only assert when flipping actually changed something (a purely numeric
    // token would be unchanged).
    if (flipped !== token) {
      expect(await verifyHealthToken(flipped)).toBe(false);
    }
  });

  test('handles multi-byte input without throwing', async () => {
    await getOrCreateHealthToken();
    // Buffer.from(…, 'utf8') makes byte length differ from string length here;
    // the comparison must still resolve cleanly to false.
    await expect(verifyHealthToken('🎈🎈🎈')).resolves.toBe(false);
  });

  test('does not mutate the stored token', async () => {
    const token = await getOrCreateHealthToken();
    await verifyHealthToken('wrong');
    await verifyHealthToken(token);

    expect(store.get('health_import_token')).toBe(token);
  });
});
