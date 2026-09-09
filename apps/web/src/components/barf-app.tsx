'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Archive, Calculator, Copy, Plus, UserRound } from 'lucide-react';
import {
  BARF_ENGINE_VERSION,
  barfCatalog,
  emptyBarfInput,
  type BarfInput,
  type BarfRecipe,
} from '@cat-care/shared';
import { authClient } from '@/lib/auth-client';
import { HomeHeader } from './home-header';
import { BarfEditor } from './barf-editor';
import { Button } from './ui/button';
import { Feedback } from './feedback';
import { Label } from './ui/label';
import { useUnsavedChangesDialog } from './unsaved-changes-dialog';

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/account/barf/' + path, {
    cache: 'no-store',
    signal,
    ...(body !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'BARF_ACCESS_DENIED'
        : (data.code ?? 'BARF_REQUEST_FAILED'),
    );
  return data as T;
}

export function BarfApp() {
  const t = useTranslations('Barf');
  const { data, isPending, error } = authClient.useSession();
  if (isPending) return <p role="status">{t('loading')}</p>;
  if (!data || error)
    return (
      <main className="barf-access">
        <h1>{t('title')}</h1>
        <p>{t('signInRequired')}</p>
        <Link href="/login">{t('signIn')}</Link>
      </main>
    );
  return <BarfAccount key={data.user.id} />;
}

