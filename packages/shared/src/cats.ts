export const profileAreas = [
  'about',
  'home',
  'household',
  'routine',
  'preferences',
  'health',
  'history',
] as const;
export type ProfileArea = (typeof profileAreas)[number];
export const profileFields = {
  about: ['age', 'sex', 'neutered', 'origin', 'homeSince'],
  home: ['rooms', 'highPlaces', 'shelters', 'restPlaces', 'litterBoxes', 'resources', 'access'],
  household: ['relationships'],
  routine: ['meals', 'play', 'rest', 'alone', 'outdoors'],
  preferences: ['games', 'contact', 'handling', 'boundaries'],
  health: ['conditions', 'treatment', 'mobility'],
  history: [],
} as const;
export type ProfileField = (typeof profileFields)[ProfileArea][number];
export type CatAttributes = Partial<Record<ProfileField, string>>;
export type HouseholdGroup = 'children' | 'dogs' | 'other_animals';
export type Presence = 'yes' | 'no' | 'unknown';
export interface HouseholdFacts {
  children: Presence;
  dogs: Presence;
  other_animals: Presence;
  totalCats: 'unknown' | 'one' | 'two' | 'three_or_more';
}
export const unknownHousehold: HouseholdFacts = {
  children: 'unknown',
  dogs: 'unknown',
  other_animals: 'unknown',
  totalCats: 'unknown',
};
export interface CatEvent {
  id: string;
  date: string;
  title: string;
  details: string;
}
export interface HouseholdRecord {
  id: string;
  version: number;
  facts: HouseholdFacts;
  environment: CatAttributes;
  members: Array<{ id: string; name: string }>;
  updatedAt: string;
}
export interface CatRecord {
  id: string;
  name: string;
  version: number;
  photoVersion: number;
  hasPhoto: boolean;
  attributes: CatAttributes;
  events: CatEvent[];
  household: HouseholdRecord;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  portraitStatus: 'not_started' | 'awaiting_observation' | 'incomplete' | 'preliminary_portrait';
}

export function validateAttributes(
  input: unknown,
  allowed: readonly string[] = Object.values(profileFields).flat(),
): CatAttributes {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid profile fields');
  const result: CatAttributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key) || typeof value !== 'string' || value.length > 1500)
      throw new Error('Invalid profile field');
    if (key === 'sex' && value && !['female', 'male', 'unknown'].includes(value))
      throw new Error('Invalid sex');
    if (key === 'neutered' && value && !['yes', 'no', 'unknown'].includes(value))
      throw new Error('Invalid neutering status');
    result[key as ProfileField] = value.trim();
  }
  return result;
}

export function validateHousehold(input: unknown): HouseholdFacts {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid household');
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !Object.hasOwn(unknownHousehold, key)))
    throw new Error('Invalid household field');
  for (const key of ['children', 'dogs', 'other_animals'])
    if (!['yes', 'no', 'unknown'].includes(String(data[key])))
      throw new Error('Invalid household presence');
  if (!['unknown', 'one', 'two', 'three_or_more'].includes(String(data.totalCats)))
    throw new Error('Invalid cat count');
  return data as unknown as HouseholdFacts;
}

export function householdAnswer(facts: HouseholdFacts, memberCount: number): string[] | null {
  // Only explicit information can prefill an answer. Registered housemates establish a lower bound.
  if (
    ['children', 'dogs', 'other_animals'].some((key) => facts[key as HouseholdGroup] === 'unknown')
  )
    return null;
  const declared = { unknown: 0, one: 1, two: 2, three_or_more: 3 }[facts.totalCats];
  if (!declared && memberCount < 2) return null;
  const total = Math.max(declared, memberCount);
  const answer = (['children', 'dogs', 'other_animals'] as const).filter(
    (key) => facts[key] === 'yes',
  ) as string[];
  if (total === 2) answer.push('one_cat');
  if (total >= 3) answer.push('multiple_cats');
  return answer.length ? answer : ['none'];
}

export function factsFromHouseholdAnswer(answer: string[]): HouseholdFacts | null {
  if (!answer.length || answer.includes('unknown') || answer.includes('deferred')) return null;
  return {
    children: answer.includes('children') ? 'yes' : 'no',
    dogs: answer.includes('dogs') ? 'yes' : 'no',
    other_animals: answer.includes('other_animals') ? 'yes' : 'no',
    totalCats: answer.includes('multiple_cats')
      ? 'three_or_more'
      : answer.includes('one_cat')
        ? 'two'
        : 'one',
  };
}
