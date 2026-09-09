'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, startTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  profileAreas,
  nextPortraitQuestion,
  type CatRecord,
  type PortraitRecord,
  type ProfileArea,
} from '@cat-care/shared';
import { catError, catRequest } from '@/lib/cats-api';
import { useCats } from './cats-provider';
import { HomeHeader } from './home-header';
import { CatProfileOverview } from './cat-profile-overview';
import { CatAreaForm, CatHouseholdForm, CatIdentityForm } from './cat-profile-forms';
import { CatObservationForm, CatQuestionForm } from './cat-interview';
import { CatPortraitResult } from './cat-portrait-result';
import { CatHistory } from './cat-history';
import { useUnsavedChangesDialog } from './unsaved-changes-dialog';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Feedback } from './feedback';

type View =
  | 'portrait'
  | 'profile'
  | 'identity'
  | 'home-link'
  | ProfileArea
  | 'period'
  | 'interview'
  | 'profile-history'
  | 'portrait-history';
export function CatApp({ catId }: { catId: string }) {
  const { ownerId } = useCats();
  return <CatAppContent key={ownerId ?? 'guest'} catId={catId} />;
}
function CatAppContent({ catId }: { catId: string }) {
  const t = useTranslations('Cats'),
    common = useTranslations('Common'),
    context = useCats(),
    router = useRouter();
  const [cat, setCat] = useState<CatRecord | null>(null),
    [portrait, setPortrait] = useState<PortraitRecord | null>(null);
  const [view, setView] = useState<View>(catId === 'new' ? 'identity' : 'profile'),
    [question, setQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(catId !== 'new'),
    [error, setError] = useState<ReturnType<typeof catError> | ''>(''),
    [notice, setNotice] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const { confirmDiscard, dialog } = useUnsavedChangesDialog();
  const heading = useRef<HTMLHeadingElement>(null);
  const visited = useRef<string[]>([]);
  const ownerId = context.ownerId;
  const reload = useCallback(async () => {
    if (!ownerId || catId === 'new') return;
    try {
      const [data, result] = await Promise.all([
        catRequest<CatRecord>('/' + catId),
        catRequest<PortraitRecord | null>(`/${catId}/portrait`),
      ]);
      setCat(data);
      setPortrait(result);
      setError('');
    } catch (failure) {
      setError(catError(failure));
    } finally {
      setLoading(false);
    }
  }, [catId, ownerId]);
  useEffect(() => {
    startTransition(() => reload());
  }, [reload]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  useLayoutEffect(() => {
    if (view !== 'interview') heading.current?.focus();
  }, [view, question, loading]);
  function clearDraft() {
    const key =
      view === 'identity'
        ? `identity:${catId}`
        : view === 'home-link'
          ? `home-link:${catId}`
          : view === 'period'
            ? `period:${catId}`
            : view === 'interview' && portrait && question
              ? `answer:${catId}:${portrait.assessmentId}:${question}`
              : `area:${catId}:${view}`;
    context.clearDraft(key);
  }
  async function beforeNavigate() {
    if (busy) return false;
    if (dirty && !(await confirmDiscard())) return false;
    if (dirty) clearDraft();
    setDirty(false);
    return true;
  }
  async function navigate(next: View) {
    if (!(await beforeNavigate())) return;
    setNotice(false);
    setError('');
    setView(next);
  }
  async function saved(data: CatRecord) {
    const [, result] = await Promise.all([
      context.refresh(),
      catRequest<PortraitRecord | null>(`/${data.id}/portrait`),
    ]);
    context.select(data.id);
    setCat(data);
    setPortrait(result);
    setDirty(false);
    setNotice(true);
    setView('profile');
    if (catId === 'new') router.replace('/cats/' + data.id);
  }
  async function answered(result: PortraitRecord) {
    const [, data] = await Promise.all([context.refresh(), catRequest<CatRecord>('/' + catId)]);
    setCat(data);
    setPortrait(result);
    setDirty(false);
    setNotice(true);
    if (question) visited.current.push(question);
    const next = nextPortraitQuestion(result, visited.current);
    setQuestion(next);
    setView(next ? 'interview' : 'profile');
  }
  function editAnswer(id: string) {
    visited.current = [];
    setQuestion(id);
    setView('interview');
    setNotice(false);
  }
  function continuePortrait() {
    visited.current = [];
    if (!portrait || !portrait.result.description) {
      setView('period');
      return;
    }
    const next = nextPortraitQuestion(portrait);
    setQuestion(next);
    setView(next ? 'interview' : 'portrait');
  }
  async function archive(restore = false) {
    if (!cat) return;
    setBusy(true);
    setError('');
    try {
      await catRequest(restore ? `/${cat.id}/restore` : '/' + cat.id, {
        method: restore ? 'POST' : 'DELETE',
        body: JSON.stringify({ expectedVersion: cat.version }),
      });
      setArchiveOpen(false);
      await context.refresh();
      if (restore) await reload();
      else router.push('/account');
    } catch (failure) {
      setError(catError(failure));
    } finally {
      setBusy(false);
    }
  }
  const callbacks = {
    onSaved: saved,
    onCancel: () => {
      void (catId === 'new'
        ? beforeNavigate().then((ok) => {
            if (ok) router.push('/account');
          })
        : navigate('profile'));
    },
    onDirty: setDirty,
    onBusy: setBusy,
  };
  return (
    <>
      <a className="skip-link" href="#main-content">
        {common('skip')}
      </a>
      <HomeHeader beforeNavigate={beforeNavigate} disabled={busy} />
      <main id="main-content" className="cat-workspace" tabIndex={-1}>
        {!ownerId ? (
          <p>
            {t('signIn')} <Link href="/login">{common('signIn')}</Link>
          </p>
        ) : loading ? (
          <p role="status">{t('loading')}</p>
        ) : (
          <>
            {view !== 'interview' && (
              <Button
                variant="ghost"
                onClick={() => {
                  void beforeNavigate().then((ok) => {
                    if (ok) router.push('/account');
                  });
                }}
              >
                {t('yourCats')}
              </Button>
            )}
            <h1
              className={(view === 'profile' && cat) || view === 'interview' ? 'sr-only' : ''}
              ref={heading}
              tabIndex={-1}
            >
              {catId === 'new'
                ? t('addCat')
                : view === 'profile'
                  ? cat?.name
                  : view === 'identity'
                    ? t('editIdentity')
                    : view === 'home-link'
                      ? t('changeHome')
                      : profileAreas.includes(view as ProfileArea)
                        ? t(`areas.${view as ProfileArea}`)
                        : t('portrait')}
            </h1>
            {error && (
              <Feedback tone="error">
                {t(`errors.${error}`)}{' '}
                <Button variant="outline" onClick={() => void reload()}>
                  {t('retry')}
                </Button>
              </Feedback>
            )}
            {notice && view !== 'interview' && <Feedback>{t('saved')}</Feedback>}
            {view === 'identity' && (catId === 'new' || cat) && (
              <CatIdentityForm key={catId} cat={cat ?? undefined} {...callbacks} />
            )}
            {cat && view === 'home-link' && (
              <CatHouseholdForm cat={cat} {...callbacks} onCancel={() => void navigate('home')} />
            )}
            {cat && profileAreas.includes(view as ProfileArea) && (
              <>
                {view === 'home' && (
                  <details className="cat-home-link">
                    <summary>{t('homeLinkDetails')}</summary>
                    <p>{t('shareHelp')}</p>
                    <Button variant="outline" onClick={() => void navigate('home-link')}>
                      {t('homeChoice')}
                    </Button>
                  </details>
                )}
                <CatAreaForm key={view} cat={cat} area={view as ProfileArea} {...callbacks} />
              </>
            )}
            {cat && view === 'period' && (
              <CatObservationForm
                cat={cat}
                previous={portrait}
                {...callbacks}
                onSaved={async (result) => {
                  await context.refresh();
                  setPortrait(result);
                  visited.current = [];
                  setQuestion(result.result.next_question?.id ?? null);
                  setView(result.result.next_question ? 'interview' : 'profile');
                  setDirty(false);
                }}
              />
            )}
            {cat && view === 'interview' && portrait && question && (
              <>
                <p className="cat-progress" role="status">
                  {t('progress', {
                    done: portrait.result.progress.base_resolved,
                    total: portrait.result.progress.base_relevant,
                    pending: portrait.result.progress.base_deferred,
                  })}
                </p>
                <p className="hint">
                  {t('followupCount', { count: Object.keys(portrait.followups).length })}
                </p>
                <CatQuestionForm
                  key={`${portrait.revision}:${question}`}
                  cat={cat}
                  portrait={portrait}
                  questionId={question}
                  {...callbacks}
                  onSaved={answered}
                />
              </>
            )}
            {cat && portrait && view === 'portrait' && (
              <>
                <Button variant="ghost" onClick={() => void navigate('profile')}>
                  {t('back')}
                </Button>
                <CatPortraitResult
                  portrait={portrait}
                  onEdit={cat.archivedAt ? undefined : editAnswer}
                />
              </>
            )}
            {cat && (view === 'profile-history' || view === 'portrait-history') && (
              <CatHistory
                key={view}
                catId={cat.id}
                kind={view === 'profile-history' ? 'profile' : 'portrait'}
                onClose={() => setView('profile')}
              />
            )}
            {cat && view === 'profile' && (
              <>
                <CatProfileOverview
                  cat={cat}
                  portrait={portrait}
                  onIdentity={() => void navigate('identity')}
                  onArea={(area) => void navigate(area)}
                  actions={
                    cat.archivedAt ? (
                      <section className="cat-portrait-callout">
                        <h2>{t('archived')}</h2>
                        <p>{t('archivedHelp')}</p>
                        <Button disabled={busy} onClick={() => void archive(true)}>
                          {t('restore')}
                        </Button>
                      </section>
                    ) : (
                      <div className="cat-portrait-actions">
                        <Button onClick={continuePortrait}>
                          {t(
                            !portrait
                              ? 'startPortrait'
                              : nextPortraitQuestion(portrait) && portrait.result.description
                                ? 'continuePortrait'
                                : 'viewPortrait',
                          )}
                        </Button>
                        {portrait && (
                          <Button variant="ghost" onClick={() => void navigate('period')}>
                            {t('newObservation')}
                          </Button>
                        )}
                      </div>
                    )
                  }
                />
                <details className="cat-profile-fold">
                  <summary>{t('areas.history')}</summary>
                  {cat.events.length ? (
                    cat.events.map((event) => (
                      <p key={event.id}>
                        <strong>{event.title}</strong> · {event.date}
                        <br />
                        {event.details}
                      </p>
                    ))
                  ) : (
                    <p className="hint">{t('notProvided')}</p>
                  )}
                  {!cat.archivedAt && (
                    <Button variant="outline" onClick={() => void navigate('history')}>
                      {t('addEvent')}
                    </Button>
                  )}
                </details>
                <details className="cat-profile-fold">
                  <summary>{t('history')}</summary>
                  <div className="cat-actions">
                    <Button variant="outline" onClick={() => void navigate('profile-history')}>
                      {t('catHistory')}
                    </Button>
                    {portrait && (
                      <Button variant="outline" onClick={() => void navigate('portrait-history')}>
                        {t('portraitHistory')}
                      </Button>
                    )}
                  </div>
                </details>
                {!cat.archivedAt && (
                  <div className="cat-profile-footer">
                    <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
                      {t('archive')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      {dialog}
      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!busy) setArchiveOpen(open);
        }}
      >
        <DialogContent>
          <DialogTitle>{t('archiveTitle')}</DialogTitle>
          <DialogDescription>
            {cat?.name}. {t('archiveHelp')}
          </DialogDescription>
          <div className="cat-actions">
            <Button variant="outline" disabled={busy} onClick={() => setArchiveOpen(false)}>
              {t('cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void archive()}>
              {t('archive')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
