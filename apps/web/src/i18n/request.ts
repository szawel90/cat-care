import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { initialPreferences } from '../lib/initial-preferences';
import { languageFromHeader, resolveLanguage } from '../lib/locale';
import { messagesFor } from './messages';

export default getRequestConfig(async () => {
  const preferences = await initialPreferences();
  const locale = resolveLanguage(
    preferences.language,
    languageFromHeader((await headers()).get('accept-language')),
  );
  return { locale, messages: messagesFor(locale), timeZone: 'UTC' };
});
