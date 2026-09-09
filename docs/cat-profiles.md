# Cat profiles and observation portraits

A signed-in owner can create a cat with only a name, optionally upload a photo, and complete seven profile areas over time. The account page lists cat cards; the centered header picker always offers another cat. Creating a profile opens that profile without starting an interview.

Cats may share a household or belong to separate households. Explicitly choosing a housemate reuses household facts and physical environment details. Individual behavior, access limitations, health and preferences remain specific to the cat. Declared animal counts include animals without profiles: registration alone must not count the same animal twice. Archiving a profile preserves its household membership; a household move is a separate action.

## Observation rules

The `cat-portrait-draft-1` rules produce nine coordinates from at most 18 base questions, or 16 without an observable other-cat relationship, and at most two clarification slots per observation. The rules and short questionnaire are an authored research draft, not a validated psychometric or diagnostic instrument. No language model calculates scores or fills missing answers.

Behavioral responses map to 0–4. Unknown, unobserved, context-dependent and deferred responses have distinct meanings and do not become zero. A pair differing by at most one point is averaged; larger differences remain a range without a fabricated midpoint. Single indicators are explicitly preliminary. Household associations can prevent a context-independent position; spatial preferences require real alternatives and calm rest. Relationship coordinates concern the same identified other cat, not an aggregate household personality.

The interface shows nine scales and four two-dimensional intersections. Points, ranges and missing positions remain distinct. A short summary is derived from entered profile data and eligible rule-based descriptions. A changed context is flagged without recalculating historical results.

Deferred answers remain directly accessible in the profile. Answering within the original period creates a new revision. Later observations start a new period and do not copy behavioral answers. Only confirmed household context may prefill Q02. Editing prerequisite answers invalidates dependent current responses while preserving earlier revisions. Previously used clarification slots remain spent after a correction.

## Versioned domain data

`Cat` and `Household` hold identity, current pointers and lifecycle metadata. `CatVersion`, `HouseholdVersion` and `PortraitRevision` preserve collected payloads. Changes append records inside transactions and update only previous-version flags and timestamps. Compare-and-swap version checks reject lost updates with HTTP 409. Observation dates are separate from recording dates; results retain the rule version and household snapshot used to produce them.

Cat archival is reversible. The existing permanent account-deletion process cascades through all owned history and photos. Account export includes all domain versions. Every endpoint authenticates the owner, verifies ownership and uses `no-store`; writes require the trusted origin. Photos are size-limited, decoded and re-encoded to strip attached metadata, and served through authenticated routes.

The same append-version pattern applies to future important domain records. Operational account credentials and sessions continue to follow the existing authentication lifecycle.

## Verification

The test suite includes offline-reference scoring fixtures, missing and contradictory evidence, conditional routing, household reuse, ownership boundaries, concurrent updates, photo validation, immutable history, archive/restore and account-deletion cascades. Browser tests exercise creation, deferred responses, corrections, intersections, household changes and historical views. Storybook covers picker and portrait states with keyboard and accessibility checks at desktop and mobile sizes. These checks do not validate behavioral accuracy or establish full accessibility conformance.
