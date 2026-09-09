import { solve, type Constraint } from 'yalps';
import {
  barfCatalog,
  barfNutrients,
  calculateBarf,
  validateBarfInput,
  type BarfCatalog,
  type BarfIngredient,
  type BarfInput,
  type BarfItem,
  type BarfNutrientId,
} from './index';

export const BARF_PLANNER_VERSION = 'barf-inventory-v1';
export const BARF_NEW_PRODUCT_LIMIT = 3;
export interface BarfStockItem extends BarfItem {
  useAll: boolean;
}
export type BarfPlannerMode = 'inventory' | 'supplements';
export interface BarfPlanContext {
  version: string;
  mode: BarfPlannerMode;
  inventory: BarfStockItem[];
  /** Meat-category grams; added fats still count in the source nutrient references. */
  meatGrams: number;
}
export interface BarfPlanCheck {
  id: string;
  actual: number | null;
  target: number;
  status: 'at-reference' | 'above-reference' | 'below-reference' | 'off-target' | 'missing-data';
  missingIngredientIds: string[];
  gap: number;
}
export interface BarfPlanAssessment {
  taurineZeroAssumption?: { value: 0; ingredientIds: string[] };
  checks: BarfPlanCheck[];
  purchases: BarfItem[];
  unused: BarfItem[];
  targetsMet: boolean;
}
export interface BarfPlan extends BarfPlanAssessment {
  input: BarfInput | null;
  status: 'proposal' | 'no-improvement' | 'no-proposal';
  checkedCombinations: number;
  searchLimited: boolean;
}

const ratios = ['calciumPhosphorus', 'potassiumSodium', 'water', 'fat'] as const;
const MAX_MODELS = 1200;
const BEAM_WIDTH = 12;
const STEP = 0.001;
const numericTolerance = 1e-6;

function contribution(i: BarfIngredient, id: BarfNutrientId): number | null {
  const value = i.nutrients[id];
  if (value === null) return id === 'taurine' ? 0 : null;
  return i.unit === 'yolk' ? (value * 16) / 100 : value / i.basisQuantity;
}
function meatCoefficient(i: BarfIngredient) {
  return i.countsAsMeat ? (i.gramsPerUnit ?? 0) : 0;
}
function meatCategory(i: BarfIngredient) {
  return i.category === 'meat';
}

/** A catalog rule is necessary; disease-specific premixes and indivisible units are manual. */
export function canPlanBarfIngredient(i: BarfIngredient): boolean {
  return (
    i.unit === 'g' &&
    i.gramsPerUnit === 1 &&
    !!i.suggestion &&
    i.id !== 'premix-011' &&
    (barfNutrients.some((n) => n.id === i.suggestion) ||
      [...ratios, 'yeast', 'premix'].includes(i.suggestion))
  );
}

export function isBarfBaseFood(i: BarfIngredient): boolean {
  return (
    ['meat', 'fish', 'fat', 'vegetable', 'water'].includes(i.category) ||
    [
      'supplement-034',
      'supplement-035',
      'supplement-036',
      'supplement-037',
      'supplement-038',
      'supplement-039',
      'supplement-040',
      'supplement-041',
      'supplement-059',
    ].includes(i.id)
  );
}

function validateStock(input: BarfInput, context: BarfPlanContext, catalog: BarfCatalog) {
  if (!context || context.version !== BARF_PLANNER_VERSION || !Array.isArray(context.inventory))
    throw new Error('BARF_PLANNER_VERSION_MISMATCH');
  if (!['inventory', 'supplements'].includes(context.mode))
    throw new Error('BARF_INVALID_PLANNER_MODE');
  validateBarfInput({ ...input, planning: undefined, items: context.inventory }, catalog);
  if (
    !Number.isFinite(context.meatGrams) ||
    context.meatGrams < 0.001 ||
    context.meatGrams > 100_000
  )
    throw new Error('BARF_INVALID_BATCH');
  for (const stock of context.inventory) {
    if (typeof stock.useAll !== 'boolean') throw new Error('BARF_INVALID_STOCK');
    const i = catalog.ingredients.find((i) => i.id === stock.ingredientId)!;
    if (context.mode === 'supplements' && (!stock.useAll || !isBarfBaseFood(i)))
      throw new Error('BARF_BASE_FOODS_ONLY');
    if (!stock.useAll && !meatCategory(i) && !canPlanBarfIngredient(i))
      throw new Error('BARF_FIXED_AMOUNT_REQUIRED');
  }
}