function BarfAccount() {
  const t = useTranslations('Barf');
  const common = useTranslations('Common');
  const locale = useLocale();
  const router = useRouter();
  const { confirmDiscard, dialog } = useUnsavedChangesDialog();
  const [recipes, setRecipes] = useState<BarfRecipe[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [input, setInput] = useState<BarfInput>(emptyBarfInput);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewedVersion, setViewedVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = recipes.find((recipe) => recipe.id === activeId);
  const revision = active?.revisions.find((item) => item.version === viewedVersion);
  const readOnly = Boolean(
    active?.archivedAt ||
    (active && viewedVersion !== active.currentVersion) ||
    input.engineVersion !== BARF_ENGINE_VERSION ||
    input.catalogVersion !== barfCatalog.version,
  );

  const fail = useCallback((failure: unknown) => {
    const code = failure instanceof Error ? failure.message : '';
    if (code === 'BARF_ACCESS_DENIED') setDenied(true);
    setError(
      code === 'BARF_VERSION_CONFLICT'
        ? 'conflict'
        : code === 'BARF_VERSION_MISMATCH'
          ? 'versionMismatch'
          : 'requestFailed',
    );
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    const [list, savedFavorites] = await Promise.all([
      request<BarfRecipe[]>('recipes', undefined, signal),
      request<{ ingredientIds: string[] }>('favorites', undefined, signal),
    ]);
    if (!signal?.aborted) {
      setRecipes(list);
      setFavorites(savedFavorites.ingredientIds);
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      request<BarfRecipe[]>('recipes', undefined, controller.signal),
      request<{ ingredientIds: string[] }>('favorites', undefined, controller.signal),
    ])
      .then(([list, savedFavorites]) => {
        if (!controller.signal.aborted) {
          setRecipes(list);
          setFavorites(savedFavorites.ingredientIds);
          setLoaded(true);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) fail(failure);
      });
    return () => controller.abort();
  }, [fail]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }
  async function allowNavigation() {
    return !busy && (!dirty || (await confirmDiscard()));
  }
  function intercept(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!dirty && !busy) return;
    event.preventDefault();
    void allowNavigation().then((allowed) => {
      if (allowed) router.push(href);
    });
  }
  async function openRecipe(id: string) {
    if (!(await allowNavigation())) return;
    await run(async () => {
      const recipe = await request<BarfRecipe>('recipes/' + id);
      setRecipes((list) => list.map((item) => (item.id === id ? recipe : item)));
      setActiveId(id);
      setViewedVersion(recipe.currentVersion);
      setInput(structuredClone(recipe.revisions[0]!.snapshot.input));
      setDirty(false);
      setNotice('');
      setError('');
    });
  }
  async function createNew(copy = false) {
    if (busy || (!copy && !(await allowNavigation()))) return;
    setActiveId(null);
    setViewedVersion(null);
    setInput(
      copy
        ? {
            ...structuredClone(input),
            title: t('copyName', { name: input.title }).slice(0, 100),
            catalogVersion: barfCatalog.version,
            engineVersion: BARF_ENGINE_VERSION,
          }
        : emptyBarfInput(),
    );
    setDirty(copy);
    setNotice(copy ? 'copyReady' : '');
    setError('');
  }
  async function save() {
    await run(async () => {
      const saved = await request<BarfRecipe>(activeId ? 'recipes/' + activeId : 'recipes', {
        input,
        ...(active ? { expectedVersion: active.currentVersion } : {}),
      });
      setRecipes((list) => [saved, ...list.filter((item) => item.id !== saved.id)]);
      setActiveId(saved.id);
      setViewedVersion(saved.currentVersion);
      setInput(saved.revisions[0]!.snapshot.input);
      setDirty(false);
      setNotice('saved');
    });
  }
  async function archive() {
    if (!active || !(await allowNavigation())) return;
    await run(async () => {
      const saved = await request<BarfRecipe>(`recipes/${active.id}/archive`, {
        expectedVersion: active.currentVersion,
      });
      setRecipes((list) => list.map((item) => (item.id === saved.id ? saved : item)));
      setViewedVersion(saved.currentVersion);
      setInput(saved.revisions[0]!.snapshot.input);
      setDirty(false);
      setNotice('archived');
    });
  }
  if (denied)
    return (
      <main className="barf-access">
        <h1>{t('title')}</h1>
        <Feedback tone="error">{t('accessDenied')}</Feedback>
        <Link href="/login">{t('signIn')}</Link>
      </main>
    );
  return (
    <>
      <a className="skip-link" href="#barf-main">
        {common('skip')}
      </a>
      <div className="barf-no-print">
        <HomeHeader beforeNavigate={allowNavigation} disabled={busy} />
      </div>
      <div className="barf-shell">
        <nav className="barf-navigation barf-no-print" aria-label={t('navigation')}>
          <Link href="/account" onClick={(event) => intercept(event, '/account')}>
            <UserRound aria-hidden="true" />
            {t('account')}
          </Link>
          <Link href="/barf" aria-current="page" onClick={(event) => event.preventDefault()}>
            <Calculator aria-hidden="true" />
            {t('title')}
          </Link>
        </nav>
        <main id="barf-main" className="barf-main">
          <div className="barf-page-heading barf-no-print">
            <div>
              <p className="eyebrow">{t('eyebrow')}</p>
              <h1>{t('title')}</h1>
              <p>{t('intro')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void createNew()}
            >
              <Plus aria-hidden="true" />
              {t('newRecipe')}
            </Button>
          </div>
          {error && <Feedback tone="error">{t(error as 'requestFailed')}</Feedback>}
          {error === 'conflict' && activeId && (
            <Button variant="outline" disabled={busy} onClick={() => void openRecipe(activeId)}>
              {t('reloadRecipe')}
            </Button>
          )}
          {notice && <Feedback>{t(notice as 'saved')}</Feedback>}
          {!loaded ? (
            <div>
              <p role="status">{t('loading')}</p>
              {error && <Button onClick={() => void run(() => load())}>{t('retry')}</Button>}
            </div>
          ) : (
            <>
              <section className="barf-library barf-no-print" aria-label={t('savedRecipes')}>
                <div>
                  <Label htmlFor="barf-saved">{t('savedRecipes')}</Label>
                  <select
                    id="barf-saved"
                    value={activeId ?? ''}
                    disabled={busy}
                    onChange={(event) => {
                      if (event.target.value) void openRecipe(event.target.value);
                    }}
                  >
                    <option value="">{t('newRecipe')}</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.revisions[0]!.snapshot.input.title}
                        {recipe.archivedAt ? ` · ${t('archivedLabel')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {active && (
                  <>
                    <div>
                      <Label htmlFor="barf-history">{t('history')}</Label>
                      <select
                        id="barf-history"
                        value={viewedVersion ?? active.currentVersion}
                        disabled={busy}
                        onChange={(event) => {
                          const version = Number(event.target.value);
                          void allowNavigation().then((allowed) => {
                            if (!allowed) return;
                            const item = active.revisions.find(
                              (entry) => entry.version === version,
                            )!;
                            setViewedVersion(version);
                            setInput(structuredClone(item.snapshot.input));
                            setDirty(false);
                            setNotice('');
                          });
                        }}
                      >
                        {active.revisions.map((item) => (
                          <option key={item.version} value={item.version}>
                            {t('revision', { version: item.version })} ·{' '}
                            {new Intl.DateTimeFormat(locale, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(item.createdAt))}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button variant="outline" disabled={busy} onClick={() => void createNew(true)}>
                      <Copy aria-hidden="true" />
                      {t('copyRecipe')}
                    </Button>
                    {!active.archivedAt && (
                      <Button variant="ghost" disabled={busy} onClick={() => void archive()}>
                        <Archive aria-hidden="true" />
                        {t('archiveRecipe')}
                      </Button>
                    )}
                  </>
                )}
              </section>
              {readOnly && <p className="barf-draft-notice">{t('historicalNotice')}</p>}
              <BarfEditor
                input={input}
                snapshot={!dirty ? revision?.snapshot : undefined}
                onChange={(value) => {
                  setInput(value);
                  setDirty(true);
                  setNotice('');
                }}
                favorites={favorites}
                busy={busy}
                readOnly={readOnly}
                onSave={() => void save()}
                onFavorite={(id) =>
                  void run(async () => {
                    const ingredientIds = favorites.includes(id)
                      ? favorites.filter((item) => item !== id)
                      : [...favorites, id];
                    const saved = await request<{ ingredientIds: string[] }>('favorites', {
                      ingredientIds,
                    });
                    setFavorites(saved.ingredientIds);
                  })
                }
              />
            </>
          )}
        </main>
      </div>
      {dialog}
    </>
  );
}
