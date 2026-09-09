import data from './catalog.json';

export const BARF_ENGINE_VERSION = 'barf-1.9c-corrected-v1';
export type BarfNutrientId = keyof (typeof data.ingredients)[number]['nutrients'];
export interface BarfIngredient {
  id: string;
  category: string;
  name: { en: string; pl: string };
  unit: string;
  basisQuantity: number;
  gramsPerUnit: number | null;
  countsAsMeat: boolean;
  suggestion: string | null;
  premixGramsPerKg: number | null;
  source: { sheet: string; row: number; label: string | null };
  nutrients: Record<BarfNutrientId, number | null>;
}
export type BarfCatalog = Omit<typeof data, 'ingredients'> & { ingredients: BarfIngredient[] };
export const barfCatalog: BarfCatalog = data;
export const barfNutrients = data.nutrients as ((typeof data.nutrients)[number] & {
  id: BarfNutrientId;
})[];

export interface BarfItem {
  ingredientId: string;
  quantity: number;
}
export interface BarfInput {
  title: string;
  catName: string;
  catWeightKg: number;
  catalogVersion: string;
  engineVersion: string;
  items: BarfItem[];
}
export interface BarfNutrientResult {
  knownTotal: number;
  reference: number | null;
  missingIngredientIds: string[];
  perDay: number | null;
  perKgDay: number | null;
  per1000Kcal: number | null;
}
export interface BarfResult {
  meatGrams: number;
  knownMixtureGrams: number;
  massIncomplete: boolean;
  days: number | null;
  dailyPortionGrams: number | null;
  moisturePercent: number | null;
  proteinDryMatterPercent: number | null;
  fatDryMatterPercent: number | null;
  calciumPhosphorus: number | null;
  potassiumSodium: number | null;
  nutrients: Record<BarfNutrientId, BarfNutrientResult>;
  missingNutrientCount: number;
  validation: 'legacy-unverified';
}
export interface BarfSnapshot {
  input: BarfInput;
  result: BarfResult;
  ingredients: BarfIngredient[];
}
export interface BarfRecipeRevision {
  version: number;
  status: 'current' | 'superseded' | 'withdrawn';
  createdAt: string;
  snapshot: BarfSnapshot;
}
export interface BarfRecipe {
  id: string;
  currentVersion: number;
  archivedAt: string | null;
  createdAt: string;
  revisions: BarfRecipeRevision[];
}

export function emptyBarfInput(): BarfInput {
  return {
    title: '',
    catName: '',
    catWeightKg: 4,
    catalogVersion: data.version,
    engineVersion: BARF_ENGINE_VERSION,
    items: [],
  };
}

export function validateBarfInput(input: BarfInput, catalog: BarfCatalog = data): void {
  if (input.engineVersion !== BARF_ENGINE_VERSION || input.catalogVersion !== catalog.version)
    throw new Error('BARF_VERSION_MISMATCH');
  if (!Number.isFinite(input.catWeightKg) || input.catWeightKg < 0.1 || input.catWeightKg > 30)
    throw new Error('BARF_INVALID_WEIGHT');
  if (!Array.isArray(input.items) || input.items.length > 200)
    throw new Error('BARF_INVALID_ITEMS');
  const ids = new Set<string>();
  for (const item of input.items) {
    if (!catalog.ingredients.some((ingredient) => ingredient.id === item.ingredientId))
      throw new Error('BARF_UNKNOWN_INGREDIENT');
    if (ids.has(item.ingredientId)) throw new Error('BARF_DUPLICATE_INGREDIENT');
    ids.add(item.ingredientId);
    if (!Number.isFinite(item.quantity) || item.quantity < 0.001 || item.quantity > 100_000)
      throw new Error('BARF_INVALID_QUANTITY');
  }
}