/** Validate saved provenance against actual quantities, never client claims about balance. */
export function validateBarfPlanContext(input: BarfInput, catalog = barfCatalog): void {
  const context = input.planning;
  if (!context) return;
  validateStock(input, context, catalog);
  const quantities = new Map(input.items.map((i) => [i.ingredientId, i.quantity]));
  const stockIds = new Set(context.inventory.map((i) => i.ingredientId));
  for (const stock of context.inventory) {
    const used = quantities.get(stock.ingredientId) ?? 0;
    if (used > stock.quantity + 1e-8 || (stock.useAll && Math.abs(used - stock.quantity) > 1e-8))
      throw new Error('BARF_STOCK_LIMIT');
  }
  const purchases = input.items.filter((i) => !stockIds.has(i.ingredientId));
  if (context.mode === 'inventory' && purchases.length > BARF_NEW_PRODUCT_LIMIT)
    throw new Error('BARF_NEW_PRODUCT_LIMIT');
  if (
    purchases.some(
      (item) =>
        !canPlanBarfIngredient(catalog.ingredients.find((i) => i.id === item.ingredientId)!),
    )
  )
    throw new Error('BARF_UNSUPPORTED_ADDITION');
  if (
    input.items.filter(
      (item) =>
        catalog.ingredients.find((i) => i.id === item.ingredientId)?.suggestion === 'premix',
    ).length > 1
  )
    throw new Error('BARF_MULTIPLE_PREMIXES');
  const meat = input.items.reduce((sum, item) => {
    const i = catalog.ingredients.find((i) => i.id === item.ingredientId)!;
    return sum + (meatCategory(i) ? item.quantity * (i.gramsPerUnit ?? 0) : 0);
  }, 0);
  if (Math.abs(meat - context.meatGrams) > (context.inventory.length * STEP) / 2 + 1e-8)
    throw new Error('BARF_BATCH_MISMATCH');
}

/** Linear source-target residual per unit. Null always blocks that specific equation. */
function coefficient(
  i: BarfIngredient,
  rule: string,
  targetIngredient?: BarfIngredient,
): number | null {
  const a = (id: BarfNutrientId) => contribution(i, id);
  if (rule === 'premix' || rule === 'yeast') {
    const dose = rule === 'yeast' ? 3 : targetIngredient?.premixGramsPerKg;
    if (!dose || !targetIngredient) return null;
    return (i.id === targetIngredient.id ? 1 : 0) - (meatCoefficient(i) * dose) / 1000;
  }
  if (rule === 'calciumPhosphorus') {
    return a('calcium') === null || a('phosphorus') === null
      ? null
      : a('calcium')! - 1.15 * a('phosphorus')!;
  }
  if (rule === 'potassiumSodium') {
    return a('potassium') === null || a('sodium') === null
      ? null
      : a('potassium')! - 1.35 * a('sodium')!;
  }
  if (rule === 'water' || rule === 'fat') {
    if (i.gramsPerUnit === null || a('water') === null) return null;
    return rule === 'water'
      ? a('water')! - 0.75 * i.gramsPerUnit
      : a('fat') === null
        ? null
        : a('fat')! - 0.25 * (i.gramsPerUnit - a('water')!);
  }
  const nutrient = barfNutrients.find((n) => n.id === rule);
  if (!nutrient || nutrient.referencePerKgDay === null || a(nutrient.id) === null) return null;
  return a(nutrient.id)! - (meatCoefficient(i) * nutrient.referencePerKgDay) / 25;
}

