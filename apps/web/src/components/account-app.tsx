'use client';

import Image from 'next/image';
import { useTranslations, useFormatter } from 'next-intl';
import { accountMessage, authErrorKey, type AccountMessage } from '@/i18n/messages';
import { LanguageSettings, GuestLanguageSwitcher } from './language-settings';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { authClient as client } from '@/lib/auth-client';
import { useUnsavedChangesDialog } from './unsaved-changes-dialog';
import { AppearanceSettings } from './appearance-settings';
import { InstallApp } from './install-app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import { AccountMenu } from './account-menu';
import { EmailField, PasswordField } from './account-fields';
import { Feedback } from './feedback';
import { AccountSettingsTabs } from './account-settings-tabs';

type View = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'account';
type Session = typeof client.$Infer.Session.session;
type ConnectedAccount = { id: string; providerId: string; accountId: string };
type Options = { google: boolean; facebook: boolean; emailPassword: boolean };

async function check<
  T extends { error: { message?: string; code?: string; status?: number } | null },
>(result: Promise<T>): Promise<T> {
  const response = await result;
  if (response.error) throw new Error(authErrorKey(response.error));
  return response;
}

export function AccountApp({ view }: { view: View }) {
  const t = useTranslations('Account');
  const format = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const { data: current, isPending, error: sessionError, refetch } = client.useSession();
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AccountMessage | ''>('');
  const [error, setError] = useState<AccountMessage | ''>('');
  const requestedTab = params.get('settings');
  const settingsOpen =
    view === 'account' && ['profile', 'security', 'data'].includes(requestedTab ?? '');
  const tab = settingsOpen ? requestedTab : 'profile';
  const formDirty = useRef(false);
  const { confirmDiscard, dialog } = useUnsavedChangesDialog();
  async function navigateSettings(section: string | null) {
    if (busy || section === requestedTab) return;
    if (formDirty.current && !(await confirmDiscard())) return;
    formDirty.current = false;
    setNotice('');
    setError('');
    router.push(section ? '/account?settings=' + section : '/account', { scroll: false });
  }
  const [sessions, setSessions] = useState<Session[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [securityLoaded, setSecurityLoaded] = useState(false);
  const user = current?.user;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/options', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setOptions)
      .catch(() => {
        if (!controller.signal.aborted) setError('serviceUnavailable');
      });
    return () => controller.abort();
  }, []);

  const loadSecurity = useCallback(async () => {
    const [sessionList, accountList] = await Promise.all([
      check(client.listSessions()),
      check(client.listAccounts()),
    ]);
    setSessions(sessionList.data ?? []);
    setAccounts(accountList.data ?? []);
    setSecurityLoaded(true);
  }, []);

  useEffect(() => {
    if (view === 'account' && current && !sessionError) {
      let active = true;
      Promise.all([check(client.listSessions()), check(client.listAccounts())])
        .then(([sessionList, accountList]) => {
          if (!active) return;
          setSessions(sessionList.data ?? []);
          setAccounts(accountList.data ?? []);
          setSecurityLoaded(true);
        })
        .catch(() => {
          if (active) setError('securityUnavailable');
        });
      return () => {
        active = false;
      };
    }
  }, [view, current, sessionError]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      setError(accountMessage(failure instanceof Error ? failure.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  function submit(action: (data: FormData) => Promise<void>) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void run(async () => {
        await action(data);
        formDirty.current = false;
      });
    };
  }

  const value = (data: FormData, key: string) => String(data.get(key) ?? '');
  const email = (data: FormData, key = 'email') => value(data, key).trim().toLowerCase();
  const signOut = async () => {
    if (formDirty.current && !(await confirmDiscard())) return;
    return run(async () => {
      await check(client.signOut());
      router.replace('/login');
      router.refresh();
    });
  };
  const social = (link = false) =>
    run(async () => {
      if (!options?.google) {
        setNotice('googleUnavailable');
        return;
      }
      if (link)
        await check(
          client.linkSocial({
            provider: 'google',
            callbackURL: '/account',
            errorCallbackURL: '/account',
          }),
        );
      else
        await check(
          client.signIn.social({
            provider: 'google',
            callbackURL: '/account',
            errorCallbackURL: '/login',
          }),
        );
    });

  function providers() {
    return (
      <>
        <Button
          className="provider"
          type="button"
          disabled={busy || !options}
          onClick={() => void social()}
        >
          <Image src="/google.svg" alt="" width={19} height={19} />
          {t('google')}
        </Button>
        <Button className="provider" type="button" disabled>
          <Image src="/facebook.svg" alt="" width={19} height={19} />
          {t('facebook')}
        </Button>
        <div className="separator">{t('emailAlternative')}</div>
      </>
    );
  }

  const feedback = (
    <>
      {(error || params.get('error')) && (
        <Feedback tone="error">{error ? t(error) : t('linkError')}</Feedback>
      )}
      {notice && <Feedback>{t(notice)}</Feedback>}
    </>
  );

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('skip')}
      </a>
      <header className="site-header">
        <Link
          href="/"
          prefetch={false}
          onClick={(event) => {
            if (busy) {
              event.preventDefault();
              return;
            }
            if (formDirty.current) {
              event.preventDefault();
              void confirmDiscard().then((discard) => {
                if (discard) {
                  formDirty.current = false;
                  router.push('/');
                }
              });
            }
          }}
          className="brand"
          aria-label={t('home')}
        >
          <Image src="/brand.svg" alt="" width={35} height={35} />
          cat care<span>.</span>
        </Link>
        {view === 'account' && user && !sessionError ? (
          <AccountMenu
            user={user}
            busy={busy}
            onProfileClick={(event) => {
              if (busy) {
                event.preventDefault();
                return;
              }
              if (formDirty.current) {
                event.preventDefault();
                void confirmDiscard().then((discard) => {
                  if (discard) {
                    formDirty.current = false;
                    setNotice('');
                    setError('');
                    router.push('/account');
                  }
                });
                return;
              }
              formDirty.current = false;
              setNotice('');
              setError('');
            }}
            onSettings={() => void navigateSettings('profile')}
            onSignOut={() => void signOut()}
          />
        ) : (
          <div className="guest-account-actions">
            <GuestLanguageSwitcher />
            <span className="header-note">
              <i />
              {t('pilot')}
            </span>
          </div>
        )}
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={view === 'account' ? 'workspace workspace-account' : 'workspace'}
      >
        {view !== 'account' && (
          <aside className="story" aria-label={t('about')}>
            <div className="eyebrow">{t('storyEyebrow')}</div>
            <h2>{t.rich('storyTitle', { br: () => <br />, em: (chunks) => <em>{chunks}</em> })}</h2>
            <p>{t.rich('storyText', { br: () => <br /> })}</p>
            <div className="art">
              <Image src="/cat.svg" alt="" fill sizes="(max-width: 740px) 0px, 500px" priority />
            </div>
            <div className="story-foot">{t('storyFooter')}</div>
          </aside>
        )}
        <section className="form-column">
          <div className="form-wrap">
            {view !== 'account' && feedback}
            {view === 'login' && (
              <>
                <h1>{t('welcome')}</h1>
                <p className="subtitle">{t('welcomeDescription')}</p>
                {params.get('verified') && (
                  <p className="feedback" role="status">
                    {t('verifiedNotice')}
                  </p>
                )}
                {params.get('deleted') && (
                  <p className="feedback" role="status">
                    {t('deletedNotice')}
                  </p>
                )}
                {providers()}
                <form
                  onSubmit={submit(async (data) => {
                    await check(
                      client.signIn.email({
                        email: email(data),
                        password: value(data, 'password'),
                      }),
                    );
                    router.replace('/account');
                    router.refresh();
                  })}
                >
                  <fieldset disabled={busy}>
                    <EmailField />
                    <PasswordField id="password" />
                    <p className="right-link">
                      <Link href="/forgot-password">{t('forgotPassword')}</Link>
                    </p>
                    <Button className="primary" type="submit">
                      {busy ? t('signingIn') : t('signIn')}
                    </Button>
                  </fieldset>
                </form>
                <p className="bottom-link">
                  {t('newHere')} <Link href="/register">{t('createAnAccount')}</Link>
                </p>
                <details className="sign-in-help">
                  <summary>{t('signInHelp')}</summary>
                  <Button
                    className="text-button resend"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const address = (
                          document.getElementById('email') as HTMLInputElement
                        ).value.trim();
                        if (!address) throw new Error('enterEmail');
                        await check(
                          client.sendVerificationEmail({
                            email: address,
                            callbackURL: '/login?verified=1',
                          }),
                        );
                        setNotice('verificationResent');
                      })
                    }
                  >
                    {t('resendVerification')}
                  </Button>
                  <div className="pilot-note">{t('pilotAccess')}</div>
                </details>
              </>
            )}

            {view === 'register' && (
              <>
                <h1>{t('registerTitle')}</h1>
                <p className="subtitle">{t('registerDescription')}</p>
                {providers()}
                <form
                  onSubmit={submit(async (data) => {
                    await check(
                      client.signUp.email({
                        name: value(data, 'name').trim(),
                        email: email(data),
                        password: value(data, 'password'),
                        callbackURL: '/login?verified=1',
                      }),
                    );
                    setNotice('verifyBeforeSignIn');
                  })}
                >
                  <fieldset disabled={busy}>
                    <div className="field">
                      <Label htmlFor="name">{t('displayName')}</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="nickname"
                        maxLength={60}
                        required
                        placeholder={t('namePlaceholder')}
                      />
                    </div>
                    <EmailField />
                    <PasswordField id="password" newPassword />
                    <Button className="primary" type="submit">
                      {busy ? t('creatingAccount') : t('createAccount')}
                    </Button>
                  </fieldset>
                </form>
                <p className="bottom-link">
                  {t('alreadyRegistered')} <Link href="/login">{t('signIn')}</Link>
                </p>
              </>
            )}

            {view === 'forgot-password' && (
              <>
                <Link className="back" href="/login">
                  {t('backToSignInArrow')}
                </Link>
                <h1>{t('forgotTitle')}</h1>
                <p className="subtitle">{t('forgotDescription')}</p>
                <form
                  onSubmit={submit(async (data) => {
                    await check(
                      client.requestPasswordReset({
                        email: email(data),
                        redirectTo: '/reset-password',
                      }),
                    );
                    setNotice('resetRequested');
                  })}
                >
                  <fieldset disabled={busy}>
                    <EmailField />
                    <Button className="primary" type="submit">
                      {busy ? t('sending') : t('sendResetLink')}
                    </Button>
                  </fieldset>
                </form>
              </>
            )}

            {view === 'reset-password' && (
              <>
                <Link href="/login" className="back">
                  {t('backToSignInArrow')}
                </Link>
                <h1>{t('resetTitle')}</h1>
                <p className="subtitle">{t('resetDescription')}</p>
                <form
                  onSubmit={submit(async (data) => {
                    if (!params.get('token')) throw new Error('invalidResetLink');
                    await check(
                      client.resetPassword({
                        newPassword: value(data, 'password'),
                        token: params.get('token')!,
                      }),
                    );
                    router.replace('/login');
                  })}
                >
                  <fieldset disabled={busy || !params.get('token')}>
                    <PasswordField id="password" newPassword />
                    <Button className="primary" type="submit">
                      {t('saveNewPassword')}
                    </Button>
                  </fieldset>
                </form>
                <p className="bottom-link">
                  <Link href="/forgot-password">{t('requestNewResetLink')}</Link>
                </p>
              </>
            )}

            {view === 'account' &&
              (isPending ? (
                <p role="status">{t('loadingAccount')}</p>
              ) : !user || sessionError ? (
                <>
                  <h1>{t('signInRequiredTitle')}</h1>
                  {feedback}
                  <p className="subtitle">{t('sessionEnded')}</p>
                  <Link className="primary" href="/login">
                    {t('backToSignIn')}
                  </Link>
                </>
              ) : (
                <div
                  className="account"
                  onChange={() => {
                    formDirty.current = true;
                  }}
                >
                  {settingsOpen && (
                    <Button className="back" onClick={() => navigateSettings(null)}>
                      {t('backToAccount')}
                    </Button>
                  )}
                  <h1>{settingsOpen ? t('settings') : t('accountTitle')}</h1>
                  <p className="subtitle">
                    {settingsOpen ? t('settingsDescription') : t('accountDescription')}
                  </p>
                  {!settingsOpen ? (
                    <div className="account-overview">
                      {feedback}
                      <div className="account-top">
                        <div className="avatar" aria-hidden="true">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong>{user.name}</strong>
                          <p className="account-email">{t('accountReady')}</p>
                        </div>
                      </div>
                      <p className="hint">{t('openSettingsHint')}</p>
                    </div>
                  ) : (
                    <AccountSettingsTabs
                      value={tab!}
                      onValueChange={navigateSettings}
                      disabled={busy}
                    >
                      {feedback}
                      <TabsContent value="profile">
                        <form
                          key={user.name}
                          onSubmit={submit(async (data) => {
                            await check(
                              client.updateUser({ name: value(data, 'displayName').trim() }),
                            );
                            await refetch();
                            setNotice('profileUpdated');
                          })}
                        >
                          <fieldset disabled={busy}>
                            <div className="field">
                              <Label htmlFor="displayName">{t('displayName')}</Label>
                              <Input
                                id="displayName"
                                name="displayName"
                                autoComplete="nickname"
                                defaultValue={user.name}
                                required
                                maxLength={60}
                              />
                            </div>
                            <div className="field">
                              <Label htmlFor="profile-email">{t('email')}</Label>
                              <Input id="profile-email" value={user.email} readOnly />
                              <p className="hint">{t('emailVerified')}</p>
                            </div>
                            <Button className="primary" type="submit">
                              {t('saveChanges')}
                            </Button>
                          </fieldset>
                        </form>
                        <details>
                          <summary>{t('changeEmail')}</summary>
                          <p className="hint">{t('changeEmailHelp')}</p>
                          <form
                            onSubmit={submit(async (data) => {
                              await check(
                                client.changeEmail({
                                  newEmail: email(data, 'newEmail'),
                                  callbackURL: '/login?verified=1',
                                }),
                              );
                              setNotice('emailChangeRequested');
                            })}
                          >
                            <fieldset disabled={busy}>
                              <EmailField id="newEmail" label={t('newEmail')} />
                              <Button className="primary" type="submit">
                                {t('requestEmailChange')}
                              </Button>
                            </fieldset>
                          </form>
                        </details>
                        <AppearanceSettings disabled={busy} onSavingChange={setBusy} />
                        <LanguageSettings disabled={busy} onSavingChange={setBusy} />
                      </TabsContent>
                      <TabsContent value="security">
                        <div className="section-title">{t('signInMethods')}</div>
                        {!securityLoaded ? (
                          <p role="status">{t('loadingSecurity')}</p>
                        ) : (
                          <>
                            <div className="setting-row">
                              <span>Google</span>
                              {accounts.some((account) => account.providerId === 'google') ? (
                                <Button
                                  disabled={busy || accounts.length < 2}
                                  onClick={() =>
                                    void run(async () => {
                                      await check(
                                        client.unlinkAccount({
                                          accountId: accounts.find(
                                            (account) => account.providerId === 'google',
                                          )!.id,
                                        }),
                                      );
                                      await loadSecurity();
                                      setNotice('googleDisconnected');
                                    })
                                  }
                                >
                                  {t('disconnect')}
                                </Button>
                              ) : (
                                <Button disabled={busy} onClick={() => void social(true)}>
                                  {t('connect')}
                                </Button>
                              )}
                            </div>
                            <div className="setting-row">
                              <span>Facebook</span>
                              <Button disabled>{t('connect')}</Button>
                            </div>
                            <details>
                              <summary>
                                {accounts.some((account) => account.providerId === 'credential')
                                  ? t('changePassword')
                                  : t('setPassword')}
                              </summary>
                              {accounts.some((account) => account.providerId === 'credential') ? (
                                <form
                                  onSubmit={submit(async (data) => {
                                    await check(
                                      client.changePassword({
                                        currentPassword: value(data, 'currentPassword'),
                                        newPassword: value(data, 'newPassword'),
                                        revokeOtherSessions: true,
                                      }),
                                    );
                                    await loadSecurity();
                                    setNotice('passwordChanged');
                                  })}
                                >
                                  <fieldset disabled={busy}>
                                    <PasswordField
                                      id="currentPassword"
                                      label={t('currentPassword')}
                                    />
                                    <PasswordField
                                      id="newPassword"
                                      label={t('newPassword')}
                                      newPassword
                                    />
                                    <Button className="primary" type="submit">
                                      {t('changePassword')}
                                    </Button>
                                  </fieldset>
                                </form>
                              ) : (
                                <Button
                                  className="primary"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await check(
                                        client.requestPasswordReset({
                                          email: user.email,
                                          redirectTo: '/reset-password',
                                        }),
                                      );
                                      setNotice('passwordSetupRequested');
                                    })
                                  }
                                >
                                  {t('sendPasswordSetup')}
                                </Button>
                              )}
                            </details>
                            <div className="section-title">{t('sessions')}</div>
                            {sessions.map((session) => (
                              <div className="setting-row" key={session.id}>
                                <div>
                                  {session.id === current.session.id
                                    ? t('thisDevice')
                                    : t('anotherDevice')}
                                  <div className="security-sub">
                                    {t('signedInAt', {
                                      date: format.dateTime(new Date(session.createdAt), {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                      }),
                                    })}
                                  </div>
                                </div>
                                {session.id === current.session.id ? (
                                  <span className="chip">{t('active')}</span>
                                ) : (
                                  <Button
                                    disabled={busy}
                                    onClick={() =>
                                      void run(async () => {
                                        await check(client.revokeSession({ token: session.token }));
                                        await loadSecurity();
                                        setNotice('deviceSignedOut');
                                      })
                                    }
                                  >
                                    {t('signOut')}
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await check(client.revokeSessions());
                                  await signOut();
                                })
                              }
                            >
                              {t('signOutEverywhere')}
                            </Button>
                          </>
                        )}
                      </TabsContent>
                      <TabsContent value="data">
                        <div className="setting-row">
                          <span>{t('yourData')}</span>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const response = await fetch('/api/account/export', {
                                  cache: 'no-store',
                                });
                                if (!response.ok) throw new Error('exportRequiresSignIn');
                                const url = URL.createObjectURL(await response.blob());
                                const anchor = document.createElement('a');
                                anchor.href = url;
                                anchor.download = 'cat-care-account.json';
                                anchor.click();
                                URL.revokeObjectURL(url);
                                setNotice('exportReady');
                              })
                            }
                          >
                            {t('downloadData')}
                          </Button>
                        </div>
                        <details className="danger">
                          <summary>{t('deleteAccount')}</summary>
                          <p className="hint">{t('deleteHelp')}</p>
                          <form
                            onSubmit={submit(async () => {
                              await check(client.deleteUser({ callbackURL: '/login?deleted=1' }));
                              setNotice('deletionRequested');
                            })}
                          >
                            <fieldset disabled={busy}>
                              <Label className="checkbox">
                                <input type="checkbox" required />
                                {t('deleteConsent')}
                              </Label>
                              <Button className="primary danger-button" type="submit">
                                {t('sendDeletionConfirmation')}
                              </Button>
                            </fieldset>
                          </form>
                        </details>
                      </TabsContent>
                    </AccountSettingsTabs>
                  )}
                </div>
              ))}
          </div>
        </section>
      </main>
      {dialog}
      <footer className="site-footer">
        <span>© 2026 Cat Care</span>
        <InstallApp />
      </footer>
    </>
  );
}
