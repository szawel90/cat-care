import { portraitAxes, portraitQuestions, portraitFollowups } from './portrait-catalog-v1';

export const portraitVersion = 'cat-portrait-draft-1';
export type PortraitAnswers = Record<string, string | string[]>;
export type PortraitFollowups = Record<string, string>;
export type AxisId = keyof typeof portraitAxes;
export const axisIds = Object.keys(portraitAxes) as AxisId[];
const socialGroups = new Set(['children', 'cats', 'dogs', 'other_animals', 'adults', 'several']);
const contextEffects: Record<string, AxisId[]> = {
  play_more: ['activity'],
  contact_more: ['human_contact'],
  withdraw: ['caution', 'height', 'openness'],
  space: ['height', 'openness'],
  food: ['food_inspection'],
  several: axisIds,
  unknown: axisIds,
};

export interface AxisResult {
  point: number | null;
  range: [number, number] | null;
  status: string;
  items: Array<{ question: string; answer: string | string[] | undefined; value: number | null }>;
  numeric_answers: number;
  expected_answers: number;
  reasons: string[];
  observed_point: number | null;
  observed_range: [number, number] | null;
  basis: string;
  scope: string | null;
  pending_questions: string[];
}

export function relationTarget(
  answers: PortraitAnswers,
  followups: PortraitFollowups,
): string | null {
  const household = answers.Q02 ?? [];
  if (household.includes('one_cat')) return 'only-other-cat';
  if (household.includes('multiple_cats')) {
    const target = followups.F_TARGET;
    return target && !['unknown', 'deferred'].includes(target) ? target.trim() : null;
  }
  return null;
}

export function validatePortrait(
  answers: unknown,
  followups: unknown,
): asserts answers is PortraitAnswers {
  if (
    !answers ||
    typeof answers !== 'object' ||
    Array.isArray(answers) ||
    !followups ||
    typeof followups !== 'object' ||
    Array.isArray(followups)
  )
    throw new Error('Invalid answers');
  const data = answers as PortraitAnswers;
  const extra = followups as PortraitFollowups;
  if (Object.keys(extra).length > 2) throw new Error('At most two clarifications');
  for (const [key, value] of Object.entries(data)) {
    if (!Object.hasOwn(portraitQuestions, key)) throw new Error('Unknown question');
    const options = portraitQuestions[key]!.options.map((option) => option.id);
    if (key === 'Q02') {
      if (
        !Array.isArray(value) ||
        !value.length ||
        value.some((item) => typeof item !== 'string' || !options.includes(item)) ||
        new Set(value).size !== value.length
      )
        throw new Error('Invalid household options');
      if (
        value.some((item) => ['none', 'unknown', 'deferred'].includes(item)) &&
        value.length !== 1
      )
        throw new Error('Exclusive household options');
      if (value.includes('one_cat') && value.includes('multiple_cats'))
        throw new Error('Conflicting cat counts');
    } else if (typeof value !== 'string' || !options.includes(value))
      throw new Error('Invalid answer');
  }
  const household = data.Q02 as string[] | undefined;
  const group = data.Q03 as string | undefined;
  const required: Record<string, string[]> = {
    children: ['children'],
    cats: ['one_cat', 'multiple_cats'],
    dogs: ['dogs'],
    other_animals: ['other_animals'],
  };
  if (
    household?.length &&
    !household.some((item) => ['unknown', 'deferred'].includes(item)) &&
    group &&
    required[group] &&
    !required[group]!.some((item) => household.includes(item))
  )
    throw new Error('The reported group is absent');
  for (const [key, value] of Object.entries(extra)) {
    if (!Object.hasOwn(portraitFollowups, key)) throw new Error('Unknown clarification');
    if (typeof value !== 'string') throw new Error('Invalid clarification');
    if (key === 'F_TARGET') {
      if (!household?.includes('multiple_cats') || !value.trim() || value.length > 60)
        throw new Error('Invalid relationship target');
    } else if (!portraitFollowups[key]!.includes(value))
      throw new Error('Invalid clarification option');
  }
  if (extra.F_CONTEXT && !socialGroups.has(group ?? ''))
    throw new Error('Context clarification no longer applies');
  if ((data.Q10 !== undefined || data.Q11 !== undefined) && !relationTarget(data, extra))
    throw new Error('A shared relationship target is required');
}