function checks(input: BarfInput, catalog: BarfCatalog): BarfPlanCheck[] {
  const pure = { ...input, planning: undefined };
  const result = calculateBarf(pure, catalog);
  const selected = input.items.map((item) => ({
    ...item,
    ingredient: catalog.ingredients.find((i) => i.id === item.ingredientId)!,
  }));
  const definitions = [
    ...barfNutrients
      .filter((n) => n.referencePerKgDay !== null && n.referencePerKgDay > 0)
      .map((n) => n.id),
    ...ratios,
  ];
  return definitions.map((id) => {
    const nutrient = barfNutrients.find(
      (n) => n.id === id && !ratios.includes(id as (typeof ratios)[number]),
    );
    const raw = nutrient ? result.nutrients[nutrient.id] : undefined;
    const target =
      raw?.reference ??
      (id === 'calciumPhosphorus'
        ? 1.15
        : id === 'potassiumSodium'
          ? 1.35
          : id === 'water'
            ? 75
            : 25);
    const actual = raw
      ? raw.knownTotal
      : id === 'calciumPhosphorus'
        ? result.calciumPhosphorus
        : id === 'potassiumSodium'
          ? result.potassiumSodium
          : id === 'water'
            ? result.moisturePercent
            : result.fatDryMatterPercent;
    const missing = selected
      .filter(({ ingredient }) => coefficient(ingredient, id) === null)
      .map((i) => i.ingredientId);
    // Rounding tolerance is arithmetic precision, never a nutritional safe range.
    const residual = selected.reduce(
      (sum, i) => sum + (coefficient(i.ingredient, id) ?? 0) * i.quantity,
      0,
    );
    const tolerance = selected.reduce(
      (sum, i) => sum + (Math.abs(coefficient(i.ingredient, id) ?? 0) * STEP) / 2,
      numericTolerance,
    );
    const unknown = missing.length > 0 || actual === null || result.meatGrams <= 0;
    const gap = unknown
      ? 1
      : raw
        ? Math.max(0, (target - actual!) / Math.max(target, 1e-8))
        : Math.min(1, Math.abs(actual! - target) / target);
    const status: BarfPlanCheck['status'] = unknown
      ? 'missing-data'
      : Math.abs(residual) <= tolerance
        ? 'at-reference'
        : raw
          ? actual! > target
            ? 'above-reference'
            : 'below-reference'
          : 'off-target';
    return {
      id,
      actual: unknown ? null : actual,
      target,
      status,
      missingIngredientIds: missing,
      gap: status === 'at-reference' || status === 'above-reference' ? 0 : gap,
    };
  });
}

export function assessBarfPlan(input: BarfInput, catalog = barfCatalog): BarfPlanAssessment {
  validateBarfInput(input, catalog);
  const inventory = input.planning?.inventory ?? [];
  const owned = new Set(inventory.map((i) => i.ingredientId));
  const quantities = new Map(input.items.map((i) => [i.ingredientId, i.quantity]));
  const assessment = checks(input, catalog);
  return {
    checks: assessment,
    taurineZeroAssumption: calculateBarf({ ...input, planning: undefined }, catalog)
      .taurineZeroAssumption,
    purchases: input.planning ? input.items.filter((i) => !owned.has(i.ingredientId)) : [],
    unused: inventory
      .map((i) => ({
        ingredientId: i.ingredientId,
        quantity: Math.max(0, i.quantity - (quantities.get(i.ingredientId) ?? 0)),
      }))
      .filter((i) => i.quantity > 1e-8),
    targetsMet: assessment.every(
      (c) => c.status === 'at-reference' || c.status === 'above-reference',
    ),
  };
}

