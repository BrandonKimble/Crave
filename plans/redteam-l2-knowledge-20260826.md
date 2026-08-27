# Red team L2 — the KNOWLEDGE + ATTRIBUTE architecture (2026-08-26)

Scope: the attribute/knowledge data model as ONE system, as it stands after
44bdf44be (S4 knowledge), 262d174ab (cuisine gold), c76f14638 (S4 search/geo).
Standard: ideal-from-scratch. Every dual-home, special case, or
patch-on-pattern is a finding.

Verdict up front: **the evidence substrate is the right primitive and it is
already 80% built — but it was never made the ONLY home.** `restaurant_attributes`
survives as a hand-unioned array with four direct writers and one replacing
projection; `restaurant_metadata.cuisineExtraction` survives as a private JSON
mirror; `knowledge_cuisines` was added as a fourth home in this commit set and
adjudication does not know it exists. Three staleness primitives were introduced
in one commit. Two mint policies for the same vocabulary sit 200 lines apart.

---

## K1 (P0) — `restaurant_attributes` has FIVE writers with two contradictory semantics

Four writers UNION into the array; one REPLACES it from evidence.

Union writers:
- `unified-processing.service.ts:3022` (testimony) — `[...new Set([...existingAttributeIds, ...operation.attributeIds])]`
- `restaurant-cuisine-extraction.service.ts:256,281` — `mergedAttributes = unionStringArrays(entity.placeAttributes, cuisineAttributeIds, editorial.activeIds)` then `data: { placeAttributes: mergedAttributes }`
- same file `:161–176` (the fingerprint SKIP path re-unions carried ids from JSON)
- `poll-entity-seed.service.ts:532–536` — `updated.add(params.attributeId)`

Replace writer:
- `projection-rebuild.service.ts:733` `derivePlaceAttributes` — `SET restaurant_attributes = COALESCE(ev.attrs, ...)` from `core_restaurant_attribute_evidence`, active-only.

The schema comment already diagnosed this in 2026-07-27 language and the fix
was only half-landed:

> "`core_entities.restaurant_attributes` array is a merge-only accumulator that
> can never shrink, so re-extraction cannot correct a wrong attribute."
> (`schema.prisma:1113`)

**Failure scenario (live today).** Google refreshes a venue's editorial summary.
The fingerprint changes, the cuisine lane reruns, drops `steakhouse`, and
`recordEvidence(..., { replace: true })` deletes the `editorial_llm` row. The
lane's own next line unions the NEW ids onto the array but **cannot remove the
old one** — `steakhouse` stays in `restaurant_attributes`, and therefore in
search, until some unrelated reddit document causes `projection-rebuild` to run
`derivePlaceAttributes` for that place. For a restaurant with no new Reddit
mentions, that is never. The comment at `:288` — "Re-extraction CORRECTS: this
lane owns its two source classes, so the restaurant's prior claims are replaced,
never accumulated beside" — is true of the evidence table and false of the
column search actually reads.

**Rederived shape.** `restaurant_attributes` is a pure derived column with
exactly ONE writer (`derivePlaceAttributes`), and every lane writes only
evidence. Any lane needing immediate read-visibility calls the projection for
its own place ids at the end of its transaction — that is one function call, not
a second write semantics. Migration cost: low and mechanical. Delete the three
union writes; call `derivePlaceAttributes(tx, [placeId])` after each; the poll
seed becomes evidence-only. Risk of not doing it: silent, unbounded,
per-restaurant divergence between what the evidence says and what search returns
— the exact defect the substrate was built to end.

## K2 (P0) — adjudication does not know about `knowledge_cuisines` or the evidence table; the grain bridge can resurrect an archived id

`applyPlan` repoints/strips merged and rejected attribute ids in exactly two
places, and its doc comment asserts that is exhaustive:

> "The merged/rejected attribute ids live in `core_restaurant_items.food_attributes`
> (food) or `core_entities.restaurant_attributes` (restaurant) — those are the
> only array columns that hold an attribute id, so re-pointing is type-scoped."
> (`attribute-ontology.service.ts:675–677`)

