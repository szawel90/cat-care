'use client';
import { useCatMessages } from './cat-messages';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { variationAxis, type CatRecord, type PortraitRecord } from '@cat-care/shared';
import { catError, catRequest } from '@/lib/cats-api';
import { useCats } from './cats-provider';
import { questionText, type PortraitCopy } from './cat-portrait-result';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Feedback } from './feedback';

type Callbacks = {
  onSaved: (portrait: PortraitRecord) => Promise<void>;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
};
export function CatObservationForm({
  cat,
  previous,
  onSaved,
  onCancel,
  onDirty,
  onBusy,
}: Callbacks & { cat: CatRecord; previous: PortraitRecord | null }) {
  const t = useTranslations('Cats'),
    context = useCats(),
    key = 'period:' + cat.id;
  const [{ today, earliest }] = useState(() => ({
    today: new Date().toISOString().slice(0, 10),
    earliest: new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10),
  }));
  const [dates, setDates] = useState(
    () =>
      (context.getDraft(key) as { start: string; end: string }) ?? { start: earliest, end: today },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ReturnType<typeof catError> | ''>('');
  useEffect(() => {
    onDirty(dates.start !== earliest || dates.end !== today);
    return () => onDirty(false);
  }, [dates, earliest, today, onDirty]);
  function update(value: typeof dates) {
    setDates(value);
    context.setDraft(key, value);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const portrait = await catRequest<PortraitRecord>(`/${cat.id}/portrait`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRevision: previous?.revision ?? 0,
          periodStart: dates.start,
          periodEnd: dates.end,
        }),
      });
      context.clearDraft(key);
      onDirty(false);
      await onSaved(portrait);
    } catch (failure) {
      setError(catError(failure));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className="cat-form" onSubmit={(event) => void submit(event)}>
      <h2>{t(previous ? 'newObservation' : 'startPortrait')}</h2>
      <p>{t('portraitIntro')}</p>
      {previous && <p>{t('newObservationHelp')}</p>}
      {error && <Feedback tone="error">{t(`errors.${error}`)}</Feedback>}
      <fieldset disabled={busy}>
        <legend>{t('period')}</legend>
        <div className="cat-date-fields">
          <div className="field">
            <Label htmlFor="period-start">{t('periodStart')}</Label>
            <Input
              id="period-start"
              type="date"
              value={dates.start}
              max={dates.end}
              required
              onChange={(event) => update({ ...dates, start: event.target.value })}
            />
          </div>
          <div className="field">
            <Label htmlFor="period-end">{t('periodEnd')}</Label>
            <Input
              id="period-end"
              type="date"
              value={dates.end}
              min={dates.start}
              max={today}
              required
              onChange={(event) => update({ ...dates, end: event.target.value })}
            />
          </div>
        </div>
        <p className="hint">{t('periodHelp')}</p>
        <div className="cat-actions">
          <Button type="submit">{busy ? t('saving') : t('start')}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </fieldset>
      <p className="hint">{t('portraitNote')}</p>
    </form>
  );
}

