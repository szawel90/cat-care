import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AccountApp } from '../../components/account-app';
const views = ['login', 'register', 'forgot-password', 'reset-password', 'account'] as const;
export default async function AccountPage({ params }: { params: Promise<{ view: string }> }) {
  const t = await getTranslations('Common');
  const { view } = await params;
  const supported = views.find((item) => item === view);
  if (!supported) notFound();
  return (
    <Suspense fallback={<p role="status">{t('loading')}</p>}>
      <AccountApp view={supported} />
    </Suspense>
  );
}
