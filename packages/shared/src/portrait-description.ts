import type { AxisId, AxisResult, PortraitAnswers } from './portrait';

export const descriptionVersion = 'cat-description-1';
export type TraitBand = 'low' | 'middle' | 'high' | 'varied' | 'context' | 'use';
export interface PortraitTrait {
  axis: AxisId;
  band: TraitBand;
  preliminary: boolean;
  questions: string[];
}

/** Return semantic keys so the same saved evidence can be read in either UI language. */
export function describePortrait(
  axes: Record<AxisId, AxisResult>,
  answers: PortraitAnswers,
  relationship: string | null,
  incomplete: boolean,
) {
  const priority: AxisId[] = [
    'human_contact',
    'exploration',
    'activity',
    'caution',
    'cat_affiliation',
    'cat_distancing',
    'height',
    'openness',
    'food_inspection',
  ];
  const traits: PortraitTrait[] = [];
  for (const axis of priority) {
    const value = axes[axis];
    const reported = value.items.some(
      (item) => item.answer === 'contextual' || item.answer === 'still_tense',
    );
    if (!value.numeric_answers && !reported) continue;
    const band: TraitBand =
      value.status === 'observed_use_only'
        ? 'use'
        : value.status === 'context_dependent'
          ? 'context'
          : value.range
            ? 'varied'
            : value.point === null
              ? 'context'
              : value.point <= 1
                ? 'low'
                : value.point >= 3
                  ? 'high'
                  : 'middle';
    traits.push({
      axis,
      band,
      preliminary:
        value.numeric_answers < value.expected_answers || value.pending_questions.length > 0,
      questions: value.items
        .filter((item) => item.answer !== undefined && item.answer !== 'deferred')
        .map((item) => item.question),
    });
  }
  const specific = traits.filter(
    (trait) => !trait.preliminary && !['context', 'varied', 'use'].includes(trait.band),
  );
  const hasCombination =
    specific.some((trait) => trait.axis === 'human_contact' && trait.band === 'high') &&
    specific.some((trait) => trait.axis === 'caution' && trait.band === 'high');
  const sentenceKeys: string[] = [];
  const covered = new Set<AxisId>();
  if (hasCombination) {
    sentenceKeys.push('combination.close_cautious');
    covered.add('human_contact');
    covered.add('caution');
  }
  if (relationship === 'affiliation_and_distancing_coexist') {
    sentenceKeys.push('combination.social_distance');
    covered.add('cat_affiliation');
    covered.add('cat_distancing');
  }
  for (const trait of traits) {
    if (sentenceKeys.length >= 3) break;
    if (trait.preliminary && !['context', 'varied', 'use'].includes(trait.band)) continue;
    if (!covered.has(trait.axis)) {
      sentenceKeys.push(`traits.${trait.axis}.${trait.band}.sentence`);
      covered.add(trait.axis);
    }
  }
  if (!sentenceKeys.length) sentenceKeys.push('empty');
  if (answers.Q01 && answers.Q01 !== 'usual') sentenceKeys.push('snapshot');
  else if (incomplete) sentenceKeys.push('partial');
  return {
    version: descriptionVersion,
    traits,
    sentenceKeys,
    preliminary: incomplete || answers.Q01 !== 'usual',
  };
}