export function CatQuestionForm({
  cat,
  portrait,
  questionId,
  onSaved,
  onCancel,
  onDirty,
  onBusy,
}: Callbacks & { cat: CatRecord; portrait: PortraitRecord; questionId: string }) {
  const t = useTranslations('Cats'),
    context = useCats(),
    copy = useCatMessages().questionnaire as PortraitCopy;
  const initial =
    portrait.answers[questionId] ??
    portrait.followups[questionId] ??
    (questionId === 'Q02' ? [] : '');
  const key = `answer:${cat.id}:${portrait.assessmentId}:${questionId}`;
  const [draft, setDraft] = useState(
    () =>
      (context.getDraft(key) as { answer: string | string[]; revision: number }) ?? {
        answer: initial,
        revision: portrait.revision,
      },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ReturnType<typeof catError> | ''>('');
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft.answer);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }, [questionId]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  function select(answer: string | string[]) {
    const value = { ...draft, answer };
    setDraft(value);
    context.setDraft(key, value);
  }
  function toggle(value: string) {
    const exclusive = ['none', 'unknown', 'deferred'];
    if (exclusive.includes(value)) {
      select([value]);
      return;
    }
    let values = Array.isArray(draft.answer)
      ? draft.answer.filter((item) => !exclusive.includes(item))
      : [];
    if (values.includes(value)) values = values.filter((item) => item !== value);
    else {
      if (value === 'one_cat') values = values.filter((item) => item !== 'multiple_cats');
      if (value === 'multiple_cats') values = values.filter((item) => item !== 'one_cat');
      values.push(value);
    }
    select(values);
  }
  async function save(answer: string | string[]) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const result = await catRequest<PortraitRecord>(`/${cat.id}/portrait`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedRevision: draft.revision, questionId, answer }),
      });
      context.clearDraft(key);
      onDirty(false);
      await onSaved(result);
    } catch (failure) {
      setError(catError(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const household = portrait.householdSnapshot as CatRecord['household'];
  const options = Object.entries(copy.questions[questionId]!.options).filter(([id]) => {
    if (id === 'deferred') return false;
    if (
      questionId !== 'Q03' ||
      !Array.isArray(portrait.answers.Q02) ||
      portrait.answers.Q02.some((value) => ['unknown', 'deferred'].includes(value))
    )
      return true;
    const requires: Record<string, string[]> = {
      children: ['children'],
      cats: ['one_cat', 'multiple_cats'],
      dogs: ['dogs'],
      other_animals: ['other_animals'],
    };
    return !requires[id] || requires[id]!.some((value) => portrait.answers.Q02!.includes(value));
  });
  const variant = variationAxis(portrait.answers);
  const title = questionText(copy, questionId, {
    ...portrait,
    result: {
      ...portrait.result,
      context: { ...portrait.result.context, variation_axis: variant },
    },
  });
  return (
    <form
      className="cat-form cat-question"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft.answer);
      }}
    >
      <p className="cat-eyebrow">
        {questionId.startsWith('F_')
          ? t('clarification')
          : t('questionCount', { number: Number(questionId.slice(1)) })}
      </p>
      <h2 className="cat-question-title" ref={heading} tabIndex={-1} id="question-title">
        {title}
      </h2>
      <fieldset disabled={busy} aria-labelledby="question-title">
        <p id="question-help">{copy.questions[questionId]!.help}</p>
        <p className="hint">{t(questionId === 'Q02' ? 'summaryChoices' : 'autoAdvance')}</p>
        {error && <Feedback tone="error">{t(`errors.${error}`)}</Feedback>}
        {questionId === 'F_TARGET' ? (
          <div className="field">
            <Label htmlFor="target-name">{t('targetAlias')}</Label>
            <Input
              id="target-name"
              maxLength={60}
              value={
                typeof draft.answer === 'string' &&
                !draft.answer.startsWith('cat:') &&
                !['unknown', 'deferred'].includes(draft.answer)
                  ? draft.answer
                  : ''
              }
              onChange={(event) => select(event.target.value)}
            />
            {household.members
              .filter((member) => member.id !== cat.id)
              .map((member) => (
                <button
                  type="button"
                  className="cat-answer-option"
                  key={member.id}
                  onClick={() => void save('cat:' + member.id)}
                >
                  <span>{member.name}</span>
                </button>
              ))}
          </div>
        ) : (
          <div className="cat-answer-options" aria-describedby="question-help">
            {options.map(([id, label]) =>
              questionId !== 'Q02' ? (
                <button
                  key={id}
                  type="button"
                  className="cat-answer-option"
                  onClick={() => void save(id)}
                >
                  <span>{label}</span>
                </button>
              ) : (
                <label key={id} className="cat-answer-option">
                  <input
                    type={questionId === 'Q02' ? 'checkbox' : 'radio'}
                    name="answer"
                    value={id}
                    checked={
                      Array.isArray(draft.answer) ? draft.answer.includes(id) : draft.answer === id
                    }
                    onChange={() => (questionId === 'Q02' ? toggle(id) : select(id))}
                  />
                  <span>{label}</span>
                </label>
              ),
            )}
          </div>
        )}
        {(questionId === 'Q02' || questionId === 'F_TARGET') && (
          <div className="cat-actions">
            <Button type="submit" disabled={!draft.answer.length || draft.answer === 'deferred'}>
              {busy ? t('saving') : t('saveAndContinue')}
            </Button>
          </div>
        )}
        <div className="cat-question-footer">
          <Button type="button" variant="ghost" onClick={onCancel}>
            ← {t('back')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="cat-defer"
            onClick={() => void save(questionId === 'Q02' ? ['deferred'] : 'deferred')}
          >
            {t('defer')} →
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
