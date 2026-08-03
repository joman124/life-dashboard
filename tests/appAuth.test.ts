import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  passwordConfigError,
  safeEqual,
  sessionToken,
} from '@/lib/appAuth';

const GOOD = 'a'.repeat(MIN_PASSWORD_LENGTH);

describe('sessionToken', () => {
  it('returns a 64-character hex digest', async () => {
    const token = await sessionToken(GOOD);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, so middleware and the login route agree', async () => {
    expect(await sessionToken(GOOD)).toBe(await sessionToken(GOOD));
  });

  it('differs for different passwords', async () => {
    expect(await sessionToken('password-one-xxxx')).not.toBe(await sessionToken('password-two-xxxx'));
  });

  it('is not a bare sha256 of the password', async () => {
    // Guards the domain-separation prefix: without it, a cookie stolen from
    // this app would match a plain sha256 of the same password elsewhere.
    const bareSha256OfPasswordA =
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';

    expect(await sessionToken('a')).not.toBe(bareSha256OfPasswordA);
  });
});

describe('safeEqual', () => {
  it('accepts identical strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects strings differing in one character', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
  });

  it('rejects strings of different lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('rejects a prefix of the expected value', () => {
    expect(safeEqual('', 'abc')).toBe(false);
  });
});

describe('passwordConfigError', () => {
  it('reports an unset password', () => {
    expect(passwordConfigError(undefined)).toMatch(/not set/);
  });

  it('reports an empty password', () => {
    expect(passwordConfigError('')).toMatch(/not set/);
  });

  it('rejects a password below the minimum length', () => {
    expect(passwordConfigError('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
  });

  it('accepts a password at the minimum length', () => {
    expect(passwordConfigError(GOOD)).toBeNull();
  });
});