/** Fit one selected set simultaneously; no absent non-taurine coefficient is imputed. */
function fit(
  input: BarfInput,
  context: BarfPlanContext,
  additions: BarfIngredient[],
  catalog: BarfCatalog,
): BarfInput | null {
  const lookup = new Map(catalog.ingredients.map((i) => [i.id, i]));
  const base = context.inventory.filter(
    (i) => i.useAll || meatCategory(lookup.get(i.ingredientId)!),
  );
  const stocks = new Map(context.inventory.map((i) => [i.ingredientId, i]));
  const selected = [...base.map((i) => lookup.get(i.ingredientId)!), ...additions];
  // Never stack full source doses of multiple complete premixes.
  if (selected.filter((i) => i.suggestion === 'premix').length > 1) return null;
  const constraints: Record<string, Constraint> = { batch: { equal: context.meatGrams } };
  const variables: Record<string, Record<string, number>> = {};
  for (const i of selected) {
    const stock = stocks.get(i.id);
    constraints[`bound:${i.id}`] = stock?.useAll
      ? { equal: stock.quantity }
      : { min: meatCategory(i) ? 0 : STEP, max: stock?.quantity ?? 100_000 };
    variables[i.id] = { [`bound:${i.id}`]: 1, batch: meatCategory(i) ? (i.gramsPerUnit ?? 0) : 0 };
  }
  for (const target of additions) {
    const key = `dose:${target.id}`;
    constraints[key] = { equal: 0 };
    for (const i of selected) {
      const value = coefficient(i, target.suggestion!, target);
      if (value === null) {
        if (stocks.get(i.id)?.useAll || additions.some((a) => a.id === i.id)) return null;
        constraints[`bound:${i.id}`] = { equal: 0 };
      } else variables[i.id]![key] = value;
    }
  }
  // Among feasible quantities, reduce source-reference shortfalls and ratio residuals.
  // Unknown objectives are omitted, then explicitly scored as unassessed below.
  const referenceRules = [
    ...barfNutrients
      .filter((n) => n.referencePerKgDay !== null && n.referencePerKgDay > 0)
      .map((n) => n.id),
    ...ratios,
  ];
  for (const rule of referenceRules) {
    const values = selected.map((i) => coefficient(i, rule));
    if (values.some((v) => v === null)) continue;
    const key = `target:${rule}`;
    const reference = barfNutrients.find((n) => n.id === rule)?.referencePerKgDay;
    const scale = Math.max(1, (context.meatGrams * (reference ?? 25)) / 25);
    constraints[key] = { equal: 0 };
    selected.forEach((i, index) => {
      variables[i.id]![key] = values[index]! / scale;
    });
    variables[`short:${rule}`] = { [key]: 1, error: 1 };
    variables[`excess:${rule}`] = { [key]: -1, error: 1 };
  }
  const solution = solve(
    { direction: 'minimize', objective: 'error', constraints, variables },
    { maxPivots: 2048, checkCycles: true },
  );
  if (solution.status !== 'optimal') return null;
  const quantities = new Map(solution.variables);
  const items = selected
    .map((i) => {
      const stock = stocks.get(i.id);
      const solved = quantities.get(i.id) ?? 0;
      const rounded = Math.round(solved / STEP) * STEP;
      return {
        ingredientId: i.id,
        quantity: stock?.useAll ? stock.quantity : Math.min(rounded, stock?.quantity ?? 100_000),
      };
    })
    .filter((i) => i.quantity >= STEP);
  const candidate = { ...input, items, planning: structuredClone(context) };
  try {
    validateBarfInput(candidate, catalog);
  } catch {
    return null;
  }
  // Recheck every dose after rounding with all products present.
  for (const target of additions) {
    const residual = items.reduce(
      (sum, item) =>
        sum +
        coefficient(lookup.get(item.ingredientId)!, target.suggestion!, target)! * item.quantity,
      0,
    );
    const tolerance = items.reduce(
      (sum, item) =>
        sum +
        (Math.abs(coefficient(lookup.get(item.ingredientId)!, target.suggestion!, target)!) *
          STEP) /
          2,
      numericTolerance,
    );
    if (!Number.isFinite(residual) || Math.abs(residual) > tolerance) return null;
  }
  return candidate;
}