That sentence became FALSE in the same commit set that made cuisines
adjudicable: `core_entities.knowledge_cuisines uuid[]` (`schema.prisma:67`) now
holds attribute ids, as does `core_restaurant_attribute_evidence.attribute_id`.
Neither is touched by `repointMergeRefs` (`:865`) or `removeRejectRefs` (`:896`).

**Failure scenario A (resurrection).** The judge merges cuisine `tex mex` into
`tex-mex`, archives the loser, and strips it from `food_attributes`.
`knowledge_cuisines` on the dish entity still holds the archived id. The grain
bridge's vocabulary CTE has **no status filter at all**:

```
WITH cuisine_vocab AS (SELECT entity_id FROM core_entities
   WHERE type='place_attribute' AND facet='cuisine')   -- dish-knowledge-synthesis.service.ts:352
```

and the knowledge set is unioned in unconditionally (`x = ANY(d.knowledge_cuisines)`).
So the next time that dish's rule version bumps, the projection writes the
archived id back into every one of its connections. Adjudication is undone by a
reconciler. (Compare `derivePlaceAttributes`, which DOES filter `status='active'`,
and `CuisineFacetRegistry`, which filters `status <> 'archived'` — three
different status predicates over one vocabulary, see K5.)

**Failure scenario B (stale evidence).** A rejected `editorial_llm` attribute's
evidence row survives adjudication forever. It is invisible only because
`derivePlaceAttributes` filters active — i.e. correctness rests on a downstream
filter rather than on the ledger being true.

**Rederived shape.** Adjudication takes an explicit, enumerated list of
attribute-id reference sites, asserted by an invariant test that fails when a new
`uuid[]` column referencing an attribute entity appears without being registered.
Merge repoints evidence rows (with `ON CONFLICT` collapse onto the composite PK)
and `knowledge_cuisines`; rejection strips both. Migration cost: ~40 lines plus
one scanner test. Do this before the enumerator populates knowledge at scale;
after that, a backfill has to reconcile against an unknown number of resurrected
ids.

## K3 (P1) — THREE evidence homes, and a fourth private one in JSON

Asked directly: should there be one evidence primitive
`(subject, attribute, source_class, observation)`? **Yes — and the codebase has
already written it once.** `PlaceAttributeEvidence` IS that primitive, minus a
subject-type column. Today:

1. **Testimony** → `core_restaurant_entity_events` → projected to evidence
   (`reddit_evidence`) → projected to the array. Correct.
2. **Enrichment** → evidence directly (`cuisine_llm`, `editorial_llm`,
   `google_types` via `recordAttributeEvidence`, `poll_seed`). Correct.
3. **Dish knowledge** → `core_entities.knowledge_cuisines` (a bare array, no
   source class, no observation count, no evidence row) → projected to
   `core_restaurant_items.food_attributes`. **Not the primitive.**
4. **`restaurant_metadata.cuisineExtraction`** JSON — `attributeIds`,
   `editorialAttributeIds`, `inputFingerprint`, `attributes` — a private mirror
   of rows that already exist in the evidence table, used as the source of truth
   for the skip-path repair at `:161–186`. **A fourth home nobody else can read.**

Home 3 is the one that hurts. Because dish knowledge is not evidence, it cannot
be vetoed, cannot be counted, cannot be attributed, and cannot be corrected by
the adjudicator (K2). `plans/knowledge-attributes.md` already specifies the
testimony veto (`final searchable attributes = testimony ∪ (knowledge − vetoed)`)
— that formula is unrepresentable in the current shape, because knowledge and
testimony land in different columns at different grains with no join key.

**Rederived shape.** One table:

```
attribute_evidence(subject_type, subject_id, attribute_id, source_class,
                   observations, computed_at)
```

`subject_type ∈ {place, item, connection}`. Restaurant testimony is
`(place, place_id, …, 'reddit_evidence')`. Dish knowledge is
`(item, food_id, …, 'dish_knowledge')` — at ENTITY grain, where it belongs.
Both array columns become derived projections of one table with one writer each.
The veto becomes a WHERE clause, not a new mechanism.

