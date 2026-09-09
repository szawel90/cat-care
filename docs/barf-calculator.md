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

Every blank/error value stays `null`, with the affected ingredient IDs attached to
the nutrient result. An explicit source zero stays zero, without claiming laboratory
verification. Totals with missing contributions are labeled known subtotals.
Automatic quantity suggestions are unavailable when their required source inputs
are missing. Other nutrient gaps still appear in the balance. No result is labeled
as a verified complete diet, and no disease-specific prescription is generated.

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
- Missing values and capsule/drop masses remain visible uncertainties.

Suggestions preserve the source's individual nutrient, Ca:P 1.15, K:Na 1.35,
75% moisture, 25% dry-matter fat, yeast and premix arithmetic. They do not solve
all nutrient constraints simultaneously. Each accepted change recomputes the balance.

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
