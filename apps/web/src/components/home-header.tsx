'use client';
import { useTranslations } from 'next-intl';

import Image from 'next/image';
import { GuestLanguageSwitcher } from './language-settings';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { AccountMenu } from './account-menu';
import { ActiveCatPicker } from './cats-provider';
import { Button } from './ui/button';

export function HomeHeader({
  beforeNavigate,
  disabled = false,
}: {
  beforeNavigate?: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const t = useTranslations('Common');
  const { data: session, error: sessionError, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function signOut() {
    if (disabled) return;
    if (beforeNavigate && !(await beforeNavigate())) return;
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      router.refresh();
    } catch {
      setError('signOutError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className={session && !sessionError ? 'site-header has-cat-picker' : 'site-header'}>
        <Link
          className="brand"
          href="/"
          aria-label={t('home')}
          onClick={(event) => {
            if (beforeNavigate) {
              event.preventDefault();
              void beforeNavigate().then((ok) => {
                if (ok) router.push('/');
              });
            }
          }}
        >
          <Image src="/brand.svg" alt="" width={35} height={35} />
          cat care<span>.</span>
        </Link>
        {session && !sessionError && (
          <ActiveCatPicker beforeNavigate={beforeNavigate} disabled={busy || disabled} />
        )}
        {session && !sessionError ? (
          <AccountMenu
            user={session.user}
            busy={busy || disabled}
            onProfileClick={(event) => {
              if (beforeNavigate) {
                event.preventDefault();
                void beforeNavigate().then((ok) => {
                  if (ok) router.push('/account');
                });
              }
            }}
            onSettings={() => {
              void (beforeNavigate?.() ?? Promise.resolve(true)).then((ok) => {
                if (ok) router.push('/account?settings=profile');
              });
            }}
            onSignOut={() => void signOut()}
          />
        ) : (
          <div className="guest-account-actions">
            <GuestLanguageSwitcher />
            <nav
              aria-label={t('accountNavigation')}
              className="guest-navigation"
              aria-busy={isPending}
            >
              <Button asChild variant="outline">
                <Link href="/login">{t('signIn')}</Link>
              </Button>
            </nav>
          </div>
        )}
      </header>
      {error && (
        <p className="feedback error home-error" role="alert">
          {t('signOutError')}
        </p>
      )}
    </>
  );
}
