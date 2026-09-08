'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { AccountMenu } from './account-menu';
import { Button } from './ui/button';

export function HomeHeader() {
  const { data: session, error: sessionError, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      router.refresh();
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Cat Care home">
          <Image src="/brand.svg" alt="" width={35} height={35} />
          cat care<span>.</span>
        </Link>
        {session && !sessionError ? (
          <AccountMenu
            user={session.user}
            busy={busy}
            onSettings={() => router.push('/account?settings=profile')}
            onSignOut={() => void signOut()}
          />
        ) : (
          <nav aria-label="Account" className="guest-navigation" aria-busy={isPending}>
            <Button asChild variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </nav>
        )}
      </header>
      {error && (
        <p className="feedback error home-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