export function valueOf(answers: PortraitAnswers, question: string): number | null {
  return (
    portraitQuestions[question]?.options.find((option) => option.id === answers[question])?.value ??
    null
  );
}

export function summarizeAxis(answers: PortraitAnswers, axis: AxisId): AxisResult {
  const items = portraitAxes[axis].map((question) => ({
    question,
    answer: answers[question],
    value: valueOf(answers, question),
  }));
  const values = items.flatMap((item) => (item.value === null ? [] : [item.value]));
  const result: AxisResult = {
    point: null,
    range: null,
    status: 'unknown',
    items,
    numeric_answers: values.length,
    expected_answers: items.length,
    reasons: [],
    observed_point: null,
    observed_range: null,
    basis: '',
    scope: null,
    pending_questions: [],
  };
  if (items.some((item) => item.answer === 'contextual')) {
    result.status = 'context_dependent';
    result.reasons.push('owner_reported_context_variation');
  } else if (values.length) {
    if (Math.max(...values) - Math.min(...values) >= 2) {
      result.range = [Math.min(...values), Math.max(...values)];
      result.status = 'varied';
      result.reasons.push('different_item_profiles');
    } else {
      result.point = values.reduce((a, b) => a + b, 0) / values.length;
      result.status = values.length >= 2 ? 'consistent_pair' : 'single_indicator';
    }
  }
  return result;
}

export function variationAxis(answers: PortraitAnswers): AxisId | null {
  let strongest: AxisId | null = null;
  let spread = 0;
  for (const axis of axisIds) {
    const result = summarizeAxis(answers, axis);
    const difference =
      result.status === 'context_dependent'
        ? 5
        : result.range
          ? result.range[1] - result.range[0]
          : 0;
    if (difference > spread) {
      strongest = axis;
      spread = difference;
    }
  }
  return strongest;
}

export function spaceNeedsFollowup(answers: PortraitAnswers): boolean {
  if (valueOf(answers, 'Q15') === null && valueOf(answers, 'Q16') === null) return false;
  const calm = valueOf(answers, 'Q18');
  return answers.Q17 !== 'both' || calm === null || calm < 3;
}

export function nextQuestion(
  answers: PortraitAnswers,
  followups: PortraitFollowups = {},
  issuedFollowups?: string[],
): { id: string; group?: string; axis?: AxisId } | null {
  validatePortrait(answers, followups);
  for (const key of Object.keys(portraitQuestions)) {
    if (['Q10', 'Q11'].includes(key)) {
      if (answers.Q02?.includes('multiple_cats') && !Object.hasOwn(followups, 'F_TARGET')) {
        if (issuedFollowups && issuedFollowups.length >= 2 && !issuedFollowups.includes('F_TARGET'))
          continue;
        if (Object.keys(followups).length >= 2)
          throw new Error('Target selection must precede optional clarifications');
        return { id: 'F_TARGET' };
      }
      if (!relationTarget(answers, followups)) continue;
    }
    if (!Object.hasOwn(answers, key)) return { id: key };
  }
  if (Object.keys(followups).length >= 2 || (issuedFollowups && issuedFollowups.length >= 2))
    return null;
  if (socialGroups.has(String(answers.Q03)) && !Object.hasOwn(followups, 'F_CONTEXT'))
    return { id: 'F_CONTEXT', group: String(answers.Q03) };
  if (spaceNeedsFollowup(answers) && !Object.hasOwn(followups, 'F_SPACE')) return { id: 'F_SPACE' };
  const axis = variationAxis(answers);
  return axis && !Object.hasOwn(followups, 'F_VARIATION') ? { id: 'F_VARIATION', axis } : null;
}

