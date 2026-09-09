import {
  BARF_PLANNER_VERSION,
  barfCatalog,
  barfNutrients,
  calculateBarf,
  emptyBarfInput,
  planBarf,
  assessBarfPlan,
  snapshotBarf,
  validateBarfInput,
  canPlanBarfIngredient,
  barfFoodMass,
  type BarfCatalog,
  type BarfIngredient,
  type BarfInput,
  type BarfPlanContext,
} from '@cat-care/shared';

function product(
  id: string,
  values: Partial<BarfIngredient['nutrients']>,
  rule: string | null = null,
  meat = false,
): BarfIngredient {
  return {
    ...structuredClone(barfCatalog.ingredients[0]!),
    id,
    category: meat ? 'meat' : 'supplement',
    name: { en: id, pl: id },
    unit: 'g',
    basisQuantity: 100,
    gramsPerUnit: 1,
    countsAsMeat: meat,
    suggestion: rule,
    premixGramsPerKg: null,
    nutrients: {
      ...Object.fromEntries(barfNutrients.map((n) => [n.id, 0])),
      water: 75,
      fat: 6.25,
      ...values,
    } as BarfIngredient['nutrients'],
  };
}
const completeMeat = () =>
  product(
    'meat',
    {
      ...Object.fromEntries(
        barfNutrients
          .filter((n) => n.referencePerKgDay !== null)
          .map((n) => [n.id, n.referencePerKgDay! * 4]),
      ),
      calcium: 322,
      phosphorus: 280,
      potassium: 324,
      sodium: 240,
    },
    null,
    true,
  );
const catalog = (...ingredients: BarfIngredient[]): BarfCatalog => ({
  ...barfCatalog,
  ingredients,
});
const input = (
  items: BarfInput['items'] = [{ ingredientId: 'meat', quantity: 1000 }],
): BarfInput => ({ ...emptyBarfInput(), title: 'Synthetic planner fixture', items });
const context = (value: BarfInput, fixed = true, meatGrams = 1000): BarfPlanContext => ({
  version: BARF_PLANNER_VERSION,
  mode: 'inventory',
  meatGrams,
  inventory: value.items.map((i) => ({ ...i, useAll: fixed })),
});

