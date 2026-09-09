import {
  BARF_ENGINE_VERSION,
  barfCatalog,
  barfNutrients,
  calculateBarf,
  emptyBarfInput,
  snapshotBarf,
  suggestBarfQuantity,
  type BarfCatalog,
  type BarfIngredient,
  type BarfInput,
} from '@cat-care/shared';
import reference from './fixtures/barf-excel-reference.json';
import stockReference from './fixtures/barf-stock-excel.json';

function ingredient(
  id: string,
  values: Partial<BarfIngredient['nutrients']>,
  suggestion: string | null = null,
  meat = false,
): BarfIngredient {
  return {
    ...structuredClone(barfCatalog.ingredients[0]!),
    id,
    name: { en: id, pl: id },
    countsAsMeat: meat,
    suggestion,
    nutrients: {
      ...Object.fromEntries(barfNutrients.map(({ id }) => [id, 0])),
      ...values,
    } as BarfIngredient['nutrients'],
  };
}
function catalog(...ingredients: BarfIngredient[]): BarfCatalog {
  return { ...barfCatalog, ingredients };
}
const meal = (items: BarfInput['items']): BarfInput => ({
  ...emptyBarfInput(),
  title: 'Synthetic reference',
  catName: 'Test cat',
  items,
});

describe('BARF corrected 1.9c arithmetic', () => {
  it.each(reference.cases)('matches independent Excel totals and references: $name', (fixture) => {
    const result = calculateBarf({ ...meal(fixture.items), catWeightKg: fixture.catWeightKg });
    expect(result.meatGrams).toBeCloseTo(fixture.expected.meatGrams, 8);
    expect(result.knownMixtureGrams).toBeCloseTo(fixture.expected.knownMixtureGrams, 8);
    expect(result.days).toBeCloseTo(fixture.expected.days, 8);
    expect(result.dailyPortionGrams).toBeCloseTo(fixture.expected.dailyPortionGrams, 8);
    for (const { id } of barfNutrients)
      expect(result.nutrients[id].knownTotal).toBeCloseTo(fixture.expected.totals[id], 7);
    for (const [id, value] of Object.entries(fixture.expected.references))
      expect(result.nutrients[id as keyof typeof result.nutrients].reference).toBeCloseTo(value, 7);
  });

  it('imports all 261 records plus water without converting missing data into zero', () => {
    expect(barfCatalog.ingredients).toHaveLength(262);
    expect(new Set(barfCatalog.ingredients.map(({ id }) => id)).size).toBe(262);
    expect(
      barfCatalog.ingredients.filter((i) => i.category === 'meat' && i.nutrients.taurine === null),
    ).toHaveLength(51);
    expect(
      barfCatalog.ingredients.filter((i) => i.category === 'meat' && i.nutrients.taurine === 0),
    ).toHaveLength(62);
    for (const item of barfCatalog.ingredients) {
      expect(item.name.en.trim()).not.toBe('');
      expect(item.name.pl.trim()).not.toBe('');
      for (const value of Object.values(item.nutrients))
        if (value !== null) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        }
    }
  });

  it('calculates taurine from taurine, not iodine, and keeps sub-gram precision', () => {
    const meat = ingredient('meat', { taurine: 0, iodine: 60 }, null, true);
    const taurine = ingredient('taurine', { taurine: 100_000 }, 'taurine');
    const input = meal([{ ingredientId: 'meat', quantity: 1000 }]);
    expect(suggestBarfQuantity(input, 'taurine', catalog(meat, taurine)).quantity).toBe(2.4);
    input.items.push({ ingredientId: 'taurine', quantity: 2.4 });
    expect(suggestBarfQuantity(input, 'taurine', catalog(meat, taurine)).quantity).toBe(2.4);
    expect(calculateBarf(input, catalog(meat, taurine)).nutrients.taurine.knownTotal).toBe(2400);
  });

  it('includes the 32nd and subsequent ingredients in nutrient sums', () => {
    const records = Array.from({ length: 40 }, (_, i) =>
      ingredient(`meat-${i}`, { protein: i + 1 }, null, true),
    );
    const result = calculateBarf(
      meal(records.map(({ id }) => ({ ingredientId: id, quantity: 100 }))),
      catalog(...records),
    );
    expect(result.nutrients.protein.knownTotal).toBe(820);
    expect(result.knownMixtureGrams).toBe(4000);
  });

  it('tracks missing contributors while using the explicit zero assumption in totals, ratios and doses', () => {
    const meat = ingredient('meat', { taurine: null, calcium: null, phosphorus: 100 }, null, true);
    const taurine = ingredient('taurine', { taurine: 100_000 }, 'taurine');
    const input = meal([{ ingredientId: 'meat', quantity: 1000 }]);
    const result = calculateBarf(input, catalog(meat, taurine));
    expect(result.nutrients.taurine).toMatchObject({
      knownTotal: 0,
      missingIngredientIds: ['meat'],
    });
    expect(result.calciumPhosphorus).toBe(0);
    expect(result.taurineZeroAssumption).toEqual({ value: 0, ingredientIds: ['meat'] });
    expect(meat.nutrients.taurine).toBeNull();
    const calcium = ingredient('calcium', { calcium: 40_000, phosphorus: 0 }, 'calciumPhosphorus');
    expect(suggestBarfQuantity(input, 'calcium', catalog(meat, calcium)).quantity).toBe(2.875);
    expect(result.missingValuesAssumption?.nutrients).toContainEqual({
      nutrientId: 'calcium',
      ingredientIds: ['meat'],
    });
    expect(suggestBarfQuantity(input, 'taurine', catalog(meat, taurine))).toMatchObject({
      quantity: 2.4,
      missingIngredientIds: [],
      assumedZeroIngredientIds: ['meat'],
    });
  });

  it('uses potassium over sodium, and accounts for both minerals in the added salt', () => {
    const meat = ingredient('meat', { potassium: 200, sodium: 50 }, null, true);
    const salt = ingredient('salt', { sodium: 40_000, potassium: 0 }, 'potassiumSodium');
    const input = meal([{ ingredientId: 'meat', quantity: 1000 }]);
    const quantity = suggestBarfQuantity(input, 'salt', catalog(meat, salt)).quantity!;
    expect(quantity).toBeCloseTo(2.454, 3);
    input.items.push({ ingredientId: 'salt', quantity });
    expect(calculateBarf(input, catalog(meat, salt)).potassiumSodium).toBeCloseTo(1.35, 3);
  });

  it('solves calcium/phosphorus without mixing up the target ratio', () => {
    const meat = ingredient('meat', { calcium: 10, phosphorus: 100 }, null, true);
    const calcium = ingredient('calcium', { calcium: 40_000, phosphorus: 0 }, 'calciumPhosphorus');
    const input = meal([{ ingredientId: 'meat', quantity: 1000 }]);
    const quantity = suggestBarfQuantity(input, 'calcium', catalog(meat, calcium)).quantity!;
    expect(quantity).toBe(2.625);
    input.items.push({ ingredientId: 'calcium', quantity });
    expect(calculateBarf(input, catalog(meat, calcium)).calciumPhosphorus).toBeCloseTo(1.15, 10);
  });

  it('adds water to reach the original mixture moisture target', () => {
    const meat = ingredient('meat', { water: 60 }, null, true);
    const water = barfCatalog.ingredients.find((i) => i.id === 'water')!;
    const input = meal([{ ingredientId: 'meat', quantity: 1000 }]);
    expect(suggestBarfQuantity(input, 'water', catalog(meat, water)).quantity).toBe(600);
    input.items.push({ ingredientId: 'water', quantity: 600 });
    expect(calculateBarf(input, catalog(meat, water)).moisturePercent).toBe(75);
  });

  it('preserves source units for yolks, drops and capsules, without inventing their masses', () => {
    const result = calculateBarf(
      meal([
        { ingredientId: 'meat-076', quantity: 100 },
        { ingredientId: 'supplement-059', quantity: 2 },
        { ingredientId: 'supplement-052', quantity: 2 },
        { ingredientId: 'supplement-053', quantity: 1 },
      ]),
    );
    expect(result.knownMixtureGrams).toBe(132);
    expect(result.massIncomplete).toBe(true);
    expect(result.dailyPortionGrams).toBeNull();
    expect(result.nutrients.vitaminE.knownTotal).toBeCloseTo(
      272 +
        barfCatalog.ingredients.find((i) => i.id === 'meat-076')!.nutrients.vitaminE! +
        0.32 * barfCatalog.ingredients.find((i) => i.id === 'supplement-059')!.nutrients.vitaminE!,
      8,
    );
  });

  it('returns unavailable for zero denominators and never proposes a negative amount', () => {
    const meat = ingredient('meat', { taurine: 1000 }, null, true);
    const empty = ingredient('empty', {}, 'calciumPhosphorus');
    const taurine = ingredient('taurine', { taurine: 100_000 }, 'taurine');
    const input = meal([{ ingredientId: 'meat', quantity: 1000 }]);
    expect(suggestBarfQuantity(input, 'empty', catalog(meat, empty)).quantity).toBeNull();
    expect(suggestBarfQuantity(input, 'taurine', catalog(meat, taurine)).quantity).toBe(0);
    expect(calculateBarf(meal([])).days).toBeNull();
  });

  it.each([0, -1, NaN, Infinity, 100001])('rejects an invalid quantity %s', (quantity) => {
    expect(() => calculateBarf(meal([{ ingredientId: 'meat-076', quantity }]))).toThrow(
      'BARF_INVALID_QUANTITY',
    );
  });
  it('rejects unknown IDs, duplicate rows, invalid weights and stale engine versions', () => {
    expect(() => calculateBarf(meal([{ ingredientId: 'unknown', quantity: 100 }]))).toThrow(
      'BARF_UNKNOWN_INGREDIENT',
    );
    expect(() =>
      calculateBarf(
        meal([
          { ingredientId: 'water', quantity: 100 },
          { ingredientId: 'water', quantity: 100 },
        ]),
      ),
    ).toThrow('BARF_DUPLICATE_INGREDIENT');
    expect(() => calculateBarf({ ...meal([]), catWeightKg: 0 })).toThrow('BARF_INVALID_WEIGHT');
    expect(() => calculateBarf({ ...meal([]), engineVersion: 'obsolete' })).toThrow(
      'BARF_VERSION_MISMATCH',
    );
  });
  it('keeps known taurine separate from the zero assumption and preserves raw snapshot gaps', () => {
    const input = meal([
      { ingredientId: 'meat-041', quantity: 1000 },
      { ingredientId: 'meat-076', quantity: 100 },
    ]);
    const snapshot = snapshotBarf(input);
    expect(snapshot.result.nutrients.taurine.knownTotal).toBe(34);
    expect(snapshot.result.taurineZeroAssumption).toEqual({
      value: 0,
      ingredientIds: ['meat-041'],
    });
    expect(snapshot.ingredients.find((i) => i.id === 'meat-041')?.nutrients.taurine).toBeNull();
    expect(
      snapshotBarf(meal([{ ingredientId: 'meat-076', quantity: 100 }])).result.taurineZeroAssumption
        ?.ingredientIds,
    ).toEqual([]);
    const empty = ingredient('empty', { taurine: null }, 'taurine');
    const base = ingredient('base', { taurine: null }, null, true);
    expect(
      suggestBarfQuantity(
        meal([{ ingredientId: 'base', quantity: 1000 }]),
        'empty',
        catalog(base, empty),
      ).quantity,
    ).toBeNull();
  });

  it('captures versioned inputs and used data independently of later edits', () => {
    const input = meal([{ ingredientId: 'meat-076', quantity: 1000 }]);
    const snapshot = snapshotBarf(input);
    input.items[0]!.quantity = 500;
    expect(snapshot.input.items[0]!.quantity).toBe(1000);
    expect(snapshot.input.engineVersion).toBe(BARF_ENGINE_VERSION);
    expect(snapshot.ingredients).toHaveLength(1);
    expect(snapshot.result.validation).toBe('legacy-unverified');
  });
});

describe('three-meat native Excel comparison', () => {
  it.each(stockReference.cases)(
    'matches the original Excel sums, ratios and references: $name',
    (fixture) => {
      const result = calculateBarf({ ...fixture.input, planning: undefined } as BarfInput);
      for (const row of fixture.nutrients) {
        const nutrient = result.nutrients[row.id as keyof typeof result.nutrients];
        expect(nutrient.knownTotal).toBeCloseTo(row.excel, 7);
        if (row.reference !== null) expect(nutrient.reference).toBeCloseTo(row.reference, 7);
      }
      for (const row of fixture.metrics)
        expect(result[row.id as keyof typeof result]).toBeCloseTo(row.excel, 7);
    },
  );
});