/** Bounded deterministic search. A partial/no-result outcome is not an infeasibility proof. */
export function planBarf(
  input: BarfInput,
  context: BarfPlanContext,
  catalog = barfCatalog,
): BarfPlan {
  validateStock(input, context, catalog);
  const stocks = new Map(context.inventory.map((i) => [i.ingredientId, i]));
  const pool = catalog.ingredients
    .filter((i) => canPlanBarfIngredient(i) && !stocks.get(i.id)?.useAll)
    .sort(
      (a, b) =>
        Number(!stocks.has(a.id)) - Number(!stocks.has(b.id)) || a.id.localeCompare(b.id, 'en'),
    );
  const empty: BarfPlan = {
    input: null,
    status: 'no-proposal',
    checks: [],
    purchases: [],
    unused: [],
    targetsMet: false,
    checkedCombinations: 0,
    searchLimited: false,
  };
  const baseline = fit(input, context, [], catalog);
  if (!baseline) return { ...empty, checkedCombinations: 1 };
  const baselineChecks = new Map(checks(baseline, catalog).map((c) => [c.id, c]));
  type Node = {
    additions: BarfIngredient[];
    input: BarfInput;
    assessment: BarfPlanAssessment;
    score: number;
  };
  function node(additions: BarfIngredient[], proposed: BarfInput): Node {
    const assessment = assessBarfPlan(proposed, catalog);
    const score = assessment.checks.reduce((sum, current) => {
      const before = baselineChecks.get(current.id)!;
      // Losing data cannot count as correcting a deficit. Newly introduced excess
      // is a ranking penalty against the source target, not a clinical upper limit.
      if (current.status === 'missing-data')
        return sum + before.gap + (before.status === 'missing-data' ? 0 : 0.01);
      const excess = (c: BarfPlanCheck) =>
        c.status === 'above-reference' && c.actual !== null
          ? Math.max(0, c.actual / c.target - 1)
          : 0;
      return sum + current.gap + Math.max(0, excess(current) - excess(before));
    }, 0);
    return { additions, input: proposed, assessment, score };
  }
  function compare(a: Node, b: Node) {
    const complete = Number(b.assessment.targetsMet) - Number(a.assessment.targetsMet);
    if (complete) return complete;
    if (a.assessment.targetsMet && b.assessment.targetsMet)
      return (
        a.assessment.purchases.length - b.assessment.purchases.length ||
        a.additions.length - b.additions.length
      );
    return (
      a.score - b.score ||
      a.assessment.purchases.length - b.assessment.purchases.length ||
      a.additions.length - b.additions.length
    );
  }
  const initial = node([], baseline);
  let best = initial;
  let beam = [initial];
  let checked = 1;
  let limited = false;
  const seen = new Set<string>();
  const maximumDepth =
    context.mode === 'supplements'
      ? pool.length
      : Math.min(
          pool.length,
          context.inventory.filter((i) => !i.useAll).length + BARF_NEW_PRODUCT_LIMIT,
        );
  // Reserve search capacity for deeper recipes instead of spending it on brands
  // at the first few levels. This is especially important without a purchase cap.
  const beamWidth = Math.max(
    1,
    Math.min(BEAM_WIDTH, Math.floor(MAX_MODELS / Math.max(1, maximumDepth * pool.length))),
  );
  for (let depth = 0; depth < maximumDepth && beam.length && checked < MAX_MODELS; depth++) {
    const next: Node[] = [];
    for (const current of beam) {
      for (const product of pool) {
        if (checked >= MAX_MODELS) {
          limited = true;
          break;
        }
        if (current.additions.some((i) => i.id === product.id)) continue;
        const additions = [...current.additions, product].sort((a, b) =>
          a.id.localeCompare(b.id, 'en'),
        );
        if (
          context.mode === 'inventory' &&
          additions.filter((i) => !stocks.has(i.id)).length > BARF_NEW_PRODUCT_LIMIT
        )
          continue;
        const key = additions.map((i) => i.id).join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        checked++;
        const proposed = fit(input, context, additions, catalog);
        if (!proposed) continue;
        const evaluated = node(additions, proposed);
        next.push(evaluated);
        if (compare(evaluated, best) < -1e-9) best = evaluated;
      }
    }
    next.sort(compare);
    if (next.length > beamWidth || (depth === maximumDepth - 1 && next.length > 0)) limited = true;
    beam = next.slice(0, beamWidth);
    // In food-base mode every addition is a purchase; deeper sets cannot use fewer.
    if (context.mode === 'supplements' && best.assessment.targetsMet) break;
  }
  return {
    ...best.assessment,
    input: best.input,
    status: best === initial ? 'no-improvement' : 'proposal',
    checkedCombinations: checked,
    searchLimited: limited,
  };
}
