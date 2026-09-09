# BARF recipe calculator

The signed-in `/barf` workspace adapts the Excel 1.9c calculator into a responsive
English/Polish recipe editor. It uses the existing account, theme and localization
infrastructure. Cat name and weight are recipe inputs in this increment; a link to
cat profiles will be integrated separately.

## Calculation and source data

`@cat-care/shared` provides the catalog, arithmetic, suggestions and snapshot types.
The browser calculates previews locally. The API independently recalculates every
saved recipe from validated ingredient IDs and quantities, never client totals.

The initial catalog has 261 source records plus water and 35 nutrient columns.
Each record retains its source sheet, row, original name, reported source label,
units and missing values. English ingredient names are translations of the source
labels. Product names do not assert that a current formulation still matches the
imported data. The initial catalog remains `legacy-unverified`.

The source model uses 25 g of meat per kg of cat weight per day. The source includes
added fats in meat weight, but excludes separately added liver, fish and yolk. The
mixture's nutrient references equal meat grams / 25 × the source daily reference.
These are source reference values, not newly selected clinical limits. Portions
are derived from this model, not from individualized energy requirements.

Nutrients use the source per-100-g basis except vitamin E capsule/drop records,
which are per unit. A source yolk is 16 g. Missing capsule/drop masses prevent a
complete portion/mass/moisture result; the known mass remains visible.

Every blank/error value stays `null` in source data. Engine v3 explicitly counts
every missing nutrient contribution as zero. Snapshots retain the policy and the
affected nutrient/product IDs in `missingValuesAssumption`; numeric totals, ratios,
suggestions, print and shopping lists use and disclose the assumption. This is not
a measured absence. Historical v1/v2 snapshots remain unchanged; copying uses v3.
Missing mass conversions or zero denominators cannot produce a finite ratio or dose.
No result is labeled as a verified complete diet, and no disease-specific prescription
is generated. Nutrients without a source target are totaled but no target is invented.

## Deliberate differences from 1.9c

- Taurine suggestions use taurine, fixing the recalculation macro's iodine-row reference.
- All selected ingredients contribute, including beyond the source's 31-column sum.
- Nutrients are mapped by identifier, avoiding the vitamin E macro's shifted mineral rows.
- Potassium:sodium is named in the direction used by the source salt calculation.
- Suggestion quantities retain 0.001-unit precision instead of the legacy varying
  one-decimal/whole-gram rounding. Intermediate arithmetic is not rounded.
- Suggestions replace the existing amount of that ingredient. They are recalculated
  against the other current ingredients and require an explicit user action to apply.
- Nonfinite/negative inputs, unknown IDs, duplicates, unsupported versions and zero
  denominators cannot silently produce a saved calculation or an invalid suggestion.
- Missing nutrient values are assumed zero; source gaps and unknown capsule/drop masses remain preserved.

Suggestions preserve the source's individual nutrient, Ca:P 1.15, K:Na 1.35,
75% moisture, 25% dry-matter fat, yeast and premix arithmetic. They do not solve
all nutrient constraints simultaneously by themselves. Each accepted change recomputes
the balance. The planner below fits the selected source rules together.

## Three workflows

The selector at the top of the editor provides:

1. **Manual balance**: enter a recipe and inspect its calculated totals.
2. **My products + up to 3 additions**: entered quantities are stock maxima, with
   per-product fixed amounts. Meat defaults to fixed. Unlocked meat quantities can
   be allocated to a smaller meat batch. Owned supplements may be omitted or reduced;
   an owned product is never silently topped up beyond its stock. At most three
   distinct products outside the stock may be added.
3. **Recipe from my stock + supplements**: entered foods and supported gram-based
   supplements are available maxima. Quantities are flexible by default; users can
   lock a quantity. Unused food is retained in the stock breakdown. New food purchases
   are capped at **50% of food actually used from stock**. Food classification includes
   meat, fish, fat, vegetables, liver and yolks; water and supplements do not count
   toward either side of this allowance. This mode has no three-product limit.

Both planners retain the meat-based 1.9c reference model, including added fats.
Fish alone does not provide the required meat denominator. Automatic choices exclude
fractional capsules/drops, unknown unit masses and renal premixes. A known-mass yolk
can be kept at a fixed input quantity. Multiple premixes cannot be combined.

Planner `barf-balance-v3` uses YALPS 0.6.4 (MIT). Historical v2 provenance remains valid
under its original fixed-base rules; new searches require v3.