export function calculatePortrait(
  answers: PortraitAnswers,
  followups: PortraitFollowups = {},
  issuedFollowups?: string[],
) {
  validatePortrait(answers, followups);
  if (followups.F_SPACE && !spaceNeedsFollowup(answers))
    throw new Error('Spatial clarification no longer applies');
  if (followups.F_VARIATION && !variationAxis(answers))
    throw new Error('Variation clarification no longer applies');
  const target = relationTarget(answers, followups);
  const axes = Object.fromEntries(
    axisIds.map((axis) => [axis, summarizeAxis(answers, axis)]),
  ) as Record<AxisId, AxisResult>;
  for (const axis of axisIds) {
    const result = axes[axis];
    result.observed_point = result.point;
    result.observed_range = result.range;
    result.basis = answers.Q01 === 'usual' ? 'reported_usual' : 'current_snapshot';
    result.scope = axis.startsWith('cat_')
      ? target
      : axis === 'human_contact'
        ? 'respondent'
        : 'reported_household_conditions';
  }
  const group = String(answers.Q03 ?? '');
  const affected = new Set<AxisId>();
  if (socialGroups.has(group)) {
    const effect =
      followups.F_CONTEXT === 'deferred' ? 'unknown' : (followups.F_CONTEXT ?? 'unknown');
    for (const axis of contextEffects[effect] ?? []) affected.add(axis);
    if (['cats', 'several'].includes(group) && effect === 'withdraw')
      affected.add('cat_distancing');
    for (const axis of affected) {
      if (axes[axis].numeric_answers || axes[axis].status === 'context_dependent') {
        axes[axis].point = null;
        axes[axis].range = null;
        axes[axis].status = 'context_dependent';
        axes[axis].reasons.push('reported_household_association');
      }
    }
  }
  const calm = valueOf(answers, 'Q18');
  for (const axis of ['height', 'openness'] as const) {
    const allowed = axis === 'height' ? ['both', 'height_only'] : ['both', 'cover_only'];
    const reasons: string[] = [];
    if (!allowed.includes(String(answers.Q17))) reasons.push('choice_unavailable_or_unknown');
    if (calm === null || calm < 3) reasons.push('calm_rest_not_sufficiently_reported');
    if (answers.Q01 === 'health' || followups.F_SPACE === 'mobility')
      reasons.push('health_or_mobility_context');
    if (reasons.length && axes[axis].numeric_answers) {
      axes[axis].point = null;
      axes[axis].range = null;
      axes[axis].status = 'observed_use_only';
      axes[axis].reasons.push(...reasons);
    }
  }
  for (const axis of ['cat_affiliation', 'cat_distancing'] as const)
    if (!target) axes[axis].reasons.push('no_observed_target_relationship');
  let headline: 'energetic_companion' | 'calm_companion' | 'independent_explorer' | null = null;
  const pair = (axis: AxisId) =>
    axes[axis].status === 'consistent_pair' && axes[axis].point !== null;
  const a = axes.activity.point,
    h = axes.human_contact.point,
    e = axes.exploration.point;
  if (answers.Q01 === 'usual') {
    if (pair('activity') && pair('human_contact') && a !== null && h !== null) {
      if (a >= 3 && h >= 3) headline = 'energetic_companion';
      else if (a <= 1 && h >= 3) headline = 'calm_companion';
    }
    if (
      !headline &&
      pair('exploration') &&
      pair('human_contact') &&
      e !== null &&
      h !== null &&
      e >= 3 &&
      h <= 1
    )
      headline = 'independent_explorer';
  }
  const cf = axes.cat_affiliation.point,
    cd = axes.cat_distancing.point;
  let relationshipNote: string | null = null;
  if (cf !== null && cd !== null) {
    if (cf <= 1 && cd <= 1) relationshipNote = 'little_affiliation_and_little_distancing';
    else if (cf >= 3 && cd <= 1) relationshipNote = 'frequent_affiliation_and_little_distancing';
    else if (cf >= 3 && cd >= 3) relationshipNote = 'affiliation_and_distancing_coexist';
    else if (cf <= 1 && cd >= 3) relationshipNote = 'little_affiliation_and_frequent_distancing';
  }
  const deferred = Object.entries({ ...answers, ...followups })
    .filter(
      ([, value]) => value === 'deferred' || (Array.isArray(value) && value[0] === 'deferred'),
    )
    .map(([key]) => key);
  if (deferred.length) headline = null;
  for (const axis of axisIds) {
    const dependencies = new Set<string>([...portraitAxes[axis], 'Q01', 'Q03']);
    if (axis.startsWith('cat_')) ['Q02', 'F_TARGET'].forEach((key) => dependencies.add(key));
    if (['height', 'openness'].includes(axis))
      ['Q17', 'Q18', 'F_SPACE'].forEach((key) => dependencies.add(key));
    if (affected.has(axis)) dependencies.add('F_CONTEXT');
    if (axis === variationAxis(answers)) dependencies.add('F_VARIATION');
    axes[axis].pending_questions = deferred.filter((key) => dependencies.has(key));
  }
  const relevantBase = Object.keys(portraitQuestions).filter(
    (key) => !['Q10', 'Q11'].includes(key) || target,
  );
  const unresolved =
    !answers.Q02 ||
    answers.Q02.includes('unknown') ||
    answers.Q02.includes('deferred') ||
    (answers.Q02.includes('multiple_cats') && !target);
  const incomplete = axisIds
    .filter((key) => !key.startsWith('cat_') || target || unresolved)
    .some(
      (key) => axes[key].point === null || axes[key].numeric_answers < axes[key].expected_answers,
    );
  return {
    version: portraitVersion,
    axes,
    vector: Object.fromEntries(axisIds.map((axis) => [axis, axes[axis].point])),
    headline,
    relationship_target: target,
    relationship_note: relationshipNote,
    context: {
      household: answers.Q02 ?? null,
      group: answers.Q03 ?? null,
      effect: followups.F_CONTEXT ?? null,
      affected_axes: [...affected].sort(),
      space_detail: followups.F_SPACE ?? null,
      variation_detail: followups.F_VARIATION ?? null,
      variation_axis: followups.F_VARIATION ? variationAxis(answers) : null,
      causality_established: false,
    },
    answered_questions: Object.keys(answers).length + Object.keys(followups).length,
    profile_status: deferred.length
      ? ('awaiting_observation' as const)
      : incomplete
        ? ('incomplete' as const)
        : ('preliminary_portrait' as const),
    pending: deferred.map((id) => ({ id, state: 'awaiting_observation' })),
    progress: {
      base_relevant: relevantBase.length,
      base_resolved: relevantBase.filter(
        (key) => Object.hasOwn(answers, key) && !deferred.includes(key),
      ).length,
      base_deferred: relevantBase.filter((key) => deferred.includes(key)).length,
      followups_deferred: Object.keys(followups).filter((key) => deferred.includes(key)).length,
      relationship_scope_unresolved: Boolean(unresolved),
    },
    next_question: nextQuestion(answers, followups, issuedFollowups),
  };
}
export type PortraitResult = ReturnType<typeof calculatePortrait>;
export interface PortraitRecord {
  catId: string;
  revision: number;
  assessmentId: string;
  recordedAt: string;
  periodStart: string;
  periodEnd: string;
  answers: PortraitAnswers;
  followups: PortraitFollowups;
  result: PortraitResult;
  householdSnapshot: unknown;
  prefilledQuestions: string[];
  isCurrent: boolean;
  supersededAt: string | null;
  contextChangedAt: string | null;
}

