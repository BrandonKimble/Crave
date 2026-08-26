# Cuisine System Review — 2026-08-25

How cuisine words flow through the system today, end to end, so the owner can decide
whether cuisines attach to dishes, restaurants, or both. Research only — no patches.
Companion to plans/v16-trace-audit-20260825.md §3.5.

---

## 1. The "drain job" — what actually deletes cuisine words from dish slots

**The line the audit cited is a comment, not the drain.**
`apps/api/src/modules/content-processing/reddit-collector/projection-rebuild.service.ts:1158-1162`
is a stranded-count NOTE inside the nightly tombstone-event sweep: *"the entity-dimension
count is dominated by ~11k deliberately-archived attribute events (cuisine vocabulary)
awaiting the class-② repointing ruling — expected to drain then."* That comment is now
STALE — the ruling landed and the backlog drained on 2026-08-02 (data-audit round 9
re-measured "0 stranded"), but the comment still says "awaiting".

**The real drain has three parts:**

1. **A one-time migration** — `apps/api/prisma/migrations/20260801200000_cuisine_facet/migration.sql`
   (commit `cfa69f38b`, 2026-08-01, "class ②" of the data-audit execution). It:
   - built a 59-name cuisine lexicon and minted/blessed one ACTIVE
     `restaurant_attribute` row per cuisine with `facet='cuisine'` (61–62 canonicals);
   - archived every cuisine that lived as a food-side attribute ("ACTIVE food_attribute
     cuisines fold too — 'bbq' lived on as an active food_attribute with 35 events");
   - wrote `entity_redirects` from every archived variant (both attribute types) to the
     canonical;
   - **repointed the 11,235-event backlog with a type flip** — dish-side cuisine events
     were rewritten `SET entity_id = canonical, entity_type = 'restaurant_attribute',
     evidence_type = 'restaurant_attribute'` — i.e. dish-side cuisine testimony was
     CONVERTED into restaurant-side testimony, not merely deleted;
   - deleted redundant copies and the redirect-less "junk sink" backlog.

2. **A write-time drain, still live.** The event writer in
   `unified-processing.service.ts` "re-points archived ids through their redirects and
   DROPS ids with no redirect (the junk sink)". So today, when extraction emits
   `item_attributes: ["mexican"]`, the resolver's TOMBSTONE SINK
   (`entity-resolution.service.ts:2043-2051` — "a term the ontology already REJECTED
   lives on as an archived row... repeat mentions resolve onto the tombstone") lands it
   on the archived food-side row, and the write path immediately re-maps it through the
   redirect to the canonical restaurant-side cuisine. Dish-side cuisine claims for the
   known lexicon **cannot accumulate as dish attributes anymore** — they are converted
   on arrival.

3. **A nightly sweep, still live.** `sweepTombstoneEvents()`
   (`projection-rebuild.service.ts:997`) runs inside the 3AM nightly convergence cron
   (`restaurant-enrichment/nightly-convergence.service.ts:37,48`) and repoints any event
   sitting on an archived entity through its redirect (active-run rows only). Nuance:
   unlike the migration, the sweep sets only `entity_id` — it does NOT flip
   `evidence_type` to the restaurant-attribute shape.

**Why it was added:** data-audit P0.1 ("attribute tombstone leak", CONFIRMED
2026-08-01): archival wrote redirects for restaurants only, so 15,904 events (12.8%)
sat invisibly on tombstones — archived food_attribute `mexican` held 1,808 events while
active restaurant_attribute `mexican` held 2,704; `tex-mex` had no active row at all.
The audit called 57% of restaurant-attribute evidence mass "cuisine/category," a
category dimension mislabeled as venue property, and class ② was the fix
(plans/data-audit-2026-08.md:22-27, 59-71, 283-287).

**Gap found by today's v16 audit:** the drain's lexicon and redirects cover the OLD
entity rows. v16 rehearsal runs mint FRESH (rehearsal-status) cuisine entities, so
the same cuisine words reappear on dishes un-archived — "the activation path must run
the same cuisine-vocabulary drain the old corpus got, or the v16 events will re-pollute
what the drain cleaned" (plans/v16-trace-audit-20260825.md:89).

---

## 2. The attribute enumerators — planned, mostly not built

**Split verdict.** What EXISTS is attribute-ontology *canonicalization*
(`apps/api/src/modules/attribute-ontology/`, registered in `app.module.ts:118`,
enqueued from `unified-processing.service.ts:853`): it judges attribute *vocabulary*
(pending → active/merged/rejected) but never decides which dish or restaurant gets
which attribute.

**The enumerators the owner remembers are `plans/knowledge-attributes.md` — DESIGN
ONLY, nothing shipped.** No `knowledge_attributes` column exists anywhere but the plan
itself (line 57); no enumerator service/worker/cron exists in code. Gate is explicit:
*"Owner decides continue-or-kill on pilot measurements; nothing here ships before
that"* (knowledge-attributes.md:10-11), and it sits at item 5 of the post-activation
docket (plans/v16-program.md:89-95).

Responsibilities the design gives them (quotes, knowledge-attributes.md):
- an async knowledge pass extending the dish-knowledge-synthesis pattern (per-entity
  stamp, pooled batch calls, cron flag-gated) (:26-29);
- governing test: *"Attach only what the NAME of the entity entails — never what the
  ask, the vibes, or the venue suggests"* (:33-35);
- testimony veto: contradicting banked testimony suppresses the knowledge attribute
  for that connection (:45-49);
- storage: *"a `knowledge_attributes uuid[]` on the entity... one attribute
  vocabulary, two provenances"*; *"final searchable attributes = testimony ∪
  (knowledge − vetoed)"* (:56-64);
- pilots on BOTH sides: *"a small restaurant-attribute enumeration pilot... and a
  dish-attribute enumeration pilot, both fresh-lens graded"* (:114-117).

**Where cuisine fits:** restaurant-side cuisine already has a BUILT owner — the
once-ever-per-restaurant cuisine lane
(`restaurant-enrichment/restaurant-cuisine-extraction.service.ts`): Google place types
first (`GOOGLE_PLACE_CUISINE_TYPE_MAP`), else LLM over the Google editorial summary,
writing evidence with `sourceClass: 'cuisine_llm'` (:566) and gated "ONCE EVER PER
RESTAURANT, DELIBERATELY (F369)" (:96-98). **Dish-side cuisine has NO owner**: dishes
get attributes only from testimony (knowledge-attributes.md:3-7 says exactly this),
and the knowledge-attribute pilots do not name cuisine as a facet they'd take over —
the plan treats cuisine as already-solved on the restaurant side.

---

## 3. What actually runs when a user types "mexican"

**The code path (traced end to end):**

- Understand is the gazetteer alone (`search-query-interpretation.service.ts:204-207` —
  "the gazetteer IS the Understand. The sync LLM path is deleted"). It scans
  `['item','ingredient','item_attribute','place_attribute','place']` (:170-176).
- When one word matches entities of several types, SINGLE-BUCKET PLACEMENT keeps ONE
  (`:607-640`), ordered `item_attribute > item > place_attribute > ingredient > place`
  (`CROSS_TYPE_PLACEMENT_ORDER`, :1208-1214).
- If "mexican" lands as an **item_attribute**: the dish query filters
  `core_restaurant_items.food_attributes && ARRAY[mexican]`
  (`search-query.builder.ts:721-774`) and the restaurant query admits via a UNION of
  the same `food_attributes` overlap plus `core_restaurant_entity_signals.entity_id IN
  (mexican)` (:1305-1313). **Neither axis reads `core_entities.restaurant_attributes`**
  — the place-attribute arm (:985-990, :997-1023) is inert because placement discarded
  the place-side reading. The pooled gate never engages for a bare cuisine word (soft
  ids require a primary subject, `search.service.ts:1598-1616`).

**What the DATA actually contains (verified on staging, 2026-08-25):**

- `item_attribute` "mexican" is **ARCHIVED** (the drain); the only active attribute is
  `place_attribute` "mexican" (facet=cuisine).
- `core_restaurant_items.food_attributes` contains the canonical cuisine id in
  **0 rows**. The only "mexican" marker in dish arrays is an active junk **item**
  entity named "mexican" (a cuisine-as-dish leftover, 27 connections — one of the "16
  cuisines still active as dishes" on the rerun cleanup list).
- `core_entities.restaurant_attributes` carries the canonical on **426 places**;
  `core_restaurant_entity_signals` has **559** rows on it.
- So placement's menu for "mexican" is {active item, active place_attribute}, and the
  order ranks **item above place_attribute** — a bare "mexican" search most likely
  resolves as a DISH named "mexican" (the junk hub), not as the cuisine at all.
  (Static trace + data; not runtime-verified.)

**Answer to the concrete question — "does a Mexican dish at a non-Mexican restaurant
surface under a mexican search?"**

- **The QUERY shape supports it; the DATA no longer does.** If dish rows carried the
  cuisine id in `food_attributes`, both axes would surface the taco at the Korean spot
  with zero reference to the restaurant's own cuisine. But the drain converted every
  dish-side cuisine event to restaurant-side evidence, so `food_attributes` holds no
  cuisine ids — the dish axis has nothing to match. Today the behavior is effectively
  "restaurants known for mexican" (via signals, which live at (restaurant, entity)
  grain) at best, and possibly the junk-item path at worst.
- **If cuisines lived ONLY on restaurants** (and search were repointed to
  `place_attribute`): the dish axis flips from "dishes that are Mexican" to "all
  dishes at Mexican-attributed restaurants" (`buildPlaceConditions` :985-990 becomes
  the only live filter, connection filter empties). The Mexican taco at the Korean
  place surfaces **only if** the Korean restaurant itself carries `mexican` in
  `restaurant_attributes` — which the both-sides prompt doctrine does provide
  ("tacos at a Korean spot ... add mexican to the restaurant's attributes"), but then
  the WHOLE Korean menu rides in, not just the taco. Dish-level precision is lost.

---

## 4. Prior decisions on cuisine-on-dishes vs cuisine-on-restaurants

The full ledger (decision → status):

- **Both prompts command both-sides attachment — LIVE.** Active prompt
  `collection-prompt.md:272`: *"(a) A cuisine attaches on BOTH sides, always... emit
  it in both arrays"*; `:273` infers cuisine from dish identity even when unstated;
  `:343` "tacos ordered at a Korean spot give the dish `item_attributes: [\"mexican\"]`
  and add 'mexican' to `place_attributes` in addition to 'korean'." v16 candidate
  `collection-prompt.candidate.md:824-837` (D.4) says the identical thing, and the
  schema text reinforces it (`llm-response-schemas.ts:286` — "cuisines belong in the
  attribute arrays").
- **P2.1 "cuisine dissolves, no new facet" (2026-08-01) — SUPERSEDED next day**: the
  build DID land the facet (data-audit-2026-08.md:138-151 and the EXECUTION RECORD ②).
  `plans/query-system-data-dependencies.md:136` still carries the stale "no new facet"
  line; its §2 header was later annotated CLOSED.
- **The cuisine facet + one-canonical-per-cuisine + drain — SHIPPED 2026-08-02, LIVE**;
  extended by R14 (2026-08-16): `facet ∈ {venue_kind,cuisine,amenity}` persisted on all
  ~1,964 attribute rows, cuisine=154 (taxonomy-rederivation.md:215-218, 277-279).
- **Facet as a search-grounding fix — CORRECTED 2026-08-06**: simulated on a corpus
  clone, the class-② fixes moved the launch gate **+0.0%** — "they matter for SCORING
  integrity, not search grounding" (query-system-data-dependencies.md:56).
- **X-food doctrine (T4)**: "'dominican food' reduces to 'dominican' — merge, keep
  'dominican food' as an alias/surface... Then search needs NO 'X food' composition
  rule at all" (taxonomy-rederivation.md:61-71). Live, extraction-side gold case still
  queued.
- **Cuisines are never dishes** — prediction-test ruling preserved
  (data-audit-2026-08.md:246, 941); 16 cuisines that existed as active dishes are on
  the rerun cleanup list (:400-403).
- **Today's open question** — v16-trace-audit-20260825.md:89 is the only document that
  puts the both-sides doctrine itself back on the table: change D.4, or make the
  activation path run the drain.

---

## 5. Synthesis — the ideal from-scratch shape

**Where the system fights itself today (the mechanism-level contradiction):**

1. The prompt (both v1 and v16) orders cuisine onto BOTH sides, always.
2. The drain machinery (migration + write-time junk-sink/redirect + nightly sweep)
   converts every dish-side cuisine claim into restaurant-side evidence the moment it
   arrives — so the dish side the prompt writes is systematically emptied.
3. Search's Understand ranks `item_attribute` first and reads ONLY dish-side columns
   for a bare cuisine word — the exact slot the drain empties — while the
   restaurant-side column the drain fills (`restaurant_attributes`, 426 places) is
   never read on this path.
4. The planned dish-side owner (knowledge-attribute enumeration) is unbuilt, and its
   design doesn't even claim cuisine.

Three writers and one reader, each pointed at a different slot. No patch fixes this;
the source mechanism is that **cuisine has never been assigned a single home**.

**The ideal shape (one coherent behavior):**

- **Cuisine is a property of BOTH the dish and the place — keep the doctrine — but
  each side gets exactly one owner and one storage slot.**
  - *Restaurant side*: testimony + Places types + cuisine_llm, all landing as
    `place_attribute` evidence on the canonical facet='cuisine' rows (this is the
    shipped shape — keep it).
  - *Dish side*: cuisine is KNOWLEDGE, not testimony. "Tikka masala is Indian" is
    entailed by the dish's NAME — precisely the knowledge-attributes.md test ("attach
    only what the NAME of the entity entails"). So dish-side cuisine belongs to the
    knowledge-attribute enumerator (per-entity, blind, set-replacement, cheap), NOT to
    per-mention extraction. Extraction stops emitting cuisine in `item_attributes`
    (drop that half of D.4); the enumerator stamps each food ENTITY once, and the
    projection carries it onto every connection. This ends the extract-then-drain
    treadmill AND removes the `american`-noise class (1,376 near-information-free
    mentions) at the source.
- **The drain then becomes unnecessary** in its cuisine role — nothing dish-side mints
  cuisine attributes anymore. Under the no-guards law, that is the tell that this is
  the right shape: today's drain is a standing guard against the prompt.
- **Search reads both homes deliberately**: a cuisine word (recognizable by
  facet='cuisine') should not fight single-bucket placement between two twins — it is
  ONE concept with two projections. Dish axis: dishes whose FOOD ENTITY carries the
  cuisine knowledge attribute (surfacing the Mexican taco at the Korean spot,
  precisely). Restaurant axis: places whose `restaurant_attributes`/signals carry it.
  The gazetteer resolving "mexican" to a junk dish entity is a separate cleanup
  (the 16 cuisine-dishes are already on the rerun list).

**The verdict on the owner's test case:** "a Mexican dish at a non-Mexican restaurant
surfaces under mexican searches" is **NOT supported today** — the query shape allows
it but the drain emptied the data it reads. Cuisine-on-restaurants-only cannot support
it at dish precision (it admits whole menus). The shape that supports it is
**cuisine on both sides with split provenance**: restaurant-side by testimony+Places
(shipped), dish-side by name-entailed knowledge on the food entity (the unbuilt
enumerator). That one change realigns extraction (stops emitting it), the drain
(retires), the enumerators (gain their natural facet), and search (reads each side's
real home).

**Open decisions this hands the owner:** (a) amend D.4 to restaurant-side-only
emission at extraction; (b) greenlight cuisine as the first knowledge-attribute
enumeration facet (dish side); (c) teach Understand to treat facet='cuisine' words as
one dual-projection concept instead of single-bucket placement; (d) if v16 activates
before (a), re-run the cuisine drain on the fresh entities or they re-pollute
(v16-trace-audit:89). Also: fix the stale comment at
`projection-rebuild.service.ts:1160` ("awaiting" a ruling that landed 2026-08-02).
