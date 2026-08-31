# WHY THIS MATCHED — implementation report (2026-08-30)

Owner-ratified spec: explain by affinity, never by deficit; exact matches show
NOTHING; one quiet chip per card; page-level friendly line when starved words
queued an on-demand hunt. All server changes are ADDITIVE — the pooled
execution, admission, and ordering are untouched.

## Wire contract (additive)

`packages/shared/src/types/search.ts`:

```ts
type MatchExplainKind = 'partial' | 'similar' | 'contains';
interface MatchExplain {
  kind: MatchExplainKind;
  terms: string[];      // the USER'S display words (originalText preferred)
  widened?: boolean;    // contains only: ingredient stand-ins were welcome
  basis?: 'evidence' | 'derived';
  // contains only (owner ruling 2026-08-30: never promise what we
  // inferred). 'evidence' = the TESTIMONY arm matched (a human wrote the
  // ingredient — c.ingredients); 'derived' = our own derivation
  // (synthesized canon / name-twin). Copy asserts only on 'evidence'.
}
// ItemResult.matchExplain?: MatchExplain   — absent on exact rows, always
// PlaceResult.matchExplain?: MatchExplain  — absent on exact rows, always

interface SearchNotice { kind: 'starved_on_demand'; terms: string[] }
// SearchResponseMetadata.searchNotice?: SearchNotice
//   set ONLY when starved words exist AND onDemandQueued — the client
//   renders one friendly line from it.
```

Derivation inputs per row (all pre-existing or additive):

- dish rows: `match_tier` (0/1/2/NULL), `food_attributes`, and the CTE's
  `place_attributes_arr` (already selected; now typed on `DishQueryRow`).
- restaurant rows: `match_tier` plus ONE new selected column,
  `matched_soft_concept_tokens` — per soft concept `'<id>'` when the row
  satisfies it through an anchor arm, `'<id>:w'` when only through a judged
  widening arm, NULL otherwise. Same per-concept expressions the tier CASE
  and the rswc_N starvation windows already evaluate; display-only.
- `ConceptConstraint.widenedArms?` (additive metadata): `widenConceptArms`
  now records which arms entered through satisfies widening, so the explain
  layer can tell "matched the asked word" from "matched its judged neighbor".
  Membership SQL never reads it.

Derivation (`apps/api/src/modules/search/match-explain.ts`, pure):

| row fact | kind | terms |
|---|---|---|
| `match_tier = 2` (dense-sibling / judged-cousin ring) | `similar` | the asked subject word |
| soft concept satisfied ONLY via a widening arm (any tier) | `similar` | that concept's asked word |
| ingredient ask + dish name lacks the ingredient word | `contains` | the asked ingredient word(s) (+`widened` when ingredient widening ran) |
| `match_tier = 1` with nameable matched words | `partial` | the words the row DID match |
| `match_tier = 0` / NULL, none of the above | — | ABSENT (exact says nothing) |

## Chip priority rationale (similar > contains > partial)

Priority is resolved SERVER-side so the client renders at most one chip with
zero logic. `similar` wins because it flags a different-thing admission — the
one case where silence would actively mislead ("why is a pub #1 for 'bar'?").
`contains` beats `partial` because it explains the row's IDENTITY (this dish
has your ingredient even though its name doesn't say so), while `partial` only
qualifies coverage of modifier words. `partial` is last and positively framed:
it names the words that DID match; a tier-1 row with nothing nameable shows
nothing (deficit reports are banned by the design principle).

## Copy table (one strings map: `apps/mobile/src/screens/Search/match-explain-strings.ts`)

