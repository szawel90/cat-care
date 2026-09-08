import 'server-only';
import { headers } from 'next/headers';
import { isThemePreference, type ThemePreference } from './theme';

export async function initialTheme(): Promise<ThemePreference> {
  const cookie = (await headers()).get('cookie');
  if (!cookie) return 'system';
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
      if (isThemePreference(data.themePreference)) return data.themePreference;
    }
  } catch {
    // The client retries loading the preference and reports unavailable settings.
  }
  return 'system';
}
