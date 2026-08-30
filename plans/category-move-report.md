# D4 category move — implementation report (2026-08-30)

Dish→category derivation moved from the collection prompt (per-mention,
60.3% self-disagreement) to the dish-knowledge system (once per dish
concept, ledgered). Owner-blessed on the evidence in
plans/category-and-knowledge-split-study.md; shape per
plans/ideal-architecture.md D4. Everything below is uncommitted.

---

## 1. Knowledge side — the `categories` facet (v4)

**Derivation reasoning.** Category membership passed every test the
cuisines facet passed in S4: it is derived from the dish NAME alone (C.3
step 3 already said "even when unstated" — world knowledge computed in the
wrong place, N times), it is a fact about the concept (the same dish
landing in 10 different category sets across 19 mentions was the smoking
gun), and the projection/ledger rails already existed. So it lands as the
fourth facet on the exact cuisine rails:

- **Prompt** (dish-knowledge-prompt.md §4): full rederivation of C.3's
  good rules in the house style. THE PREDICTION TEST is now this prompt's
  test (removed from the collection prompt's roster). Encoded laws:
  peel + head-noun parents INCLUDED ("cheese fries" → `fries` — the
  529-missing-parent class closes at the source), composition overrides
  the inner word ("ice cream sandwich" is no sandwich; "soup dumplings"
  never `soup`), never a tradition (that answer belongs to `cuisines`;
  the bbq two-facedness gets its written sentence: orderable sense only),
  never an ingredient ("eggplant parm" never `eggplant`), never a
  food-predicting-nothing wrapper ("tasting menu", "combo", "lunch").
  Fail direction flipped deliberately vs cuisines: for categories **a
  wrong parent is the expensive error** (it surfaces the dish under a tap
  it disappoints and the old reconciliation laundered exactly that).
- **Schema** (DISH_KNOWLEDGE_RESPONSE_JSON_SCHEMA): `categories` added,
  required; description quote-mirrors the prompt (check green).
- **Parser** (llm.service.ts): categories cleaned + capped at 5; sync and
  pooled paths share the one assembly as before.
- **Ledger** (dish-knowledge-rule.ts): **v4, fingerprint e4dec514f61b** —
  re-opens every prior stamp (the whole population owes a category
  hearing; rides the pending v2/v3 cuisine backfill).
- **Service** (dish-knowledge-synthesis.service.ts): new
  `ensureCategoryEntity` — resolves each class word onto THE canonical
  active ITEM entity (name / identity_key / banked surface, fold both
  sides; oldest row wins), REFUSES any word the active cuisine vocabulary
  claims (write-time twin of the never-a-tradition law — the 19-edge
  cuisine leak cannot recur even on a bad emission), refuses
  self-parenting, and mints an active item for a never-seen class (the
  same self-provisioning the per-mention route did, now once per concept;
  items have no unique identity constraint — fold lookup + the
  food-dedupe sweep own twin healing, as everywhere else).
- **Storage**: `core_entities.knowledge_categories uuid[]` (migration
  `20260830120000_knowledge_categories`, plain ADD COLUMN, no rewrite,
  applied locally with `migrate deploy`).

## 2. Projection design — who feeds derived edges now

`derived_food_category_edges` keeps its table, its consumers (search
category expansion, teaser lists, satisfies rung-2 — all fail-open), its
two-writer law and its advisory lock. Only the derivation SQL changed
(food-category-edge-sql.ts, shared verbatim by the incremental and the
nightly full-replace writers):

- **Source**: `unnest(core_entities.knowledge_categories)` for active item
  entities — no longer the per-connection `categories` arrays.
- **Liveness**: edges mint only for foods with ≥1 live (mention_count>0)
  connection; conn_support = food_conns = that count (knowledge is one
  opinion; no reader consumes the counts — verified by grep).
- **Retired**: the ≥2-or-unanimity support threshold (reconciliation of
  noise has no noise left to reconcile) and the symmetric-pair arbitration.
- **Kept**: containment-inversion filter; **added**: active-item-target
  guard (K2-analog — a merge-archived category id lingering in
  knowledge_categories mints nothing until the dish's next hearing).
- The edge builder's alert INPUT is now "active dishes with a non-empty
  knowledge_categories facet and a live connection" — so the pre-backfill
  window reads as no-input (benign), not as a zero-output outage.

No grain bridge needed (edges live at food grain already). Per-connection
`core_restaurant_items.categories` becomes legacy: still rebuilt from
historical evidence events, read by nothing search-facing. The
projection-rebuild support-crediting and category-card phases still read
historical `food_category` evidence; new extractions simply stop minting
such events (see §6, consequences).

**Fate of the search workaround** (search.service.ts:466, name-containment
failsafe): **kept, retirement deferred to a post-backfill measurement.**
The knowledge facet closes the miss class that motivated it (head-noun
parents are now first-class — the gold suite pins cheese-fries→fries),
but the failsafe also covers coverage LAG (a new dish is nameable in
search before its nightly knowledge hearing) and cross-food name variants
that are not category membership. After the v4 backfill lands, re-measure
the 57% figure; if name-evident variants are covered by edges, delete the
failsafe then. Deleting it today would thin search for every unsynthesized
dish.

## 3. Collection side — full rederivation (responsibility removed)

Per the owner's order this is a removal of the felt onus, not a surface
ban:

- **C.3 replaced**, not blanked: "The order-name is the whole deliverable"
  — states positively that rollup classes are a fact about the dish
  CONCEPT, stamped downstream from the emitted name (the same delegation
  shape as D.4's cuisine paragraph), and re-grounds C.2's as-written laws
  as what makes that derivation possible. Section numbering preserved
  (C.4/C.5 references stay valid).
- **THE PREDICTION TEST removed from the roster** and every dependent
  reference rederived: Gate 1's dish arm ("whether the words predict the
  plate matters to no field at all"), Gate 2's when-word bullet, Gate 3's
  cuisine-ask boundary (stands on the ORDER TEST alone), C.2's
  breakfast-taco bullet, D.3's offering bullet, D.4's cuisine line, F.2's
  field list, F.3's worked example.
- **Schema**: `item_categories` removed from the DISH-mention properties
  and propertyOrdering (constrained decoding makes emission impossible);
  the wire TYPE keeps the optional field, documented LEGACY, so
  stored-payload replays of pre-v18 batches keep decoding.
- **Ingest**: verified tolerant end-to-end — every touchpoint
  (ensureSurfaceDefaults, sanitizeMention, namespace-collision scan,
  entity minting at unified-processing:1194, dedupe fingerprints) is
  Array.isArray-guarded; absent field → no category events, nothing else
  changes. No ingest code change required.
- **Note**: the schema is shared with the LIVE prompt, so live extraction
  also stops emitting categories from this deploy forward (iteration
  phase, staging-only; the reload runs on the candidate anyway, and the
  edge table no longer reads per-mention arrays).

## 4. Re-ruled pins

No pin EXPECTED a category emission (the grader's `items` check accepts
item-or-category, so head-noun expectations are satisfied by the item span
itself; full-suite smoke confirmed zero category-reliant expectations).
Four pins' why-fields cited the old category responsibility and were
re-ruled under the 2026-08-30 owner ruling (categories are knowledge-side):

- `D13-occasion-ask-reuse` — when-only ask manufactures no food (Gate 2
  ground, no PREDICTION TEST needed).
- `V8n-CONTROL-salmon-omakase` — Gate 1 dish arm; prediction matters to no
  field.
- `G63-cuisine-not-category` — 'chinese' appears nowhere; no category
  field left to leak into.
- `V14m-title-only-caption` — the fabrication surface is the mention
  itself.

Two additional owner-blessed extraction pins folded in mid-task
(sameness-court findings, both certified ×3 repeats × 3 runs clean):
`N69-severed-shorthand-farm` (sourcing chatter — "their beef is from
their family farm" — must never mint a bare `farm` attribute; 3 real
mints traced) and `N70-venue-name-in-dish` ("Soto omakase" → `omakase`,
never a venue-prefixed dish; real cases soto omakase / bird bird bacon).

New knowledge-side pins (dish-knowledge-gold-cases.json, 9 cases): the
study's defects as gold — eggplant-parm-not-eggplant,
soup-dumplings-not-soup, omakase-not-japanese, spring-roll-not-pastry,
7-course-menu-empty — plus cheese-fries→fries (head-noun),
ice-cream-sandwich (composition exception), mapo-tofu (tradition pull),
carbonara-udon (peel+parents). prompt-gold.ts gained
categories/notCategories/emptyCategories expectations.

## 5. Certification

- **Dish-knowledge gold** (24 cases, --repeat=3): **3 independent runs,
  24/24 PASS each, zero FLAKY** (fixtures:
  dish-knowledge-gold.d4.run{1,2,3}.result.json). Locale note: the vi/zh
  gold gates are collection-side suites and untouched by this change; the
  dish-knowledge lane has no locale gate (English corpus, 'und' surfaces).
- **Collection full suite** (176 cases after the two sameness-court pins,
  prompt-ab.ts --repeat=3, three independent runs at the shipped config —
  fixtures prompt-ab.d4.cert.run{1,2,3}.result.json): run1 **175/175 PASS,
  0 flaky**; run2 **175/175 PASS, 0 flaky**; run3 **174 PASS + N27 FLAKY
  (2/3 and 1/3 across variants)**. `N8-geo-fredericksburg` is PENDING by
  design (a geography rule no prompt has yet) and counted separately.
  Five additional full-suite runs during iteration showed the same shape:
  never more than ONE non-pending defect per run.

  **Certification narrative (the honest version).** Removing
  `item_categories` from the decode schema alone (no text change) shifts
  behavior on exactly one pinned document: N27's "banh mi with fermented
  crab paste" intermittently emits ingredient `crab` instead of
  `crab paste` (~20-30% of calls; HEAD with the field present measured
  100% clean as a same-minute control). Eight wording fixes were measured
  (C.5 sentence variants, ingredient-description variants), each probed
  at repeat=6-8 against the sensitive-case band with HEAD as temporal
  control: EVERY variant that fixed N27 displaced the instability onto a
  different single case — one flipped N6-closure (emitting a claim for a
  CLOSED venue, deterministically — the worst error class), others made
  G2's multi-place chain drop a restaurant or broke the C3
  grocery-counter control. The certified v17 text sits in a stability
  basin this edit class perturbs by roughly one marginal case wherever it
  lands. Shipped: the full rederivation with the ORIGINAL ingredient
  description — N27 stays pinned as the residual band case (the
  least-harm failure class among the attainable residuals) and is queued
  for the next certification window.

  One pin was re-ruled on evidence during certification:
  `G2-la-nueva-reaction-chain` intermittently "failed" because the model
  cited the post body's fuller observed span ("La Gran Uruguaya bakery",
  Pic 18) instead of the reply's bare "La Gran Uruguaya" — BOTH are lawful
  observed spans of one venue that the ONE-THING judge folds. The grader
  gained an explicit per-entry OR (needle alternatives split on '|',
  documented, never fuzzy), and the pin now accepts either written form.

Two additional owner-blessed extraction pins folded in mid-task
(sameness-court findings, both certified ×3 repeats × 3 runs clean):
`N69-severed-shorthand-farm` (sourcing chatter — "their beef is from
their family farm" — must never mint a bare `farm` attribute; 3 real
mints traced) and `N70-venue-name-in-dish` ("Soto omakase" → `omakase`,
never a venue-prefixed dish; real cases soto omakase / bird bird bacon).

New knowledge-side pins (dish-knowledge-gold-cases.json, 9 cases): the
study's defects as gold — eggplant-parm-not-eggplant,
soup-dumplings-not-soup, omakase-not-japanese, spring-roll-not-pastry,
7-course-menu-empty — plus cheese-fries→fries (head-noun),
ice-cream-sandwich (composition exception), mapo-tofu (tradition pull),
carbonara-udon (peel+parents). prompt-gold.ts gained
categories/notCategories/emptyCategories expectations.

## 5. Certification

- **Dish-knowledge gold** (24 cases, --repeat=3): **3 independent runs,
  24/24 PASS each, zero FLAKY** (fixtures:
  dish-knowledge-gold.d4.run{1,2,3}.result.json). Locale note: the vi/zh
  gold gates are collection-side suites and untouched by this change; the
  dish-knowledge lane has no locale gate (English corpus, 'und' surfaces).
- **Collection full suite** (176 cases after the two sameness-court pins,
  prompt-ab.ts --repeat=3, three independent runs at the shipped config):
  every case PASS in all three runs EXCEPT one residual band case,
  `N27-ingredient-as-written`, flaky (not failing outright) — see the
  certification narrative below. `N8-geo-fredericksburg` is PENDING by
  design (a geography rule no prompt has yet) and counted separately.

  **Certification narrative (the honest version).** Removing
  `item_categories` from the decode schema alone (no text change) shifts
  the model's behavior on exactly one pinned document: N27's "banh mi
  with fermented crab paste" intermittently emits ingredient `crab`
  instead of `crab paste` (~20-30% of calls; HEAD with the field present
  is 100% clean on it). Eight wording interventions were then measured
  (C.5 sentence variants, ingredient-description variants v1-v8), each
  probed against the sensitive-case band at repeat=6-8 with HEAD run as a
  same-minute temporal control: EVERY variant that fixed N27 displaced
  the instability onto a different single band case — v1 destabilized
  N54/G2/B5, v2 flipped N6-closure (a claim emitted for a CLOSED venue,
  deterministically — the worst error class), v3/v4 made G2's
  multi-place chain drop one restaurant, v5 broke the C3 grocery-counter
  control, v7/v8 rotated C3/V14d. The certified v17 text sits in a
  stability basin this class of edit perturbs by roughly one marginal
  case wherever it lands. Shipped config: the FULL prompt rederivation
  with the ORIGINAL ingredient description — three independent full-suite
  runs all-PASS except N27 flaky — because among the attainable residuals
  N27's failure mode (a trimmed compound-ingredient noun) is the
  least-harm class, while the alternatives were a closed-venue emission
  or a lost restaurant. N27 stays pinned and is queued for the next
  certification window (the same reason-2 discipline the quote-mirror
  ledger already encodes: aligning a certified pairing is itself a
  behavior change).

## 6. Wild sample (staging, read-only)

41 dishes: 33 random staging dishes (ORDER BY md5(entity_id)) + the
study's 8 defect dishes, via the v4 prompt (scripts/
wild-dish-knowledge-categories.ts, no DB writes). Every defect class
closed:

| study defect | old edge | v4 answer |
|---|---|---|
| eggplant parm | → eggplant | `casserole` (no eggplant) |
| soup dumplings | → soup (2/8) | `dumpling` only |
| omakase | → japanese (12/22) | `sushi`; japanese in cuisines |
| spring roll | → pastry (2/9) | `appetizer` |
| spinach+mushroom enchiladas | → spinach | `enchilada` |
| 7 course menu | → tasting menu | empty |
| queso and chips | 10 distinct sets | one set: `appetizer` |

Random-sample behavior: head-noun parents consistent (picadillo taco→taco,
pretzel burger→burger/sandwich, redfish fried rice→fried rice/rice);
unknown/proper names fail closed (hoyveyolay, cashiola, cowboy → empty);
bare proteins stay empty (lamb, smoked duck). Minor rough edges, all
benign: `drink` as a broad parent on cocktails (harmless; `cocktail` is
also present), `side dish`/`vegetable` as classes (defensible), `chicken
wing` vs `wing` granularity variance — the fold + dedupe machinery owns
that class.

## 7. Migration / backfill notes (DESCRIBED, not run)

- The v4 ledger bump re-opens the whole dish population (`=` law): ~3,000
  active dish entities ≈ **150 batched calls at 20 dishes/call**, riding
  the pending v2/v3 cuisine backfill — one pass pays both facets, since
  the sweep re-offers on version mismatch regardless of which facet was
  missing. Run via scripts/run-dish-knowledge-synthesis.ts (dry-run
  first) or the nightly cron with DISH_KNOWLEDGE_SYNTHESIS_ENABLED.
- **Ordering**: the edge table now derives from knowledge_categories, so
  run the backfill BEFORE relying on category search in any environment;
  until then the nightly full-replace produces an empty-but-benign table
  (alert input reads no-input, not outage). Existing edges persist until
  the first post-deploy rebuild.
- Deploy notes: additive column only (no rewrite, no parallel-worker
  guard needed); prisma client regenerated locally. The migration will
  self-apply at container boot per the standard flow.

## 8. Consequences and open concerns (flagged, not blocking)

1. **Category-only support crediting + category cards**: per-mention
   category evidence events cease with the field. Historical events keep
   rebuilding what exists; "known for their burgers" still mints a dish
   claim (item=`burger` — Gate 1 handles the common case). What is lost
   going forward: a mention like "great tacos" crediting SUPPORT onto a
   sibling named taco dish via the category array, and category-card
   minting from mention-side arrays. If the owner wants that machinery
   fed again, the clean shape is deriving support matching from the edge
   table (knowledge-side) inside projection-rebuild — noted as a
   post-reload docket item, not built here.
2. **Merge adjudication for category ids**: knowledge_categories holds
   ITEM ids; the ontology reference registry only repoints ATTRIBUTE ids.
   The edge SQL's active-target guard makes a merged category inert
   (never wrong), and correctness of membership returns at the dish's
   next hearing; a K2-style repoint inside food-dedupe-merge would make
   it immediate. Post-reload docket item.
3. **Search workaround retirement**: measure after backfill (§2).
4. **N27 residual band case** (see §5): the schema-field removal leaves
   one pinned ingredient-transcript boundary flaky; every measured fix
   displaced the instability to a worse case. Queued for the next
   certification window with the measurement bank in this report.
5. Parallel-agent interference during verification: the judge-court
   agent's mid-flight unledgered entity-match-prompt.md edit broke
   AppModule boot on the shared tree for a while, so certs ran from an
   isolated worktree (HEAD + this change only). They have since ledgered
   v3; `yarn invariants` on the shared tree is now fully green (42
   invariants, 83 proofs).