**Migration honesty.** This is the largest item here: a table rename + a widened
PK, a backfill from `knowledge_cuisines`, and rewrites of `derivePlaceAttributes`
and `projectKnowledgeCuisines`. Roughly a day, all offline, no data loss (both
sources are recomputable). Against that: three write paths and four homes with
NO cross-home reconciler is a permanent drift tax, and K1/K2 are both direct
consequences of the split. Recommendation: do K1 and K2 now (they are cheap and
they are live bugs); schedule K3 as the S4 follow-through before the enumerator
adds facet #2, because every additional knowledge facet multiplies the backfill.

The JSON mirror (home 4) should simply die: the fingerprint moves to a real
column (K4), and the skip-path repair disappears once the array is derived (K1).

## K4 (P1) — three staleness primitives, one commit set

| Lane | Primitive | Where |
|---|---|---|
| Venue facts | `sha256(summary, sorted types, prompt fingerprint)` in JSON | `restaurant-cuisine-extraction.service.ts:305–325` |
| Dish knowledge | rule-ledger version equality (`knowledge_prompt_version != DISH_KNOWLEDGE_RULE.version`) | `dish-knowledge-synthesis.service.ts:124` |
| Grain bridge | stamp comparison (`cuisine_projection_version IS DISTINCT FROM knowledge_prompt_version`) | `:364` |

These are not three concepts — they are one: **a computation is due when the
hash of its inputs differs from the hash stamped on its output.** The dish lane's
version ledger is that hash with the corpus inputs dropped (the dish NAME is an
input and is not in the stamp — a renamed dish is never re-synthesized); the
fingerprint is that hash with the code version folded in; the projection stamp is
that hash where the input is another stamp.

