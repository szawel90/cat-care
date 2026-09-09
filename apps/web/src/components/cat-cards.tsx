'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Plus, Archive } from 'lucide-react';
import type { CatRecord } from '@cat-care/shared';
import { CatAvatar } from './cat-picker';
import { useCats } from './cats-provider';
import { Button } from './ui/button';
import { catRequest } from '@/lib/cats-api';

export function CatCards({
  cats,
  selectedId,
  onSelect,
  onAdd,
}: {
  cats: CatRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const t = useTranslations('Cats');
  return (
    <div className="cat-card-grid">
      {cats.map((cat) => (
        <button key={cat.id} type="button" className="cat-card" onClick={() => onSelect(cat.id)}>
          <span className="cat-card-top">
            <CatAvatar cat={cat} />
            {cat.id === selectedId && (
              <span className="cat-selected-label">{t('selectedCat')}</span>
            )}
          </span>
          <strong>{cat.name}</strong>
          <span>
            {cat.attributes.age === 'deferred'
              ? t('pending')
              : cat.attributes.age || t('notProvided')}
          </span>
          <small>{cat.archivedAt ? t('archived') : t(`statuses.${cat.portraitStatus}`)}</small>
        </button>
      ))}
      <button type="button" className="cat-card cat-add-card" onClick={onAdd}>
        <Plus aria-hidden="true" />
        <strong>{t('addCat')}</strong>
        <span>{t('nameOnly')}</span>
      </button>
    </div>
  );
}
export function YourCats() {
  const context = useCats();
  const t = useTranslations('Cats');
  const router = useRouter();
  const [archived, setArchived] = useState<CatRecord[] | null>(null);
  const [archiveError, setArchiveError] = useState(false);
  const navigate = (id: string) => {
    context.select(id);
    router.push('/cats/' + id);
  };
  async function showArchive() {
    if (archived) {
      setArchived(null);
      return;
    }
    setArchiveError(false);
    try {
      setArchived(await catRequest<CatRecord[]>('?archived=true'));
    } catch {
      setArchiveError(true);
    }
  }
  return (
    <section className="your-cats" aria-labelledby="your-cats-heading">
      <h2 id="your-cats-heading">{t('yourCats')}</h2>
      {context.status === 'loading' ? (
        <p role="status">{t('loading')}</p>
      ) : context.status === 'error' ? (
        <div role="alert">
          <p>{t('errors.load')}</p>
          <Button variant="outline" onClick={() => void context.refresh()}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <>
          <CatCards
            cats={context.cats}
            selectedId={context.selectedId}
            onSelect={navigate}
            onAdd={() => router.push('/cats/new')}
          />
          <Button className="cat-archive-link" variant="ghost" onClick={() => void showArchive()}>
            <Archive aria-hidden="true" />
            {t('archivedCats')}
          </Button>
          {archiveError && <p role="alert">{t('errors.load')}</p>}
          {archived && (
            <section aria-label={t('archivedCats')}>
              <h3>{t('archivedCats')}</h3>
              {archived.length ? (
                <div className="cat-card-grid">
                  {archived.map((cat) => (
                    <Button key={cat.id} variant="outline" onClick={() => navigate(cat.id)}>
                      {cat.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <p>{t('empty')}</p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
