# Search-attribute mechanics — merge vs search-time widening (read-only study, 2026-08-30)

Question under decision: should near-synonym attributes (bar/pub, modern/trendy,
piano bar/live music, pizza truck/food truck, kebab shop/shawarma, citrus/lemony,
fudgy/gooey, grass fed/pasture raised) MERGE in storage, or stay separate with
search-time widening? These are the mechanical facts, read from the code end-to-end
plus the staging DB.

All paths under `/Users/brandonkimble/Crave/Crave/apps/api/src/modules/`.

## Headline answers

1. **An attribute search is an exact-entity-id filter. There is NO semantic widening
   for attributes.** A separate "pub" attribute returns only rows stamped with pub's id.
2. **All widening machinery (satisfies, siblings, categories, name-containment,
   twin-ingredient) is ITEM-only** — both at build time and at read time.
3. **After a merge, the loser word grounds to the winner via folded surfaces and
   returns the winner's full pool** — and **no ranking mechanism preserves the seeker's
   narrower intent inside a merged pool** (tier is admission-only by owner ruling;
   order is pure Crave Score). Merged = both words return the union, undifferentiated.
   Separate + today's code = each word returns only its own pool.
4. Staging already contains a live example of the failure mode the hand-audit flagged:
   **"piano bar" is a folded surface of "live music"** and "farm to table" is a folded
   surface of "locally sourced" — those searches already serve the broad pool.
5. **"farm" was extraction severing, not diner vocabulary** (details in §5).

---

## 1. The search flow for an attribute word ("pub", "fudgy")

`search/search-query-interpretation.service.ts`:

- Interpretation is the gazetteer, no per-search LLM
  (`interpret()` → `interpretViaGazetteer`, :203–219).
- The query is scanned against known surfaces for types
  `['item','ingredient','item_attribute','place_attribute','place']`
  (`GAZETTEER_UNDERSTAND_TYPES` :171–177; `scanForKnownEntityGroups` call :262–266).
  Grounding is lexical: entity_surface / lexicon lookup over ACTIVE entities
  (entity-text-search/entity-text-search.service.ts :1526+, surface reads filter
  `status='active'`).
- A grounded span becomes an `EntityResolutionResult` carrying the matched
  **entity id(s)** (placement at :617–715), grouped into
  `itemAttributes` / `placeAttributes` buckets (`groupResolvedEntities` :1245–1324).
- Residue (unknown words) goes through the unified linker (:921–1076): exact >
  calibrated fuzzy > dense tier (dense only for non-English/non-Latin queries,
  :569–573). All of this decides WHICH entity the word links to — it never adds
  sibling/synonym entities.

Execution (`search/search.service.ts` + `search/search-query.builder.ts`):

- Attribute ids land in `constraints.ids.itemAttributeIds / placeAttributeIds`
  (search.service.ts `buildSearchConstraints` :1848–1934).
- With a primary subject (a food/restaurant also in the query) each non-dietary,
  non-cuisine attribute becomes a SOFT concept (:1644–1658): membership is NOT
  restricted by it; instead each concept is a per-row provenance test
  `c.food_attributes @> ARRAY[id]` or venue-array equivalent
  (builder :649–668, count windows :873–897), and the pooled gate admits partial
  rows only when all-word rows can't fill the page (builder :814–822).
- With NO primary subject (the attribute IS the query — exactly the "pub"/"fudgy"
  case) attributes stay **hard walls**: place side
  `r.restaurant_attributes && ARRAY[ids]` + archived-attr guard
  (builder `buildPlaceAttributeMatchConditions` :1011–1038, :993–1000); dish side
  `c.food_attributes && ARRAY[ids]` (builder :1170–1177).
- **In every branch the test is array containment on the exact entity id(s).**
  No satisfies edges, no sibling edges, no category edges, no embedding
  neighborhood are consulted for attributes.

The ONE attribute-id widening that exists is **lexical text expansion**, and only
on a thin page: when pooled coverage < target or terms are unresolved
(search.service.ts :616–620), `buildPlanExpansionForRequest` (:3312–3588) re-probes
the attribute TERM through `expandEntitiesByText` scoped to the same type
(:3427–3440). That is fuzzy/prefix matching of the same word — "pub" can pick up a
"pubs"-shaped surface, never "bar". Dietary ids are excluded (:3449–3471). Expanded
ids merge into the id lists at :1927–1934 (`mergeIfBase`).

