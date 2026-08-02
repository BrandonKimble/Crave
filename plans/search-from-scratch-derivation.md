# Search: The From-Scratch Derivation (canonical spec, 2026-07-29)

Derived from requirements as if no code existed; the current implementation
compared at the end. This is the doc we build against. Everything marked
RATIFIED is an owner decision from the 2026-07-28/29 sessions; everything
marked MEASURED cites the evidence produced in them.

## 0. The requirements (what must be true)

1. **A claim is one comment saying one thing about one place**, counted
   once, credited to the most specific thing named (claim identity,
   d9e963da).
2. **A word's meaning lives in the data, not in a guess.** 827 of 17,949
   active names carry multiple entity types; "breakfast" is a food class
   AND a venue property simultaneously (MEASURED).
3. **The user's query is intent, not schema.** Nobody typing "spicy
   breakfast tacos" has heard of `food_attribute`.
4. **Score is sovereign** (RATIFIED, twice: the pooled-pure-score comment
   at search.service.ts:995 and re-confirmed 2026-07-29). The visible list
   is ALWAYS ordered by score (or trending — same law, different key).
   Matching influences MEMBERSHIP of the pool, never visible order.
   Sectioned/tiered presentation stays a shelved experiment
   (SEARCH_RANKING_MODE=sectioned, default off).
5. **Some constraints are non-negotiable** — and not only the toggle
   filters (see §3).
6. **Missing data is a signal, not a failure** — thinness feeds on-demand
   collection, and the signal should say WHICH word failed, not "few
   results".
7. **The user consumes two objects** — a dish card and a restaurant card.
   Product fact, not implementation choice. Two projections is the
   from-scratch answer, not a legacy accident.
8. **No fake numbers.** Weights, floors, and cut points are measured
   (sweeps, ledgers) or owner-chosen — never invented (no-fake-estimates
   law).

## 1. The pipeline: Understand → Ground → Filter → Pool → Rank → Learn

### 1.1 Understand (span segmentation; LLM demoted, not removed)

Order of lanes — deterministic facts first, calibrated judgment second,
LLM last (the session's recurring law: plural resolution, thinking
resolver, spend gate all landed on this shape):

