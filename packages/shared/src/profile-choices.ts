export const profileChoices = {
  rooms: { multiple: false, options: ['one_room', 'several_rooms', 'whole_home', 'limited'] },
  highPlaces: { multiple: false, options: ['none', 'one', 'several'] },
  shelters: { multiple: false, options: ['none', 'one', 'several'] },
  restPlaces: {
    multiple: true,
    options: ['open', 'covered', 'near_people', 'quiet', 'warm', 'elevated'],
  },
  litterBoxes: { multiple: false, options: ['one', 'two', 'three_plus'] },
  resources: {
    multiple: true,
    options: ['scratching_posts', 'separate_food_water', 'multiple_water', 'food_puzzles', 'none'],
  },
  access: {
    multiple: true,
    options: ['free', 'sometimes_blocked', 'often_blocked', 'mobility_limited'],
  },
  meals: { multiple: false, options: ['fixed', 'flexible', 'freely_available', 'mixed'] },
  play: { multiple: true, options: ['morning', 'day', 'evening', 'night', 'varies'] },
  rest: { multiple: true, options: ['quiet', 'near_people', 'covered', 'elevated', 'varies'] },
  alone: {
    multiple: false,
    options: ['rarely_alone', 'under_four', 'four_eight', 'over_eight', 'varies'],
  },
  outdoors: {
    multiple: true,
    options: ['indoor', 'secured_balcony', 'secured_garden', 'supervised', 'free_access'],
  },
  games: {
    multiple: true,
    options: ['wand', 'balls', 'chase', 'food_puzzles', 'hide_seek', 'none'],
  },
  contact: { multiple: true, options: ['head', 'back', 'nearby_no_touch', 'brief', 'none'] },
  handling: {
    multiple: false,
    options: ['comfortable', 'short_only', 'moves_away', 'avoids', 'varies'],
  },
  boundaries: {
    multiple: true,
    options: ['belly', 'paws', 'tail', 'pickup', 'brushing', 'rest', 'feeding', 'none'],
  },
} as const;
export type ChoiceField = keyof typeof profileChoices;
export function isChoiceField(field: string): field is ChoiceField {
  return Object.hasOwn(profileChoices, field);
}
export function toggleProfileChoice(
  current: string | string[] | undefined,
  option: string,
): string[] {
  const exclusive = ['deferred', 'none', 'free', 'indoor', 'varies'];
  if (exclusive.includes(option)) return current?.includes(option) ? [] : [option];
  const values = Array.isArray(current)
    ? current.filter((value) => !exclusive.includes(value))
    : [];
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
}
