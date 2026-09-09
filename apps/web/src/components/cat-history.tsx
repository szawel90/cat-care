'use client';
import { useCatMessages } from './cat-messages';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import {
  groupPortraitCycles,
  type PortraitCycleRevision,
  type CatAttributes,
  type CatEvent,
  type HouseholdRecord,
  type PortraitRecord,
} from '@cat-care/shared';
import { catRequest } from '@/lib/cats-api';
import { CatPortraitResult } from './cat-portrait-result';
import { Button } from './ui/button';

type Version = {
  version: number;
  recordedAt: string;
  supersededAt: string | null;
  isCurrent: boolean;
  changeKind: string;
};
type ProfileHistory = {
  cats: Array<
    Version & {
      name: string;
      hasPhoto: boolean;
      archived: boolean;
      attributes: CatAttributes;
      events: CatEvent[];
    }
  >;
  homes: Array<Version & HouseholdRecord>;
};
type Observation = PortraitCycleRevision;
export function CatHistory({
  catId,
  kind,
  onClose,
}: {
  catId: string;
  kind: 'profile' | 'portrait';
  onClose: () => void;
}) {
  const t = useTranslations('Cats'),
    locale = useLocale();
  const [profile, setProfile] = useState<ProfileHistory | null>(null),
    [observations, setObservations] = useState<Observation[] | null>(null),
    [selected, setSelected] = useState<PortraitRecord | null>(null),
    [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const request =
      kind === 'profile'
        ? catRequest<ProfileHistory>(`/${catId}/history`).then((value) => {
            if (active) setProfile(value);
          })
        : catRequest<Observation[]>(`/${catId}/portrait/revisions`).then((value) => {
            if (active) setObservations(value);
          });
    void request.catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [catId, kind, attempt]);
  const stamp = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  const changes = useCatMessages().changes as Record<string, string>;
  const statusLabels = useCatMessages().statuses as Record<string, string>;
  const fields = useCatMessages().fields as Record<string, string>,
    options = useCatMessages().options as Record<string, string>;
  const choices = useCatMessages().choiceLabels as Record<string, string>;
  const entries = (data: object) =>
    Object.entries(data)
      .filter(([, value]) => value)
      .map(([key, value]) => (
        <div key={key}>
          <dt>{fields[key]}</dt>
          <dd>
            {['sex', 'neutered', 'children', 'dogs', 'other_animals', 'totalCats'].includes(key)
              ? (options[String(value)] ?? String(value))
              : (Array.isArray(value) ? value : [value])
                  .map((item) => choices[String(item)] ?? options[String(item)] ?? String(item))
                  .join(', ')}
          </dd>
        </div>
      ));
  const versionLabel = (row: Version) => (
    <>
      <strong>{t('version', { number: row.version })}</strong> ·{' '}
      {t('recorded', { date: stamp(row.recordedAt) })}
      <p className="hint">
        {changes[row.changeKind]} ·{' '}
        {row.isCurrent ? t('currentVersion') : t('superseded', { date: stamp(row.supersededAt!) })}
      </p>
    </>
  );
  return (
    <section className="cat-history">
      <Button variant="outline" onClick={onClose}>
        {t('closeHistory')}
      </Button>
      <h2>{t(kind === 'profile' ? 'history' : 'portraitHistory')}</h2>
      <p>{t('historyHelp')}</p>
      {error && (
        <div role="alert">
          <p>{t('errors.load')}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError(false);
              setAttempt((value) => value + 1);
            }}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      {!profile && !observations && !error && <p role="status">{t('loading')}</p>}
      {profile && (
        <>
          <h3>{t('catHistory')}</h3>
          {profile.cats.map((row) => (
            <details key={row.version}>
              <summary>{versionLabel(row)}</summary>
              <h4>{row.name}</h4>
              {row.archived && <p>{t('archived')}</p>}
              {row.hasPhoto && (
                <Image
                  unoptimized
                  src={`/api/cats/${catId}/photo?version=${row.version}`}
                  alt=""
                  width={100}
                  height={100}
                  className="cat-history-photo"
                />
              )}
              <dl className="cat-data">{entries(row.attributes)}</dl>
              {row.events.map((event) => (
                <p key={event.id}>
                  <strong>{event.title}</strong> · {event.date}
                  <br />
                  {event.details}
                </p>
              ))}
            </details>
          ))}
          <h3>{t('homeHistory')}</h3>
          {profile.homes.map((row, index) => (
            <details key={index}>
              <summary>{versionLabel(row)}</summary>
              <p>{row.members.map((cat) => cat.name).join(', ')}</p>
              <dl className="cat-data">
                {entries(row.facts)}
                {entries(row.environment)}
              </dl>
            </details>
          ))}
        </>
      )}
      {observations && (
        <>
          <div className="cat-revisions">
            {groupPortraitCycles(observations).map((cycle) => {
              const row = cycle.latest;
              return (
                <Button
                  key={row.revision}
                  variant={selected?.revision === row.revision ? 'default' : 'outline'}
                  onClick={() => {
                    void catRequest<PortraitRecord>(`/${catId}/portrait/revisions/${row.revision}`)
                      .then(setSelected)
                      .catch(() => setError(true));
                  }}
                >
                  <span>
                    <strong>{t('cycle', { number: cycle.number })}</strong>
                    <br />
                    {t('cycleStarted', { date: stamp(cycle.startedAt) })} ·{' '}
                    {t('cycleUpdated', { date: stamp(cycle.updatedAt) })}
                    {row.profileStatus && (
                      <span className="hint"> · {statusLabels[row.profileStatus]}</span>
                    )}
                  </span>
                </Button>
              );
            })}
          </div>
          {selected && (
            <>
              <p>
                {selected.isCurrent
                  ? t('currentVersion')
                  : t('superseded', { date: stamp(selected.supersededAt!) })}
              </p>
              <CatPortraitResult portrait={selected} />
            </>
          )}
        </>
      )}
    </section>
  );
}