/** Reproduce the workbook's meat-based model. Missing values stay explicitly unknown. */
export function calculateBarf(input: BarfInput, catalog: BarfCatalog = data): BarfResult {
  validateBarfInput(input, catalog);
  const ingredients = new Map(catalog.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const nutrients = Object.fromEntries(
    barfNutrients.map(({ id }) => [
      id,
      {
        knownTotal: 0,
        reference: null,
        missingIngredientIds: [],
        perDay: null,
        perKgDay: null,
        per1000Kcal: null,
      },
    ]),
  ) as unknown as Record<BarfNutrientId, BarfNutrientResult>;
  let meatGrams = 0;
  let knownMixtureGrams = 0;
  let massIncomplete = false;
  for (const item of input.items) {
    const ingredient = ingredients.get(item.ingredientId)!;
    const grams = ingredient.gramsPerUnit === null ? null : item.quantity * ingredient.gramsPerUnit;
    if (grams === null) massIncomplete = true;
    else knownMixtureGrams += grams;
    if (ingredient.countsAsMeat) meatGrams += grams ?? 0;
    const factor =
      ingredient.unit === 'yolk'
        ? (item.quantity * 16) / 100
        : item.quantity / ingredient.basisQuantity;
    for (const { id } of barfNutrients) {
      const amount = ingredient.nutrients[id];
      if (amount === null) nutrients[id].missingIngredientIds.push(ingredient.id);
      else nutrients[id].knownTotal += amount * factor;
    }
  }
  const days = meatGrams > 0 ? meatGrams / (25 * input.catWeightKg) : null;
  for (const definition of barfNutrients) {
    const result = nutrients[definition.id];
    result.reference =
      definition.referencePerKgDay === null || meatGrams === 0
        ? null
        : (meatGrams / 25) * definition.referencePerKgDay;
    result.perDay = days ? result.knownTotal / days : null;
    result.perKgDay = days ? result.knownTotal / days / input.catWeightKg : null;
    result.per1000Kcal =
      nutrients.energy.knownTotal > 0 && nutrients.energy.missingIngredientIds.length === 0
        ? (result.knownTotal / nutrients.energy.knownTotal) * 1000
        : null;
  }
  const dryMass = knownMixtureGrams - nutrients.water.knownTotal;
  function ratio(a: BarfNutrientId, b: BarfNutrientId) {
    return nutrients[a].missingIngredientIds.length === 0 &&
      nutrients[b].missingIngredientIds.length === 0 &&
      nutrients[b].knownTotal > 0
      ? nutrients[a].knownTotal / nutrients[b].knownTotal
      : null;
  }
  function dryMatter(id: 'protein' | 'fat') {
    return !massIncomplete &&
      dryMass > 0 &&
      !nutrients.water.missingIngredientIds.length &&
      !nutrients[id].missingIngredientIds.length
      ? (nutrients[id].knownTotal / dryMass) * 100
      : null;
  }
  return {
    meatGrams,
    knownMixtureGrams,
    massIncomplete,
    days,
    dailyPortionGrams: days && !massIncomplete ? knownMixtureGrams / days : null,
    moisturePercent:
      knownMixtureGrams > 0 && !massIncomplete && !nutrients.water.missingIngredientIds.length
        ? (nutrients.water.knownTotal / knownMixtureGrams) * 100
        : null,
    proteinDryMatterPercent: dryMatter('protein'),
    fatDryMatterPercent: dryMatter('fat'),
    calciumPhosphorus: ratio('calcium', 'phosphorus'),
    potassiumSodium: ratio('potassium', 'sodium'),
    nutrients,
    missingNutrientCount: Object.values(nutrients).filter((n) => n.missingIngredientIds.length > 0)
      .length,
    validation: 'legacy-unverified',
  };
}

export interface BarfSuggestion {
  quantity: number | null;
  reason: string;
  missingIngredientIds: string[];
}

/** Suggest a replacement quantity, never an extra dose on top of an existing line. */
export function suggestBarfQuantity(
  input: BarfInput,
  ingredientId: string,
  catalog: BarfCatalog = data,
): BarfSuggestion {
  const ingredient = catalog.ingredients.find((entry) => entry.id === ingredientId);
  if (!ingredient) throw new Error('BARF_UNKNOWN_INGREDIENT');
  const base = {
    ...input,
    items: input.items.filter((item) => item.ingredientId !== ingredientId),
  };
  const result = calculateBarf(base, catalog);
  const rule = ingredient.suggestion;
  const answer: BarfSuggestion = {
    quantity: null,
    reason: rule ?? 'manual',
    missingIngredientIds: [],
  };
  if (!rule || result.meatGrams <= 0) return answer;
  const perUnit = (id: BarfNutrientId) => {
    const amount = ingredient.nutrients[id];
    return amount === null ? null : amount / ingredient.basisQuantity;
  };
  // Keep the source's known subtotal available, but disclose every omitted input.
  const known = (id: BarfNutrientId) => {
    answer.missingIngredientIds.push(...result.nutrients[id].missingIngredientIds);
    return result.nutrients[id].knownTotal;
  };
  let quantity: number | null = null;
  if (rule === 'water') {
    if (!result.massIncomplete)
      quantity = (0.75 * result.knownMixtureGrams - known('water')) / 0.25;
  } else if (rule === 'yeast') {
    quantity = (result.meatGrams / 1000) * 3;
  } else if (rule === 'premix') {
    quantity = (result.meatGrams / 1000) * (ingredient.premixGramsPerKg ?? 0);
  } else if (rule === 'fat') {
    const fat = perUnit('fat');
    const water = perUnit('water');
    if (fat !== null && water !== null && !result.massIncomplete)
      quantity =
        (0.25 * (result.knownMixtureGrams - known('water')) - known('fat')) /
        (fat - 0.25 * (1 - water));
  } else if (rule === 'calciumPhosphorus') {
    const calcium = perUnit('calcium');
    const phosphorus = perUnit('phosphorus');
    if (calcium !== null && phosphorus !== null)
      quantity = (1.15 * known('phosphorus') - known('calcium')) / (calcium - 1.15 * phosphorus);
  } else if (rule === 'potassiumSodium') {
    const sodium = perUnit('sodium');
    const potassium = perUnit('potassium');
    if (sodium !== null && potassium !== null)
      quantity = (1.35 * known('sodium') - known('potassium')) / (potassium - 1.35 * sodium);
  } else if (barfNutrients.some(({ id }) => id === rule)) {
    const nutrient = rule as BarfNutrientId;
    const concentration = perUnit(nutrient);
    const reference = result.nutrients[nutrient].reference;
    if (concentration !== null && concentration > 0 && reference !== null)
      quantity = (reference - known(nutrient)) / concentration;
  }
  answer.missingIngredientIds = [...new Set(answer.missingIngredientIds)];
  // Missing source data cannot silently become a dosing assumption.
  if (
    quantity !== null &&
    Number.isFinite(quantity) &&
    quantity <= 100_000 &&
    answer.missingIngredientIds.length === 0
  ) {
    answer.quantity = Math.max(0, Math.round(quantity * 1000) / 1000);
  }
  return answer;
}

export function snapshotBarf(input: BarfInput): BarfSnapshot {
  const result = calculateBarf(input);
  const ids = new Set(input.items.map((item) => item.ingredientId));
  return {
    input: structuredClone(input),
    result,
    ingredients: structuredClone(data.ingredients.filter((item) => ids.has(item.id))),
  };
}