1. **Gazetteer pass** (tier 0): scan the query with the span-preserving
   n-gram scanner (`scanForKnownEntities`) across ALL entity types
   INCLUDING ingredient, viewport/territory-scoped, returning character
   spans → entities with the types the data says they have.
   **REQUIRED SCANNER CHANGE (round-2 review, two reviewers converged
   independently): the existing scanner CANNOT do this.** Its greedy
   overlap filter treats same-span duplicates as overlaps, so a span with
   three active entities (breakfast: food + food_attribute +
   restaurant_attribute) survives as ONE arbitrary-order winner — decided
   by JS sort stability over DB row order. As-is, "types come from
   grounding" would reintroduce the never-look defect with Postgres row
   order as the guesser. Fix: return all same-span matches as one span
   carrying an entities[] list; overlap policy applies to SPANS, type
   policy to CONSUMERS. This is a shared dependency — polls highlighting
   uses the same scanner — so the change ships with a consumer-side
   single-winner policy for polls to preserve its display behavior.
   Two more scanner requirements from the same review: a HARD QUERY
   LENGTH CAP (sourceQuery has no @MaxLength; tokens x 4-grams on a
   5k-token query measured 3.8s — a self-inflicted DoS once this is the
   unconditional first step), and the SCAN QUERY REWRITTEN as a UNION of
   an indexed name arm and an alias arm (the current `name = ANY OR
EXISTS(unnest(aliases))` defeats the btree entirely — measured as a
   full seq scan; the earlier "alias-haystack index lever" claim was
   wrong, a trgm index cannot serve array-element equality; a normalized
   alias table is the durable fix).
   - Poll highlighting keeps its narrower type set — in a comment,
     attribute words are incidental prose; in a query every word was typed
     on purpose. One engine, per-consumer type set + display policy.
   - Overlap policy (OPEN, decide at build): longest span wins for
     segmentation; the shorter contained match ("taco" inside "breakfast
     taco") is retained as family evidence, not as its own span.
2. **Linker on the residue**: the calibrated conservative matcher
   (sweep-derived per-tier floors, tie plurality) for typos and variants
   the gazetteer can't see ("vgean" → vegan).
3. **NO PER-SEARCH LLM (RATIFIED 2026-07-29; supersedes the earlier
   "two irreducible jobs" framing).** Smoke-tested on the search-signal
   ledger — with the honest caveat that the corpus is 2 ACTORS / 157
   searches (the owner pre-launch, mostly single-entity queries): NOT
   traffic evidence, only proof the mechanics ground cleanly (151/157;
   3 of 4 misses are typos, the linker's lane). The decision rests on the
   owner's product ruling and the pipeline mechanics, not this number;
   re-measure on real traffic post-launch. The two formerly-irreducible jobs both leave the hot path:
   - **Negation: the FEATURE is removed** (owner: people do not search
     "pizza no tomato sauce"). ROUND-2 TRACE, then the RULING: removal
     alone does not ignore a negated phrase — it INVERTS it ("cilantro"
     is an active ingredient, so "tacos no cilantro" grounds cilantro as
     a POSITIVE constraint). **OWNER RULING (2026-07-30): ACCEPTED AS A
     FEATURE, not a bug — no cue guard.** The behavior trains users that
     the search box does not do negation, exactly as Google Maps does;
     the only negation the product expresses is through real entities
     (gluten free etc.) and the dietary toggles. The trade-off is known
     and chosen. Replaced by the DIETARY TOGGLE STRIP —
     LIFESTYLE toggles only (vegan, vegetarian, gluten-free, halal,
     kosher), mapping to HARD attribute constraints. ALLERGEN toggles are
     REJECTED (owner 2026-07-30): allergens are not discussed enough for
     the claim data to carry them — and the exclusion lane could only
     filter dishes KNOWN to contain the allergen; absence of evidence is
     not absence of nuts, so the toggle would imply a promise the data
     cannot keep. CONSEQUENCE: the excluded-ingredient lane is DELETED
     ENTIRELY (its only producer was LLM negation output) — DTO field,
     compiler clause, two-tier NOT SQL, and specs. Free-text negation is
     no longer interpreted.
   - **Unknown-phrase segmentation moves ASYNC.** Verified plumbing: the
     on-demand queue already receives cleaned per-TERM rows (never the raw
     query — it rides only as audit metadata), consumed by the §11
     four-family portfolio (unmet floor, cooldowns, cap, spend check)
     into literal Reddit keyword searches. Today term quality comes from
     the SYNC LLM; under zero-per-search-LLM, a batch-priced segmentation
     step INSIDE the demand pipeline (many residues per call) becomes the
     REQUIRED precondition before residue may become keywords — the same
     job relocated, not a new capability. SCHEMA IMPLICATION (red team):
     on_demand_requests.entity_type is NOT NULL, so raw residue cannot
     enter the queue as-is — it needs a staging landing zone (or an
     'unsegmented' holding state) that the batch segmenter drains INTO
     typed queue rows. "Logged as-is" was underspecified. Partial-grounding queries
     ("khachapuri at that place on 5th") get instant results from the
     known spans; the unknown term becomes a clean collection seed
     asynchronously. Per-search LLM cost -> zero; llmMs (the dominant
     interpretation latency) disappears.
   - **Junk discard needs no judgment**: junk words simply fail to ground
     and are ignored as residue. The necessary partner is extraction
     hygiene — principled (not word-list) §2.5 rules keeping
     best/good/top-class words out of the GRAPH, so junk can never ground.
     Jobs that DISSOLVED earlier on inspection (kept for the record):
     typing (→ data); filter extraction (never existed; trilemma resolved
     to attributes); attachment (never existed — six FLAT arrays,
     exclusions query-global); fallback decomposition (n-gram scan finds
     every KNOWN contained dish); ingredient-vs-dish direction (multi-type
     grounding + twin union).
4. **Nothing assigns types by guess.** Typing was the root cause of
   every query-understanding bug found this session (breakfast, sushi,
   tasting menu): the guess was made at the layer that lacks the facts,
   and type-scoped recall then never looked in the right vocabulary (the
   never-look defect). Types come from grounding — and with the hot path
   LLM-free, no component is left that COULD guess.

### 1.2 Ground (structured, never flattened)

Each span resolves to a STRUCTURED grounding — kept structured all the way
to the query builder:

- **anchors**: the entities the span names (all types it truly has);
- **family**: is-a instances via `derived_food_category_edges` (one-hop
  from anchors only — the transitive fan-out ban stands) + head-final name
  variants + twin ingredients. Family is MEANING, not widening: a "pizza"
  search that excluded neapolitan pizza would be wrong, not strict.
- **similar**: reciprocal-neighbor dense siblings (mutual-rank cut,
  ceiling-normalized relevance — the precomputed
  `derived_entity_sibling_edges` machinery survives unchanged).

**Anti-flattening law.** The current code merges everything into one
foodIds array and then reconstructs the distinctions with three pieces of
bookkeeping (exactFoodIds rebuild, relevanceByFoodId side-map, max-merge
rule). The ideal shape abolishes the flattening boundary instead of
compensating for it.

**One evidence engine for "same thing?", per-consumer floors.** The linker
(95%-precision floors) and search-time lexical expansion (different
floors) are today two independently tuned implementations of the same
question — the two-rate-tables disease. Unify the engine; keep DIFFERENT
admission floors per consumer, because the questions are differently
priced (a wrong LINK asserts identity; a wrong EXPANSION admit adds a
pool member that provenance + score-ranking absorb).

### 1.3 Filter (hard constraints — the four classes)

Hardness is a FACT, derived — never guessed per query:

| class                   | source              | examples                                                       | relaxable?            |
| ----------------------- | ------------------- | -------------------------------------------------------------- | --------------------- |
| structural              | request             | viewport, open-now, price                                      | never                 |
| **dietary requirement** | **vocabulary flag** | vegan, vegetarian, gluten-free, halal, kosher (LIFESTYLE only) | **never**             |
| preference              | default             | spicy, crispy, patio, cozy                                     | soft (richness-gated) |

COVERAGE MEASURED (red team 2026-07-30), so expectations are set before
launch: restaurant-side vegan 219 / halal 134 / vegetarian 110 / gluten
free 57 / kosher 10 venues; dish-side vegan 186 / vegetarian 114 / gluten
free 37 connections (Austin). Hard toggles WILL run thin — by design that
feeds precise demand, but kosher at 10 venues argues for launching the
well-covered four and adding kosher when the data can carry it (owner
call at build). DENOMINATOR (round-2): 8,612 active restaurants — so
even vegan's 219 is ~2.5% coverage; the sparse-hard-toggle UX question
is in the §7 owner queue. Gazetteer scan measured ~16-22ms today, but the
mechanism claim was WRONG: the `OR EXISTS(unnest(aliases))` shape defeats
the name btree, so it is an O(catalogue) seq scan, not an indexed lookup
— fine at 22k rows, linear growth after the reload; fix is the UNION /
alias-table rewrite in §1.1. The vs-LLM latency conclusion still holds.

RATIFIED 2026-07-29: dietary attributes are hard. Today's ladder DROPS
"vegan" (it lives in the droppable food-attributes bucket) — for a vegan
user that is a wrong answer, not degradation. The fix: a small CURATED
`constraintClass` flag on the attribute entities themselves (closed set,
owner-approved; everything unflagged is soft). When a hard constraint
makes results thin we do NOT relax — we show what honestly exists and
fire the precise demand signal. "Include similar" (the chip) remains the
user's explicit opt-out.

### 1.4 Pool (one query; soft constraints; the richness gate)

One execution per projection. In-query, every candidate row computes which
constraints it satisfies (provenance). Membership policy:

1. Subject + family: always required (subject is sacred). COMPOSITION LAW
   — corrected TWICE and now stated from verified code, with the change
   marked as a change: multiple SUBJECT spans compose as OR (one
   `= ANY(...)` clause; "tacos and pizza" means either). MODIFIERS today
   compose as OR WITHIN their bucket too (`c.food_attributes &&
ARRAY[...]` is array OVERLAP — "spicy crispy tacos" = spicy OR
   crispy); AND holds only ACROSS buckets. Therefore per-word soft
   constraints with AND semantics are a BEHAVIOR CHANGE, not a
   preservation — under today's semantics no state exists where "spicy"
   alone fails. **RESOLVED (owner, 2026-08-01): richness-gate semantics —
   all-words matches preferred, partial matches admitted only when full
   matches are scarce — CONDITIONAL on the adaptation happening inside a
   single request (no second search). The in-query gate satisfies this by
   construction (per-row provenance → cumulative window gate → score
   order, one execution).**
2. Hard constraints: absolute walls.
3. Each PREFERENCE is individually droppable — per WORD, not per type
   bucket (today "spicy vegan tacos" thin drops spicy AND vegan together;
   per-word can keep vegan-only matches first — and with vegan now hard,
   spicy alone is what relaxes).
4. **THE RICHNESS GATE (named invariant):** soft misses are admitted ONLY
   when full matches are scarce. Without it, score-alone ordering makes
   every soft word decorative. Expressible in-query — round-2 PROVED the
   shape (per-row provenance booleans → cumulative window gate → score
   order): 5.98ms on today's data, deterministic membership, stable
   pagination. TWO DESIGN CONSTRAINTS the proof also surfaced:
   (a) OPEN-NOW: today's relax trigger counts POST-openness rows, and
   openness is evaluated in JS — an in-SQL gate counts pre-openness
   candidates (50 matches, 3 open: today relaxes, the naive gate does
   not). The gate DECISION must therefore be computed on the
   openness-aware candidate set and passed into the query as a parameter
   for the open-now path.
   (b) PHASE-2 HYDRATE: the open-now hydrate re-runs the builder
   restricted to page ids; a gate embedded in the shared CTE stack would
   recompute over ~20 rows and flip. Same fix: gate decided once per
   request, parameterized in.
   THRESHOLD PROVENANCE (round-2): today's 10 is an inherited bare
   literal from the original commit — neither measured nor owner-chosen.
   Under the no-fake-estimates law it must be adopted EXPLICITLY or
   re-derived; and per-word gating counts a different quantity than
   today's per-bucket count, so "transfers" was unexamined. NOT optional
   either way.
5. Similar ring: admitted only behind the user's "Include similar" chip
   (existing behavior, kept).

What this dissolves — scaffolding that exists only because the pool is
assembled from separate executions: stage probe queries, exclusion-id
lists, hand-rolled strict/relaxed pagination stitching.

### 1.5 Rank

One pooled list per projection, ordered by score alone (or rising).
Provenance (exactMatch, relevance) rides as data for the chip, display,
and demand — never as sort key. Round-2 VERIFIED the score-alone claim
(exactMatch is null in production config; pooledOrder degenerates to pure
score). Behavior preservation is re-scoped from "identical" to
"identical EXCEPT an explicit intended-divergence list", because two
divergences are now known and deliberate: (1) the pre-existing page-1
row-loss bug (client pageSize < threshold strands strict rows 6-10 on no
page — the single query FIXES this), and (2) whatever the owner rules on
modifier AND-vs-OR (§1.4.1).

### 1.6 Learn

Unresolved spans (understanding) and per-word failures (pooling: "nothing
satisfied _vegan_ here") feed on-demand collection with the word, the
viewport, and the covering engines. This is strictly better input than
today's "few results" — the improvement falls out of provenance for free.

## 2. What the wideners actually are (the three-questions taxonomy)

They are not three tiers of one mechanism; they are answers to three
different questions, and belong in different layers:

- **Family membership** = _what does the word mean_ → grounding, every
  search. Not widening; a pizza search without neapolitan pizza is wrong.
- **Lexical retry + dense siblings** = _did we find who you meant_ →
  grounding (the one evidence engine), thin-triggered, budgeted,
  fail-open.
- **Preference relaxation** = _what did you require_ → the query layer,
  per-word, richness-gated. The ONLY mechanism that sacrifices any part
  of the ask.
- **On-demand collection** = _we don't have it; go get it_ → the fourth
  ring; any spec that omits it treats an open-world product as
  closed-world.

## 3. Comparison to current (how far off are we?)

SURVIVES the derivation unchanged (would rebuild the same):

- Two projections (dish/restaurant dual query) — requirement 7 produces
  it; "one merged query" is NOT the ideal (two output shapes, no latency
  to win — they already run in parallel).
- Pooled pure-score presentation incl. the continuous strict→relaxed
  pagination stream; the "Include similar" chip; fail-open interpretation
  (LLM outage → browse); open-now two-phase filter-then-hydrate;
  signals recording {entityId, term} untyped; sibling machinery
  (reciprocity cut + ceiling normalization, precomputed); one-hop family
  law; probeServesAsPage economics.

FAILS the derivation (one connected mistake — typing at the wrong layer —
plus one flattening):

- LLM assigns types → type-scoped recall never looks in the right
  vocabulary (never-look defect; the food→ingredient fallback lane is a
  hand-patch of exactly this).
- Six typed buckets, AND-composed → cannot express one span with two
  placements.
- Type-keyed relaxation ladder (whole-bucket drops; probe re-runs;
  exclusion lists; pagination stitching) → per-word, in-query provenance.
- Provenance flattening at the constraints boundary (one foodIds array +
  three reconstruction mechanisms).
- Dietary attributes relaxable (droppable bucket) → hard class.
- Two "same thing?" implementations with divergent floors → one engine,
  per-consumer floors.
- Gazetteer exists but is unused by search; missing ingredient type AND
  structurally one-type-per-span (the §1.1 scanner change).
- A THIRD projection exists that the derivation missed: see-locations
  (lean single-restaurant + in-view locations, bypasses the ranking
  pipeline entirely). Untouched by this redesign — named here so scope is
  honest, not discovered mid-build.

## 4. Migration order (each step shippable and reversible; steps 1-2

change visible results BY DESIGN — the header no longer claims otherwise)

**BUILD STATUS (2026-08-01, all structural steps LANDED + empirically
verified on the mirror; commits 4a538e49 → 1e50ef3f):** step 1 dietary
hardness ✅ (earlier); step 2 ✅ untyped exact recall + lemma variant
probes + single-bucket placement (dietary wins; deterministic order;
curated list = calibration tail) in the linker chain, 4 specs +
real-data premises verified; step 3 ✅ pooled window-gate behind
SEARCH_POOLED_MODE=off|shadow|on (shadow diff harness; relax forced off
in 'on'), smoke-verified incl. openness-aware gate + hydrate-never-
gates, 9 shape specs; step 4 ✅ structured grounding
(SearchConstraints.grounding.food; flat foodIds/exactFoodIds/relevance
are derived views — the three reconstruction mechanisms are deleted) +
one evidence-admission authority (evidence-admission.ts, per-consumer
floors); step 5 ✅ per-word starvation (soft_word_counts in both pooled
counts → executor → starvedWords on demand context + narrowed
requests). Zero-per-search-LLM plumbing ✅: unsegmented staging table +
env-gated async segmenter cron + SEARCH_GAZETTEER_UNDERSTAND=
off|shadow|on (residue-join rule implemented in 'on'). Calibration
instruments ✅ built, readings PARKED (calibration-instruments.ts:
conflicts/junk/threshold; linker-calibration-sweep.ts pre-existing).
Nothing is FLIPPED: pooled off, gazetteer off, segmenter off — the
ladder still serves until shadow parity is measured.

**EMPIRICAL RED TEAM (2026-08-02, real Nest context + mirror DB, no
mocks) — 6/6 PASS** after one real finding fixed: (1) lemma probe:
"empanadas" grounds to "empanada" tier=exact — the finding was that a
FUZZY typed link ("birria empanada") was accepted before the variant
EXACT ran; ordering fixed (2bd80cdd1); (2) untyped re-bucket: a
food-typed attribute-only term lands in restaurant_attribute; (3)
gazetteer-on grounds compound span "breakfast tacos"; (4) junk residue
"blorptastic" writes exactly one staging row; (5) pooled-on runQuery
end-to-end: 25 dishes, tier-ordered, bounds applied, total=560; (6)
starved-word computation yields exactly the zero-coverage term.
Harness gotchas recorded: bounds DTO is northEast/southWest (wrong
casing silently disables bounds → world-scope queries look like a
hang); stopCronsForScript does NOT stop BullMQ queue workers (a
long-lived harness will process real jobs — mirror only, but beware).

0. RE-SEQUENCED (owner 2026-07-30): the program is now **search STRUCTURE
   (this plan, now) → data audit + prompt review cycle (its own third
   plan) → charter reload → search CALIBRATION tail.** Only the
   calibration-dependent work waits for the post-reload graph: the linker
   re-sweep, the ~44-name placement curation, the richness threshold
   adoption, and the junk sweep. Everything structural below is
   graph-content-independent and builds NOW; each thing is then measured
   exactly once, against data that is done changing.
1. **Dietary hardness** (user-visible correctness). Round-2 corrected the
   scope: there is NO per-id drop mechanism — relaxation zeroes a whole
   presence count — so this is THREE coordinated call-site changes
   (partial-drop in buildSearchConstraints; canDrop\* recomputation when
   every food-attr is hard; blocking relaxed_modifiers, which drops both
   buckets and is preferentially selected), not a flag. COUPLING: step 2's
   placement of "vegan" (itself multi-type) must respect the dietary flag
   over dominance, or step 1's exemption silently stops applying — the
   dietary flag WINS placement, by rule.
2. **Untyped RECALL behind the existing buckets** (RED TEAM 2026-07-30
   re-scoped this step — as first written it was incoherent): today's
   buckets AND against each other (verified: the restaurant query ANDs the
   attribute clause at builder line ~206), so placing one span's grounding
   into TWO buckets would demand BOTH match — "breakfast" would require a
   breakfast-family dish AND a breakfast-attributed venue. OVER-constraint,
   the opposite of the fix. So step 2 does what the buckets CAN express:
   full-vocabulary recall (gazetteer + linker see every type), then
   SINGLE-bucket placement. Round-2 KILLED the dominance formula: honest
   per-type counts for breakfast are 606 food_attribute / 355 food / 323
   restaurant_attribute (the earlier "929 vs 264" summed two buckets on
   one side and undercounted the other), dominance is ill-defined for
   roughly half the 827 multi-type names (423 under 10 events, 69 exact
   ties), and it places "vegetarian" into the RESTAURANT bucket against
   the dietary rule. The honest mechanism: only ~44 names are genuine
   cross-bucket conflicts (690 of 827 are food+ingredient pairs the twin
   union already serves) — placement is a small CURATED list, dietary
   flags win by rule, everything else follows its only bucket. This
   kills the never-look defect at the RECALL level only;
   full multi-type placement (OR within a span) lands with step 3's
   constraint model, which is the layer that can express it. Requires the
   linker re-sweep (floors were fit to type-scoped recall).
   LINKER RESIDUE RULE (red team): the linker must probe residue tokens
   JOINED with adjacent grounded spans, not tokens alone — "brekfast
   tacos" grounds "tacos", and only the joined candidate "brekfast tacos"
   can fuzzy-reach the COMPOUND entity "breakfast taco"; a lone "brekfast"
   probe fragments the span into breakfast+taco and loses the compound.
   (Today the sync LLM emits whole phrases, masking this.) Round-2 made
   this rule load-bearing for ORDINARY PLURALS, not just typos: exact
   grounding is alias-dependent and 1,003 of 1,085 single-word foods
   carry no plural alias — "empanadas" grounds only because the lemma
   variants / linker catch it. Wire the food-lemma variant probe into the
   gazetteer candidate set so number never depends on alias luck.
3. **Single-query pooling with provenance + richness gate**, run alongside
   the ladder on real queries until output matches, then delete the
   ladder, probes, exclusion lists, and pagination stitching.
4. **Structured grounding to the builder** (abolish the flattening +
   its three reconstruction mechanisms); unify the evidence engine with
   per-consumer floors.
5. Per-word demand signals (falls out of 3; wire to on-demand context).

## 5. Open questions (decide at build, not before)

- Gazetteer overlap policy details (longest-wins segmentation + contained
  matches as family evidence) — validate on real queries.
- ~~The richness threshold (today's 10)~~ **RESOLVED (owner, 2026-08-01):
  one full page (DEFAULT_PAGE_SIZE = 25).** Applied to
  RELAX_STRICT_THRESHOLD immediately; the step-3 gate inherits the same
  value; re-measure in the calibration tail. Audited: no other bare-10
  relax knobs exist in the search module (ON_DEMAND_MIN_RESULTS=1 is a
  different, intentional knob).
- Primary-entity rule for the search signal when a span grounds to
  multiple types (today: targets[0]; consider recording all).
- Whether the LLM skip gate should also require no digits/no comparatives
  (defensive additions to "residue empty").
- Linker re-sweep corpus refresh (974 pairs + 300 controls predate the
  reload vocabulary).
- VOCABULARY CURATION (owner, deferred to the post-implementation prompt
  passes): "dinner date" should have been banked as an alias on
  'romantic' and archived — the round-2 "date grounds as the fruit"
  finding is a curation gap of this kind, not a pipeline defect. Sweep
  the vibe-phrase vocabulary for peers when the prompt passes run.
- RETROACTIVE junk cleanup (round-2): junk already lives as ACTIVE
  entities and WILL ground — restaurants named "Best", "Place",
  "Favorite" (zero geocoded locations; escape territory scoping whenever
  no engine covers the viewport), food-side "fresh"/"classic"/"dinner",
  and 299 extraction-fragment names of 5+ words. §2.5 hygiene is
  forward-looking only; schedule the sweep of the existing rows.
- ~~Price/hours words trilemma~~ **RESOLVED (owner, 2026-07-29):
  ATTRIBUTES, never toggle pre-fill.** Pre-filling toggles from "cheap"
  would establish an inference contract owed forever ("fancy", "date
  night", "dinner" ...) where every miss reads as a bug; suppressing the
  words is prompt work in the wrong direction. As plain attributes they
  match where the community made the claim, drop via the richness gate
  where claims are sparse, and the drop itself teaches the toggle —
  degradation as instruction. CORRECTION (measured 2026-07-29): no curation
  act is needed — the active 'affordable' restaurant_attribute already
  carries 35 aliases including 'cheap' and 'cheap eats' (the archived rows
  are tombstone sinks from a correct ontology pass: food-side 'cheap'
  REJECTED as not a dish property; restaurant-side merged with the name
  banked). "cheap" grounds via the alias tier today; the earlier
  "dead word" claim checked archived name rows but not aliases.

## 6. Worked example (the mental model)

Query: **"vgean breakfast tacos, no cilantro"**, map on Austin.

- Understand: gazetteer grounds "breakfast tacos" (anchors + family:
  migas taco, breakfast burrito…) with every type breakfast truly has;
  linker resolves "vgean"→vegan (dietary-flagged, hard); "no" is
  ungrounded residue and "cilantro" grounds as a positive ingredient
  span — BY RULING (accepted inversion; the box does not do negation,
  like Google Maps). No LLM ran.
- Constraints: viewport hard; vegan hard (dietary flag); breakfast-taco
  family required. (No exclusion exists — the lane is deleted.)
- One query, gate decision parameterized in: 12 vegan breakfast tacos
  exist → exactly those, score-ordered. Only 3 exist → still ONLY those
  3 (vegan is hard; nothing relaxes), and collection is told "vegan
  failed in this viewport". If instead a SOFT word had gone thin
  ("spicy"), non-spicy rows would join the pool — one score-sorted list.

## 7. Round-2 fresh-context adversarial review (2026-07-30) — status

Three independent reviewers (systems, product, data), no access to the
authoring context. Every finding above marked "round-2" came from them
and was verified against code/data before being folded in. What HELD
under genuine attack: the gazetteer-first + types-from-data architecture,
score-sovereign pooling (verified pure-score in production config), the
single-query gate shape (5.98ms proof), alias depth, Spanish dish-name
grounding, the linker residue rule, claim-identity scoring, and every
headline number (reproduced within drift).

**OWNER DECISION QUEUE (design questions the reviews opened; not mine to
settle):**

1. ~~SPARSE HARD TOGGLES~~ **RESOLVED (owner 2026-07-30): ship hard;
   sparse coverage is EXPECTED, not surprising.** The remedy is
   EXTRACTION-side, not UX-side: a dedicated prompt pass ensuring every
   raw-data mention of gluten free / dietary terms is captured and
   PERMANENTLY linked as restaurant attribute evidence (work item for
   the post-implementation prompt passes). Dietary attributes are also
   EXCLUDED from lexical expansion and the similar ring — a hard
   constraint is never reinterpreted.
2. ~~CHIP vs WALLS~~ **RESOLVED by code verification (2026-07-30): the
   chip already respects every wall.** It widens ONLY the food subject
   ring (siblings anchor on resolved food ids; attributes are
   structurally untouchable), the widened run keeps all other
   constraints, and when walls leave nothing similarAvailable reads 0 —
   the chip goes naturally inert, which is honest. NEW-PLAN improvement:
   today the chip's badge costs an EXTRA dual query on every page-1 food
   search (attachSimilarPreview); in the one-query design the similar
   ring is provenance in the SAME execution (excluded from the default
   view, counted for the badge) — the extra execution dissolves.
3. ~~MODIFIER SEMANTICS~~ **RESOLVED (owner 2026-07-30): OR stays.**
   "spicy crispy tacos" keeps meaning spicy OR crispy — today's semantics
   are the product. Per-word provenance still lands (it powers the
   richness gate and demand signals); only the COMPOSITION stays OR, so
   the migration is behavior-preserving on this axis after all.
4. ~~PARTIAL-GROUNDING HONESTY~~ **RESOLVED (owner 2026-07-30): keep as
   is — silent.** No unresolved-terms affordance in the UI; half-grounded
   queries return what grounded, and the residue works through the demand
   pipeline. Consistent with the negation ruling: the box teaches its own
   grammar by behavior, not by disclaimers.

THE QUEUE IS EMPTY — every design question from both review rounds is
ratified, verified, or explicitly deferred with an owner ruling.
