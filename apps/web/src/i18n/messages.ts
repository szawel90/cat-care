import en from '../../messages/en.json';
import pl from '../../messages/pl.json';
import type { Locale } from '../lib/locale';

export type AccountMessage = keyof typeof en.Account;
export const catalogs = { en, pl };

export function messagesFor(locale: Locale) {
  // English is the runtime fallback; CI separately requires complete Polish catalogs.
  const translated = catalogs[locale];
  return {
    Cats: { ...en.Cats, ...translated.Cats },
    Account: { ...en.Account, ...translated.Account },
    Common: { ...en.Common, ...translated.Common },
    Home: { ...en.Home, ...translated.Home },
    Appearance: { ...en.Appearance, ...translated.Appearance },
    Language: { ...en.Language, ...translated.Language },
    Unsaved: { ...en.Unsaved, ...translated.Unsaved },
    Install: { ...en.Install, ...translated.Install },
  };
}

export function accountMessage(value: unknown): AccountMessage {
  return typeof value === 'string' && Object.hasOwn(en.Account, value)
    ? (value as AccountMessage)
    : 'genericError';
}

export function authErrorKey(error: {
  code?: string;
  message?: string;
  status?: number;
}): AccountMessage {
  const codes: Record<string, AccountMessage> = {
    INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
    INVALID_PASSWORD: 'invalidPassword',
    EMAIL_NOT_VERIFIED: 'emailNotVerified',
    INVALID_EMAIL: 'invalidEmail',
    PASSWORD_TOO_SHORT: 'passwordTooShort',
    PASSWORD_TOO_LONG: 'passwordTooLong',
    SESSION_EXPIRED: 'signInAgain',
    FRESH_SESSION_REQUIRED: 'signInAgain',
    INVALID_TOKEN: 'invalidEmailLink',
    TOKEN_EXPIRED: 'invalidEmailLink',
    USER_ALREADY_EXISTS: 'accountExists',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'accountExists',
    YOU_CANNOT_UNLINK_YOUR_LAST_ACCOUNT: 'cannotUnlink',
    SERVICE_UNAVAILABLE: 'serviceUnavailable',
    TOO_MANY_REQUESTS: 'rateLimit',
  };
  const codeMessage = error.code ? codes[error.code] : undefined;
  if (codeMessage) return codeMessage;
  if (error.status === 429) return 'rateLimit';
  const explicit: Record<string, AccountMessage> = {
    'Please sign in to continue.': 'signInAgain',
    'Sign in again before changing account security.': 'signInAgain',
    'Sign in again before connecting Google.': 'signInAgain',
  };
  const explicitMessage = error.message ? explicit[error.message] : undefined;
  if (explicitMessage) return explicitMessage;
  const known = Object.entries(en.Account).find(([, message]) => message === error.message)?.[0];
  return accountMessage(known);
}