describe('BARF inventory planner', () => {
  it('uses owned products first and never purchases an already owned ingredient', () => {
    const meat = completeMeat();
    meat.nutrients.taurine = 0;
    const taurine = product('taurine', { taurine: 100_000 }, 'taurine');
    const meal = input([
      { ingredientId: 'meat', quantity: 1000 },
      { ingredientId: 'taurine', quantity: 10 },
    ]);
    const stock = context(meal);
    stock.inventory[1]!.useAll = false;
    const result = planBarf(meal, stock, catalog(meat, taurine));
    // Fixture Ca/P and K/Na references differ by up to 1.25%; they are not exact optima.
    expect(Math.max(...result.checks.map((c) => c.gap))).toBeLessThan(0.015);
    expect(result.purchases).toEqual([]);
    expect(result.input!.items).toContainEqual({ ingredientId: 'taurine', quantity: 2.4 });
    expect(result.unused).toContainEqual({ ingredientId: 'taurine', quantity: 7.6 });
  });

  it.each([1, 2, 3])(
    'finds a correction requiring %i new products and rechecks their combined contributions',
    (count) => {
      const meat = completeMeat();
      const rules = ['taurine', 'iodine', 'iron'] as const;
      for (const rule of rules.slice(0, count)) meat.nutrients[rule] = 0;
      const supplements = rules
        .slice(0, count)
        .map((rule) => product(rule, { [rule]: 100_000 }, rule));
      const meal = input();
      const result = planBarf(meal, context(meal), catalog(meat, ...supplements));
      // Fixture Ca/P and K/Na references differ by up to 1.25%; they are not exact optima.
      expect(Math.max(...result.checks.map((c) => c.gap))).toBeLessThan(0.015);
      expect(result.purchases).toHaveLength(count);
      expect(assessBarfPlan(result.input!, catalog(meat, ...supplements)).checks).toEqual(
        result.checks,
      );
    },
  );

  it('prefers one multipurpose product over three products that achieve the same source targets', () => {
    const meat = completeMeat();
    meat.nutrients.taurine = meat.nutrients.iodine = meat.nutrients.iron = 0;
    const combined = product(
      'combined',
      { taurine: 100_000, iodine: 25_000, iron: 2500 },
      'taurine',
    );
    const products = ['taurine', 'iodine', 'iron'].map((rule) =>
      product(rule, { [rule]: 100_000 }, rule),
    );
    const meal = input();
    const result = planBarf(meal, context(meal), catalog(meat, combined, ...products));
    // Fixture Ca/P and K/Na references differ by up to 1.25%; they are not exact optima.
    expect(Math.max(...result.checks.map((c) => c.gap))).toBeLessThan(0.015);
    expect(result.purchases.map((p) => p.ingredientId)).toEqual(['combined']);
  });

  it('never exceeds three missing products even when four separate corrections are needed', () => {
    const meat = completeMeat();
    const rules = ['taurine', 'iodine', 'iron', 'vitaminA'] as const;
    for (const rule of rules) meat.nutrients[rule] = 0;
    const supplements = rules.map((rule) => product(rule, { [rule]: 100_000 }, rule));
    const meal = input();
    const result = planBarf(meal, context(meal), catalog(meat, ...supplements));
    expect(result.targetsMet).toBe(false);
    expect(result.purchases).toHaveLength(3);
    expect(result.checks.some((c) => c.status === 'below-reference')).toBe(true);
  });

  it('can use more than three owned supplements without counting them as purchases', () => {
    const meat = completeMeat();
    const rules = ['taurine', 'iodine', 'iron', 'vitaminA'] as const;
    for (const rule of rules) meat.nutrients[rule] = 0;
    const supplements = rules.map((rule) => product(rule, { [rule]: 100_000 }, rule));
    const meal = input([
      { ingredientId: 'meat', quantity: 1000 },
      ...rules.map((ingredientId) => ({ ingredientId, quantity: 100 })),
    ]);
    const stock = context(meal);
    stock.inventory.slice(1).forEach((i) => {
      i.useAll = false;
    });
    const result = planBarf(meal, stock, catalog(meat, ...supplements));
    expect(result.purchases).toEqual([]);
    // Fixture Ca/P and K/Na references differ by up to 1.25%; they are not exact optima.
    expect(Math.max(...result.checks.map((c) => c.gap))).toBeLessThan(0.015);
    expect(result.input!.items).toHaveLength(5);
  });

  it('rejects impossible fixed amounts and respects unlocked stock maxima and batch size', () => {
    const meat = completeMeat();
    const meal = input();
    expect(planBarf(meal, context(meal, true, 500), catalog(meat)).status).toBe('no-proposal');
    const result = planBarf(meal, context(meal, false, 500), catalog(meat));
    expect(result.input!.items).toEqual([{ ingredientId: 'meat', quantity: 500 }]);
    expect(result.unused).toEqual([{ ingredientId: 'meat', quantity: 500 }]);
    expect(planBarf(meal, context(meal, false, 1100), catalog(meat)).status).toBe('no-proposal');
  });

  it('does not silently top up an owned product beyond its stock', () => {
    const meat = completeMeat();
    meat.nutrients.taurine = 0;
    const taurine = product('taurine', { taurine: 100_000 }, 'taurine');
    const meal = input([
      { ingredientId: 'meat', quantity: 1000 },
      { ingredientId: 'taurine', quantity: 1 },
    ]);
    const stock = context(meal);
    stock.inventory[1]!.useAll = false;
    const result = planBarf(meal, stock, catalog(meat, taurine));
    expect(result.targetsMet).toBe(false);
    expect(
      result.input!.items.find((i) => i.ingredientId === 'taurine')?.quantity ?? 0,
    ).toBeLessThanOrEqual(1);
    expect(result.purchases).toEqual([]);
  });

  it('uses the all-nutrient zero assumption without rewriting source gaps', () => {
    const meat = completeMeat();
    meat.nutrients.taurine = null;
    meat.nutrients.iodine = null;
    const taurine = product('taurine', { taurine: 100_000 }, 'taurine');
    const iodine = product('iodine', { iodine: 100_000 }, 'iodine');
    const meal = input();
    const source = catalog(meat, taurine, iodine);
    const before = structuredClone(source);
    const result = planBarf(meal, context(meal), source);
    expect(result.purchases.map((i) => i.ingredientId)).toEqual(['iodine', 'taurine']);
    expect(result.taurineZeroAssumption).toEqual({ value: 0, ingredientIds: ['meat'] });
    expect(result.targetsMet).toBe(false);
    expect(result.checks.find((c) => c.id === 'iodine')).toMatchObject({
      status: 'at-reference',
      actual: 600,
      missingIngredientIds: [],
    });
    expect(calculateBarf(result.input!, source).taurineZeroAssumption?.ingredientIds).toEqual([
      'meat',
    ]);
    expect(source).toEqual(before);
  });

  it('combines supplements while treating missing cross-contributions as zero', () => {
    const meat = completeMeat();
    meat.nutrients.taurine = meat.nutrients.iodine = 0;
    const taurine = product('taurine', { taurine: 100_000, iodine: null }, 'taurine');
    const iodine = product('iodine', { iodine: 100_000 }, 'iodine');
    const meal = input();
    const result = planBarf(meal, context(meal), catalog(meat, taurine, iodine));
    expect(result.targetsMet).toBe(false);
    expect(result.purchases).toHaveLength(2);
    expect(result.missingValuesAssumption?.nutrients).toContainEqual({
      nutrientId: 'iodine',
      ingredientIds: ['taurine'],
    });
  });

  it('offers a separate food-base mode that can calculate more than three new supplements', () => {
    const meat = completeMeat();
    const rules = ['taurine', 'iodine', 'iron', 'vitaminA'] as const;
    for (const rule of rules) meat.nutrients[rule] = 0;
    const supplements = rules.map((rule) => product(rule, { [rule]: 100_000 }, rule));
    const meal = input();
    const result = planBarf(
      meal,
      { ...context(meal), mode: 'supplements' },
      catalog(meat, ...supplements),
    );
    // Fixture Ca/P and K/Na references differ by up to 1.25%; they are not exact optima.
    expect(Math.max(...result.checks.map((c) => c.gap))).toBeLessThan(0.015);
    expect(result.purchases).toHaveLength(4);
    expect(result.input!.items.find((i) => i.ingredientId === 'meat')?.quantity).toBe(1000);
    expect(() =>
      validateBarfInput(
        { ...result.input!, planning: { ...result.input!.planning!, mode: 'inventory' } },
        catalog(meat, ...supplements),
      ),
    ).toThrow('BARF_NEW_PRODUCT_LIMIT');
    const bad = input([
      { ingredientId: 'meat', quantity: 1000 },
      { ingredientId: 'taurine', quantity: 5 },
    ]);
    const stocked = { ...context(bad), mode: 'supplements' as const };
    stocked.inventory[1]!.useAll = false;
    const ownedResult = planBarf(bad, stocked, catalog(meat, ...supplements));
    expect(ownedResult.purchases.some((i) => i.ingredientId === 'taurine')).toBe(false);
    expect(ownedResult.unused.some((i) => i.ingredientId === 'taurine')).toBe(true);
  });

  it('reaches more than three additions even when many brands compete for the search budget', () => {
    const meat = completeMeat();
    const rules = ['taurine', 'iodine', 'iron', 'vitaminA'] as const;
    for (const rule of rules) meat.nutrients[rule] = 0;
    const supplements = rules.map((rule) => product(rule, { [rule]: 100_000 }, rule));
    const brands = Array.from({ length: 60 }, (_, index) =>
      product(`brand-${index}`, { taurine: 100_000 }, 'taurine'),
    );
    const meal = input();
    const result = planBarf(
      meal,
      { ...context(meal), mode: 'supplements' },
      catalog(meat, ...brands, ...supplements),
    );
    // Fixture Ca/P and K/Na references differ by up to 1.25%; they are not exact optima.
    expect(Math.max(...result.checks.map((c) => c.gap))).toBeLessThan(0.015);
    expect(result.purchases).toHaveLength(4);
    expect(result.checkedCombinations).toBeLessThanOrEqual(1200);
  });

  it('never combines multiple full-dose premixes', () => {
    const meat = completeMeat();
    meat.nutrients.taurine = 0;
    const a = product('premix-a', { taurine: 10_000 }, 'premix');
    a.premixGramsPerKg = 10;
    const b = { ...a, id: 'premix-b' };
    const meal = input();
    const result = planBarf(meal, { ...context(meal), mode: 'supplements' }, catalog(meat, a, b));
    expect(result.purchases.length).toBeLessThanOrEqual(1);
  });

  it('excludes renal premixes and fractional capsule/drop dosing from automatic choices', () => {
    const renal = barfCatalog.ingredients.find((i) => i.id === 'premix-011')!;
    expect(canPlanBarfIngredient(renal)).toBe(false);
    for (const i of barfCatalog.ingredients.filter((i) =>
      ['capsule', 'drop', 'yolk'].includes(i.unit),
    ))
      expect(canPlanBarfIngredient(i)).toBe(false);
  });

  it('validates saved planner provenance and preserves it in server-computed snapshots', () => {
    const meal = input([{ ingredientId: 'meat-041', quantity: 1000 }]);
    const proposed = { ...meal, planning: context(meal) };
    const snapshot = snapshotBarf(proposed);
    expect(snapshot.planning?.checks.find((c) => c.id === 'taurine')?.actual).toBe(0);
    expect(snapshot.result.taurineZeroAssumption?.ingredientIds).toEqual(['meat-041']);
    proposed.planning.inventory[0]!.quantity = 2000;
    expect(snapshot.input.planning?.inventory[0]?.quantity).toBe(1000);
    expect(() => validateBarfInput(proposed)).toThrow('BARF_STOCK_LIMIT');
    expect(() =>
      validateBarfInput({ ...meal, planning: { ...context(meal), version: 'old' } }),
    ).toThrow('BARF_PLANNER_VERSION_MISMATCH');
    expect(() => planBarf(meal, { ...context(meal), meatGrams: NaN })).toThrow(
      'BARF_INVALID_BATCH',
    );
  });

  it('is deterministic, finite and honestly partial on the sparse source catalog', () => {
    const meal = input([{ ingredientId: 'meat-041', quantity: 1000 }]);
    const stock = context(meal);
    const result = planBarf(meal, stock);
    expect(planBarf(meal, stock)).toEqual(result);
    expect(result.purchases.length).toBeLessThanOrEqual(3);
    expect(result.targetsMet).toBe(false);
    expect(result.checkedCombinations).toBeLessThanOrEqual(1200);
    expect(result.input!.items.every((i) => Number.isFinite(i.quantity) && i.quantity > 0)).toBe(
      true,
    );
  });
});

