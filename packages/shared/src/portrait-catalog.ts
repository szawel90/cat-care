/** Application-specific observation categories, not psychometric or population scores. */
export const portraitQuestions: Record<
  string,
  { kind: string; options: Array<{ id: string; value: number | null }> }
> = {
  Q01: {
    kind: 'single',
    options: [
      {
        id: 'usual',
        value: null,
      },
      {
        id: 'changed',
        value: null,
      },
      {
        id: 'health',
        value: null,
      },
      {
        id: 'short',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q02: {
    kind: 'multiple',
    options: [
      {
        id: 'children',
        value: null,
      },
      {
        id: 'one_cat',
        value: null,
      },
      {
        id: 'multiple_cats',
        value: null,
      },
      {
        id: 'dogs',
        value: null,
      },
      {
        id: 'other_animals',
        value: null,
      },
      {
        id: 'none',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q03: {
    kind: 'single',
    options: [
      {
        id: 'none',
        value: null,
      },
      {
        id: 'children',
        value: null,
      },
      {
        id: 'cats',
        value: null,
      },
      {
        id: 'dogs',
        value: null,
      },
      {
        id: 'other_animals',
        value: null,
      },
      {
        id: 'adults',
        value: null,
      },
      {
        id: 'several',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q04: {
    kind: 'single',
    options: [
      {
        id: 'never',
        value: 0,
      },
      {
        id: 'rarely',
        value: 1,
      },
      {
        id: 'sometimes',
        value: 2,
      },
      {
        id: 'often',
        value: 3,
      },
      {
        id: 'almost_always',
        value: 4,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q05: {
    kind: 'single',
    options: [
      {
        id: 'no_play',
        value: 0,
      },
      {
        id: 'watches',
        value: 1,
      },
      {
        id: 'brief_play',
        value: 2,
      },
      {
        id: 'joins_play',
        value: 4,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q06: {
    kind: 'single',
    options: [
      {
        id: 'rests',
        value: 0,
      },
      {
        id: 'watches',
        value: 0,
      },
      {
        id: 'moves_away',
        value: 4,
      },
      {
        id: 'hides',
        value: 4,
      },
      {
        id: 'still_tense',
        value: null,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q07: {
    kind: 'single',
    options: [
      {
        id: 'continues',
        value: 0,
      },
      {
        id: 'looks',
        value: 0,
      },
      {
        id: 'moves_away',
        value: 4,
      },
      {
        id: 'hides',
        value: 4,
      },
      {
        id: 'still_tense',
        value: null,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q08: {
    kind: 'single',
    options: [
      {
        id: 'approaches_contact',
        value: 4,
      },
      {
        id: 'approaches_nearby',
        value: 2,
      },
      {
        id: 'stays_apart',
        value: 0,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q09: {
    kind: 'single',
    options: [
      {
        id: 'close',
        value: 4,
      },
      {
        id: 'same_room',
        value: 2,
      },
      {
        id: 'farther',
        value: 0,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q10: {
    kind: 'single',
    options: [
      {
        id: 'initiates_greeting',
        value: 4,
      },
      {
        id: 'stays_near_without_greeting',
        value: 0,
      },
      {
        id: 'stays_separate',
        value: 0,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q11: {
    kind: 'single',
    options: [
      {
        id: 'stays',
        value: 0,
      },
      {
        id: 'moves_away',
        value: 4,
      },
      {
        id: 'changes_route',
        value: 4,
      },
      {
        id: 'still_tense',
        value: null,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q12: {
    kind: 'single',
    options: [
      {
        id: 'investigates',
        value: 4,
      },
      {
        id: 'observes',
        value: 2,
      },
      {
        id: 'no_interest',
        value: 0,
      },
      {
        id: 'moves_away',
        value: 0,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q13: {
    kind: 'single',
    options: [
      {
        id: 'explores',
        value: 4,
      },
      {
        id: 'looks_from_entrance',
        value: 2,
      },
      {
        id: 'stays_in_known_place',
        value: 0,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q14: {
    kind: 'single',
    options: [
      {
        id: 'starts_eating',
        value: 0,
      },
      {
        id: 'brief_sniff',
        value: 2,
      },
      {
        id: 'inspects_first',
        value: 4,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q15: {
    kind: 'single',
    options: [
      {
        id: 'floor',
        value: 0,
      },
      {
        id: 'mostly_floor',
        value: 1,
      },
      {
        id: 'balanced',
        value: 2,
      },
      {
        id: 'mostly_elevated',
        value: 3,
      },
      {
        id: 'elevated',
        value: 4,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q16: {
    kind: 'single',
    options: [
      {
        id: 'covered',
        value: 0,
      },
      {
        id: 'mostly_covered',
        value: 1,
      },
      {
        id: 'balanced',
        value: 2,
      },
      {
        id: 'mostly_open',
        value: 3,
      },
      {
        id: 'open',
        value: 4,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q17: {
    kind: 'single',
    options: [
      {
        id: 'both',
        value: null,
      },
      {
        id: 'height_only',
        value: null,
      },
      {
        id: 'cover_only',
        value: null,
      },
      {
        id: 'neither',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
  Q18: {
    kind: 'single',
    options: [
      {
        id: 'settles',
        value: 4,
      },
      {
        id: 'stays_alert',
        value: 2,
      },
      {
        id: 'cannot_settle',
        value: 0,
      },
      {
        id: 'contextual',
        value: null,
      },
      {
        id: 'deferred',
        value: null,
      },
    ],
  },
};
export const portraitAxes = {
  activity: ['Q04', 'Q05'],
  caution: ['Q06', 'Q07'],
  human_contact: ['Q08', 'Q09'],
  cat_affiliation: ['Q10'],
  cat_distancing: ['Q11'],
  exploration: ['Q12', 'Q13'],
  food_inspection: ['Q14'],
  height: ['Q15'],
  openness: ['Q16'],
};
export const portraitFollowups: Record<string, string[]> = {
  F_TARGET: [],
  F_CONTEXT: ['play_more', 'contact_more', 'withdraw', 'space', 'food', 'several', 'deferred'],
  F_SPACE: ['access', 'retreat', 'mobility', 'varied', 'deferred'],
  F_VARIATION: ['different_contexts', 'varies_same_context', 'deferred'],
};
