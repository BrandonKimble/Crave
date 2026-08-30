# Venue-cuisine evidence lanes (D5) — design, measurement, dry run

2026-08-30. Implements ideal-architecture.md D5: the two missing venue-cuisine
evidence sources. Code uncommitted; nothing applied to staging (dry-run only).

## What was built

Both lanes are **deterministic** (no LLM), write **evidence rows** into
`core_restaurant_attribute_evidence` with their own `source_class`, and never
touch `restaurant_attributes` directly — the one-writer projection
(`derivePlaceAttributes`) stays the only column writer.

- `apps/api/src/modules/restaurant-enrichment/venue-cuisine-evidence.service.ts`
  — `VenueCuisineEvidenceService.reconcile()`: recompute-from-state, diff
  against the lane's own rows (insert/delete/update only what changed),
  re-project changed places. Idempotent; scoped or corpus-wide.
- **Lane `dish_set`**: per restaurant, over active non-category connections
  whose dish carries `knowledge_cuisines` (the canonical dish-side home), a
  cuisine is claimed when it covers a **majority (> 0.5)** of the
  cuisine-attributed connections with **>= 2** distinct supporting
  connections (`observations` = support count).
- **Lane `venue_name`**: a cuisine-vocab word at a word boundary in the
  venue's name (the exact matcher the 2026-08-29 measurement certified),
  one row per (place, cuisine). Only write-time gate: a Google-grounded
  place whose types are ALL non-food (museum, park) makes no kitchen claim.
- **Projection vote** (`place-attribute-projection.ts`): `venue_name` rows
  are votes, not facts. A name claim projects iff **corroborated** (any
  other source class asserts the same attribute) or **unopposed** (no other
  source names ANY cuisine for the place AND no product-counter venue-kind
  evidence — bakery/dessert/coffee family, classified in
  `PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES` in google-place-type-attributes.ts).
  No word list over names: the homographs lose by vote from Google's own
  venue-kind evidence, exactly as the owner ruled.
- Nightly rail: new `venue-cuisine-evidence` phase in
  `nightly-convergence.service.ts`, right after `knowledge-cuisine-projection`
  (so it reads freshly converged dish knowledge). Deterministic and free, so
  like the grain bridge it runs regardless of LLM flags. No new cron.
- Backfill runner: `apps/api/scripts/backfill-venue-cuisine-evidence.ts` —
  **dry-run default**, `--apply` gated; prints counts, the dish-set share
  distribution, and per-row projection verdicts.

## The vote rule, derived from measurement (staging, read-only, 2026-08-30)

689 (place, cuisine) name-match pairs across 623 active places, bucketed by
the evidence they actually carry:

| bucket | pairs | verdict |
|---|---|---|
| corroborated by another source's same-cuisine row | 409 | project |
| contrary cuisine evidence (other cuisines, not this one) | 138 | outvote |
| no cuisine evidence, but product-counter venue kind | ~63 | outvote |
| only generic `restaurant` kind, no cuisine | 18 | project |
| no evidence at all (mostly ungrounded) | 61 | project |

Hand-check against the measurement's 13 known-wrong homographs: **11/13
correctly outvoted** on staging data — Texas French Bread, Go Greek Yogurt,
Great American Cookies, Jeremiah's Italian Ice, The Great British Baking
Company, All American Bagel, Culture Yogurt (product-counter vote); French
Quarter Grille, Roman's, MEXICAN DOGGIS, Tocabe (contrary-cuisine vote).
Residual wrong: **Western Yunnan Crossing Bridge Noodle** ("western",
noodle/soup venue kinds don't oppose) and **Spaghetti Western** (ungrounded,
no evidence at all) — 2 places, same residual the measurement already priced.
The honest side stays alive: Truth BBQ and the ~25 `* BBQ` barbecue joints
project, Chaba Thai / Lafuentes Mexican Restaurant (ungrounded, name-only)
project.

The trap the measurement missed and this work caught: **"National Museum of
African American History and Culture"** is an active place matching two
cuisine words with zero evidence rows — hence the write-time non-food-venue
gate (its stored Google types are all noise per the one-authority type map).