Special case worth knowing: a primary item_attribute query ALSO ORs in dishes whose
NAME matches the attribute text (`itemIdsFromPrimaryItemAttributeText`,
search.service.ts :3473–3488; builder :1131–1145) — "fudgy" can return a dish
literally named "fudgy brownie" even if unstamped. Cuisine-facet attributes get the
dual-home OR (dish column OR venue column, one concept — search.service.ts
:1603–1658, builder :645–668) but still on the exact id.

## 2. Satisfies coverage

- Writer: entity-resolver/concept-satisfies.service.ts. `run()` is parameterized by
  `options.type` but **defaults to 'item'** (:241–245), and its only production
  caller passes NO type (entity-display/knowledge-maintenance.service.ts :146–148).
  Candidates come from `derived_entity_sibling_edges` (:390–434), which the builder
  populates **for items only** (entity-text-search/entity-sibling-edge-builder.service.ts
  :76, :99 — the HNSW neighborhood spans all types but the item filter is applied).
  So `entity_satisfies` holds item→item edges only in practice.
- Reader: search/search-sibling-expansion.service.ts `getSatisfiesItemIds`
  (:263–311) — anchors are the query's ITEM ids, target join requires
  `t.type='item'` (:284). Consulted only from the item-anchored widening block
  (search.service.ts :452–546, :1704–1723).
- **Not consulted for attribute filters anywhere.**
- Could it be, cheaply? Structurally yes: the table is generic
  (from_entity_id, to_entity_id, relation, prompt_version — service :226–236), the
  read is a copyable 30-line query, and the merge point for widened attribute ids
  already exists (`mergeIfBase(itemAttributeIds, planExpansion.itemAttributeIds)`,
  search.service.ts :1927–1934 — lexically-expanded attribute ids already flow
  through it today). The work would be: (a) run the satisfies judge with
  type='place_attribute'/'item_attribute' (its candidate recall would need an
  attribute-typed sibling-edge pass, since today's edges are item-only), and
  (b) one new reader + merge into the attribute id lists, ideally tagged so the
  widened id becomes a SOFT concept rather than a wall. No schema change.

## 3. Merge mechanics vs the search experience

attribute-ontology/attribute-dedupe-merge.service.ts `executeMergePlan` (:587–634),
one transaction: every attribute-id reference repointed (arrays + evidence ledger,
`repointAttributeIdRefs` :605–610), user anchors rekeyed, event substrate rekeyed,
then `finalizeMergeCompletion` (reddit-collector/extraction-scope.service.ts
:587–598+): **loser's name + surface rows fold onto the winner**, loser archived,
`entity_redirects` written and flattened.

Consequences, confirmed in the read path:

- The loser word's surface now points at the winner, so the gazetteer grounds
  "pub" → bar's entity id, and the filter is bar's id: **the loser word returns the
  winner's entire pool.** (Live proof on staging: `entity_surface` has
  `piano bar → live music` and `farm to table → locally sourced`.)
- **No intent survives inside the merged pool.** The only tiering in the pooled
  query is per-CONCEPT (all-soft-words vs partial), and after a merge both words
  are ONE concept id. Even across concepts, tier is admission-only, never order:
  builder :801–802 — "OWNER RULING 2026-08-08: tier never orders — admission
  only"; order is Crave Score (`resolveDishOrderSql`, :303–304 place order).
  `matched_tags` (builder :457, :520–540) is display metadata, not ranking. A
  piano-bar seeker post-merge gets live-music places in pure score order.
- Stale references elsewhere resolve via redirects (e.g. satisfies reader follows
  one redirect hop, search-sibling-expansion.service.ts :277–287), so nothing
  breaks — but nothing distinguishes either.

## 4. Dish-side parallels

Same shape. item_attribute ids test `c.food_attributes @> ARRAY[id]` (soft concept:
builder :649–668/:873–878; hard: :1170–1177). No expansion beyond the same-word
lexical one. The facet='cuisine' dual-home OR (dish column OR
`restaurant_attributes`) is per-CONCEPT (search.service.ts :1603–1658; renderer
`conceptDishAxisSql`, builder :649–651, walls :690–706) — it widens which COLUMN can
satisfy the id, never which id.

One staging reality check: the stamped `food_attributes` arrays are sparse — 7,905
connections, only 693 with any attribute, and none of the six dish-side pair words
is stamped at all (see §6). Dish-side attribute filtering is currently running on
almost no data.

