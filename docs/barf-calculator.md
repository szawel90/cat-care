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
3. **Food base + calculated supplements**: meat, fish, liver, yolks and other food
   ingredients stay at the entered quantities. Automatic additions do not have
   the three-product purchase limit. Pre-entered supplements prevent calculation
   until removed or handled in the inventory workflow; switching never deletes them.

Both planners retain the meat-based 1.9c reference model. Fish alone does not provide
its required meat denominator. Fractional capsule/drop dosing and renal premixes are
excluded from automatic choices. Multiple full-dose premixes cannot be combined.
Automatic gram quantities have 0.001-unit arithmetic precision; this does not establish
the practical measurement precision of every product.

YALPS 0.6.4 (MIT) fits quantities under stock bounds and fixed base amounts.
Planner v2 has two separate search strategies:

- **Inventory** retains bounded candidate search (at most 1,200 combinations and an
  adaptive beam up to 12) and simultaneous source dose rules, with no more than three
  new products. Missing nutrient contributions now count as zero in every equation.
- **Food base** considers all eligible gram-based additions together. It enumerates
  the no-premix case and each single premix, with a premix bounded by its source dose.
  Individual supplement dose rules no longer force exact equations: the objective
  minimizes the sum of squared normalized residuals across **all 31 available targets**.
  Deficits and excesses both contribute; an excess never counts as an exact match.
  Only equally good nutrient results may prefer a smaller maximum residual or fewer
  ingredients. There is no stop after one corrected deficit or three additions.

Nutrient residuals are normalized by their reference for the fixed entered meat batch.
Ratio residuals use fixed batch scales (Ca:P and K:Na denominator reference amounts;
water 75% of batch mass; fat 25% of the assumed 25% dry batch mass). This puts g, mg,
micrograms and IU on comparable scales and prevents water dilution of the objective.
The displayed percentage deviations use the actual final reference/ratio; they are
distinct from this fixed normalization used during optimization. Added fats still
affect final references under the unchanged 1.9c model.

The convex squared objective is solved through successively refined tangent bounds,
with a 32-iteration cap and a relative/absolute objective gap of 1e-7. Fixed base foods
are eliminated into RHS constants for numerical stability. A solver/iteration limit
is disclosed; a bounded result is a closest found working proposal, not a proof of
global optimum or infeasibility. After rounding quantities to 0.001 units, stock
constraints and the complete balance are recomputed. Inventory dose equations are
also rechecked. The original source targets have small internal disagreements (e.g.
80/70 versus Ca:P 1.15), so exact simultaneous matches are not always possible.

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