describe('whole-balance regression', () => {
  it('minimizes joint relative errors instead of forcing one target and doubling another', () => {
    const meat = completeMeat();
    meat.nutrients.taurine = meat.nutrients.iodine = 0;
    const combined = product('combined', { taurine: 100_000, iodine: 50_000 }, 'taurine');
    const meal = input();
    const result = planBarf(
      meal,
      { ...context(meal), mode: 'supplements' },
      catalog(meat, combined),
    );
    // Independent minimax optimum: 1 - x/2.4 = x/1.2 - 1, hence x = 1.6 grams.
    expect(result.purchases).toEqual([{ ingredientId: 'combined', quantity: 1.6 }]);
    expect(result.checks.find((c) => c.id === 'taurine')!.gap).toBeCloseTo(1 / 3, 2);
    expect(result.checks.find((c) => c.id === 'iodine')!.gap).toBeCloseTo(1 / 3, 2);
    expect(result.targetsMet).toBe(false);
  });

  it('uses zero for every missing nutrient and fills four separate gaps together', () => {
    const meat = completeMeat();
    const rules = ['taurine', 'iodine', 'iron', 'vitaminA'] as const;
    for (const rule of rules) meat.nutrients[rule] = null;
    const supplements = rules.map((rule) =>
      product(rule, { [rule]: 100_000, vitaminD: null }, rule),
    );
    const source = catalog(meat, ...supplements);
    const original = structuredClone(source);
    const meal = input();
    const result = planBarf(meal, { ...context(meal), mode: 'supplements' }, source);
    expect(result.purchases).toHaveLength(4);
    for (const rule of rules)
      expect(result.checks.find((c) => c.id === rule)!.gap).toBeLessThan(0.09);
    expect(result.checks.every((c) => c.actual !== null && c.status !== 'missing-data')).toBe(true);
    expect(source).toEqual(original);
  });

  it('never treats a large fixed excess as a fully met target', () => {
    const meat = completeMeat();
    meat.nutrients.iron = 300;
    const meal = input();
    const result = planBarf(meal, { ...context(meal), mode: 'supplements' }, catalog(meat));
    expect(result.targetsMet).toBe(false);
    expect(result.checks.find((c) => c.id === 'iron')!.gap).toBeCloseTo(49, 6);
    expect(result.input!.items).toEqual(meal.items);
  });
});

