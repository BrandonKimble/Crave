# Full Data Audit — 2026-08-01

Five parallel fresh-context auditors (Opus) over the local prod mirror
(refreshed 2026-07-31, post-reload, NY knowingly ~43% rebuilt), one per
surface: restaurants, foods/ingredients, attributes/aliases,
connections/edges, pipeline health. Method: every smell verified by
pulling the raw source documents and replaying what a correct extractor
should have produced; findings marked CONFIRMED (raw text proves it) or
PLAUSIBLE. This document is the canonical record; the prompt-review cycle
and the pre-rerun fix list derive from it.

## VERDICT IN ONE LINE

The graph's arithmetic is sound (counters reconcile 0/17,901; redirects
flawless; menu-item projection 99.94%) but the PIPELINE has two active
structural defects silently corrupting scores (attribute tombstone leak,
cross-shard duplicate events), the RESTAURANT type carries ~17% junk+dupes,
and several vocabulary/taxonomy decisions need owner rulings before the
re-extraction prompt is final.

## P0 — PIPELINE DEFECTS (fix before the rerun, or it all recurs)

1. **Attribute tombstone leak** (health §4, CONFIRMED, ongoing). Archival
   writes redirects for restaurants ONLY. 1,766 archived attributes have
   no redirect; resolution keeps landing on them — 15,904 events (12.8%)
   sit on tombstones, 15,546 unreachable from the live graph; `mexican`
   (food_attribute) accumulated 1,808 events for 18h AFTER archival;
   `tex-mex` has NO active row of either type. This is also why the live
   attribute vocabulary looks strip-mined (74-76% archived). FIX: archival
   always writes a redirect (any type); resolver refuses archived rows and
   follows redirects (tombstone SINK behavior must become explicit, not
   accidental); re-point the stranded events; decide the cuisine-slot
   question (P2.1) first so events land somewhere correct.
   Plus the shard race (11 events written ~70s after a merge archived
   their target — Sway/Abgb): resolver cache must invalidate on archive.
2. **Cross-shard duplicate events** (health §3, CONFIRMED). Event
   uniqueness is keyed on extraction_run_id, so a doc extracted by 2+
   shards double-counts: 2,509 Austin docs, 23,358 duplicate-lineage
   events (14.7% of ledger), score inflation 2-4x on affected restaurants.
   FIX: delete events whose run != the doc's active run (safe — same
   prompt hash); re-key uniqueness on (source_document_id, mention_key,
   restaurant_id, entity_id, evidence_type); dedupe the shard queue.
3. **Duplicate mention rows** (connections §2, CONFIRMED). 688 excess
   rows across 467 connections — same (connection, document, kind) 2-4x;
   counters faithfully mirror the inflation (SusieCakes/dessert 6 vs 4
   true). FIX: dedupe + recompute + UNIQUE index on the triple.
4. **Active-run filter is a foot-gun** (connections §3). 4,147 superseded
   food events read as live to any consumer that forgets the join —
   the difference between 0.06% and 32% orphan rates. FIX: a view (or
   ledger hygiene at replay-activation) so the filter cannot be forgotten.
5. **Two-table event split** (health §0). Restaurant-only praise lives in
   core_restaurant_events; coverage/consumer queries reading only
   core_restaurant_entity_events under-report. AUDIT every consumer.

## P1 — DATA FIXES (mechanical, run before or with the rerun)

- Restaurants — archive ~201 non-restaurants (CPG brands from the
  frozen-pizza thread, groceries incl. Central Market=877ev/H-E-B/Costco,
  hotels, home bakers, farms, hospitals); merge ~150 duplicate pair
  clusters (Valentina's x5 = 178 fragmented events; possessive/punctuation
  splits; 33 ungrounded stubs orbiting grounded canonicals — stub often
  has MORE evidence, merges must move it); delete 5 confirmed junk
  (Ko/Php/Median + 2 out-of-market).
