export const locales = ['en', 'pl'] as const;
export type Locale = (typeof locales)[number];
export type LanguagePreference = Locale | 'system';
export const languageCookie = 'cat-care-language';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'pl';
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || isLocale(value);
}

export function matchLanguage(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) continue;
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

export function languageFromHeader(header: string | null): Locale {
  const requested = (header ?? '').split(',').map((part, order) => {
    const [language = '', ...parameters] = part.trim().split(';');
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    const weight = quality === undefined ? 1 : Number(quality.trim().slice(2));
    return { language, weight, order };
  });
  return matchLanguage(
    requested
      .filter(({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1)
      .sort((a, b) => b.weight - a.weight || a.order - b.order)
      .map(({ language }) => language),
  );
}

export function resolveLanguage(preference: LanguagePreference, automatic: Locale): Locale {
  return preference === 'system' ? automatic : preference;
}