describe('catalog-wide balance regression', () => {
  it.each(['meat-041', 'meat-076'])(
    'fits the complete pool for %s without inventing excess calcium or taurine',
    (id) => {
      const meal = input([{ ingredientId: id, quantity: 1000 }]);
      const result = planBarf(meal, { ...context(meal), mode: 'supplements' });
      expect(result.status).toBe('proposal');
      expect(result.purchases.length).toBeGreaterThan(3);
      expect(
        result.purchases.every((i) => (String(i.quantity).split('.')[1]?.length ?? 0) <= 3),
      ).toBe(true);
      expect(result.checks.every((c) => c.actual !== null)).toBe(true);
      expect(result.checks.find((c) => c.id === 'taurine')!.gap).toBeLessThan(0.02);
      expect(result.checks.find((c) => c.id === 'calcium')!.gap).toBeLessThan(0.1);
      expect(result.checks.find((c) => c.id === 'iodine')!.gap).toBeLessThan(0.03);
      expect(result.input!.items.find((i) => i.ingredientId === id)!.quantity).toBe(1000);
    },
  );
});

describe('stock-first food planning', () => {
  it('reduces the three-meat case without consuming everything or overwhelming the stock with purchases', () => {
    const meal = input([
      { ingredientId: 'meat-094', quantity: 1000 },
      { ingredientId: 'meat-041', quantity: 1500 },
      { ingredientId: 'meat-153', quantity: 500 },
    ]);
    const stock = { ...context(meal, false, 3000), mode: 'supplements' as const };
    const before = structuredClone({ meal, stock });
    const result = planBarf(meal, stock);
    expect(result.status).toBe('proposal');
    expect(result.targetsMet).toBe(false);
    expect(Math.max(...result.checks.map((c) => c.gap))).toBeLessThan(1.04);
    expect(result.unused).toContainEqual({ ingredientId: 'meat-094', quantity: 1000 });
    expect(result.unused).toContainEqual({ ingredientId: 'meat-153', quantity: 500 });
    expect(result.input!.items).toContainEqual({ ingredientId: 'meat-041', quantity: 1500 });
    const foodMass = (items: BarfInput['items']) =>
      items.reduce(
        (sum, item) =>
          sum +
          item.quantity *
            barfFoodMass(barfCatalog.ingredients.find((i) => i.id === item.ingredientId)!),
        0,
      );
    expect(foodMass(result.purchases)).toBeLessThanOrEqual(750.01);
    expect(
      result.purchases.some(
        (i) => barfCatalog.ingredients.find((p) => p.id === i.ingredientId)!.category === 'meat',
      ),
    ).toBe(true);
    expect(calculateBarf(result.input!).knownMixtureGrams).toBeLessThan(5000);
    expect(() => validateBarfInput(result.input!)).not.toThrow();
    expect({ meal, stock }).toEqual(before);
    expect(planBarf(meal, stock)).toEqual(result);
  });

  it('rejects a forged food purchase allowance, including water counted as stock', () => {
    const meal = input([
      { ingredientId: 'meat-041', quantity: 1000 },
      { ingredientId: 'water', quantity: 5000 },
    ]);
    const stock = { ...context(meal, false), mode: 'supplements' as const };
    const forged = {
      ...meal,
      items: [...meal.items, { ingredientId: 'meat-094', quantity: 501 }],
      planning: { ...stock, meatGrams: 1501 },
    };
    expect(() => validateBarfInput(forged)).toThrow('BARF_FOOD_PURCHASE_LIMIT');
    forged.items[2]!.quantity = 500;
    forged.planning.meatGrams = 1500;
    expect(() => validateBarfInput(forged)).not.toThrow();
  });

  it('preserves saved v2 provenance but requires the current version for a new search', () => {
    const meal = input([{ ingredientId: 'meat-041', quantity: 1000 }]);
    const old = { ...context(meal), mode: 'supplements' as const, version: 'barf-balance-v2' };
    expect(() => validateBarfInput({ ...meal, planning: old })).not.toThrow();
    expect(snapshotBarf({ ...meal, planning: old }).input.planning).toEqual(old);
    expect(() => planBarf(meal, old)).toThrow('BARF_PLANNER_VERSION_MISMATCH');
    old.inventory[0]!.useAll = false;
    expect(() => validateBarfInput({ ...meal, planning: old })).toThrow('BARF_BASE_FOODS_ONLY');
  });
});
