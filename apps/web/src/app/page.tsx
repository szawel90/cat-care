import Image from 'next/image';
import { HomeHeader } from '@/components/home-header';
import { InstallApp } from '@/components/install-app';

const articles = [
  { title: 'A place to feel at home', category: 'Everyday life', image: '/article-home.svg' },
  { title: 'A little time to play', category: 'Time together', image: '/article-play.svg' },
  { title: 'The art of slowing down', category: 'Quiet moments', image: '/article-rest.svg' },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <HomeHeader />
      <main id="main-content" tabIndex={-1} className="home-workspace">
        <div className="home-intro">
          <p className="eyebrow">Life with your cat</p>
          <h1>A little closer, every day.</h1>
          <p className="subtitle">Stories, ideas and small moments to share.</p>
        </div>
        <section className="article-grid" aria-label="Articles">
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
                <p className="eyebrow">{article.category}</p>
                <h2>{article.title}</h2>
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
