import { describe, expect, test } from 'vitest';
import {
  authExpiredMessage,
  isAuthExpired,
  oauthErrorCode,
  oauthErrorDescription,
} from '@/lib/google/errors';

/**
 * Shapes below are the real ones googleapis throws. The token-endpoint body is
 * the important case: it is what a lapsed refresh token produces, and it nests
 * `error` as a *string*, unlike a regular Google API failure which nests it as
 * an object. Getting that distinction wrong is what let `invalid_grant` reach
 * the UI as raw text in the first place.
 */
const refreshFailure = {
  message: 'invalid_grant',
  response: {
    status: 400,
    data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
  },
};

const apiFailure404 = {
  message: 'Not Found',
  response: {
    status: 404,
    data: { error: { code: 404, message: 'Not Found', status: 'NOT_FOUND' } },
  },
};

describe('oauthErrorCode', () => {
  test('reads the code from a token-endpoint body', () => {
    expect(oauthErrorCode(refreshFailure)).toBe('invalid_grant');
  });

  test('reads a code hoisted onto the error object', () => {
    expect(oauthErrorCode({ error: 'unauthorized_client' })).toBe('unauthorized_client');
  });

  test('falls back to a whole-word match in the message', () => {
    expect(oauthErrorCode({ message: 'Error: invalid_grant returned by Google' })).toBe(
      'invalid_grant',
    );
  });

  test('does not match a code embedded in a larger word', () => {
    expect(oauthErrorCode({ message: 'notinvalid_grantish' })).toBeNull();
  });

  test('returns null for non-object and empty inputs', () => {
    expect(oauthErrorCode(null)).toBeNull();
    expect(oauthErrorCode(undefined)).toBeNull();
    expect(oauthErrorCode('invalid_grant')).toBeNull(); // a bare string is not a thrown error shape
    expect(oauthErrorCode({})).toBeNull();
  });

  test('reads a nested API error object without mistaking it for a code', () => {
    // { error: { ... } } is an object, so no string code should be extracted.
    expect(oauthErrorCode(apiFailure404)).toBeNull();
  });
});

describe('isAuthExpired', () => {
  test('true for a refresh failure', () => {
    expect(isAuthExpired(refreshFailure)).toBe(true);
  });

  test('true for the other re-consent codes', () => {
    expect(isAuthExpired({ error: 'invalid_token' })).toBe(true);
    expect(isAuthExpired({ error: 'unauthorized_client' })).toBe(true);
    expect(isAuthExpired({ error: 'invalid_client' })).toBe(true);
  });

  test('false for ordinary API failures, which must stay per-source errors', () => {
    expect(isAuthExpired(apiFailure404)).toBe(false);
    expect(isAuthExpired({ message: 'Rate Limit Exceeded' })).toBe(false);
    expect(isAuthExpired(new Error('ECONNRESET'))).toBe(false);
    expect(isAuthExpired(null)).toBe(false);
  });

  test('false for a scope error — reconnecting would not fix a missing scope', () => {
    expect(
      isAuthExpired({
        message: 'Request had insufficient authentication scopes.',
        response: { status: 403, data: { error: { code: 403, status: 'PERMISSION_DENIED' } } },
      }),
    ).toBe(false);
  });
});

describe('oauthErrorDescription', () => {
  test("returns Google's own description when present", () => {
    expect(oauthErrorDescription(refreshFailure)).toBe('Token has been expired or revoked.');
  });

  test('returns null when absent, blank, or not a string', () => {
    expect(oauthErrorDescription({ response: { data: { error: 'invalid_grant' } } })).toBeNull();
    expect(
      oauthErrorDescription({ response: { data: { error_description: '   ' } } }),
    ).toBeNull();
    expect(oauthErrorDescription({ response: { data: { error_description: 7 } } })).toBeNull();
    expect(oauthErrorDescription(null)).toBeNull();
  });
});

describe('authExpiredMessage', () => {
  test('leads with the action and never leaks the raw OAuth code', () => {
    const msg = authExpiredMessage(refreshFailure);
    expect(msg.startsWith('Google sign-in expired')).toBe(true);
    expect(msg).not.toContain('invalid_grant');
  });

  test("quotes Google's description when there is one", () => {
    expect(authExpiredMessage(refreshFailure)).toContain('Token has been expired or revoked.');
  });

  test('names the 7-day Testing-mode expiry for invalid_grant, the common case', () => {
    expect(authExpiredMessage(refreshFailure)).toContain('7 days');
  });

  test('points at the credentials, not the token age, for a client-side code', () => {
    const msg = authExpiredMessage({
      message: 'invalid_client',
      response: { status: 401, data: { error: 'invalid_client' } },
    });
    expect(msg).toContain('GOOGLE_CLIENT_ID');
    expect(msg).not.toContain('7 days');
  });

  test('is still a complete message with no error to inspect', () => {
    expect(authExpiredMessage()).toContain('reconnect');
    expect(authExpiredMessage()).toContain('7 days'); // sensible default hint
  });
});
