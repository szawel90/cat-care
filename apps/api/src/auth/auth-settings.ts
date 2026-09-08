export interface AuthSettings {
  baseUrl: string;
  secret: string;
  mailpitUrl: string;
  google?: { clientId: string; clientSecret: string };
}

export function getAuthSettings(env: NodeJS.ProcessEnv = process.env): AuthSettings {
  const baseUrl = env.AUTH_BASE_URL ?? 'http://127.0.0.1:3000';
  const url = new URL(baseUrl);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('AUTH_BASE_URL must be a plain origin.');
  }
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('AUTH_BASE_URL must use HTTPS outside localhost.');
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Set a random BETTER_AUTH_SECRET using pnpm env:setup.');
  }
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error('Both Google credentials must be configured together.');
  }
  const mailpitUrl = env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
  const mailUrl = new URL(mailpitUrl);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(mailUrl.hostname) ||
    !['http:', 'https:'].includes(mailUrl.protocol) ||
    mailUrl.username ||
    mailUrl.password ||
    mailUrl.pathname !== '/' ||
    mailUrl.search ||
    mailUrl.hash
  ) {
    throw new Error('The development mailbox must stay on loopback.');
  }
  if (env.NODE_ENV === 'production' && !local && env.ALLOW_TEST_MAILBOX !== 'true') {
    throw new Error('Configure a production email sender before public deployment.');
  }
  return {
    baseUrl: url.origin,
    secret,
    mailpitUrl: mailUrl.origin,
    ...(clientId && clientSecret ? { google: { clientId, clientSecret } } : {}),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
