# Attribute Merge System — active-vocabulary dedupe-merge lane

Owner directive (2026-08-29): attributes have no post-hoc merge lane —
"killer atmosphere" / "dope atmosphere" / "great ambience" / "great
ambiance" live as 4 entities. Not a cleanup: a SYSTEM, LLM-prompt-driven,
asynchronous, batched, in the house judge-lane style. Built 2026-08-29;
this doc is the derivation, the rulings, and the dry-run results.

## What already existed (the study's key finding)

The vocabulary is NOT unmanaged — `AttributeOntologyService`
(attribute-ontology module) already adjudicates PENDING terms against the
active ontology (embedding shortlist + `attribute-placement-prompt.md`,
promote/merge/reject/rename, debounced Bull worker after collection). The
hole is precise: **two synonyms that both went ACTIVE are never compared
again.** Placement only ever compares pending→active; and its apply path
lacks entity_redirects, user-anchor rehome, event-substrate rekey, and
verdict memory. The new lane closes exactly that hole and reuses the
ontology module's proven parts rather than duplicating them.

## The system

`AttributeDedupeMergeService` (attribute-ontology module), the food-dedupe
architecture applied to attributes:

- **Candidate generation** — meaning-first, because string similarity is
  proven insufficient ("killer atmosphere"/"great ambience"). Over the LIVE
  vocabulary per type (status='active', **facet='cuisine' excluded** — the
  cuisine system owns that identity), union of three recall signals
  mirroring the placement shortlist's measured design: embedding top-K
  neighborhood per attribute (K=10), shared significant token (the
  ontology's measured ≥3-char floor), trigram-Jaccard ≥ the measured 0.4
  floor. Pairs deduped on the sorted id pair, cosine-ranked; per-run
  hearing cap (default 500) truncates the least-similar.
- **Judge** — NEW prompt `attribute-merge-prompt.md`: THE ONE-INTENTION
  TEST — do the two names make the same claim such that a diner filtering
  by either would want the other's evidence, in BOTH directions. Batched
  (40 pairs/request, `LLMService.judgeAttributeMergesBatch`, caller
  `attribute.merge_batch`, FLASH tier — merge stakes, never lite). Fails
  closed to reasonless 'keep'; a reasonless verdict is never recorded.
- **Verdict memory** — the hearing ledger (`claim_verdicts`), lane
  `attribute_merge`, sorted-pair claim key
  (attribute-merge-lane.adapter.ts), rule version derived from the prompt
  text's fingerprint (attribute-merge-rule.ts, v1 = 5e79585de61c).
  Verdict-then-effect; 'hold' rows make rejections free forever; a rule
  bump is the only re-opener; crash-resume replays the STORED plan.
- **Merge execution** — one transaction: identity advisory locks (same
  namespace as creation), every registered reference site repointed via
  THE shared implementation (`repointAttributeIdRefs`, extracted from
  applyPlan into attribute-reference-registry.ts so both merge paths run
  one code path — arrays with DISTINCT collapse, evidence ledger folded on
  its composite PK), user anchors hard-rekeyed
  (EntityAnchorRehomeService), entity-event substrate rekeyed (a
  projection rebuild can never resurrect the loser), then
  `finalizeMergeCompletion` — surfaces folded as tagged aliases, loser
  archived (never deleted), scores pruned, entity_redirects written and
  chain-flattened. Idempotent by state (archived loser ⇒ no-op).
- **Async/batched wiring** — `runSweep()` (resume pending, then both
  vocabularies) behind `ATTRIBUTE_MERGE_JUDGE_ENABLED`, ready for the
  scheduler but **not cron-registered** (owner sequences activation).
  Operator runner: `scripts/attribute-dedupe-merge.ts` — dry-run default,
  `--sample=N` preview verdicts, `--apply` to hear/record/merge (source
  'certification').

## Rulings made (each pinned by a gold case, both sides where contested)

1. **Strength tiers merge.** "good atmosphere" = "great" = "killer" =
   "dope". Derivation: the ideal spec's aspect-praise canon ("atmosphere is
   killer" → `great atmosphere`) and the placement prompt's precedent
   (`good value` = `great value`). A diner never runs separate searches for
   good-vs-great versions of one quality; splitting them splits one claim's
   evidence. Counter-boundary kept: measured steps a diner picks on purpose
   ("spicy" vs "extra spicy") are positions on a descriptive axis, not
   praise, and stay separate.
2. **cheap folds into affordable.** The ideal spec's value canon:
   `affordable` IS the value token ("good value" wording folds in; "not
   break the bank" licenses affordable). Polarity absolute: "expensive"
   never merges.
3. **A specific quality is not a tier of a generic one.** "romantic" ≠
   "great atmosphere"; "rooftop" ≠ "outdoor seating"; "cozy" ≠ "great
   ambiance". Interchangeability fails one way, so keep.
4. **Survivor selection.** Owner-canon spellings (`affordable`, `great
   atmosphere` — the names the collection prompt anchors evidence to) win
   their pair unconditionally; otherwise more references (counted over the
   SAME registry the repoint iterates); ties to the shorter name.
   **SUPERSEDED 2026-08-30 (sameness court, owner-overruled): NO canonical
   dictionary — the pinned set is deleted. Survivor = more references,
   tie → shorter/plainer, always; aliases preserve every spelling. See
   plans/sameness-court-report.md.**
5. **Cuisine facet out of scope**; `amenity` and `venue_kind` facets are IN
   (only cuisine was excluded by the directive) — see open question 2.
6. **Dry-run previews are not hearings.** `--sample` judges without
   recording: verdict-then-effect is the recording law, and a remembered
   'merge' with no effect would strand a pending plan for a resume to
   execute unasked.

## Certification

`scripts/attribute-merge-gold.ts` + `scripts/fixtures/attribute-merge-gold-cases.json`
— 18 cases (10 merge / 8 keep), every contested boundary pinned both
sides. Run 2026-08-29, `--repeat=3`: **ALL 18 CASES PASS ×3** (prompt v1,
fingerprint 5e79585de61c). Re-certify (and bump attribute-merge-rule.ts)
before any prompt edit reaches an apply run.

Tests: `attribute-dedupe-merge.spec.ts` (pair key symmetry, survivor
rules, rule-version resolution) and
`attribute-merge-pair.integration.spec.ts` (real-Postgres merge execution:
array repoint w/ DISTINCT collapse, evidence PK fold summing observations,
archive, redirect, idempotent replay). `yarn build`, targeted jest, and
`yarn invariants` (83 proofs) all green; the quote-mirror invariant now
carries the new schema↔prompt pairing.

## Dry run against staging (2026-08-29, read-only + ~12 judge calls ≈ cents)

- Live vocabulary: 408 active place_attribute (87 cuisine-facet excluded →
  321 in scope + 2 unfaceted), 134 active item_attribute.
- **Candidate docket: 2,493 place pairs, 941 item pairs** (full K=10
  docket; the 500/run cap + ledger memory drain it across runs — at 40
  pairs/call that is ~63 + ~24 judge calls total, one-time, then only new
  vocabulary is ever heard).
- **Preview verdicts, 120 pairs/type (240 total): 27 place merges, 7 item
  merges, rest keep.** Merge examples the first apply would execute:
  cocktails+serves cocktails+cocktail bar, brunch+brunch restaurant+serves
  brunch, coffee roaster+roastery, cafe+coffee shop, all-you-can-eat+buffet,
  dried+dry, sugar free+unsweet. Keep examples (correctly refused):
  brewery vs brewpub, irish pub vs pub, raw vegan vs vegan, mezcal bar vs
  tequila bar, breakfast vs brunch.
- **The owner's founding examples did not appear** because on staging
  "killer/dope atmosphere" are status='rehearsal' and "great
  ambiance/ambience" are 'pending' — the v17 shadow's vocabulary. The lane
  deliberately scopes to ACTIVE rows (the shadow-vocabulary law); those
  twins become its docket the moment v17 activates / placement promotes
  them. The prompt's handling of the family is gold-certified regardless.

## What the first real run would do

`ts-node scripts/attribute-dedupe-merge.ts --apply` (staging first): hear
the full docket in ~87 batched calls, record every verdict, execute
judge-approved merges with redirects. From the 240-pair sample, expect
roughly a 10–20% merge rate ⇒ on the order of 300–500 merges across both
vocabularies — but see the questions below before pulling the trigger.

## Open owner questions

1. **A few sampled merge verdicts look aggressive**: 'bar'+'pub',
   'modern'+'trendy', 'kebab shop'+'shawarma', 'citrus'+'lemony',
   'fudgy'+'gooey', 'grass fed'+'pasture raised', 'deli'+'sandwich shop'.
   Defensible under the ONE-INTENTION test, but each collapses a filter a
   picky diner might distinguish. If any offend, they become gold KEEP
   cases and the prompt gets a v2 bump before the first apply.
2. **Should venue_kind facet rows be in scope at all?** Most aggressive
   verdicts above are venue kinds (bar/pub/deli/cafe). The directive
   excluded only cuisine; excluding venue_kind too would shrink the docket
   and the risk.
3. **Timing**: run the first apply before or after v17 activation? After
   catches the atmosphere/ambiance family in the same drain.
4. **applyPlan's own merge path** (pending→active) still archives without
   writing entity_redirects or rehoming anchors. Pending rows rarely carry
   anchors, but unifying it onto `executeMergePlan` is a natural follow-up.
5. **Scheduling**: wire `runSweep()` to the nightly window (behind
   `ATTRIBUTE_MERGE_JUDGE_ENABLED`) once the first supervised drain looks
   right.