- Foods — merge 37 pairs (4 plural residue pre-lemma-fix, 4 word-order
  LIVE in current batch, 29 alias-name collisions); delete `jap` (slur,
  truncation of jalapeños) + `glitch` (roaster brand) + ~25 menu-format
  junk (`menu` x17, `a la carte`, `happy hour` as food, course formats,
  grocery SKUs); split `italian` (three fused referents: cuisine /
  sandwich / coffee).
- Attributes — archive the 12 occasion food_attributes (1.96% of mass,
  6.5x target; each has a correct restaurant_attribute twin) and re-point
  evidence; merge 7 duplicate restaurant_attribute rows (vegan x2 etc.);
  strip 184 machine-templated + 32 sentiment aliases; rename `frozen` →
  `frozen drink`; merge `generous portions`/`jumbo`.
- Aliases — dedupe 63 ambiguous same-type alias strings + 37 cross-type
  collisions (incl. two mutual swallows: traditional/old school,
  tiny/small; and `anniversary dinner → birthday` wrong-direction);
  enforce uniqueness (lower(alias), type) over active rows + rule that an
  alias may never equal another active entity's name. Resolver: exact
  tier must probe aliases (the 29 collision pairs prove it doesn't).
- Edges — drop ~28 bad edges (14 symmetric pairs — support-ratio tiebreak
  resolves 12 mechanically; 14 containment inversions); flag 1,424
  unflagged parent connections as is_category_item; fix 9 phantom
  connections (mentions but zero events).
- Hygiene — repoint 79 foodnyc docs off the failed run 7de1f19a; drop the
  47 dead region-us-\* docs; investigate 937 zero-event restaurants
  (13.4% of active; incl. orphaned Google artifacts).
- DONE 2026-08-01 during audit: dietary constraint_class re-flagged on
  prod (12 rows — wipe had deleted the flagged entities and re-extraction
  minted unflagged twins; the wipe script now re-asserts the set); 166
  dangling canonical_ingredients healed.

## P2 — OWNER DECISIONS (needed for the final prompt)

**2026-08-01 VERIFICATION UPDATE (read before presenting these to the
owner — three of the six changed after checking prompt+code):**

- **P2.1 cuisine DISSOLVES — no ruling needed.** The reworked prompt
  already encodes the design (§3.0(a): cuisine attaches BOTH sides,
  always; inferred from dish identity). The audit's "57% misplaced mass"
  is legacy data minted under the OLD prompt: food-side cuisine rows were
  archived by an earlier cleanup (the 11k stranded tombstone events —
  archived food_attribute 'mexican' holds 1,808 events while active
  restaurant_attribute 'mexican' holds 2,704) plus 11 cuisines minted as
  dishes. Fix = data repair aligned to the prompt design (revive or
  re-point food-side cuisine rows, delete cuisine-dishes) + rerun. NOT a
  new facet, NOT a new entity type.
- **P2.2 chains NARROWS.** Nobody chose the pinning; it's emergent:
  Places' location-biased matching works correctly but only fires at
  entity CREATION; resolution is global name-match-first, so later
  mentions from any city attach to the first-created branch (Austin
  Shake Shack praise → Manhattan-grounded entity) with no Places call.
  Narrowed ruling: make RESTAURANT resolution metro-scoped (per-metro
  chain entities, each grounded locally) — recommended; a resolver
  change, not schema. Owner has seen this framing; awaiting yes/no.
- **P2.3 dietary NARROWS to a data fix.** The both-sides design is
  legitimate testimony ("the pad thai is vegan" food-side vs "fully
  vegan place" venue-side) — do NOT derive one from the other. Real
  defect is duplicate active rows (vegan ×2 restaurant_attribute) →
  merge. Micro-rulings stand: kosher style / allergy friendly stay OUT
  of the dietary hard set; pescatarian stays IN (already flagged).
- P2.4 (edges are truth, arrays demoted to build input) recommendation
  VERIFIED and stands — concrete failure: 638 parent/child pairs
  (13.3%) where the shadow rule answers differently depending on which
  source a code path consults.
- P2.5 (provenance = ordinary food attributes) stands.
- P2.6 ($25 ungrounded-Places backfill inside the rerun campaign) still
  awaiting owner yes/no.

1. **Cuisine gets its own slot?** 57% of restaurant_attribute evidence
   mass is cuisine/category (`mexican` 2,704, `japanese` 1,924...), and
   cuisines also minted as dishes (11) and archived food_attributes with
   stranded mass. Options: dedicated cuisine facet vs blessed
   restaurant_attribute subclass. Affects tombstone re-pointing (P0.1).
2. **Chain ↔ branch model.** Chains collapse to ONE entity pinned to one
   arbitrary place id — Austin Shake Shack mentions pinned to a Manhattan
   store; 40 entities carry evidence from both cities; bare "Susie's in
   Westlake" credited to the West 6th branch. Architectural: identity
   needs (brand, branch) levels. (The old In-N-Out triplicate class is
   GONE — the defect now runs the opposite direction.)
3. **Dietary side canonicalization**: one concept, one side —
   food_attribute as the claim, `serves X` restaurant projection DERIVED
   not extracted? Also rule on `kosher style`/`allergy friendly` (must
   NOT inherit 'dietary') and whether `pescatarian` joins the ratified
   set (flagged on prod today pending ruling).
4. **food→category source of truth**: derived_food_category_edges vs
   per-connection categories[] disagree on 13.3% of shadow-rule pairs
   (638/4,800 pairs visible only via edges). Pick one; make the other a
   materialization.
5. **Sourcing/provenance class** (`local`, `organic`, `grass fed`) —
   attribute, or its own facet?
6. **Ungrounded backfill spend**: ~850 real Austin venues (31%) never
   resolved to Places — highest-ROI single fix; ~$0.028/venue AFTER the
   archive+merge passes (~$25). Approve as part of the rerun campaign?

## P3 — PROMPT RULES (the re-extraction prompt review checklist)

Extraction:

- Venue-class taxonomy with explicit reject bucket: CPG brands,
  grocery/retail, lodging, individuals/caterers, farms/producers,
  hospitals/entertainment. Landmark-plus-vendor ("taco stand inside the
  Chevron") extracts the vendor.
- Never split names on `/`; never mint acronyms/initialisms (Php);
  reject venues the text places outside the community's metro.
- Never emit bare cuisine/diet adjectives as foods; never emit
  menu-format/service-window/brand-SKU nouns as foods; decline names the
  author disclaims ("or whatever it's called").
- Recall: emit on concessive/comparative alternatives ("not the best —
  I'd give best to Garbo's"); tolerate misspelled venue names; make the
  closed-venue policy explicit.
- Attribution: a long comment naming other restaurants but not this one
  never yields a direct mention; raise the fuzzy floor in
  multi-restaurant comments (Wlderado→Eldorado class).
- Separate menu-presence from endorsement (price complaint != rec).
- Occasion/availability phrasing → restaurant_attribute, never food.
  Ban bare intensity words (rich, light, simple, old school).
  Pipeline policy:
- food_mention-alone projection: decide and apply uniformly (0% alone vs
  98% with category today).
- Category edge minting: conn_support >= 2 + minimum share of food_conns
  (81% of edges rest on support=1); near-synonyms route to aliasing.
- Meal-occasion/beverage-class/raw-ingredient entities out of dish
  ranking space; grocery vendors a distinct class (H-E-B/sauce is #5 in
  Austin today).
- Name provenance marker (vendor-mirrored vs extractor guess).

## THINGS VERIFIED HEALTHY (don't spend on these)

Counters (0 mismatches all rows), restaurant redirects (242/242 clean),
menu-item projection (0.06% orphan), multi-restaurant comment
disambiguation (20/20 connection sample correct), lemma fix (zero new
plural twins since it shipped), long food names (real menu items),
single-evidence tail (80% real — do NOT mass-prune), coverage discipline
(zero-event docs are mostly correctly-rejected chatter; ~20% recall
misses addressed by P3 recall rules).
