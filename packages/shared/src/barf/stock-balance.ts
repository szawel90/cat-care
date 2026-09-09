import { solve, type Constraint, type Solution } from 'yalps';
import {
  barfNutrients,
  type BarfCatalog,
  type BarfIngredient,
  type BarfInput,
  type BarfNutrientId,
} from './index';
import {
  assessBarfPlan,
  barfFoodMass,
  BARF_PURCHASED_FOOD_RATIO,
  canPlanBarfIngredient,
  isBarfBaseFood,
  type BarfPlan,
  type BarfPlanContext,
} from './planner';

/** Known-mass foods can be purchased as well as gram-based supplements. */
export function canPlanBarfFood(i: BarfIngredient): boolean {
  return isBarfBaseFood(i) && i.unit === 'g' && i.gramsPerUnit === 1;
}

const precision = 1e-8;
const round = (value: number) => Number(value.toFixed(3));
const amount = (i: BarfIngredient, id: BarfNutrientId) =>
  ((i.nutrients[id] ?? 0) * (i.unit === 'yolk' ? 16 : 1)) / i.basisQuantity;
const meatMass = (i: BarfIngredient) => (i.countsAsMeat ? (i.gramsPerUnit ?? 0) : 0);

interface Target {
  id: string;
  scale: number;
  actual: (i: BarfIngredient) => number;
  reference: (i: BarfIngredient) => number;
}

function targets(): Target[] {
  return [
    ...barfNutrients
      .filter((n) => n.referencePerKgDay !== null && n.referencePerKgDay > 0)
      .map((n) => ({
        id: n.id,
        scale: (1000 / 25) * n.referencePerKgDay!,
        actual: (i: BarfIngredient) => amount(i, n.id),
        reference: (i: BarfIngredient) => (meatMass(i) / 25) * n.referencePerKgDay!,
      })),
    {
      id: 'calciumPhosphorus',
      scale: 3220,
      actual: (i: BarfIngredient) => amount(i, 'calcium'),
      reference: (i: BarfIngredient) => 1.15 * amount(i, 'phosphorus'),
    },
    {
      id: 'potassiumSodium',
      scale: 3240,
      actual: (i: BarfIngredient) => amount(i, 'potassium'),
      reference: (i: BarfIngredient) => 1.35 * amount(i, 'sodium'),
    },
    {
      id: 'water',
      scale: 750,
      actual: (i: BarfIngredient) => amount(i, 'water'),
      reference: (i: BarfIngredient) => 0.75 * (i.gramsPerUnit ?? 0),
    },
    {
      id: 'fat',
      scale: 62.5,
      actual: (i: BarfIngredient) => amount(i, 'fat'),
      reference: (i: BarfIngredient) => 0.25 * ((i.gramsPerUnit ?? 0) - amount(i, 'water')),
    },
  ];
}

interface Search {
  limited: boolean;
  models: number;
}

