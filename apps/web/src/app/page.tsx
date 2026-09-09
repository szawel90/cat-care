import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { HomeHeader } from '@/components/home-header';
import { InstallApp } from '@/components/install-app';

const articles = [
  { title: 'homeTitle', category: 'homeCategory', image: '/article-home.svg' },
  { title: 'playTitle', category: 'playCategory', image: '/article-play.svg' },
  { title: 'restTitle', category: 'restCategory', image: '/article-rest.svg' },
] as const;

export default async function Home() {
  const t = await getTranslations('Home');
  const common = await getTranslations('Common');
  return (
    <>
      <a className="skip-link" href="#main-content">
        {common('skip')}
      </a>
      <HomeHeader />
      <main id="main-content" tabIndex={-1} className="home-workspace">
        <div className="home-intro">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('description')}</p>
        </div>
        <section className="article-grid" aria-label={t('articles')}>
          {articles.map((article) => (
            <article className="article-card" key={article.title}>
              <div className="article-art">
                <Image
                  src={article.image}
                  alt=""
                  width={420}
                  height={330}
                  sizes="(max-width: 640px) 100vw, (max-width: 960px) 50vw, 33vw"
                />
              </div>
              <div className="article-copy">
                <p className="eyebrow">{t(article.category)}</p>
                <h2>{t(article.title)}</h2>
                <p>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                  incididunt ut labore et dolore magna aliqua.
                </p>
                <p>
                  Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip
                  ex ea commodo consequat.
                </p>
              </div>
            </article>
          ))}
        </section>
      </main>
      <footer className="site-footer">
        <span>© 2026 Cat Care</span>
        <InstallApp />
      </footer>
    </>
  );
}
