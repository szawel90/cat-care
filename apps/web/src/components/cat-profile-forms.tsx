'use client';
import { useCatMessages } from './cat-messages';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  profileFields,
  type CatAttributes,
  type CatEvent,
  type CatRecord,
  type HouseholdFacts,
  type ProfileArea,
  type ProfileField,
} from '@cat-care/shared';
import { catError, catRequest, prepareCatPhoto } from '@/lib/cats-api';
import { useCats } from './cats-provider';
import { CatAvatar } from './cat-picker';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Feedback } from './feedback';

type FormCallbacks = {
  onSaved: (cat: CatRecord) => Promise<void>;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
};
function useDraft<T>(key: string, initial: T) {
  const context = useCats();
  const [value, setValue] = useState<T>(() => (context.getDraft(key) as T) ?? initial);
  const update = (next: T) => {
    setValue(next);
    context.setDraft(key, next);
  };
  return {
    value,
    update,
    clear: () => context.clearDraft(key),
    dirty: JSON.stringify(value) !== JSON.stringify(initial),
  };
}
function useDirty(dirty: boolean, report: (dirty: boolean) => void) {
  useEffect(() => {
    report(dirty);
    return () => report(false);
  }, [dirty, report]);
}

export function CatIdentityForm({
  cat,
  onSaved,
  onCancel,
  onDirty,
  onBusy,
}: FormCallbacks & { cat?: CatRecord }) {
  const t = useTranslations('Cats');
  const context = useCats();
  const draft = useDraft('identity:' + (cat?.id ?? 'new'), {
    name: cat?.name ?? '',
    photo: undefined as string | null | undefined,
    home: '',
    version: cat?.version ?? 0,
  });
  const [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState<ReturnType<typeof catError> | ''>('');
  useDirty(draft.dirty || photoBusy, onDirty);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const body = {
        name: draft.value.name.trim(),
        ...(draft.value.photo !== undefined ? { photoDataUrl: draft.value.photo } : {}),
        ...(cat
          ? { expectedVersion: draft.value.version }
          : draft.value.home
            ? { livesWithCatId: draft.value.home }
            : {}),
      };
      const result = await catRequest<CatRecord>(cat ? '/' + cat.id : '', {
        method: cat ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      draft.clear();
      onDirty(false);
      await onSaved(result);
    } catch (failure) {
      setError(catError(failure));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className="cat-form" onSubmit={(event) => void submit(event)}>
      <p>{t('nameOnly')}</p>
      {error && <Feedback tone="error">{t(`errors.${error}`)}</Feedback>}
      <fieldset disabled={busy || photoBusy}>
        <div className="field">
          <Label htmlFor="cat-name">{t('name')}</Label>
          <Input
            id="cat-name"
            required
            maxLength={60}
            autoComplete="off"
            value={draft.value.name}
            onChange={(event) => draft.update({ ...draft.value, name: event.target.value })}
          />
        </div>
        <div className="cat-photo-field">
          <CatAvatar cat={cat} large preview={draft.value.photo} />
          <div className="field">
            <Label htmlFor="cat-photo">{t('photo')}</Label>
            <Input
              id="cat-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-describedby="cat-photo-help"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setPhotoBusy(true);
                onBusy(true);
                setError('');
                void prepareCatPhoto(file)
                  .then((photo) => draft.update({ ...draft.value, photo }))
                  .catch(() => setError('photo'))
                  .finally(() => {
                    setPhotoBusy(false);
                    onBusy(false);
                  });
              }}
            />
            <p id="cat-photo-help" className="hint">
              {t('photoHelp')}
            </p>
            {(draft.value.photo || (cat?.hasPhoto && draft.value.photo !== null)) && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => draft.update({ ...draft.value, photo: null })}
              >
                {t('removePhoto')}
              </Button>
            )}
          </div>
        </div>
        {!cat && context.cats.length > 0 && (
          <div className="field">
            <Label htmlFor="cat-home">{t('homeChoice')}</Label>
            <select
              id="cat-home"
              className="cat-select"
              value={draft.value.home}
              onChange={(event) => draft.update({ ...draft.value, home: event.target.value })}
            >
              <option value="">{t('separateHome')}</option>
              {context.cats.map((other) => (
                <option key={other.id} value={other.id}>
                  {t('livesWith', { name: other.name })}
                </option>
              ))}
            </select>
            <p className="hint">{t('shareHelp')}</p>
          </div>
        )}
        <div className="cat-actions">
          <Button type="submit">{busy ? t('saving') : cat ? t('save') : t('saveCat')}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