/** Solve composition first, then scale to available stocks without forcing every product to be used. */
function fitStock(
  input: BarfInput,
  context: BarfPlanContext,
  selected: BarfIngredient[],
  catalog: BarfCatalog,
  search: Search,
  refine = false,
): BarfInput | null {
  const stock = new Map(context.inventory.map((i) => [i.ingredientId, i]));
  const rules = targets();
  const scales = new Map(
    selected.map((i) => [
      i.id,
      Math.min(
        1000,
        1 /
          Math.max(
            0.001,
            ...rules.map(
              (r) => Math.max(Math.abs(r.actual(i)), Math.abs(r.reference(i))) / r.scale,
            ),
          ),
      ),
    ]),
  );
  const cuts = new Map(rules.map((r) => [r.id, [0, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]]));
  const run = (
    gap: number,
    objective: 'purchase' | 'error' | 'batch',
    errorBound?: number,
    batchBound?: number,
  ): Solution => {
    search.models++;
    const constraints: Record<string, Constraint> = {
      ownedMeat: { equal: 1 },
      foodPurchase: { max: 0 },
      totalMeat: { max: 0 },
      ...(errorBound === undefined ? {} : { errorBound: { max: errorBound } }),
      ...(batchBound === undefined ? {} : { batchBound: { max: batchBound } }),
    };
    const variables: Record<string, Record<string, number>> = {
      scale: { batch: 1, totalMeat: -1, ...(batchBound === undefined ? {} : { batchBound: 1 }) },
    };
    const premix = selected.find((i) => i.suggestion === 'premix');
    if (premix) constraints.premix = { max: 0 };
    for (const rule of rules) {
      constraints[`above:${rule.id}`] = { max: 0 };
      constraints[`below:${rule.id}`] = { max: 0 };
      constraints[`residual:${rule.id}`] = { equal: 0 };
      for (const [prefix, sign] of [
        ['short', 1],
        ['excess', -1],
      ] as const) {
        variables[`${prefix}:${rule.id}`] = {
          [`residual:${rule.id}`]: sign,
          error: 1,
          ...(errorBound === undefined ? {} : { errorBound: 1 }),
        };
      }
    }
    for (const i of selected) {
      const factor = scales.get(i.id)!;
      const owned = stock.get(i.id);
      const key = `stock:${i.id}`;
      constraints[key] = owned?.useAll ? { equal: 0 } : { max: 0 };
      variables.scale![key] = -1;
      const values: Record<string, number> = {
        foodPurchase: (factor * barfFoodMass(i) * (owned ? -BARF_PURCHASED_FOOD_RATIO : 1)) / 1000,
        [key]: factor / (owned?.quantity ?? 100_000),
        ownedMeat: owned && i.category === 'meat' ? (factor * (i.gramsPerUnit ?? 0)) / 1000 : 0,
        totalMeat: i.category === 'meat' ? (factor * (i.gramsPerUnit ?? 0)) / 100_000 : 0,
        purchase: owned ? 0 : (factor * (i.gramsPerUnit ?? 0)) / 1000,
      };
      if (premix)
        values.premix =
          factor * ((i.id === premix.id ? 1 : 0) - (meatMass(i) * premix.premixGramsPerKg!) / 1000);
      for (const rule of rules) {
        const actual = (factor * rule.actual(i)) / rule.scale;
        const reference = (factor * rule.reference(i)) / rule.scale;
        values[`above:${rule.id}`] = actual - (1 + gap) * reference;
        values[`below:${rule.id}`] = (1 - gap) * reference - actual;
        values[`residual:${rule.id}`] = actual - reference;
      }
      variables[i.id] = values;
    }
    if (refine && objective === 'error') {
      for (const rule of rules) {
        variables[`short:${rule.id}`]!.error = 0;
        variables[`excess:${rule.id}`]!.error = 0;
        variables[`loss:${rule.id}`] = { error: 1 };
        cuts.get(rule.id)!.forEach((point, index) => {
          const key = `square:${rule.id}:${index}`;
          constraints[key] = { max: point * point };
          variables[`short:${rule.id}`]![key] = 2 * point;
          variables[`excess:${rule.id}`]![key] = 2 * point;
          variables[`loss:${rule.id}`]![key] = -1;
        });
      }
    }
    return solve(
      { direction: 'minimize', objective, constraints, variables },
      { precision, maxPivots: 32768, checkCycles: true },
    );
  };
  let low = 0;
  let high = Math.max(
    1,
    ...assessBarfPlan({ ...input, planning: undefined }, catalog).checks.map((c) => c.gap),
  );
  let feasible = run(high, 'purchase');
  if (feasible.status !== 'optimal') {
    search.limited = true;
    return null;
  }
  for (let step = 0; step < 21 && high - low > 0.000002; step++) {
    const middle = (high + low) / 2;
    const candidate = run(middle, 'purchase');
    if (candidate.status === 'optimal') {
      high = middle;
      feasible = candidate;
    } else if (candidate.status === 'infeasible') low = middle;
    else {
      search.limited = true;
      break;
    }
  }
  // These tolerances concern solver precision, not an acceptable nutritional range.
  let bestError = run(high + 0.000002, 'error');
  if (refine && bestError.status === 'optimal') {
    let bestLoss = Infinity;
    let converged = false;
    for (let iteration = 0; iteration < 32; iteration++) {
      const values = new Map(bestError.variables);
      const errors = rules.map((r) => ({
        id: r.id,
        value: (values.get(`short:${r.id}`) ?? 0) + (values.get(`excess:${r.id}`) ?? 0),
      }));
      const loss = errors.reduce((sum, r) => sum + r.value ** 2, 0);
      if (loss < bestLoss) {
        bestLoss = loss;
        feasible = bestError;
      }
      if (loss - bestError.result <= 1e-6 * Math.max(1, loss)) {
        converged = true;
        break;
      }
      for (const r of errors) cuts.get(r.id)!.push(r.value);
      bestError = run(high + 0.000002, 'error');
      if (bestError.status !== 'optimal') break;
    }
    if (!converged) search.limited = true;
  } else if (bestError.status === 'optimal') {
    feasible = bestError;
    const bestBatch = run(high + 0.000002, 'batch', bestError.result + 0.00001);
    if (bestBatch.status === 'optimal') {
      feasible = bestBatch;
      const simple = run(
        high + 0.000002,
        'purchase',
        bestError.result + 0.00001,
        bestBatch.result * (1 + 1e-6),
      );
      if (simple.status === 'optimal') feasible = simple;
      else search.limited = true;
    } else search.limited = true;
  } else search.limited = true;
  const quantities = new Map(feasible.variables);
  const scaling = Math.max(
    ...context.inventory.map(
      (item) =>
        ((quantities.get(item.ingredientId) ?? 0) * (scales.get(item.ingredientId) ?? 0)) /
        item.quantity,
    ),
    ...selected
      .filter((i) => !stock.has(i.id))
      .map((i) => ((quantities.get(i.id) ?? 0) * scales.get(i.id)!) / 100_000),
    selected.reduce(
      (sum, i) =>
        sum + (i.category === 'meat' ? (quantities.get(i.id) ?? 0) * scales.get(i.id)! : 0),
      0,
    ) / 100_000,
  );
  if (!Number.isFinite(scaling) || scaling <= 0) return null;
  const items = selected
    .map((i) => {
      const owned = stock.get(i.id);
      const quantity = owned?.useAll
        ? owned.quantity
        : Math.min(
            owned?.quantity ?? 100_000,
            round(((quantities.get(i.id) ?? 0) * scales.get(i.id)!) / scaling),
          );
      return { ingredientId: i.id, quantity };
    })
    .filter((i) => i.quantity >= 0.001);
  const lookup = new Map(selected.map((i) => [i.id, i]));
  const meatGrams = items.reduce(
    (sum, i) =>
      sum +
      (lookup.get(i.ingredientId)!.category === 'meat'
        ? i.quantity * (lookup.get(i.ingredientId)!.gramsPerUnit ?? 0)
        : 0),
    0,
  );
  const result = { ...input, items, planning: { ...structuredClone(context), meatGrams } };
  try {
    assessBarfPlan(result, catalog);
  } catch {
    search.limited = true;
    return null;
  }
  return result;
}