- **Inventory** retains the source dose equations and bounded candidate search
  (at most 1,200 combinations, adaptive beam up to 12, at most three new products).
- **Stock recipe** first fits food proportions, then considers targeted supplements
  with the selected and full food pools. The no-premix case and each single eligible
  premix are compared. Premix quantity is capped by its source dose.
- The first objective minimizes the **largest actual relative deviation** across
  all 31 targets, using bisection over linear feasibility constraints. A nutrient
  reference depends on the resulting source meat mass, and ratio denominators depend
  on the mixture. Added water cannot dilute nutrient errors.
- Composition is normalized to 1 kg of owned meat for numerical conditioning, then
  scaled to the largest batch fitting the stock. No owned quantity is exceeded; at
  least one available stock limit is reached. Food purchases remain within 50%.
- Within the best found maximum deviation, refine other targets together through
  squared normalized residuals, with iterative tangent bounds (up to 32 refinements,
  objective gap 1e-6). Secondary ratio residuals use the documented reference scales;
  displayed deviations always use actual final ratios. Fewer products break ties.
- Numerical simplification may remove a purchase only if no reported deviation grows
  by more than 0.01 percentage points and the maximum grows by at most 0.002 points
  per removal. These are numerical search tolerances, not nutritional safe ranges.

Quantities are rounded to 0.001 units and all totals, ratios, stock bounds and purchase
allowances are revalidated. This is arithmetic precision, not a claim that every
product can practically be measured to that precision. Numerical/search limits are
shown; a partial search does not prove global optimality or infeasibility.
The original source has conflicting targets, including Ca:P 80/70 versus 1.15 and
K:Na 1.35 in the salt macro versus 1.50 displayed in the original Analiza sheet.

The regression stock is 1,000 g pork neck, 1,500 g turkey breast and 500 g chicken
hearts, with no supplements owned. Native Microsoft Excel replays both the original
three-meat input and the proposed recipe, comparing 35 totals, references and six
mass/ratio metrics. The synthetic oracle fixture is committed; the workbook is private.
This case still has material deviations. Missing data assumed zero also affects food
selection, so numerical agreement does not establish nutritional completeness.

References remain comparison targets, not verified safe minima, maxima or clinical
optima. Missing numeric contributions count as zero; undefined ratios from zero
denominators remain undefined. Every shortfall and excess stays visible. Even an
exact match remains a **working proposal** based on source data and assumptions.

The worker keeps the search off the browser's main thread. Edits invalidate an old
proposal and terminate its worker. Applying a proposal opens it in manual balance
with a stock/purchase breakdown. Saving preserves the planning mode, stock and fixed
amounts in the input snapshot. The API validates them and computes the assessment;
it never accepts a client claim that the recipe is balanced. Later manual ingredient
edits detach the old planning provenance instead of mislabeling a changed recipe.

## Persistence and access

Recipes belong to an authenticated, admitted pilot account. Updates append immutable
revisions containing inputs, computed results and the exact ingredient data used.
The head version is updated atomically; a concurrent stale write returns 409.
History is read-only. Copying creates a distinct recipe with the current engine/data.
Archiving appends a withdrawn revision and preserves previous snapshots. Account
export includes all recipe revisions and favorites; account deletion cascades to them.
Every endpoint enforces ownership and pilot access, and mutations check the origin.
Private responses use `Cache-Control: no-store`; recipes are not stored in localStorage.

The editor offers ingredient search, categories, account favorites, editable quantities,
explicit suggestions, live balance, revision history, copying, archiving, printing and
a plain-text shopping list. The source model and data gaps accompany saved/printed output.

## Verification

The reference fixture contains synthetic recipes calculated independently in Microsoft
Excel using the source workbook's BIFF formulas and source ingredient cells, with macros
disabled and no saved changes to the original. Tests compare all nutrient known totals,
reference values, mixture mass, duration and portion quantities. Fixtures are arithmetic
comparisons, not feeding recommendations or evidence of clinical validation.

Additional regression tests cover taurine, >31 ingredients, unit conversion, missing data,
ratios, water, invalid values and versioned snapshots. Integration tests cover real
sessions, owner isolation, origin checks, conflicts, history, export, revocation and
cascading deletion. Storybook exercises production controls with synthetic callbacks.
Playwright covers persistence, errors, copies, history, EN/PL, both themes and reflow.

Before publishing, run the repository's full local CI-equivalent checks. GitHub Actions
remains the second required stage. Nutrition/source validation is a separate review.