| key | when | copy |
|---|---|---|
| similar | widened-arm / ring row | `Close match for '{word}'` |
| similarNoWord | no resolvable word | `Close match` |
| contains | basis=evidence | `Has '{word}' in it` |
| containsDerived | basis=derived/absent | `May have '{word}' in it` |
| containsWidened | evidence + widening | `Made with '{word}' or a close cousin` |
| containsWidenedDerived | derived + widening | `May have '{word}' (or a close cousin) in it` |
| partial | tier-1 matched words | `Matches '{word}' [and '{word2}']` |
| starvedNotice | starved + queued | `Nothing here mentions '{word}' yet — we're on the lookout. Showing closest matches.` |

Basis → verb mapping (owner copy ruling): only human testimony may assert
("Has X in it"); the synthesized-canon and name-twin arms hedge ("May have
X in it"), and an ABSENT basis (older server) hedges too — the safe default
is never to promise. The per-row fact is one additive selected column on
the dish CTE, `ingredient_evidence_match` = the testimony arm's own
overlap predicate (`c.ingredients && <asked ∪ widened ids>`), evaluated on
already-admitted rows only.

Chips render as one quiet muted pill (`styles.matchExplainChip`, gray-100
bg / gray-500 text — the same hush as the existing `similarMatchLabel`
caption, which stays as the fallback for widened rows the server didn't
explain, e.g. the Include-similar union-prefetch siblings). The starved
notice rides the EXISTING on-demand notice surface
(`on-demand-notice-copy.ts` — empty-state block and results-list footer):
when `metadata.searchNotice` is present it takes precedence over the generic
growing-coverage paragraph. Deviation from spec noted below (§ open
concerns): the spec sketched the banner "once at top"; the app's established
notice choreography renders it in the footer when results exist, and moving
it into the list-header transport (the toggle-strip machinery) was judged
too invasive for this territory. Owner call whether to relocate.

## Files

Server (additive):
- `packages/shared/src/types/search.ts`, `packages/shared/src/index.ts` — wire types
- `apps/api/src/modules/search/search-execution-directives.ts` — `widenedArms?`
- `apps/api/src/modules/search/concept-membership.compiler.ts` — records widened arms
- `apps/api/src/modules/search/search-query.builder.ts` — `matched_soft_concept_tokens` column (place query, both CTE branches, pooled only)
- `apps/api/src/modules/search/search-query.executor.ts` — row typing + per-row derivation during mapping
- `apps/api/src/modules/search/search.service.ts` — builds `MatchExplainContext` in `executePooledStage`; sets `metadata.searchNotice`
- `apps/api/src/modules/search/match-explain.ts` (+ `.spec.ts`, 19 tests)

Mobile:
- `apps/mobile/src/types/search.ts` — re-exports
- `apps/mobile/src/screens/Search/match-explain-strings.ts` (+ `.spec.ts`, 9 tests) — THE strings map
- `apps/mobile/src/screens/Search/styles.ts` — `matchExplainChip` styles
- `apps/mobile/src/components/cards/ResultCard/DishResultCard.tsx`, `RestaurantResultCard.tsx` — one chip per card
- `apps/mobile/src/screens/Search/runtime/shared/on-demand-notice-copy.ts` — starved line precedence

## Test results

- `apps/api` match-explain.spec.ts: 21/21 green (each kind, priority, exact→absent, evidence/derived basis, wire shape).
- `apps/api` full search-module suite: 33 suites / 217 tests green (no pooled-gate or byte-shape regressions).
- `apps/api` `yarn build` green; `yarn invariants`: 43 invariants / 88 proofs green.
- `apps/mobile` match-explain-strings.spec.ts (12 tests, incl. the basis→copy mapping) + search-on-demand-notice.spec.ts: green; `tsc --noEmit` green; eslint green (2 pre-existing warnings untouched).

## Live wire verification (real searches, real data)

Environment: local API (this build) against the local dev DB. The local DB's
derived layer was found EMPTY (core_restaurant_items = 0, core_restaurant_locations
= 0 — every search returned zero); repaired via the real rebuild path
(`scripts/why-matched-rebuild.ts` — mirrors FullProjectionRebuildRunner, 3,131
places → 8,836 items), a Crave Score rebuild, and an FK-filtered restore of
core_restaurant_locations from the staging dump (SELECT-only against staging;
9,814 rows). Staging's judged widening edges (174 attribute/ingredient
satisfies rows) were seeded locally tagged `prompt_version=999`
(`DELETE FROM entity_satisfies WHERE prompt_version=999` removes them).