function compare(a: BarfInput, b: BarfInput, catalog: BarfCatalog) {
  const x = assessBarfPlan(a, catalog),
    y = assessBarfPlan(b, catalog);
  const worst = Math.max(...x.checks.map((c) => c.gap)) - Math.max(...y.checks.map((c) => c.gap));
  if (Math.abs(worst) > 0.00002) return worst;
  const remaining =
    x.checks.reduce((sum, c) => sum + c.gap ** 2, 0) -
    y.checks.reduce((sum, c) => sum + c.gap ** 2, 0);
  if (Math.abs(remaining) > 0.00002) return remaining;
  return x.purchases.length - y.purchases.length || a.items.length - b.items.length;
}

export function planBarfStock(
  input: BarfInput,
  context: BarfPlanContext,
  catalog: BarfCatalog,
): BarfPlan {
  const search: Search = { limited: false, models: 0 };
  const stockIds = new Set(context.inventory.map((i) => i.ingredientId));
  const owned = context.inventory.map((i) =>
    catalog.ingredients.find((p) => p.id === i.ingredientId)!,
  );
  const ordered = catalog.ingredients
    .filter((i) => !stockIds.has(i.id) && (canPlanBarfIngredient(i) || canPlanBarfFood(i)))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  // Equivalent unowned brands do not need separate variables; source records remain unchanged.
  const fingerprints = new Set<string>();
  const pool = ordered.filter((i) => {
    const key = JSON.stringify([
      i.category,
      i.countsAsMeat,
      i.unit,
      i.suggestion,
      i.premixGramsPerKg,
      i.nutrients,
    ]);
    if (fingerprints.has(key)) return false;
    fingerprints.add(key);
    return true;
  });
  const foods = pool.filter((i) => canPlanBarfFood(i) && i.suggestion !== 'premix');
  const supplements = pool.filter((i) => !canPlanBarfFood(i) && i.suggestion !== 'premix');
  const premixes = pool.filter((i) => i.suggestion === 'premix');
  const candidates: BarfInput[] = [];
  // Start with food proportions, then complete that food choice with targeted supplements.
  const foodOnly = fitStock(input, context, [...owned, ...foods], catalog, search);
  if (foodOnly) candidates.push(foodOnly);
  const selectedFoodIds = new Set(foodOnly?.items.map((i) => i.ingredientId));
  const preferredFoods = foods.filter((i) => selectedFoodIds.has(i.id));
  const groups = preferredFoods.length === foods.length ? [foods] : [preferredFoods, foods];
  for (const group of groups) {
    for (const premix of [undefined, ...premixes]) {
      if (owned.some((i) => i.suggestion === 'premix') && premix) continue;
      const candidate = fitStock(
        input,
        context,
        [...owned, ...group, ...supplements, ...(premix ? [premix] : [])],
        catalog,
        search,
      );
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => compare(a, b, catalog));
  let best = candidates[0];
  if (best) {
    const chosen = new Set(best.items.map((i) => i.ingredientId));
    const refined = fitStock(
      input,
      context,
      [...owned, ...pool.filter((i) => i.suggestion !== 'premix' || chosen.has(i.id))],
      catalog,
      search,
      true,
    );
    if (refined && compare(refined, best, catalog) < 0) best = refined;
  }
  // Remove numerical dust only when every reported deviation stays within 0.01 percentage points.
  // This is a simplification tolerance, not an acceptable nutrient interval.
  if (best) {
    for (const item of [...best.items]
      .filter((i) => !stockIds.has(i.ingredientId))
      .sort((a, b) => a.quantity - b.quantity)) {
      const current: BarfInput = best!;
      const items = current.items.filter((i) => i.ingredientId !== item.ingredientId);
      const meatGrams = items.reduce(
        (sum, i) =>
          sum +
          (catalog.ingredients.find((p) => p.id === i.ingredientId)!.category === 'meat'
            ? i.quantity
            : 0),
        0,
      );
      const simpler: BarfInput = {
        ...current,
        items,
        planning: { ...current.planning!, meatGrams },
      };
      try {
        const before = assessBarfPlan(current, catalog),
          after = assessBarfPlan(simpler, catalog);
        if (
          Math.max(...after.checks.map((c) => c.gap)) <=
            Math.max(...before.checks.map((c) => c.gap)) + 0.00002 &&
          after.checks.every((c, n) => c.actual !== null && c.gap <= before.checks[n]!.gap + 0.0001)
        )
          best = simpler;
      } catch {
        /* Removing a product must not break stock or batch constraints. */
      }
    }
  }
  if (!best)
    return {
      input: null,
      status: 'no-proposal',
      checks: [],
      purchases: [],
      unused: [],
      targetsMet: false,
      checkedCombinations: search.models,
      searchLimited: true,
    };
  return {
    ...assessBarfPlan(best, catalog),
    input: best,
    status: 'proposal',
    checkedCombinations: search.models,
    searchLimited: search.limited,
  };
}
