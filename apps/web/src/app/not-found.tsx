import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
export default async function NotFound() {
  const t = await getTranslations('Common');
  return (
    <main id="main-content" className="home-workspace">
      <h1>{t('notFound')}</h1>
      <Link href="/">{t('backHome')}</Link>
    </main>
  );
}