Probe: `apps/api/scripts/why-matched-probe.ts` (boots the real AppModule,
runs `runNaturalQuery` over the Austin viewport). Full output:
`apps/api/logs/why-matched/wire-verification.txt`. Verdicts, all confirmed
on the wire:

- **exact → NOTHING**: "pizza" — every row `exactMatch=true`, `matchExplain` absent.
- **partial**: "bar pizza" — tier-1 rows carry `{kind:'partial', terms:['pizza']}` on both dish and restaurant rows (the restaurant side proves the new `matched_soft_concept_tokens` column flows).
- **similar (widening arm)**: "bar food wings" — chicken tenders / karaage admitted through the judged `bar food → pub` arm carry `{kind:'similar', terms:['bar food']}`.
- **contains, evidence vs derived**: "bacon" — burger @ P. Terry's `{kind:'contains', terms:['bacon'], basis:'evidence'}`; goyim burger @ Jewboy Burgers `basis:'derived'`; bacon-named dishes stay silent.
- **starved notice**: "cozy pizza" → `metadata.searchNotice = {kind:'starved_on_demand', terms:['cozy']}` with `onDemandQueued=true`.

## On-device visuals — BLOCKED by a pre-existing defect

The simulator pass (local API, signed in via the Clerk dev-instance test
user, Austin viewport) hit a blocker: submitting any search updates the
sheet header + map reveal, but the sheet BODY never swaps from the home
curated content to the results list. **Reproduced with this change fully
stashed** (clean tree, full re-bundle, cold relaunch, "pizza") — it is not
a regression from this work. Metro shows the resolve landing
(`[RESOLVE] cause: initial_submit, tier: network`) and the map reveal
starting but `revealSettled: null` — consistent with the redraw-fence /
strip-choreography items already on the owner's punchlist ("strip/
choreography still bad, skeleton never seen"). Until that is fixed, the
four requested screenshots (similar chip, contains chip, starved banner,
exact-silent page) cannot be captured; the wire facts above are the
verification of record, and the chip render path is covered by the
component-level strings specs + tsc/lint.

## Open concerns

1. **Banner position**: spec said "once at top"; shipped on the app's existing
   on-demand notice surface (footer when results exist, empty-state block when
   none). Relocating means threading a row/header through the scene-stack list
   transport — owner call.
2. **Hard-wall widening (attribute-only queries)** has no per-row explain: the
   widened ids merge into plain membership overlap lists and `match_tier` is
   NULL there. Explaining those rows needs a per-row column on the hard path —
   deliberately not added (additive-only territory).
3. **Ingredient attribution is query-level, not row-level**: with ingredient
   widening active we cannot say per row whether it holds bacon or pancetta,
   so the copy honestly hedges ("or a close cousin"). Row-level attribution
   needs the containment SQL to emit which ingredient id matched.
4. **Localization**: chip copy is English-only in the strings map; the N10
   localization rail does not yet cover it.
5. **Results-sheet body defect (pre-existing)**: search results never replace
   the home sheet body in the current dev environment (reproduced on a clean
   tree). Blocks all on-device visual verification of this feature; owner's
   choreography punchlist territory.
6. **Local dev environment left as**: local API on :3000 running THIS build;
   sim target = local; derived tables repaired; 174 staging widening edges
   seeded (tagged prompt_version=999). Temporary scripts
   `apps/api/scripts/why-matched-probe.ts` / `why-matched-rebuild.ts` are
   uncommitted and deletable once this report is accepted.
