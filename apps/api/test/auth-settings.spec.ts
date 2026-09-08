import { getAuthSettings, normalizeEmail } from '../src/auth/auth-settings';

describe('Account configuration', () => {
  const env = { BETTER_AUTH_SECRET: 'synthetic-secret-for-configuration-tests-only' };
  it('requires a secret and HTTPS for remote origins', () => {
    expect(() => getAuthSettings({})).toThrow('BETTER_AUTH_SECRET');
    expect(() => getAuthSettings({ ...env, AUTH_BASE_URL: 'http://example.com' })).toThrow('HTTPS');
    expect(() =>
      getAuthSettings({ ...env, AUTH_BASE_URL: 'https://user:password@example.com' }),
    ).toThrow('plain origin');
  });
  it('requires both Google credentials and keeps the mailbox local', () => {
    expect(() => getAuthSettings({ ...env, GOOGLE_CLIENT_ID: 'test-client' })).toThrow(
      'Both Google',
    );
    expect(() => getAuthSettings({ ...env, MAILPIT_URL: 'http://example.com' })).toThrow(
      'loopback',
    );
    expect(getAuthSettings(env).google).toBeUndefined();
    expect(() => getAuthSettings({ ...env, MAILPIT_URL: 'ftp://localhost' })).toThrow('loopback');
    expect(() =>
      getAuthSettings({
        ...env,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'https://example.test',
        ALLOW_TEST_MAILBOX: 'false',
      }),
    ).toThrow('production email');
  });
  it('does not turn Gmail dots or plus addresses into another identity', () => {
    expect(normalizeEmail(' Alex+cat@example.com ')).toBe('alex+cat@example.com');
    expect(normalizeEmail('A.Lex@gmail.com')).toBe('a.lex@gmail.com');
  });
});
