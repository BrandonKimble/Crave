# Category & knowledge-split study (2026-08-30)

Evidence-based answers to two owner questions. Read-only study; staging corpus
(mirror of local). All numbers measured, none estimated.

---

## Q1 — Should per-mention category assignment move to the dish-knowledge system?

### How it works today

- The collection prompt's C.3 (collection-prompt.candidate.md:1023) has the
  extraction model build `item_categories` per mention from the PREDICTION TEST
  plus its own food knowledge (step 3: "Add 1–3 parent classes... even when
  unstated" — "carbonara udon" → udon, noodle, pasta, carbonara).
- Storage: per-(restaurant, dish) union on `core_restaurant_items.categories`
  (uuid[]); categories are themselves food entities in `core_entities`.
- Search does NOT read the per-connection arrays anymore. It reads
  `derived_food_category_edges` (schema.prisma ~line 409;
  food-category-edge-sql.ts), a reconciliation layer built BECAUSE the
  per-mention arrays disagreed: union across a food's connections, support
  thresholds (>=2 conns or unanimity), containment-inversion filters.
  Consumers: search category expansion (search-query.builder.ts:1582),
  teaser category lists, satisfies-judge rung 2. `is_category_item` rows are
  category cards, excluded from restaurant vote rollups.

### What the corpus shows (measured today)

| metric | value |
|---|---|
| connections | 7,905 (7,395 with categories) |
| derived category edges | 4,907 |
| multi-connection foods | 960 |
| **foods whose connections disagree on the category set** | **579 / 960 = 60.3%** |

(The schema comment's own earlier measurement was 50.5% — it has gotten worse,
not better.)

**Verbatim inconsistency — the same dish, different mentions:**

- "queso and chips": 19 connections produced **10 distinct category sets**
  (`(empty)`, `appetizer,dip,side`, `appetizer,snack`, `dip`, `snack`, ...)
- "wings": 35 connections, 8 sets (`appetizer` / `chicken` / `snack,wings` / ...)
- "oysters": 27 connections, 7 sets; "margarita": 53 connections, 6 sets;
  "italian beef sandwich": 13 connections, 7 sets.

This is the per-mention-vs-once-per-concept smoking gun: category membership is
a fact about the dish CONCEPT, yet each mention re-derives it and lands
somewhere different. The edge-derivation layer exists purely to launder this
noise back into one answer per food.

**Hand-judged sample: 170 random derived edges** (post-reconciliation, i.e.
after the noise laundering):

- ~157 correct (≈92%).
- **7 clearly wrong (≈4%)**: `spinach and mushroom enchiladas → spinach`,
  `eggplant parm → eggplant`, `king mushroom and egg tofu → mushroom`
  (ingredients as categories — C.3 explicitly bans this),
  `soup dumplings → soup` (2/8 support — one bad mention survived the
  threshold), `spring roll → pastry` (2/9), `knock-out martini → margarita`,
  `7 course menu → tasting menu` (C.3 says tasting menu is never a category).
- ~6 more dubious (≈3.5%): `rolls → pastry`, `cereal and milk → dessert`,
  `strawberry cream → fruit`, `garlic knots → pastry`, etc.

**Cuisine leak** (C.3: "a cuisine is NEVER a parent"): 19 of 4,907 edges (0.4%)
have a cuisine as the category — `omakase → japanese` (12/22 support),
`brisket → bbq` (16/36), `dal → indian`, `vegan flauta → mexican`. Small but
it is exactly the class the prompt spends a paragraph banning.

**Missing obvious parents**: 529 distinct foods whose NAME ends in an existing
category word have no edge to it (e.g. `cheese fries → fries`,
`nopales taco → taco`, `green spaghetti → spaghetti`,
`japanese fried chicken → fried chicken`). Some are correct omissions
(`ice cream sandwich` is not a sandwich), but the miss class is real enough
that search already carries a read-time workaround: head-final variant
matching added because "a dish literally named X missed the X category"
(search.service.ts:466). 390 foods with live connections carry NO categories
at all.

### Does it fit the dish-knowledge shape?

Mechanically, yes — categories are exactly what the dish-knowledge system was
built for:

- **Identity-derived**: parents follow from the dish NAME alone, like
  `ingredients`, `aliases`, and (since S4) `cuisines`. No mention context is
  ever needed — C.3 step 3 already tells the extraction model to add parents
  "even when unstated," i.e. it is already world knowledge, just computed in
  the wrong place, N times, inconsistently.
- **Once per concept, offline, batched** (~20 dishes/call), stamped and
  **ledgered** (dish-knowledge-rule.ts releases — a prompt improvement
  re-opens the population; the collection prompt has no such lever for
  categories short of a full re-extraction).
- **A projection/reconciliation rail already exists** (knowledge_cuisines →
  grain bridge → food_attributes with `cuisine_projection_version`); a
  `knowledge_categories → derived_food_category_edges` projection is the same
  move. The edge table's consumers don't change at all.
- Adjudication-on-merge machinery exists too (knowledge-cuisine-adjudication
  K1/K2 proofs).

### Recommendation: MOVE (with one collection-side remnant)

- **Move parent-class derivation (C.3 step 3) to dish-knowledge**: add a
  `categories` facet next to `cuisines` (TRADITION TEST sibling: the
  PREDICTION TEST, asked once per dish name). Derive edges from that instead
  of unioning per-connection arrays.
- **Keep in collection only what is testimony**: the stated span itself and its
  peel (step 1–2 are mostly mechanical name-structure; even these could move,
  but they are cheap and source-faithful). Alternatively drop C.3 entirely and
  let dish-knowledge do seed+peel+parents — simpler prompt, one owner.
- **Benefit**: kills the 60.3% cross-mention disagreement at the source instead
  of laundering it; one consistent answer per dish; wrong parents become
  correctable by a rule-version bump (one cheap re-pay) instead of living in
  7,395 connection rows; shrinks the collection prompt's hardest,
  most-defect-prone section; closes the missing-parent class the same
  nightly sweep that fills cuisines.
- **Cost**: one knowledge-rule version bump re-opens ~3,000 dish entities ≈
  150 batched LLM calls (cheap, offline, same rail as the pending v2/v3
  cuisine backfill — can ride the same pass); a small projection change in
  food-category-edge derivation; per-connection `categories` becomes legacy
  (search already doesn't read it).
- **Risk**: low — the consumers read the edge table, which stays; a hybrid
  transition (keep C.3 output as fallback support until knowledge coverage
  lands) is available but probably unnecessary given the edge table fails
  open.

---

## Q2 — Is the cuisine/knowledge responsibility split clean?

### Who owns what (the one-diagram-in-words)

**A cuisine fact lives in exactly one of two homes, and three systems feed
them:**

1. **The DISH's cuisine** — owned by **dish-knowledge** (dish-knowledge-
   prompt.md §3, TRADITION TEST on the dish NAME, once per concept, ledgered
   v2/v3). Stored as `knowledge_cuisines` on the food entity, projected onto
   each (restaurant, dish) row's `food_attributes` by the grain bridge
   (`cuisine_projection_version`, schema.prisma:342-347). This is how "the
   Mexican taco at the Korean spot" surfaces under a mexican search.
2. **The VENUE's cuisine** — a computed profile owned by
   **restaurant-cuisine-extraction** (restaurant-cuisine-extraction.service.ts):
   Google place types (`GOOGLE_PLACE_CUISINE_TYPE_MAP`) ∪ the cuisine-prompt
   LLM reading the editorial summary, fingerprint-gated on
   (summary, types, prompt). Plus **stated testimony** from collection
   (D.4: "best Italian spot in town" → `place_attributes`). All three write
   EVIDENCE rows (`core_restaurant_attribute_evidence`, source_class =
   `places_api` 74,320 / `cuisine_llm` 1,727 / `reddit_evidence` 2,358) and
   the ONE writer `derivePlaceAttributes` projects the union into
   `restaurant_attributes` (place-attribute-projection.ts).
3. **The COLLECTION prompt explicitly owns neither**: a cuisine enters a
   mention only when stated or fit-asserted, lands only in `place_attributes`,
   and it names the delegation in so many words — "what tradition a dish
   belongs to is a fact about the dish concept, stamped downstream by another
   system from the dish name you already emitted"
   (collection-prompt.candidate.md:1301-1312). Dish identity, world knowledge
   of the venue, and the venue's own name are each explicitly banned as
   cuisine sources (:1319-1327).

Search then treats a cuisine word as ONE concept with two homes: an OR across
`food_attributes` and `restaurant_attributes`, one soft-gate entry
(cuisine-dual-projection.spec.ts laws 1–3).

### Verdict: CLEAN — the split is coherent and each prompt names its lane

No prompt claims a responsibility another owns; no consumer reads cuisine from
the wrong object (search's dual projection is deliberate, facet-driven, and
red-teamed against the junk-dish-hub hijack). Three minor smudges, none a
misrouting:

1. **The category system leaks cuisines into a lane C.3 bans** — 19
   `derived_food_category_edges` rows with a cuisine as category
   (`omakase → japanese` 12/22, `brisket → bbq` 16/36, `dal → indian`).
   Data-level, not prompt-level; a knowledge-owned category facet (Q1) plus
   one edge-hygiene pass clears it. Note `bbq` is genuinely two-faced: the
   cuisine prompt admits it as a tradition (cuisine-prompt.md:27-29) while
   C.3 treats bbq-ish words as orderable — fine, but worth one written
   sentence somewhere so future prompt editors don't "fix" one side.
2. **The cuisine-prompt does infer tradition from dishes** — but only dishes
   named in the EDITORIAL SUMMARY ("ramen and izakaya plates" → japanese,
   cuisine-prompt.md:24-29). That is venue evidence about venue cuisine, not a
   grab of dish-knowledge's lane; the one-tradition-unmistakably guard keeps
   it honest. There is NO corpus-dish-set → venue-cuisine lane in code — if
   the owner believed "dish-set implications" feed the venue profile beyond
   the summary, that belief is aspirational, not implemented (the dish side
   reaches search via the grain bridge instead, which covers most of the same
   user-visible ground).
3. **Six stale comments / older data predate the split** — e.g. category
   edges minted before the never-a-cuisine-parent rule. Cleanup, not design.

### Where cuisine-from-venue-name slots in

Exactly one place: a fourth evidence source in
restaurant-cuisine-extraction.service.ts — fold the name-derived cuisine word
into `rawCuisines` (or a new `source_class = 'venue_name'` evidence row) and
let `derivePlaceAttributes` project it like every other lane. The measurement
(plans/cuisine-name-signal-measurement.md) supports it: wrong on 13 of 652
places (2.0%), and in the fine-grained rows (sichuan, nepali, izakaya) the
name is BETTER than Google's types. It touches nothing dish-side, so the
split stays clean. The collection prompt's "the venue's own name states no
cuisine claim" rule is about per-mention testimony and would remain true and
untouched.