Both non-hash forms already carry a scar comment explaining a subtlety the hash
form would not have: the `'='` law at `:120–126` ("a rollback to a lower ledgered
version re-opens work the wrong newer rule stamped — `lt` would leave it
invisible forever") is exactly what input-hash equality gives for free.

**Rederived shape.** One `derivation_stamp(subject_id, lane, input_hash,
computed_at)` where `input_hash = sha256(lane_inputs ++ code_fingerprint)`, one
`isDue(lane, subject, inputs)` helper. The dish lane's inputs are
`(name, DISH_KNOWLEDGE_RULE.fingerprint)`; the venue lane's are
`(summary, types, CUISINE_PROMPT_FINGERPRINT)`; the projection's input is the
dish stamp. Migration cost: moderate — but it also deletes the JSON home and
fixes the renamed-dish hole. Worth folding into K3.

## K5 (P1) — the cuisine facet is read with three different status predicates, and one mint path forgets the facet entirely

Same vocabulary, three definitions:

- `CuisineFacetRegistry` (search): `facet='cuisine' AND status <> 'archived'` — **includes pending** (`cuisine-facet.registry.ts:47–51`), despite the doc line above it saying "Active facet='cuisine' attribute entity ids".
- `projectKnowledgeCuisines` (grain bridge): `facet='cuisine'`, **no status filter** — includes archived (`:352`). This is K2's resurrection vector.
- `derivePlaceAttributes`: `status='active'`.

**Failure scenario.** An unadjudicated PENDING cuisine is in the search registry,
so it wins placement and compiles a hard two-column wall — against a vocabulary
row no evidence projection will ever put in `restaurant_attributes` (active-only).
Result: a query that grounds and returns zero rows, with no relaxation, because
placement believes it is a curated concept.

**And the mint policies are asymmetric within the same lane.** In
`restaurant-cuisine-extraction.service.ts`:

- `resolveEditorialAttributeIds` (`:347–440`) mints `status: 'pending'` and calls `queueAdjudication()` — quarantined, correct.
- `resolveCuisineAttributeIds` (`:618–626`) mints with neither `status` nor `facet`: `data: { name, type: place_attribute, ...identityInsertData(...) }`. Schema default is `@default(active)` (`schema.prisma:17`). So an unknown "cuisine" from the LLM becomes an **ACTIVE, facet-NULL** attribute — never adjudicated, and **invisible to `CuisineFacetRegistry`, to `projectKnowledgeCuisines`, and to placement.** It is a cuisine the system will never treat as a cuisine.

Note the dish lane got this right in the same commit —
`ensureCuisineAttributeEntity` mints `facet: 'cuisine'`
(`dish-knowledge-synthesis.service.ts:428–433`) — so the two cuisine minters in
one commit set disagree about whether a minted cuisine is a cuisine.

**Is the active-vs-pending asymmetry justified?** The stated reason —
"cuisines are a curated closed-ish set, not quarantined collection vocabulary"
(`:391–393`) — argues for the OPPOSITE policy. A closed curated set means an
unrecognized tradition is *more* suspicious, not less; the gold cases prove it
(the prompt emits "steakhouse" and "bbq" as cuisines, exactly the terms that
would auto-mint ACTIVE cuisine rows here). Verdict: **defect, not design.**

**Rederived shape.** ONE `resolveAttribute(name, {facet})` used by both lanes,
minting `pending` + facet always, enqueuing adjudication always. ONE
`CuisineVocabulary` service with one status predicate (`active`), injected into
search, the grain bridge, and the projection. The judge promotes; nothing else
does. Migration cost: small (one helper, three call sites) plus a one-shot sweep
to stamp `facet='cuisine'` on rows minted facet-less since 2026-08-26 and to
demote them for adjudication.

## K6 (P1) — search reads the dual projection at exactly ONE call site; the map and saved lists read one column

`cuisineConceptIds` is produced only at `search.service.ts:1740`, and only when
`!hasPrimarySubject`. Everything else that filters by attributes gets `[]`:

- `search-coverage.service.ts:153–182` ANDs `e.restaurant_attributes && ARRAY[...]` and a separate `EXISTS (… c.food_attributes && …)`, straight from placement's single bucket. A cuisine word placed as `place_attribute` walls the map dots to venue-side only.
- `buildTopDishJoinSql` (`:494–514`) likewise.
- The saved-list assembler consumes the plan without cuisine directives.

**Failure scenario.** "mexican" in Austin: the dual-list panel includes the
birria taco at the Korean spot (dish-side knowledge arm); the map beneath it does
not draw that restaurant's dot, because coverage only checked
`restaurant_attributes`. List and map disagree on screen.

This is the same defect the dietary walls already suffered and fixed — the
comment is right there at `search.service.ts:1672–1678`: *"coverage used to read
only the strip, so 'vegan tacos' walled the cards beside an unwalled map."* The
lesson was fixed for dietary and not generalized, so cuisine reproduced it three
weeks later.

**Rederived shape.** Membership compilation is ONE function over
`(constraints, registries)` returning per-axis SQL, called by the dual-list
builder, coverage, and the list assembler. No consumer re-derives which column a
concept lives in. Migration cost: a refactor of `parseFilters` into a shared
membership compiler — half a day, well covered by the existing integration specs.

## K7 (P2) — `source_class` as writer-ownership namespace is a convention with no enforcement

The contract is stated only in prose:

> "source_class is a writer-ownership namespace — projection unions all classes,
> so a lane-owned class buys clean delete/rewrite without touching cuisine_llm or
> reddit_evidence rows" (44bdf44be)

Reality check: the pattern holds today (four classes, four writers), but
- the cuisine lane owns TWO classes and its `replace` deletes both at once (`:800–806`) — so an `editorial_llm`-only change also nukes and rewrites the `cuisine_llm` rows. Harmless now because one call site writes both; a second writer of `cuisine_llm` would be silently deleted by an unrelated lane.
- nothing prevents any service from `deleteMany({ where: { sourceClass: 'reddit_evidence' } })`. There is no allowlist, no type, no test.
- `sourceClass` is `String`, not an enum — a typo mints a new namespace that unions into the array and no lane ever deletes it. Permanent orphan.

**Rederived shape.** `source_class` becomes a Postgres enum (or at minimum a TS
union type + CHECK constraint) with a single registry mapping class → owning
service, and one `replaceEvidence(placeId, sourceClass, ids)` helper that is the
only code path allowed to delete by class. An invariant test asserts each class
has exactly one writer. Cost: an hour, plus one migration for the CHECK.

## K8 (P2) — grain: the projection is the right bridge, but it is stamped, batched, and flag-gated

Question 6 asked whether search should join knowledge at its own grain instead.
**No — the projection is correct**, for the same reason `food_attributes` exists
at all: the dish axis filters (restaurant, dish) rows at page scale, and a join
to `core_entities.knowledge_cuisines` per row costs a second index probe on the
hot path for a value that changes monthly. Denormalize-and-reconcile is the right
call, and `projectKnowledgeCuisines` is genuinely reconciler-shaped (derived from
state, idempotent, runs even with nothing due — `:135–142`).

Three real caveats:

1. **Visibility latency.** A brand-new connection for an already-synthesized dish
   has `cuisine_projection_version = NULL`, so it is due — but the projection only
   runs inside `DishKnowledgeSynthesisService.run()`, whose only scheduled caller
   is the 5AM cron. A dish mentioned at a new restaurant today is not
   cuisine-searchable until tomorrow morning.
2. **The cron is flag-gated OFF by default** — `DISH_KNOWLEDGE_SYNTHESIS_ENABLED`
   (`:71`). The dish-side cuisine home is empty in any environment where nobody
   set the flag. Search's dish arm then silently contributes nothing and
   "mexican" degrades to venue-side-only — the exact behavior the S4 work was
   built to end, with no signal that it is happening.
3. **The stamp is not conflict-aware with adjudication** (K2): adjudication
   changes `food_attributes` without touching `cuisine_projection_version`, so
   the row is not "due" and the repoint sticks — until the next version bump
   reinstates the pre-merge id from `knowledge_cuisines`.

**Rederived shape.** Keep the projection; move it out of the synthesis service
into the nightly convergence reconciler where the other state-derived
projections live (it is not part of the LLM pass and should not inherit its
flag), and add a cheap due-count metric so an empty dish-side home is loud rather
than silent.

## K9 (P2) — the extraction prompt still commands the behavior S4 removed

`collection-prompt.md:272`: *"A cuisine attaches on BOTH sides, always … emit it
in both arrays"*, restated at `:333`. v17 S3 rules that extraction stops emitting
dish-side cuisine, and S4 built the knowledge lane that replaces it — but the
live prompt still orders it. Until S3 lands, every extraction writes dish-side
cuisine testimony that the tombstone/redirect machinery converts to restaurant
side, while the knowledge lane writes the dish side from the other direction.
Two producers, opposite directions, same column. Low priority only because it is
already scheduled — but it should not be allowed to sit between S3 and S4
activation in either order without an explicit ruling on which lands first.

---

## Ranked docket

| # | Finding | Sev | Cost |
|---|---|---|---|
| K2 | Adjudication blind to `knowledge_cuisines` + evidence; grain bridge resurrects archived ids | P0 | ~40 lines + invariant |
| K1 | Five writers on `restaurant_attributes`, two semantics; corrections half-apply | P0 | small, mechanical |
| K5 | Three status predicates on the cuisine facet; cuisine lane mints ACTIVE + facet-NULL | P1 | small + one sweep |
| K6 | Dual projection at one call site; map/list disagree on a cuisine word | P1 | half day refactor |
| K4 | Three staleness primitives for one concept; dish-name change never re-synthesizes | P1 | moderate, fold into K3 |
| K3 | Four evidence homes; knowledge is not evidence, so the veto is unrepresentable | P1 | ~1 day, no data loss |
| K7 | `source_class` ownership unenforced, untyped, one lane owns two classes | P2 | ~1 hour |
| K8 | Projection correct but flag-gated, cron-only, silent when empty | P2 | small |
| K9 | Prompt still commands both-sides emission S3 removes | P2 | sequencing ruling |

Suggested order: K2 and K5 first (both are live correctness, both are cheap, and
both get more expensive once the enumerator scales knowledge). Then K1, which
makes K3's backfill trivial. Then K6. K3+K4 as one S4 follow-through before a
second knowledge facet exists.
