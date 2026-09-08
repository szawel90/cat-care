'use client';

import Image from 'next/image';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AccountMenu } from './account-menu';
import { Eye, EyeOff, CircleAlert, CircleCheck } from 'lucide-react';

type View = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'account';
type Session = typeof client.$Infer.Session.session;
type ConnectedAccount = { id: string; providerId: string; accountId: string };
type Options = { google: boolean; facebook: boolean; emailPassword: boolean };

async function check<T extends { error: { message?: string } | null }>(
  result: Promise<T>,
): Promise<T> {
  const response = await result;
  if (response.error)
    throw new Error(response.error.message || 'Something went wrong. Please try again.');
  return response;
}

function PasswordField({
  id,
  label = 'Password',
  newPassword = false,
}: {
  id: string;
  label?: string;
  newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <div className="password-wrap">
        <Input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          minLength={newPassword ? 12 : undefined}
          maxLength={128}
          required
        />
        <Button
          type="button"
          className="eye"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {newPassword && <p className="hint">Use at least 12 characters.</p>}
    </div>
  );
}

function EmailField({ id = 'email', label = 'Email address' }: { id?: string; label?: string }) {
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        maxLength={254}
      />
    </div>
  );
}

export function AccountApp({ view }: { view: View }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: current, isPending, error: sessionError, refetch } = client.useSession();
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
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
        if (!controller.signal.aborted)
          setError('The account service is unavailable. Please try again shortly.');
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
          if (active) setError('Could not load account security. Please sign in again.');
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
      setError(failure instanceof Error ? failure.message : 'Please try again.');
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
        setNotice('Google sign-in is being configured. Please use email for now.');
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
          Continue with Google
        </Button>
        <Button className="provider" type="button" disabled>
          <Image src="/facebook.svg" alt="" width={19} height={19} />
          Continue with Facebook
        </Button>
        <div className="separator">or continue with email</div>
      </>
    );
  }

  const feedback = (
    <>
      {(error || params.get('error')) && (
        <div className="feedback error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>
            {error ||
              'This link or sign-in attempt could not be completed. Try again, or request a new email link.'}
          </span>
        </div>
      )}
      {notice && (
        <div className="feedback" role="status">
          <CircleCheck aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
    </>
  );

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
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
          aria-label="Cat Care home"
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
          <span className="header-note">
            <i />
            Private pilot
          </span>
        )}
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={view === 'account' ? 'workspace workspace-account' : 'workspace'}
      >
        {view !== 'account' && (
          <aside className="story" aria-label="About Cat Care">
            <div className="eyebrow">A little closer, every day</div>
            <h2>
              Good care starts
              <br />
              with <em>understanding.</em>
            </h2>
            <p>
              A thoughtful space for you and your cat.
              <br />
              One account. Their story, all together.
            </p>
            <div className="art">
              <Image src="/cat.svg" alt="" fill sizes="(max-width: 740px) 0px, 500px" priority />
            </div>
            <div className="story-foot">Made for the small things that matter.</div>
          </aside>
        )}
        <section className="form-column">
          <div className="form-wrap">
            {view !== 'account' && feedback}
            {view === 'login' && (
              <>
                <h1>Welcome back.</h1>
                <p className="subtitle">A familiar place for you and your cat.</p>
                {params.get('verified') && (
                  <p className="feedback" role="status">
                    Your email is verified. You can sign in now.
                  </p>
                )}
                {params.get('deleted') && (
                  <p className="feedback" role="status">
                    Your account has been deleted.
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
                      <Link href="/forgot-password">Forgot password?</Link>
                    </p>
                    <Button className="primary" type="submit">
                      {busy ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </fieldset>
                </form>
                <p className="bottom-link">
                  New to Cat Care? <Link href="/register">Create an account</Link>
                </p>
                <details className="sign-in-help">
                  <summary>Need help signing in?</summary>
                  <Button
                    className="text-button resend"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const address = (
                          document.getElementById('email') as HTMLInputElement
                        ).value.trim();
                        if (!address) throw new Error('Enter your email address above first.');
                        await check(
                          client.sendVerificationEmail({
                            email: address,
                            callbackURL: '/login?verified=1',
                          }),
                        );
                        setNotice('If your account needs verification, a new link is on its way.');
                      })
                    }
                  >
                    Resend verification email
                  </Button>
                  <div className="pilot-note">
                    Access is currently available to approved email addresses.
                  </div>
                </details>
              </>
            )}

            {view === 'register' && (
              <>
                <h1>Make yourself at home.</h1>
                <p className="subtitle">Create your account with an approved email address.</p>
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
                    setNotice('Check your email to verify your address before signing in.');
                  })}
                >
                  <fieldset disabled={busy}>
                    <div className="field">
                      <Label htmlFor="name">Display name</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="nickname"
                        maxLength={60}
                        required
                        placeholder="What should we call you?"
                      />
                    </div>
                    <EmailField />
                    <PasswordField id="password" newPassword />
                    <Button className="primary" type="submit">
                      {busy ? 'Creating account…' : 'Create account'}
                    </Button>
                  </fieldset>
                </form>
                <p className="bottom-link">
                  Already have an account? <Link href="/login">Sign in</Link>
                </p>
              </>
            )}

            {view === 'forgot-password' && (
              <>
                <Link className="back" href="/login">
                  ← Back to sign in
                </Link>
                <h1>Forgot your password?</h1>
                <p className="subtitle">Enter your email and we’ll help you reset it.</p>
                <form
                  onSubmit={submit(async (data) => {
                    await check(
                      client.requestPasswordReset({
                        email: email(data),
                        redirectTo: '/reset-password',
                      }),
                    );
                    setNotice(
                      'If an eligible account exists, you’ll receive an email with the next steps.',
                    );
                  })}
                >
                  <fieldset disabled={busy}>
                    <EmailField />
                    <Button className="primary" type="submit">
                      {busy ? 'Sending…' : 'Send reset link'}
                    </Button>
                  </fieldset>
                </form>
              </>
            )}

            {view === 'reset-password' && (
              <>
                <Link href="/login" className="back">
                  ← Back to sign in
                </Link>
                <h1>A fresh start.</h1>
                <p className="subtitle">Choose a new password for your account.</p>
                <form
                  onSubmit={submit(async (data) => {
                    if (!params.get('token'))
                      throw new Error('This reset link is invalid. Request a new link.');
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
                      Save new password
                    </Button>
                  </fieldset>
                </form>
                <p className="bottom-link">
                  <Link href="/forgot-password">Request a new reset link</Link>
                </p>
              </>
            )}

            {view === 'account' &&
              (isPending ? (
                <p role="status">Loading your account…</p>
              ) : !user || sessionError ? (
                <>
                  <h1>Let’s get you signed in.</h1>
                  {feedback}
                  <p className="subtitle">Your session has ended or access is unavailable.</p>
                  <Link className="primary" href="/login">
                    Back to sign in
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
                      ← Back to account
                    </Button>
                  )}
                  <h1>{settingsOpen ? 'Settings' : 'Your account.'}</h1>
                  <p className="subtitle">
                    {settingsOpen
                      ? 'Manage your profile, sign-in and data.'
                      : 'A space for you and your cat.'}
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
                          <p className="account-email">Your account is ready.</p>
                        </div>
                      </div>
                      <p className="hint">Open your account menu to manage your settings.</p>
                    </div>
                  ) : (
                    <Tabs value={tab!} onValueChange={navigateSettings} activationMode="manual">
                      <TabsList
                        className="account-nav"
                        aria-label="Account settings"
                        variant="line"
                      >
                        <TabsTrigger value="profile" disabled={busy}>
                          Profile
                        </TabsTrigger>
                        <TabsTrigger value="security" disabled={busy}>
                          Security
                        </TabsTrigger>
                        <TabsTrigger value="data" disabled={busy}>
                          Data & privacy
                        </TabsTrigger>
                      </TabsList>
                      {feedback}
                      <TabsContent value="profile">
                        <form
                          key={user.name}
                          onSubmit={submit(async (data) => {
                            await check(
                              client.updateUser({ name: value(data, 'displayName').trim() }),
                            );
                            await refetch();
                            setNotice('Your profile has been updated.');
                          })}
                        >
                          <fieldset disabled={busy}>
                            <div className="field">
                              <Label htmlFor="displayName">Display name</Label>
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
                              <Label htmlFor="profile-email">Email address</Label>
                              <Input id="profile-email" value={user.email} readOnly />
                              <p className="hint">✓ Email verified</p>
                            </div>
                            <Button className="primary" type="submit">
                              Save changes
                            </Button>
                          </fieldset>
                        </form>
                        <details>
                          <summary>Change email address</summary>
                          <p className="hint">
                            Sign in again first. Your new address must be approved for the pilot.
                            We’ll ask you to confirm both email addresses.
                          </p>
                          <form
                            onSubmit={submit(async (data) => {
                              await check(
                                client.changeEmail({
                                  newEmail: email(data, 'newEmail'),
                                  callbackURL: '/login?verified=1',
                                }),
                              );
                              setNotice('Check your current email to approve this change.');
                            })}
                          >
                            <fieldset disabled={busy}>
                              <EmailField id="newEmail" label="New email address" />
                              <Button className="primary" type="submit">
                                Request email change
                              </Button>
                            </fieldset>
                          </form>
                        </details>
                        <AppearanceSettings disabled={busy} onSavingChange={setBusy} />
                      </TabsContent>
                      <TabsContent value="security">
                        <div className="section-title">Sign-in methods</div>
                        {!securityLoaded ? (
                          <p role="status">Loading security settings…</p>
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
                                      setNotice('Google has been disconnected.');
                                    })
                                  }
                                >
                                  Disconnect
                                </Button>
                              ) : (
                                <Button disabled={busy} onClick={() => void social(true)}>
                                  Connect →
                                </Button>
                              )}
                            </div>
                            <div className="setting-row">
                              <span>Facebook</span>
                              <Button disabled>Connect →</Button>
                            </div>
                            <details>
                              <summary>
                                {accounts.some((account) => account.providerId === 'credential')
                                  ? 'Change password'
                                  : 'Set a password'}
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
                                    setNotice(
                                      'Password changed. Other devices have been signed out.',
                                    );
                                  })}
                                >
                                  <fieldset disabled={busy}>
                                    <PasswordField id="currentPassword" label="Current password" />
                                    <PasswordField
                                      id="newPassword"
                                      label="New password"
                                      newPassword
                                    />
                                    <Button className="primary" type="submit">
                                      Change password
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
                                      setNotice('Check your email to set a password.');
                                    })
                                  }
                                >
                                  Send password setup link
                                </Button>
                              )}
                            </details>
                            <div className="section-title">Sessions</div>
                            {sessions.map((session) => (
                              <div className="setting-row" key={session.id}>
                                <div>
                                  {session.id === current.session.id
                                    ? 'This device'
                                    : 'Another device'}
                                  <div className="security-sub">
                                    Signed in {new Date(session.createdAt).toLocaleString('en-GB')}
                                  </div>
                                </div>
                                {session.id === current.session.id ? (
                                  <span className="chip">Active</span>
                                ) : (
                                  <Button
                                    disabled={busy}
                                    onClick={() =>
                                      void run(async () => {
                                        await check(client.revokeSession({ token: session.token }));
                                        await loadSecurity();
                                        setNotice('Device signed out.');
                                      })
                                    }
                                  >
                                    Sign out
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
                              Sign out everywhere
                            </Button>
                          </>
                        )}
                      </TabsContent>
                      <TabsContent value="data">
                        <div className="setting-row">
                          <span>Your data</span>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const response = await fetch('/api/account/export', {
                                  cache: 'no-store',
                                });
                                if (!response.ok)
                                  throw new Error('Please sign in again to download your data.');
                                const url = URL.createObjectURL(await response.blob());
                                const anchor = document.createElement('a');
                                anchor.href = url;
                                anchor.download = 'cat-care-account.json';
                                anchor.click();
                                URL.revokeObjectURL(url);
                                setNotice('Your data download is ready.');
                              })
                            }
                          >
                            Download data →
                          </Button>
                        </div>
                        <details className="danger">
                          <summary>Delete account</summary>
                          <p className="hint">
                            This permanently deletes your account and ends access on all devices.
                            Sign in again first, then confirm using the email we send you.
                          </p>
                          <form
                            onSubmit={submit(async () => {
                              await check(client.deleteUser({ callbackURL: '/login?deleted=1' }));
                              setNotice('Check your email to confirm account deletion.');
                            })}
                          >
                            <fieldset disabled={busy}>
                              <Label className="checkbox">
                                <input type="checkbox" required />I want to permanently delete my
                                account.
                              </Label>
                              <Button className="primary danger-button" type="submit">
                                Send deletion confirmation
                              </Button>
                            </fieldset>
                          </form>
                        </details>
                      </TabsContent>
                    </Tabs>
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
