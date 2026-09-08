import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { isThemePreference, type ThemePreference } from './theme';
import { isLanguagePreference, languageCookie, type LanguagePreference } from './locale';

export const initialPreferences = cache(
  async (): Promise<{
    theme: ThemePreference;
    language: LanguagePreference;
    signedIn: boolean;
  }> => {
    const guest = (await cookies()).get(languageCookie)?.value;
    const fallback = {
      theme: 'system' as const,
      language: isLanguagePreference(guest) ? guest : ('system' as const),
      signedIn: false,
    };
    const cookie = (await headers()).get('cookie');
    if (!cookie) return fallback;
    try {
      const response = await fetch(
        new URL('/v1/account/preferences', process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'),
        {
          headers: { cookie },
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (response.ok) {
        const data = await response.json();
        if (
          isThemePreference(data.themePreference) &&
          isLanguagePreference(data.languagePreference)
        ) {
          return { theme: data.themePreference, language: data.languagePreference, signedIn: true };
        }
      }
    } catch {
      // Client providers retry unavailable settings without caching account preferences.
    }
    return fallback;
  },
);
