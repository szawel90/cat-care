'use client';
import { useCatMessages } from './cat-messages';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, startTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  profileAreas,
  profileFields,
  type CatRecord,
  type PortraitRecord,
  type ProfileArea,
} from '@cat-care/shared';
import { catError, catRequest } from '@/lib/cats-api';
import { useCats } from './cats-provider';
import { HomeHeader } from './home-header';
import { CatAvatar } from './cat-picker';
import { CatAreaForm, CatHouseholdForm, CatIdentityForm } from './cat-profile-forms';
import { CatObservationForm, CatQuestionForm } from './cat-interview';
import { CatPortraitResult } from './cat-portrait-result';
import { CatHistory } from './cat-history';
import { useUnsavedChangesDialog } from './unsaved-changes-dialog';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Feedback } from './feedback';

type View =
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
    heading.current?.focus();
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
    if (question && Object.hasOwn({ ...portrait?.answers, ...portrait?.followups }, question)) {
      setView('profile');
      setQuestion(null);
    } else {
      setQuestion(result.result.next_question?.id ?? null);
      setView(result.result.next_question ? 'interview' : 'profile');
    }
  }
  function editAnswer(id: string) {
    setQuestion(id);
    setView('interview');
    setNotice(false);
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
  const otherNames =
    cat?.household.members.filter((member) => member.id !== cat.id).map((member) => member.name) ??
    [];
  const fields = useCatMessages().fields as Record<string, string>,
    options = useCatMessages().options as Record<string, string>;
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
            <h1 className={view === 'profile' && cat ? 'sr-only' : ''} ref={heading} tabIndex={-1}>
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
            {notice && <Feedback>{t('saved')}</Feedback>}
            {view === 'identity' && (catId === 'new' || cat) && (
              <CatIdentityForm key={catId} cat={cat ?? undefined} {...callbacks} />
            )}
            {cat && view === 'home-link' && <CatHouseholdForm cat={cat} {...callbacks} />}
            {cat && profileAreas.includes(view as ProfileArea) && (
              <CatAreaForm key={view} cat={cat} area={view as ProfileArea} {...callbacks} />
            )}
            {cat && view === 'period' && (
              <CatObservationForm
                cat={cat}
                previous={portrait}
                {...callbacks}
                onSaved={async (result) => {
                  await context.refresh();
                  setPortrait(result);
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
                <section className="cat-profile-heading">
                  <div className="cat-identity">
                    <CatAvatar cat={cat} large />
                    <div>
                      <p className="cat-eyebrow">cat care</p>
                      <h2>{cat.name}</h2>
                      {!cat.archivedAt && (
                        <Button variant="outline" onClick={() => void navigate('identity')}>
                          {t('editIdentity')}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="cat-summary">
                    <p>
                      {portrait?.result.headline
                        ? t('summaryPortrait', {
                            headline: t(`headlines.${portrait.result.headline}`),
                          })
                        : t('summaryEmpty', { name: cat.name })}
                    </p>
                    {cat.attributes.age && <p>{t('summaryAge', { age: cat.attributes.age })}</p>}
                    {cat.attributes.games && (
                      <p>{t('summaryGames', { games: cat.attributes.games })}</p>
                    )}
                    {portrait && portrait.result.profile_status !== 'preliminary_portrait' && (
                      <p className="hint">{t('summaryPartial')}</p>
                    )}
                  </div>
                </section>
                {cat.archivedAt ? (
                  <section className="cat-portrait-callout">
                    <h2>{t('archived')}</h2>
                    <p>{t('archivedHelp')}</p>
                    <Button disabled={busy} onClick={() => void archive(true)}>
                      {t('restore')}
                    </Button>
                  </section>
                ) : (
                  <section className="cat-portrait-callout">
                    <div>
                      <h2>{t('portrait')}</h2>
                      <p>{t(`statuses.${cat.portraitStatus}`)}</p>
                    </div>
                    <div className="cat-actions">
                      <Button
                        onClick={() => {
                          if (!portrait) setView('period');
                          else if (portrait.result.next_question) {
                            setQuestion(portrait.result.next_question.id);
                            setView('interview');
                          } else
                            document
                              .getElementById('portrait-results')
                              ?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        {t(
                          !portrait
                            ? 'startPortrait'
                            : portrait.result.next_question
                              ? 'continuePortrait'
                              : 'scales',
                        )}
                      </Button>
                      {portrait && (
                        <Button variant="outline" onClick={() => setView('period')}>
                          {t('newObservation')}
                        </Button>
                      )}
                    </div>
                  </section>
                )}
                <div className="cat-household-note">
                  <p>
                    {otherNames.length
                      ? t('sharedWith', { names: otherNames.join(', ') })
                      : t('ownHome')}
                  </p>
                  {!cat.archivedAt && (
                    <Button variant="ghost" onClick={() => setView('home-link')}>
                      {t('changeHome')}
                    </Button>
                  )}
                </div>
                <div className="cat-area-grid">
                  {profileAreas.map((area) => (
                    <section className="cat-area" key={area}>
                      <div className="cat-area-title">
                        <h3>{t(`areas.${area}`)}</h3>
                        {!cat.archivedAt && (
                          <Button
                            variant="ghost"
                            aria-label={`${t('edit')}: ${t(`areas.${area}`)}`}
                            onClick={() => setView(area)}
                          >
                            {t('edit')}
                          </Button>
                        )}
                      </div>
                      <dl className="cat-data">
                        {area === 'household' &&
                          Object.entries(cat.household.facts).map(([key, value]) => (
                            <div key={key}>
                              <dt>{fields[key]}</dt>
                              <dd>{options[value]}</dd>
                            </div>
                          ))}
                        {profileFields[area].map((key) => {
                          const value =
                            area === 'home' && key !== 'access'
                              ? cat.household.environment[key]
                              : cat.attributes[key];
                          return value ? (
                            <div key={key}>
                              <dt>{fields[key]}</dt>
                              <dd>
                                {['sex', 'neutered'].includes(key)
                                  ? (options[value] ?? value)
                                  : value}
                              </dd>
                            </div>
                          ) : null;
                        })}
                      </dl>
                      {area === 'history' ? (
                        cat.events.length ? (
                          cat.events.map((event) => (
                            <p key={event.id}>
                              <strong>{event.title}</strong> · {event.date}
                              <br />
                              {event.details}
                            </p>
                          ))
                        ) : (
                          <p className="hint">{t('notProvided')}</p>
                        )
                      ) : (
                        area !== 'household' &&
                        !profileFields[area].some(
                          (key) =>
                            (area === 'home' && key !== 'access'
                              ? cat.household.environment
                              : cat.attributes)[key],
                        ) && <p className="hint">{t('notProvided')}</p>
                      )}
                    </section>
                  ))}
                </div>
                {portrait && (
                  <div id="portrait-results">
                    {portrait.prefilledQuestions.includes('Q02') && (
                      <div className="cat-prefill">
                        <p>{t('prefilledTitle')}</p>
                        <p className="hint">{t('prefilled')}</p>
                        {!cat.archivedAt && (
                          <Button variant="outline" onClick={() => editAnswer('Q02')}>
                            {t('reviewHome')}
                          </Button>
                        )}
                      </div>
                    )}
                    <CatPortraitResult
                      portrait={portrait}
                      onEdit={cat.archivedAt ? undefined : editAnswer}
                    />
                  </div>
                )}
                <div className="cat-actions cat-profile-footer">
                  <Button variant="outline" onClick={() => setView('profile-history')}>
                    {t('history')}
                  </Button>
                  {portrait && (
                    <Button variant="outline" onClick={() => setView('portrait-history')}>
                      {t('portraitHistory')}
                    </Button>
                  )}
                  {!cat.archivedAt && (
                    <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
                      {t('archive')}
                    </Button>
                  )}
                </div>
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
