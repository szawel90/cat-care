'use client';
import { useCatMessages } from './cat-messages';
import { useLocale, useTranslations } from 'next-intl';
import { axisIds, type AxisId, type AxisResult, type PortraitRecord } from '@cat-care/shared';
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
const intersections: [AxisId, AxisId][] = [
  ['activity', 'human_contact'],
  ['exploration', 'caution'],
  ['cat_affiliation', 'cat_distancing'],
  ['height', 'openness'],
];
function interval(axis: AxisResult): [number, number] | null {
  return axis.range ?? (axis.point !== null ? [axis.point, axis.point] : null);
}
export function PortraitIntersection({
  x,
  y,
  copy,
}: {
  x: AxisResult;
  y: AxisResult;
  copy: { x: PortraitCopy['axes'][AxisId]; y: PortraitCopy['axes'][AxisId] };
}) {
  const t = useTranslations('Cats'),
    locale = useLocale();
  const xs = interval(x),
    ys = interval(y);
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const position = (axis: AxisResult) =>
    axis.range
      ? t('range', { low: number(axis.range[0]), high: number(axis.range[1]) })
      : axis.point !== null
        ? t('point', { value: number(axis.point) })
        : t('unknown');
  const title = `${copy.x.label} × ${copy.y.label}`;
  return (
    <figure className="cat-intersection">
      <figcaption>
        <h3>{title}</h3>
      </figcaption>
      <div className="cat-map-y">{copy.y.high}</div>
      <svg
        viewBox="0 0 280 220"
        role="img"
        aria-label={`${title}. ${copy.x.label}: ${position(x)}. ${copy.y.label}: ${position(y)}`}
      >
        {[0, 1, 2, 3, 4].map((n) => (
          <g key={n}>
            <path
              className="cat-map-grid"
              d={`M ${30 + n * 55} 10 V 190 M 30 ${190 - n * 45} H 250`}
            />
            <text x={30 + n * 55} y="210" textAnchor="middle">
              {n}
            </text>
            <text x="16" y={194 - n * 45} textAnchor="middle">
              {n}
            </text>
          </g>
        ))}
        {xs &&
          ys &&
          (xs[0] === xs[1] && ys[0] === ys[1] ? (
            <circle className="cat-map-mark" cx={30 + xs[0] * 55} cy={190 - ys[0] * 45} r="6" />
          ) : xs[0] === xs[1] || ys[0] === ys[1] ? (
            <line
              className="cat-map-mark"
              x1={30 + xs[0] * 55}
              x2={30 + xs[1] * 55}
              y1={190 - ys[0] * 45}
              y2={190 - ys[1] * 45}
            />
          ) : (
            <rect
              className="cat-map-area"
              x={30 + xs[0] * 55}
              y={190 - ys[1] * 45}
              width={(xs[1] - xs[0]) * 55}
              height={(ys[1] - ys[0]) * 45}
            />
          ))}
      </svg>
      <div className="cat-map-y">{copy.y.low}</div>
      <div className="cat-scale-labels">
        <span>{copy.x.low}</span>
        <span>{copy.x.high}</span>
      </div>
      {(!xs || !ys) && <p className="hint">{t('mapEmpty')}</p>}
    </figure>
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
    copy = useCatMessages().questionnaire as PortraitCopy;
  const relationNotes = useCatMessages().relationshipNotes as Record<string, string>;
  const statuses = useCatMessages().statuses as Record<string, string>,
    reasons = useCatMessages().reasons as Record<string, string>;
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return (
    <section className="cat-portrait-result" aria-label={t('portrait')}>
      <h2>{t('portrait')}</h2>
      <p className="cat-status">{t(`statuses.${portrait.result.profile_status}`)}</p>
      <p>
        {t('period')}:{' '}
        {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(portrait.periodStart),
        )}{' '}
        –{' '}
        {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(portrait.periodEnd),
        )}
      </p>
      {portrait.contextChangedAt && <p className="feedback">{t('contextChanged')}</p>}
      <p className="hint">{t(portrait.answers.Q01 === 'usual' ? 'usualBasis' : 'snapshotBasis')}</p>
      {portrait.result.progress.relationship_scope_unresolved && (
        <p className="hint">{t('scopeUnresolved')}</p>
      )}
      {portrait.result.relationship_note && (
        <p>{relationNotes[portrait.result.relationship_note]}</p>
      )}
      {portrait.result.headline && (
        <p className="cat-headline">{t(`headlines.${portrait.result.headline}`)}</p>
      )}
      {portrait.result.pending.length > 0 && (
        <section className="cat-pending">
          <h3>{t('pending')}</h3>
          <p>{t('pendingHelp')}</p>
          {portrait.result.pending.map((item) => (
            <div key={item.id}>
              <span>{questionText(copy, item.id, portrait)}</span>
              {onEdit && (
                <Button variant="outline" onClick={() => onEdit(item.id)}>
                  {t('changeAnswer')}
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      <h3>{t('scales')}</h3>
      <div className="cat-scales">
        {axisIds.map((id) => {
          const axis = portrait.result.axes[id],
            span = interval(axis),
            labels = copy.axes[id];
          return (
            <section className="cat-scale-card" key={id}>
              <h4>{labels.label}</h4>
              <p>{statuses[axis.status]}</p>
              <div className="cat-scale-track" aria-hidden="true">
                {span && (
                  <span
                    style={{ left: `${span[0] * 25}%`, width: `${(span[1] - span[0]) * 25}%` }}
                    className={span[0] === span[1] ? 'cat-scale-point' : 'cat-scale-range'}
                  />
                )}
              </div>
              <div className="cat-scale-labels">
                <span>{labels.low}</span>
                <span>{labels.high}</span>
              </div>
              <p>
                {axis.range
                  ? t('range', { low: number(axis.range[0]), high: number(axis.range[1]) })
                  : axis.point !== null
                    ? t('point', { value: number(axis.point) })
                    : t('unknown')}
              </p>
              {axis.reasons.map((reason) => (
                <p className="hint" key={reason}>
                  {reasons[reason]}
                </p>
              ))}
              <details>
                <summary>
                  {t('sourceAnswers', {
                    questions: axis.items.map((item) => item.question).join(', '),
                  })}
                </summary>
                {axis.items.map((item) => (
                  <p key={item.question}>
                    {questionText(copy, item.question, portrait)}
                    <br />
                    <strong>
                      {item.answer
                        ? answerLabel(copy, item.question, item.answer, portrait)
                        : t('notProvided')}
                    </strong>
                  </p>
                ))}
              </details>
            </section>
          );
        })}
      </div>
      <h3>{t('maps')}</h3>
      <p className="hint">{t('mapHelp')}</p>
      <div className="cat-map-grid-wrap">
        {intersections.map(([x, y]) => (
          <PortraitIntersection
            key={x}
            x={portrait.result.axes[x]}
            y={portrait.result.axes[y]}
            copy={{ x: copy.axes[x], y: copy.axes[y] }}
          />
        ))}
      </div>
      <details className="cat-answer-review">
        <summary>{t('answers')}</summary>
        {Object.entries({ ...portrait.answers, ...portrait.followups }).map(([id, answer]) => (
          <div key={id}>
            <p>
              {questionText(copy, id, portrait)}
              <br />
              <strong>{answerLabel(copy, id, answer, portrait)}</strong>
            </p>
            {onEdit && (
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