## 5. The "farm" trace (staging)

- **No 'farm' or 'winter' attribute ENTITY exists on staging** (only
  `regenerative farming`, place_attribute, active). The pair never minted because
  the placement judge intercepted it.
- The extractor DID emit bare "farm" as a restaurant_attribute term. In
  `llm_decision_records` (kind='attribute_placement'), term='farm' appears 3×:
  twice **match → "farm to table"** ("In the context of restaurant attributes,
  'farm' is a common shorthand for 'farm to table'…"), once **reject**. Related
  fragments: term='farmed' rejected ("ambiguous fragment"), 'farmers market'
  rejected (venue kind). term='winter' (food_attribute) **matched → 'seasonal'**
  once.
- Raw sources: `collection_source_documents` rows containing bare "farm" are
  sourcing NARRATIVE, not filter vocabulary — e.g. austinfood
  e34c0d25…: "their beef is from their family farm and great", foodnyc 0ddcae08…:
  "sources quails from the same farm". Nobody wrote "farm" as a standalone
  descriptor of a restaurant. **Verdict: extraction severed a noun out of a
  sourcing sentence; a bare-'farm' attribute is a defect of extraction scope, not
  a real diner ask.** (Same for 'winter' — a seasonal-menu narrative word.)
- Caveat: attribute_placement records carry no source-document pointer, so the
  exact minting doc can't be joined mechanically; the quotes above are the
  matching raw docs in the same corpus.

## 6. Volume on staging (17,160 entities; small corpus — treat as shape, not scale)

Places carrying each place_attribute (`restaurant_attributes @> id`, active places):

| pair | A | B | overlap |
|---|---|---|---|
| bar / pub | 1,608 | 125 | 124 |
| modern / trendy | 0 | 0 | 0 (vocab exists, never stamped) |
| piano bar / live music | — (already merged: 'piano bar' is a surface of live music) | 519 | n/a |
| pizza truck / food truck | no 'pizza truck' entity or surface | 120 | n/a |
| kebab shop / shawarma (place_attr) | 24 | 16 | 4 |
| deli / sandwich shop | 133 | 305 | 55 |

Dishes carrying each item_attribute (`core_restaurant_items.food_attributes`):
**citrus, lemony, fudgy, gooey, grass fed, pasture raised = 0 stamped dishes each.**
Mention events exist (core_restaurant_entity_events: grass fed 5, gooey 3,
pasture raised 2, lemony 2, fudgy 1, citrus 1) but never reached the stamped arrays.

Reading for the decision: bar/pub is the live case — pub is ~99% a subset of bar
here (124/125 pubs also tagged bar), so a "pub" searcher under merge gains 1,483
non-pub bars (intent destroyed); under separate he already sees his 125. The
dish-side pairs are currently moot at this corpus size — the decision there is
about the vocabulary rule, not user-visible volume yet.

## MUST-READ-YOURSELF (load-bearing for merge-vs-expand)

1. **search/search-query.builder.ts :634–668, :798–822, :993–1038, :1131–1177** —
   the actual filter SQL. Confirm: exact-id array containment everywhere; "tier
   never orders — admission only" (:801). This is the proof there's no
   within-pool intent preservation.
2. **search/search.service.ts :450–546 (item-only widening seed), :1603–1700
   (soft/wall/cuisine partitioning), :1848–1934 (id assembly + the mergeIfBase
   attribute merge point where widened attribute ids would plug in)**.
3. **search/search-sibling-expansion.service.ts :263–311** — getSatisfiesItemIds:
   the read is generic in shape but pinned to `t.type='item'`; this is what
   "cheaply consult satisfies for attributes" would clone.
4. **content-processing/entity-resolver/concept-satisfies.service.ts :241–245,
   :390–434** — type defaults to 'item'; candidate recall rides item-only sibling
   edges — an attribute satisfies pass needs its own candidate source.
5. **attribute-ontology/attribute-dedupe-merge.service.ts :587–634** — what a merge
   irreversibly does (arrays repointed, surfaces folded, loser archived). Note
   there is no per-place record of WHICH word the community used post-repoint
   except the evidence ledger — check `repointAttributeIdRefs` if reversibility
   matters.
6. **search/search-query-interpretation.service.ts :262–355, :921–1076** — how a
   word becomes an entity id (surfaces + linker); why a folded surface makes the
   loser word indistinguishable from the winner word at interpretation time.
