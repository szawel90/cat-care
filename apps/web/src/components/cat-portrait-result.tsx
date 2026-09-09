'use client';
import { useCatMessages } from './cat-messages';
import { useLocale, useTranslations } from 'next-intl';
import { type AxisId, type PortraitRecord } from '@cat-care/shared';
import { Button } from './ui/button';

export type PortraitCopy = {
  questions: Record<string, { text: string; help: string; options: Record<string, string> }>;
  axes: Record<AxisId, { label: string; low: string; high: string }>;
};
export function answerLabel(
  copy: PortraitCopy,
  id: string,
  answer: string | string[],
  portrait: PortraitRecord,
): string {
  const snapshot = portrait.householdSnapshot as { members?: Array<{ id: string; name: string }> };
  const label = (value: string) =>
    value.startsWith('cat:')
      ? (snapshot.members?.find((cat) => cat.id === value.slice(4))?.name ?? value.slice(4))
      : (copy.questions[id]?.options[value] ?? value);
  return (Array.isArray(answer) ? answer : [answer]).map(label).join(', ');
}
export function questionText(copy: PortraitCopy, id: string, portrait: PortraitRecord) {
  const target = portrait.followups.F_TARGET;
  const members =
    (portrait.householdSnapshot as { members?: Array<{ id: string; name: string }> }).members ?? [];
  const knownOther =
    portrait.answers.Q02?.includes('one_cat') && members.length === 2
      ? members.find((member) => member.id !== portrait.catId)?.name
      : null;
  const name =
    target && !['unknown', 'deferred'].includes(target)
      ? answerLabel(copy, 'F_TARGET', target, portrait)
      : (knownOther ?? copy.questions.Q02!.options.one_cat!);
  return copy.questions[id]!.text.replace('{other_cat}', name)
    .replace('{group}', copy.questions.Q03!.options[String(portrait.answers.Q03)] ?? '')
    .replace(
      '{axis}',
      portrait.result.context.variation_axis
        ? copy.axes[portrait.result.context.variation_axis].label
        : portrait.result.next_question?.axis
          ? copy.axes[portrait.result.next_question.axis].label
          : '',
    );
}

function useNarrative() {
  return useCatMessages().narrative as unknown as Record<string, unknown>;
}
function textAt(copy: Record<string, unknown>, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      copy,
    );
  return typeof value === 'string' ? value : '';
}
export function CatPortraitSummary({
  portrait,
  compact = false,
}: {
  portrait: PortraitRecord;
  compact?: boolean;
}) {
  const t = useTranslations('Cats'),
    copy = useNarrative();
  const description = portrait.result.description;
  if (!description) return <p>{t('legacyPortrait')}</p>;
  const traits = compact ? description.traits.slice(0, 3) : description.traits;
  return (
    <div className="cat-summary">
      <div className="cat-traits" role="group" aria-label={t('portrait')}>
        {traits.map((trait) => (
          <span
            className="cat-trait"
            key={trait.axis}
            data-trait={trait.axis}
            data-band={trait.band}
          >
            {textAt(copy, `traits.${trait.axis}.${trait.band}.name`)}
            {trait.preliminary && <span> · {t('traitPreliminary')}</span>}
          </span>
        ))}
      </div>
      <p>{description.sentenceKeys.map((key) => textAt(copy, key)).join(' ')}</p>
      {(portrait.result.next_question || portrait.result.pending.length > 0) && (
        <p className="hint">{t('portraitPartial')}</p>
      )}
    </div>
  );
}
export function CatPortraitResult({
  portrait,
  onEdit,
}: {
  portrait: PortraitRecord;
  onEdit?: (id: string) => void;
}) {
  const t = useTranslations('Cats'),
    locale = useLocale(),
    messages = useCatMessages();
  const current = Boolean(portrait.result.description);
  const copy = (current ? messages.questionnaire : messages.legacyQuestionnaire) as PortraitCopy;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(value),
    );
  return (
    <section className="cat-portrait-result">
      <h2>{t('portrait')}</h2>
      <p className="hint">
        {date(portrait.periodStart)} – {date(portrait.periodEnd)}
      </p>
      {portrait.contextChangedAt && <p className="feedback">{t('contextChanged')}</p>}
      <CatPortraitSummary portrait={portrait} />
      {portrait.prefilledQuestions.includes('Q02') && (
        <div className="cat-prefill">
          <p>{t('prefilled')}</p>
          {onEdit && current && (
            <Button variant="outline" onClick={() => onEdit('Q02')}>
              {t('reviewHome')}
            </Button>
          )}
        </div>
      )}
      {portrait.result.progress.relationship_scope_unresolved && (
        <p className="hint">{t('scopeUnresolved')}</p>
      )}
      {portrait.result.pending.length > 0 && (
        <section className="cat-pending">
          <h3>{t('pending')}</h3>
          <p>{t('pendingHelp')}</p>
          {portrait.result.pending.map((item) => (
            <div key={item.id}>
              <span>{questionText(copy, item.id, portrait)}</span>
              {onEdit && current && (
                <Button variant="outline" onClick={() => onEdit(item.id)}>
                  {t('changeAnswer')}
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      <details className="cat-answer-review">
        <summary>{t('answers')}</summary>
        {Object.entries({ ...portrait.answers, ...portrait.followups }).map(([id, answer]) => (
          <div key={id}>
            <p>
              {questionText(copy, id, portrait)}
              <br />
              <strong>{answerLabel(copy, id, answer, portrait)}</strong>
            </p>
            {onEdit && current && (
              <Button variant="outline" onClick={() => onEdit(id)}>
                {t('changeAnswer')}
              </Button>
            )}
          </div>
        ))}
      </details>
      <p className="hint">{t('portraitNote')}</p>
    </section>
  );
}