export function CatAreaForm({
  cat,
  area,
  onSaved,
  onCancel,
  onDirty,
  onBusy,
}: FormCallbacks & { cat: CatRecord; area: ProfileArea }) {
  const t = useTranslations('Cats');
  const draft = useDraft(`area:${cat.id}:${area}`, {
    attributes: cat.attributes,
    environment: cat.household.environment,
    facts: cat.household.facts,
    events: cat.events,
    version: cat.version,
    homeVersion: cat.household.version,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ReturnType<typeof catError> | ''>('');
  useDirty(draft.dirty, onDirty);
  const labels = useCatMessages().fields as Record<string, string>;
  const optionLabels = useCatMessages().options as Record<string, string>;
  function field(key: ProfileField) {
    const shared = area === 'home' && key !== 'access';
    const values = shared ? draft.value.environment : draft.value.attributes;
    const value = values[key] ?? '';
    const set = (value: string) =>
      draft.update({
        ...draft.value,
        [shared ? 'environment' : 'attributes']: { ...values, [key]: value },
      });
    const choices =
      key === 'sex'
        ? ['female', 'male', 'unknown']
        : key === 'neutered'
          ? ['yes', 'no', 'unknown']
          : null;
    return (
      <div className="field" key={key}>
        <Label htmlFor={'cat-field-' + key}>{labels[key]}</Label>
        {choices ? (
          <select
            className="cat-select"
            id={'cat-field-' + key}
            value={value}
            onChange={(event) => set(event.target.value)}
          >
            <option value="">{t('unknown')}</option>
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {optionLabels[choice]}
              </option>
            ))}
          </select>
        ) : (
          <textarea
            className="cat-textarea"
            id={'cat-field-' + key}
            rows={key === 'age' || key === 'homeSince' ? 1 : 3}
            maxLength={1500}
            value={value}
            onChange={(event) => set(event.target.value)}
          />
        )}
      </div>
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const keys = profileFields[area].filter((key) => area !== 'home' || key === 'access');
      const attributes: CatAttributes = Object.fromEntries(
        keys.map((key) => [key, draft.value.attributes[key] ?? '']),
      );
      const body = {
        expectedVersion: draft.value.version,
        attributes,
        ...(area === 'home'
          ? {
              household: {
                expectedVersion: draft.value.homeVersion,
                environment: draft.value.environment,
              },
            }
          : {}),
        ...(area === 'household'
          ? { household: { expectedVersion: draft.value.homeVersion, facts: draft.value.facts } }
          : {}),
        ...(area === 'history' ? { events: draft.value.events } : {}),
      };
      const result = await catRequest<CatRecord>('/' + cat.id, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      draft.clear();
      onDirty(false);
      await onSaved(result);
    } catch (failure) {
      setError(catError(failure));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  function editEvent(index: number, update: Partial<CatEvent>) {
    draft.update({
      ...draft.value,
      events: draft.value.events.map((event, position) =>
        position === index ? { ...event, ...update } : event,
      ),
    });
  }
  return (
    <form className="cat-form" onSubmit={(event) => void submit(event)}>
      <p>{t('optional')}</p>
      <p className="hint">
        {area === 'home' || area === 'household' ? t('sharedHelp') : t('individualHelp')}
      </p>
      {error && <Feedback tone="error">{t(`errors.${error}`)}</Feedback>}
      <fieldset disabled={busy}>
        {area === 'household' &&
          (['children', 'dogs', 'other_animals', 'totalCats'] as const).map((key) => (
            <div className="field" key={key}>
              <Label htmlFor={'home-' + key}>{labels[key]}</Label>
              <select
                className="cat-select"
                id={'home-' + key}
                value={draft.value.facts[key]}
                onChange={(event) =>
                  draft.update({
                    ...draft.value,
                    facts: { ...draft.value.facts, [key]: event.target.value } as HouseholdFacts,
                  })
                }
              >
                {(key === 'totalCats'
                  ? ['unknown', 'one', 'two', 'three_or_more']
                  : ['unknown', 'yes', 'no']
                ).map((option) => (
                  <option value={option} key={option}>
                    {optionLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        {profileFields[area].map(field)}
        {area === 'history' && (
          <>
            {draft.value.events.map((event, index) => (
              <section className="cat-event-form" key={event.id}>
                <div className="field">
                  <Label htmlFor={`event-title-${event.id}`}>{t('eventTitle')}</Label>
                  <Input
                    id={`event-title-${event.id}`}
                    required
                    maxLength={200}
                    value={event.title}
                    onChange={(input) => editEvent(index, { title: input.target.value })}
                  />
                </div>
                <div className="field">
                  <Label htmlFor={`event-date-${event.id}`}>{t('eventDate')}</Label>
                  <Input
                    id={`event-date-${event.id}`}
                    maxLength={80}
                    value={event.date}
                    onChange={(input) => editEvent(index, { date: input.target.value })}
                  />
                </div>
                <div className="field">
                  <Label htmlFor={`event-details-${event.id}`}>{t('eventDetails')}</Label>
                  <textarea
                    className="cat-textarea"
                    id={`event-details-${event.id}`}
                    rows={3}
                    maxLength={1500}
                    value={event.details}
                    onChange={(input) => editEvent(index, { details: input.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    draft.update({
                      ...draft.value,
                      events: draft.value.events.filter((item) => item.id !== event.id),
                    })
                  }
                >
                  {t('removeEvent')}
                </Button>
              </section>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={draft.value.events.length >= 100}
              onClick={() =>
                draft.update({
                  ...draft.value,
                  events: [
                    ...draft.value.events,
                    { id: crypto.randomUUID(), date: '', title: '', details: '' },
                  ],
                })
              }
            >
              {t('addEvent')}
            </Button>
          </>
        )}
        <p className="hint">{t('historyHelp')}</p>
        <div className="cat-actions">
          <Button type="submit">{busy ? t('saving') : t('save')}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

export function CatHouseholdForm({
  cat,
  onSaved,
  onCancel,
  onDirty,
  onBusy,
}: FormCallbacks & { cat: CatRecord }) {
  const t = useTranslations('Cats'),
    context = useCats();
  const draft = useDraft('home-link:' + cat.id, { home: '', version: cat.version });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ReturnType<typeof catError> | ''>('');
  useDirty(draft.dirty, onDirty);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const result = await catRequest<CatRecord>(`/${cat.id}/household`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: draft.value.version,
          livesWithCatId: draft.value.home || null,
        }),
      });
      draft.clear();
      onDirty(false);
      await onSaved(result);
    } catch (failure) {
      setError(catError(failure));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className="cat-form" onSubmit={(event) => void submit(event)}>
      <p>{t('shareHelp')}</p>
      {error && <Feedback tone="error">{t(`errors.${error}`)}</Feedback>}
      <fieldset disabled={busy}>
        <div className="field">
          <Label htmlFor="new-cat-home">{t('homeChoice')}</Label>
          <select
            className="cat-select"
            id="new-cat-home"
            value={draft.value.home}
            onChange={(event) => draft.update({ ...draft.value, home: event.target.value })}
          >
            <option value="">{t('separateHome')}</option>
            {context.cats
              .filter((other) => other.id !== cat.id)
              .map((other) => (
                <option key={other.id} value={other.id}>
                  {t('livesWith', { name: other.name })}
                </option>
              ))}
          </select>
        </div>
        <p className="hint">{t('historyHelp')}</p>
        <div className="cat-actions">
          <Button type="submit">{busy ? t('saving') : t('save')}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
