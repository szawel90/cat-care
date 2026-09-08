'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { isThemePreference, type ThemePreference } from '@/lib/theme';

type Appearance = {
  preference: ThemePreference;
  ready: boolean;
  loadError: boolean;
  save: (preference: ThemePreference) => Promise<void>;
  refresh: () => void;
};

const AppearanceContext = createContext<Appearance | null>(null);

async function requestPreferences(init: RequestInit = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 10_000);
  try {
    return await fetch('/api/account/preferences', {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}

export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const userId = session?.user.id;
  const [preference, setPreference] = useState(initialPreference);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const revision = useRef(0);
  const saving = useRef(false);
  const refreshRef = useRef<() => void>(() => {});

  function apply(next: ThemePreference) {
    document.documentElement.dataset.theme = next;
    setPreference(next);
  }

  useEffect(() => {
    revision.current++;
    if (isPending) return;
    const controller = new AbortController();
    async function synchronize() {
      if (saving.current) return;
      const requestRevision = ++revision.current;
      try {
        const response = await requestPreferences({ signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (controller.signal.aborted || requestRevision !== revision.current) return;
        if (response.status === 401 || response.status === 403) {
          apply('system');
          setReady(false);
          setLoadError(false);
          return;
        }
        if (!response.ok || !isThemePreference(data?.themePreference)) throw new Error();
        apply(data.themePreference);
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
    refreshRef.current = refresh;
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, isPending, sessionError]);

  async function save(next: ThemePreference) {
    if (saving.current || !ready) throw new Error('Please wait for your appearance settings.');
    saving.current = true;
    const requestRevision = ++revision.current;
    try {
      const response = await requestPreferences({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themePreference: next }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'Please sign in again to change your appearance.'
            : 'Could not save your appearance. Please try again.',
        );
      const data = await response.json();
      if (!isThemePreference(data.themePreference)) throw new Error('Please try again.');
      if (requestRevision === revision.current) apply(data.themePreference);
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === 'Error'
          ? error.message
          : 'Could not save your appearance. Please try again.',
        { cause: error },
      );
    } finally {
      saving.current = false;
      if (requestRevision !== revision.current) refreshRef.current();
    }
  }

  return (
    <AppearanceContext.Provider
      value={{ preference, ready, loadError, save, refresh: () => refreshRef.current() }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('Appearance controls need ThemeProvider.');
  return context;
}
