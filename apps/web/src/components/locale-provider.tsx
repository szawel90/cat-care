'use client';

import { NextIntlClientProvider } from 'next-intl';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import {
  isLanguagePreference,
  matchLanguage,
  resolveLanguage,
  type LanguagePreference,
  type Locale,
} from '@/lib/locale';
import { messagesFor } from '@/i18n/messages';

type Language = {
  preference: LanguagePreference;
  ready: boolean;
  loadError: boolean;
  save: (next: LanguagePreference) => Promise<void>;
  refresh: () => void;
};
const LanguageContext = createContext<Language | null>(null);
const subscribeTimeZone = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => 'UTC';

async function requestLanguage(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 10_000);
  try {
    return await fetch(path, { ...init, cache: 'no-store', signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}

export function LocaleProvider({
  initialLocale,
  initialPreference,
  initialSignedIn,
  children,
}: {
  initialLocale: Locale;
  initialPreference: LanguagePreference;
  initialSignedIn: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const userId = session?.user.id;
  const [preference, setPreference] = useState(initialPreference);
  const [locale, setLocale] = useState(initialLocale);
  const timeZone = useSyncExternalStore(subscribeTimeZone, browserTimeZone, serverTimeZone);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const signedIn = useRef(initialSignedIn);
  const confirmed = useRef(initialPreference);
  const displayed = useRef(initialLocale);
  const revision = useRef(0);
  const saving = useRef(false);
  const refreshRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    // Keep the document language aligned with visible client translations after refreshes.
    document.documentElement.lang = locale;
  }, [initialLocale, locale]);

  useEffect(() => {
    revision.current++;
    if (isPending) return;
    const controller = new AbortController();
    const apply = (next: LanguagePreference) => {
      const resolved = resolveLanguage(next, matchLanguage(navigator.languages));
      confirmed.current = next;
      setPreference(next);
      document.documentElement.lang = resolved;
      setLocale(resolved);
      if (displayed.current !== resolved) {
        displayed.current = resolved;
        router.refresh();
      }
    };
    async function synchronize() {
      if (saving.current) return;
      const requestRevision = ++revision.current;
      try {
        let response = await requestLanguage('/api/account/preferences', {
          signal: controller.signal,
        });
        const account = response.ok;
        if (response.status === 401 || response.status === 403)
          response = await requestLanguage('/api/locale', { signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (controller.signal.aborted || requestRevision !== revision.current) return;
        if (!response.ok || !isLanguagePreference(data?.languagePreference)) throw new Error();
        signedIn.current = account;
        apply(data.languagePreference);
        setReady(true);
        setLoadError(false);
      } catch {
        if (!controller.signal.aborted && requestRevision === revision.current) {
          setReady(false);
          setLoadError(true);
        }
      }
    }
    const refresh = () => void synchronize();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const languageChanged = () => {
      if (confirmed.current === 'system') apply('system');
    };
    refreshRef.current = refresh;
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('languagechange', languageChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('languagechange', languageChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, isPending, sessionError, router]);

  async function save(next: LanguagePreference) {
    if (saving.current || !ready) throw new Error('wait');
    saving.current = true;
    const requestRevision = ++revision.current;
    try {
      const response = await requestLanguage(
        signedIn.current ? '/api/account/preferences' : '/api/locale',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ languagePreference: next }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403 ? 'signInAgain' : 'saveError',
        );
      const data = await response.json();
      if (!isLanguagePreference(data.languagePreference)) throw new Error('saveError');
      if (requestRevision === revision.current) {
        confirmed.current = data.languagePreference;
        const resolved = resolveLanguage(
          data.languagePreference,
          matchLanguage(navigator.languages),
        );
        displayed.current = resolved;
        document.documentElement.lang = resolved;
        setPreference(data.languagePreference);
        setLocale(resolved);
        router.refresh();
      }
    } catch (error) {
      throw new Error(
        error instanceof Error && ['wait', 'signInAgain', 'saveError'].includes(error.message)
          ? error.message
          : 'saveError',
        { cause: error },
      );
    } finally {
      saving.current = false;
      if (requestRevision !== revision.current) refreshRef.current();
    }
  }

  return (
    <LanguageContext.Provider
      value={{ preference, ready, loadError, save, refresh: () => refreshRef.current() }}
    >
      <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} timeZone={timeZone}>
        {children}
      </NextIntlClientProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Language controls need LocaleProvider.');
  return context;
}