export function applyPortraitAnswer(
  answers: PortraitAnswers,
  followups: PortraitFollowups,
  id: string,
  answer: string | string[],
  issuedFollowups?: string[],
) {
  const next = { ...answers },
    extra = { ...followups };
  const previousVariation = variationAxis(answers);
  const beforeTarget = relationTarget(answers, followups);
  if (id.startsWith('F_')) {
    if (typeof answer !== 'string') throw new Error('Invalid clarification');
    extra[id] = answer;
  } else next[id] = answer;
  if (id === 'Q02' && JSON.stringify(answers.Q02) !== JSON.stringify(answer)) {
    delete next.Q10;
    delete next.Q11;
    delete next.Q03;
    delete extra.F_TARGET;
    delete extra.F_CONTEXT;
  }
  if (id === 'F_TARGET' && beforeTarget !== relationTarget(next, extra)) {
    delete next.Q10;
    delete next.Q11;
  }
  if (id === 'Q03' && answers.Q03 !== answer) delete extra.F_CONTEXT;
  if (id !== 'F_SPACE' && !spaceNeedsFollowup(next)) delete extra.F_SPACE;
  if (id !== 'F_VARIATION' && (variationAxis(next) !== previousVariation || !variationAxis(next)))
    delete extra.F_VARIATION;
  calculatePortrait(next, extra, issuedFollowups);
  return { answers: next, followups: extra };
}