## Dish-set threshold provenance (no-fake-estimates)

The plan called for measuring the share-of-praised-dishes distribution on
staging and choosing the threshold from it. **Measured result: the
distribution is EMPTY.** `core_entities.knowledge_cuisines` has zero
populated rows on staging AND local — every dish stamp is knowledge v1; the
v2 cuisine widening (dish-knowledge-rule.ts) re-opened the whole population
and its backfill has not run. (The grain bridge is likewise unprojected:
`cuisine_projection_version` is NULL on all 7,905 connections; the single
cuisine id in any `food_attributes` array corpus-wide is 1.)

So no data-derived cutoff exists to choose. The shipped constants are
**principle-derived, not estimated**: majority (> 0.5 of what the kitchen is
praised for — the only scale-free line) and min support 2 (the same support
floor `derived_food_category_edges` already uses before a per-mention claim
becomes a concept fact). The backfill runner prints the real share
distribution on every dry run; **re-confirm the constants against it once
the v2 knowledge backfill lands** (the lane then populates in the same
nightly pass, no further work).

## Dry-run counts (staging, nothing applied)

- Name lane: 689 matched pairs, 10 skipped as non-food venues, **679
  evidence rows would be inserted across 614 places** (0 deletes — the
  class is empty today).
- Projection verdicts over those 679: **409 projected (corroborated)** —
  no user-visible change, the cuisine is already there; **109 projected
  (unopposed)** — the net-new win class, real cuisine knowledge that exists
  nowhere else (Chaba Thai, Lafuentes, the `* Bbq` trailers); **138 + 23
  outvoted** (contrary cuisine / product-counter venue) — written but never
  projected, including every measured homograph.
- Dish-set lane: **0 rows** (see above — activates with the v2 backfill).

## Tests

- `venue-cuisine-evidence.spec.ts` (unit, 14 green): matcher boundaries,
  regex escaping, museum gate, threshold math, product-set hygiene against
  the one-authority map.
- `venue-cuisine-lanes.integration.spec.ts` (Postgres, 9 green): Texas
  French Bread outvoted while bakery projects; contrary-cuisine outvote;
  corroborated + unopposed-ungrounded project; museum gate writes nothing;
  vocabulary-drop retraction; dish-set majority + idempotency (second run
  diffs to zero); **recombination** — dish-set evidence corroborates a name
  claim a product venue would otherwise outvote; dry run writes nothing.
- Neighboring proofs re-run green: knowledge-cuisine-adjudication (K1/K2),
  all restaurant-enrichment specs, cuisine-dual-projection.

## Open questions

1. **Refinement suppressed as contradiction.** "A+A Sichuan China" (Google:
   chinese) loses `sichuan`; `bbq` at korean-evidence venues loses too. The
   name is often the finer, better signal there, but admitting it needs a
   cuisine-hierarchy or surface-fold corroboration notion the substrate
   doesn't have. Conservative v1; revisit if a hierarchy ever exists.
2. **Honest product-venue names lose.** Poseidon Greek Bakery, the Italian
   bakeries/ices, Chez Zee American Bistro (carries a bakery kind) — ~15-20
   true tags suppressed to kill 8 homographs. Accepted per the ruling that
   the homograph must never win; a "tradition-bakery" carve-out would be a
   judgment call for the owner.
3. **Residual wrong (2 places)**: Western Yunnan Crossing Bridge Noodle,
   Spaghetti Western. Same product/homograph grammar the measurement deemed
   an acceptable 2%-of-undeterminables tail.
4. **Backfill `--apply` timing**: iteration-phase rules say staging-only and
   nothing was applied. When the owner wants it live, run the script with
   `--apply` (or just let the nightly phase do it — same code path).
5. Pre-existing red unrelated to this work (other agents' in-flight D1/D4
   changes): `yarn build` fails in restaurant-name-census / knowledge-
   maintenance specs; `yarn invariants` reports gemini-gateway-lockdown and
   check-entity-type-literals failing on the current tree (stale 'food'
   literal in invariants/registry.ts). My files compile and lint clean.
