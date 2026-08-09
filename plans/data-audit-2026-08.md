# Full Data Audit — 2026-08-01

Five parallel fresh-context auditors (Opus) over the local prod mirror
(refreshed 2026-07-31, post-reload, NY knowingly ~43% rebuilt), one per
surface: restaurants, foods/ingredients, attributes/aliases,
connections/edges, pipeline health. Method: every smell verified by
pulling the raw source documents and replaying what a correct extractor
should have produced; findings marked CONFIRMED (raw text proves it) or
PLAUSIBLE. This document is the canonical record; the prompt-review cycle
and the pre-rerun fix list derive from it.

## CURRENT STATE (updated 2026-08-05) — READ THIS FIRST

This file is append-only and its later sections SUPERSEDE its head. What was
found on 2026-08-01 has since been built, red-teamed (rounds 5–9), and ruled
on; do not act on the as-found VERDICT / P0 / P2 lists below without reading
the resolution tag now attached to each item. Where a section is superseded
wholesale it says so inline. Nothing here is a new measurement — every
correction already lived further down the file and has only been surfaced to
the top.

- **The two "active structural defects" are CLOSED.** The attribute tombstone
  leak is fixed — cuisine facet ② drained the 11k stranded backlog and junk
  sinks now DROP at write time (see EXECUTION RECORD ②); round-9 re-measured
  "0 stranded; 58 cross-type redirects" (RULINGS RE-ANSWERED WITH DATA). The
  event double-count was addressed in the CLASS ②–⑤ build and proven by the
  round-8 rebuild-idempotence + counter-invariant check (0 mismatches).
- **The RESTAURANT hygiene + vocabulary + edge fixes SHIPPED** (EXECUTION
  RECORD ③④⑤), deployed 2026-08-01/02.
- **The P2 owner decisions are CLOSED**, first by the 2026-08-01 verification
  update (three dissolved on re-checking prompt+code), then by OWNER RULINGS
  (2026-08-05, decisions closed / round 2 opened). Only genuinely-open items:
  P2.6 Places backfill spend (deferred by owner) and the round-2 items the
  OWNER RULINGS section lists.
- **Live-ops flag, current:** the `CRONS_ENABLED=false` kill-switch was
  REMOVED 2026-08-03 ~00:35 UTC (owner authorized) — see OPERATIONAL note in
  the adoption-ladder section; `COLLECTION_SCHEDULER_ENABLED` stays false
  until prompt activation. The earlier in-file line describing the switch as
  standing/armed is as-of-2026-08-02 and is superseded by that removal.

## VERDICT (as found, 2026-08-01 — superseded by CURRENT STATE above)

The graph's arithmetic is sound (counters reconcile 0/17,901; redirects
flawless; menu-item projection 99.94%) but the PIPELINE had two structural
defects then silently corrupting scores (attribute tombstone leak,
cross-shard duplicate events — BOTH now closed, see CURRENT STATE), the
RESTAURANT type carried ~17% junk+dupes (hygiene ③ shipped), and several
vocabulary/taxonomy decisions needed owner rulings before the re-extraction
prompt was final (all now ruled — see P2 tags below).

## P0 — PIPELINE DEFECTS (as found 2026-08-01 — see resolution tags; all closed)

> **RESOLVED (2026-08-02):** every P0 below was fixed in the CLASS ②–⑤
> EXECUTION RECORD and proven across red-team rounds 5–9. Items 1–3 are the
> tombstone/dedupe cluster (② + round-8/9); items 4–5 are the active-run join
> + two-table split (round-8 #2 `activeRestaurantEventsSourceSql()`, praise
> lane 16→16). The list is kept as the as-found record.

1. **Attribute tombstone leak** (health §4, CONFIRMED). RESOLVED — cuisine
   facet ② drained the 11k backlog; junk sinks DROP at write; round-9
   re-measured 0 stranded. Archival
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
2. **Cross-shard duplicate events** (health §3, CONFIRMED). RESOLVED —
   addressed in the CLASS ②–⑤ build; round-8 rebuild-idempotence + counter
   invariant verified 0 mismatches. Event
   uniqueness was keyed on extraction_run_id, so a doc extracted by 2+
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
  > **SUPERSEDED 2026-08-02:** the build DID land a cuisine FACET — EXECUTION
  > RECORD ② ships "61 canonical rows (facet='cuisine')" with cross-type
  > redirects. Read that section, not this "no new facet" phrasing, for the
  > shipped shape.
- **P2.2 chains — RULED 2026-08-02 (owner agreed): METRO-AWARE
  RESOLUTION, not per-metro entities.** The shipped model is correct and
  stays: ONE brand entity, grounded once via location-biased Places,
  secondary expansion attaching every same-domain + same-brand-name
  place as an additional location (Jet's Pizza ×56), search geo-scoped
  by locations, votes on the entity. The defect is that RESOLUTION is
  global name-match-first — executed proof: r/austinfood "I love mi
  tradicion and comadre, I'll also throw Joes into the mix" (Joe's
  Bakery, Austin) credited to NYC's Joe's Pizza entity. THE RULING: a
  mention may only ADOPT a candidate that has a location in (or near)
  the mention's community metro; otherwise it MINTS a new entity,
  grounded locally by the existing enrichment. True chains stay whole
  (their expanded locations pass the metro test in every metro they
  operate); same-name strangers stay separate. Resolver change, no
  schema. Cross-metro TALK stays legal (NYC discussing Franklin
  Barbecue is real testimony about the Austin entity — the metro test
  gates which ENTITY a name resolves to, it never drops evidence).
  Rejected: per-metro chain entities (fights the expansion model).
  BUILD ORDER: red-team this shape first, then implement in the
  resolver during the database/extraction-prompt phase; repair the 81
  existing cross-metro-evidence entities (split misattributed events by
  re-resolving under the metro rule) as part of the rerun.
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

> **ALL SIX ANSWERED — do not present as open.** The VERIFICATION UPDATE
> directly above (P2.1–P2.6) and the OWNER RULINGS (2026-08-05) below close
> every item; the numbered list is the original as-raised phrasing, kept for
> provenance. Tags: (1) cuisine → FACET shipped (EXECUTION RECORD ②); (2)
> chain/branch → RULED metro-aware resolution (P2.2); (3) dietary → data fix,
> micro-rulings stand (P2.3); (4) food→category → edges are truth, shipped
> ⑤ (P2.4); (5) sourcing/provenance → ordinary food attributes (P2.5); (6)
> ungrounded backfill → owner-DEFERRED, re-priced to ~$38 (see Correction
> 2026-08-03 below).

1. **Cuisine gets its own slot?** [ANSWERED — facet shipped, EXECUTION
   RECORD ②.] 57% of restaurant_attribute evidence
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

> **Correction 2026-08-03 (truth audit):** the `$0.028/venue` unit cost in
> item 6 (and the `~$25` total it produces, echoed in P2.6 above) is FALSE.
> `$0.028` summed `placeDetails` only, dropping `findPlaceFromText` +
> autocomplete — the same "summed the wrong column" error that hid the $118
> Places line in the first all-in reload figure. Re-measured 2026-08-02
> against the BigQuery billing export (`crave-467301.billing_export`) on the
> 07-30/31 re-grounding — 7,115 newly grounded locations, $323.10 billed —
> the real rate is **~$0.045 per newly GROUNDED LOCATION**. So ~850 venues
> is **~$38**, not ~$25. Any owner approval should be sought at the
> corrected number.

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

## EXECUTION RECORD — CLASSES ② through ⑤ (2026-08-01/02)

All four classes built, red-teamed twice (static + execution adversaries),
dress-rehearsed on a fresh prod mirror, and deployed:

- ② Cuisine facet: 61 canonical rows (facet='cuisine'), redirects from
  every archived variant (both attribute types AND active food_attribute
  twins), 11k stranded-event backlog drained; junk sinks now DROP at
  write time. Tombstone classes explicit: merged→redirect,
  reclassified→redirect, rejected→sink.
- ③ Restaurant hygiene: ~60 confirmed non-restaurants archived (user-
  anchored venues EXEMPT — H-E-B/Whole Foods stay); nightly dedupe sweep
  upgraded to the canonical fold + a prefix lane (ungrounded-stub only,
  ambiguity-guarded, same evidence hierarchy — cross-metro shapes HOLD,
  verified empirically); food dedupe gains the nightly cron.
- ④ Vocabulary: occasion attributes redirected cross-type, duplicate
  rows merged, templated/sentiment aliases stripped, alias hygiene
  rules; identity_key GENERATED column + self-healing partial UNIQUE for
  attribute types (foods = lock+probe+sweep; restaurants await P2.2).
- ⑤ One category source of truth (derived edges; rollup verified
  EXACT against hand-computed totals on real data), edge minting
  threshold at mint time, hygiene pins.

THE CANONICAL FOLD (round-6 lesson, defined once, mirrored everywhere):
lower → strip apostrophes → non-alphanumeric runs become ONE space →
trim. Any new comparison site must use exactly this.

Remaining before the re-extraction: FULL projection rebuild on prod
(runner armed post-deploy) + Crave Score refresh; Places backfill
campaign estimate awaiting owner approval; P2.2 (chain/branch) and P2.3
(dietary side) rulings; then the prompt-review cycle (P3 checklist).

## P3 RECONCILIATION (big-one red team #5, 2026-08-02 — do this in the

prompt-review cycle before pushing any candidate)

ADD (7 confirmed defects missing from P3): possessive/punctuation name
splits (emit ONE stable surface form); word-order food variants;
truncated food tokens (the `jap`←jalapeños class — slur risk); context-
stripped fragment attributes (`frozen`); attribute near-synonym
splintering (`generous portions`/`jumbo`); `cocktails`-into-
food_categories cross-namespace leakage; asserted-vs-inferred category
marking (needs an output-schema field).

DROP (already fully encoded in the shipped prompt): cuisine-as-food ban,
occasion→restaurant_attribute, concessive recall, closed-venue policy
(P3's item is STALE — §1.4/§1.5 already cover it), availability-vs-
endorsement, menu-format nouns.

TWO CONTRADICTIONS needing prompt-text REVERSAL, not addition: §1.2
currently teaches slash-joined names as a venue SERIES (the exact
mechanism of the Uchi/ko split); §3.2 + two flagship examples emit
`rich` as a food attribute while P3 bans bare intensity words. Owner
should see both before the rewrite.

## FINAL RED TEAM (round 8 — "the big one before prompt work", 2026-08-02)

Two Opus agents (cross-system synergy; live-pipeline execution) + prod-state
prong. Everything executed: mirror rollback experiments, real cron bodies in
apply mode, prod read batteries. Confirmed clean: identity-lock concurrency
(1 food + 1 attr from racing twins), junk sink, redirect follow, merge/dedupe
convergence (2nd pass byte-identical no-op), rebuild idempotence + counter
invariant 0 mismatches, score archived-exclusion, claims race (1 winner),
compaction guard, activation trimming, claims/discard boundary, redirect graph
(0 cycles/dangling/2-hops on prod), fold parity TS↔SQL 17,564/17,564.

FIXED from this round (all proven by re-execution):

- F1 GC destroyed the retained generation rollback depends on → support =
  ANY surviving event again; reclamation happens through discard.
- F6 supersede:'delete' was cross-generation → hash-scoped in the service.
- F3 Unicode-blind fold → crave_fold() DB function + byte-identical TS
  canonicalFold (migration 20260802010000, accent translate + curly-quote
  strip); all SQL sites now call the function.
  > **SUPERSEDED 2026-08-02 (see IDENTITY redesign below):** crave_fold() and
  > the generated column were DROPPED by migration 20260802050000 —
  > canonicalFold (TS) is now the ONLY implementation and identity_key is
  > app-written. The only surviving `crave_fold` mentions in src/ are
  > epitaphs. Do not treat the DB fold as live.
- #1 nightly merge cross-metro false positives (Gueros→Gueros Brooklyn,
  Andiamo→ANDIAMO PIZZA — would have fired at 3AM; worker taken down at
  02:58 UTC to stop it) → DOMINANT-community gate; re-run: andiamo holds,
  gueros never reaches judgment.
- #2 praise lane counted superseded generations → active-run join via new
  activeRestaurantEventsSourceSql() fragment (injection probe: 16→16).
- #5 merge losers stayed publicly scored → prune inside merge tx.
- F4/#3 stale attribute arrays (2,370+1,972 restaurants) never revisited →
  repairOrphanedProjections now selects stale-array restaurants; search tag
  rows filter archived; #4 structural no-op orphans excluded (food-event
  EXISTS).
- F5 junk re-mint (1,608 terms) → rejected-tombstone adopt; P2002 on create
  → savepoint + adopt winner. #6 word-order twin lane (token-multiset,
  OR-support). #7 entitiesCreated reports DB truth.
- Lockdown conformance: new scope fragments (communities/dominant/sources);
  ops-token spec aligned with the header-only security fix.

Prod facts recorded: rescore converged 02:11; sweep crons live at 4AM UTC
nightly; archived signal/score residue clears via the (now healable-only)
repair + tombstone sweeps; one restaurant (Sway→sway thai, 8 events) awaits
the sweep. Worker DOWN pending this deploy.

## FINAL-FINAL RED TEAM (round 9 — read surfaces + whole-session synergy, 2026-08-02)

Two Opus agents (read surfaces/hostile inputs; whole-session contradictions)

- rulings-vs-data prong. Fixed, all proven by execution: GC preserved
  tombstones (91% of its kill list was junk-verdict + merge-loser memory) and
  now cleans redirects both directions; identity_key_sorted app-written column
  unifies the four divergent food-twin predicates (order lane judge-gated —
  "dumpling soup"≠"soup dumplings"); empty fold is no identity (nfc: fallback
  key, index + probes exclude ''; '食べ放題' no longer sinks 'Шведский стол');
  Turkish-İ combining-dot strip re-unifies the TS/SQL fold (twin restaurants
  minted live in the race harness before; corpus parity 17,559/17,559 after);
  restaurant profile + dishes resolve one redirect hop and never serve
  archived; search carries explicit r.status predicates + archived attribute
  ids stop matching; named-but-unresolved lanes report 'unresolved' instead of
  full-coverage generic browse; names clamp to 255 (P2000 aborted whole
  batches). Verified unbreakable: compaction guards, supersede coherence,
  RESTRICT FKs vs all delete paths, ballot lane one-voter-one-count (first
  real execution), activation poll_surface guard (proven load-bearing with a
  red control), curated filters, redirect graph.

RULINGS RE-ANSWERED WITH DATA (for the prompt/database phase): cuisine
"stranded 11k" already fixed (0 stranded; 58 cross-type redirects encode the
one-canonical-per-cuisine shape — keep it, note it in the prompt); 16
cuisines + vegan still exist as active DISHES → rerun cleanup list; dietary
dupes structurally impossible now; edges-are-truth already shipped (residual
158/2,886 pairs inert); chains: the model is brand-entity + multi-location +
geo-scoped search (correct), the defect is GLOBAL name-first resolution —
executed proof: r/austinfood "Joes" (Joe's Bakery ATX) credited to NYC's
Joe's Pizza. P2.2 design: METRO-AWARE RESOLUTION (adopt only candidates
with a location in the mention's metro; else mint + ground locally); per-
metro chain entities rejected (fights the expansion model).

## ROUND 10 (time + violence lenses, 2026-08-02) — CAMPAIGN CLOSED

Aging simulation (9 nights, churn injected, judge stubbed both ways): system
CONVERGES — byte-identical invariant panels once quiet, no metric trends or
oscillates. Fixed from it: the nightly merge sweep had been THROWING every
night since Aug 1 (42P01 missing alias; 66-restaurant backlog merged on
first successful run — fix was already on HEAD via the parallel session);
both sweep lanes now refuse the EMPTY fold (executed: a Chinese noodle shop
was archived into a Russian dumpling house on the '' group); judgeRejected
counter += not =.

Violence (kill-mid-transaction, all 8 targets): the transactional core HELD
— merge/activation/rebuild all roll back atomically under
pg_terminate_backend at every injection point, advisory locks release on
connection death, claims lease/reap correct in all five arms, savepoint
transparent under real P2002 fire, P3009 blocks boot on partial schema,
every sweep double-run byte-identical, 13 concurrency rounds with zero
deadlocks/resurrections/drift. The one wound: the merge tx had NO timeout
budget and per-event round-trips — P2028 abort above ~3,000 events
(permanent, silent; prod's 583-event max was already at the cliff on WAN
RTT arithmetic). Fixed: set-based re-key (two statements, in the scope
service per the lockdown) + explicit 15-min budget; 5,000-event merge now
completes in 231ms (was: permanent abort).

Ops drift prong: RUN_LEDGER_REPAIR=1 found still armed on the prod worker
since July — disarmed. Standing owner flags: CRONS_ENABLED=false +
COLLECTION_SCHEDULER_ENABLED=false (the other session's kill-switches —
nothing scheduled runs until reverted).
> **SUPERSEDED 2026-08-03:** CRONS_ENABLED was REMOVED ~00:35 UTC (owner
> authorized) — see the OPERATIONAL note in the adoption-ladder section.
> COLLECTION_SCHEDULER_ENABLED remains false. CRONS_ENABLED=false is NO
> LONGER the live state; do not act on this line for prod.
Standing residue, deliberate:
restHeld=8, dup_identity_groups=14 incl. exact-name chain twins (Blaze
Pizza ×2) — P2.2 metro-aware-resolution territory.

## ROUND 11 — SEMANTIC GROUND-TRUTH AUDIT (2026-08-02, 70 claims hand-graded, ~150 docs read)

Verdict: the CORPUS is trustworthy (restaurant attribution ~92%, praise
10/10, negation 9/10, questions 10/10, multi-restaurant 11/12, list-post
inflation not real, category quarantine works) — but the RANKING built on
it is not yet:

**TOP MACHINERY ITEM (owner decision, scoring phase): direct-evidence
floor.** 48 of the top-100 dish connections rest on ONE direct mention —
restaurant-level support carries any dish at a famous venue to ~10.0
(63.1% of the 822 connections displaying 9–10 are single-mention). Live
worst case: `nopales taco` @ LOS TACOS No.1 at 9.98 sourced ENTIRELY from
one line of an unvisited trip plan. Proposed: display/ranking floor on
direct dish evidence (support may not substitute for it). This is a
score-constitution change → owner ratification.

**P3 ADDITIONS (extraction classes found live, with doc ids in the round
transcript):** plan/itinerary-as-endorsement (NEW — seeded 2 top-15
claims); directory/event-listing-as-endorsement (NEW — one charity
fundraiser directory minted 28 claims across 17 restaurants);
availability-as-endorsement is STILL LIVE (P3 wrongly dropped it as
"already encoded" — un-drop); rating-qualified-lukewarm read as praise
("6/10 … a bit rich" → endorsement, NEW); negative-review-projected
(rare, NEW); dish-inferred-from-venue-class (Dead Rabbit::cocktail never
said, NEW); dish-minted-as-restaurant (Bihari Kabab, NEW). Confirmed
already catalogued: fragments/menu-format nouns, grocery-ingredient
dishes.

**P3 EXTENSIONS (pipeline/provenance):** thread-level evidence is cited
at document level (5/15 attribute citations point at a sibling comment's
doc — any per-claim "source" UI shows the wrong quote); asserted-vs-
inferred marking must cover ATTRIBUTES too, not just categories; the
restaurant_attributes array is 80% places_api / 17% reddit_evidence / 3%
cuisine_llm with no consumer-visible provenance discriminator.

## ROUND 11 CLOSE-OUT (fuzz + semantic, 2026-08-02)

Property fuzz (193 random ops, 3 seeds, 7 invariants after every op):
redirect graph, junk-tombstone protection, retain/delete conservation,
GC anchoring, counter truth at scale (939 connections, 0 drift) all HELD.
Five defects found and FIXED (all proven by re-execution): D1 CRITICAL —
self-merge annihilated the ledger through the set-based re-key (guards in
both helpers + the merge service + the place-collision handler; refused
with ledger intact); D2 — food renames never healed identity_key_sorted
(TS recompute added to the nightly refresh); D3 — 'nfc:' fallback keys
are a shared sink for blank names (food order-probe + twin lane now skip
them); D4 — empty-name entities minted (skipped with a warn now); D5 —
connections that outlive their evidence were never re-nominated (new
repair arm, scoped to non-zero projections so the deliberately-preserved
zeroed anchor rows don't churn — verified 0 nominated on the converged
mirror).

Semantic audit recorded above. CAMPAIGN VERDICT: eleven rounds; the
machinery now fails toward refusal (guards throw, sweeps skip, txs roll
back) rather than toward corruption; remaining work is PRODUCT truth
(ranking floor, extraction prompt classes) — the next phase, not more
red teams.

## IDEAL-SHAPE PASS (2026-08-02) — the two redesigns land

**(1) Language-agnostic, single-implementation identity.** The fold's
last arm was "keep a–z0-9" — every non-Latin name folded to '' (the
noodle-shop-into-dumpling-house class). Attempting a Unicode SQL mirror
exposed the deeper truth: Postgres Unicode classes are PLATFORM-
DEPENDENT ([:alnum:] folds Devanagari differently on prod glibc PG17 vs
mac PG18 — measured), so a GENERATED column can never be trusted.
Redesign: canonicalFold (TS, \p{L}\p{N}) is THE ONLY implementation;
identity_key is app-written like identity_key_sorted (migration
20260802050000 drops the generated column + crave_fold()); creation
writes both keys in-tx; ONE nightly heal recomputes both for every row
(also closes fuzz D2 permanently); all SQL sites consume the column.
Mirror: 62 non-Latin names now hold real distinct identities
(phở hoai, 新東湖 canton manor); 0 attr dupes; 0 empty keys. The
nfc: fallback now covers only genuinely letterless names (emoji-only).
The byte-parity treadmill is structurally gone.

**(2) The reconciler.** repairOrphanedProjections' four hand-enumerated
arms replaced by the invariant itself: every restaurant with any active
evidence or any projection rows is rebuilt nightly —
"projection ≡ rebuild(surviving evidence)" enforced by construction
(rebuild is idempotent, anchor-preserving, byte-exact when clean).
Mirror: 5,881 restaurants in 197s, second pass byte-identical. No
future brokenness class ever needs a fifth arm.

Post-deploy operational note: run scripts/backfill-identity-keys.ts
against prod once (NULL keys violate nothing; the heal also converges
them, but crons are currently off).

## ROUND 12 (unscoped smell-hunt + architecture audit, 2026-08-02) — IDEAL SHAPE COMPLETE

Architecture audit graded all 8 layers: evidence ledger, projections, ops
rig = END-STATE IDEAL (leave alone); the failure signature "fails toward
refusal, not corruption" held under audit. Its top-5 shape changes + the
smell-hunter's 5 executed findings all LANDED and were proven:

- IDENTITY IS ATOMIC WITH CREATION: identityInsertData() spreads both
  keys into every entity.create payload (all 7 sites); the unique index
  fires ON INSERT inside the savepoint (proven — it was structurally
  unreachable before); entityIdentityKey returns NULL for letterless
  names (the nfc: sentinel concept is deleted; entityLockKey stays
  total); P2002 recovery probes by the constraint that actually failed.
- THE MERGE COMPLETION CONTRACT is one implementation
  (finalizeMergeCompletion + set-based re-keys + identity advisory locks
  in the ledger module) used by BOTH merges — food merges get the 15-min
  budget + set-based re-key (3,000-event taco-class merge: 57ms, was a
  permanent silent P2028 abort), self-merge guards, alias banking, score
  prune, redirect flatten. H3's "merges take identity locks" is now true
  in code.
- ONE NIGHTLY CONVERGENCE COORDINATOR (3AM): heal → food dedupe →
  restaurant sweep → tombstone sweep → projection reconcile, awaited in
  declared order, per-phase fail isolation (executed proof that
  same-minute @Crons do NOT honor registration order). The four phase
  crons lost their decorators.
- Heal + backfill are convergent sweeps (per-row collision → logged
  merge candidate, never all-or-nothing); dedupe runs even if heal
  fails; heal rewrites legacy ''/nfc: sentinels to NULL (proven).
- Reconciler also prunes connection-dim scores (the one derived table
  the invariant missed); GC's ANY-event support definition + tombstone
  preservation are now lockdown-spec-enforced; contentTokens routes
  through canonicalFold (the fourth almost-fold is gone).
  DEFERRED with reasons: identity_key→name_fold rename (cosmetic, churn >
  value now); EventLedger/ExtractionScope module split (clarity only);
  one-shot runner completion rows (class is down to one instance).

## LANGUAGE & LOCALIZATION (rulings + architecture, 2026-08-02)

> **SUPERSEDED 2026-08-03: plans/multilingual.md is canonical.** Three
> further red-team rounds broke several claims below (the query-path
> LLM was already deleted; attributes are open vocabulary; aliases
> must never carry display labels). This section is kept as the
> historical record only — implement from plans/multilingual.md.

**LAW (effective now): concept vocabularies are seeded as canonical
slugs; language lives only in aliases, labels, and prompts.** Internal
canonical concepts (cuisines, dietary, occasions, attributes, junk and
provenance terms) stay English slugs — readable internal IDs, never
user-facing strings. Any new lexicon must follow this or it re-bakes
English in.

**P3 ADDITION (prompt phase, item "language"):** the extraction prompt
gains the cross-language normalization rule — a mention in ANY source
language resolves to the canonical concept vocabulary ("picante" →
`spicy`, "para llevar" → `takeout`) and the original surface form is
preserved as an alias on the entity. Without this, non-English corpora
would silently FORK the concept space (mint `picante` beside `spicy`)
instead of enriching it. Verification for the rerun: feed a small
Spanish fixture and assert zero new concept twins.

**THE TWO SIDES OF THE COIN, and how they relate:** (A) data-side
multilinguality (collection over non-English corpora) and (B) user-side
localization (a Spanish speaker uses the English-corpus app on day one)
are the SAME architecture consumed in two directions. The pivot is the
canonical concept layer: (A) writes INTO it (LLM normalizes any-language
text onto canonical concepts + banks aliases); (B) reads OUT of it
(queries in any language resolve onto the same concepts; concepts render
through per-locale labels). Neither requires the other to exist first.

**User-side (B) architecture — industry-standard, and our system needs
NO third-party language service for the core:**

1. UI chrome → ordinary i18n locale files (react-i18next-style); the
   LLM can draft the translation files; a TMS (Lokalise/Crowdin) only
   if management pain appears later.
2. Search queries in any language → ALREADY structurally supported: the
   Gemini interpretation layer reads Spanish/Japanese natively; it needs
   only the normalization rule above + per-locale gazetteer aliases so
   the zero-LLM lane also hits ("vegetariano" → `vegetarian`).
3. Data display: restaurant/dish NAMES are proper nouns — no translation
   (Google Maps leaves them; so do we). Attribute/cuisine chips are a
   CLOSED canonical set → per-locale label lookup tables (60-ish terms
   per language, an afternoon each, LLM-draftable) — this is the payoff
   of the concepts-vs-labels law: localizing DATA becomes a dictionary,
   not machine translation.
4. Review snippets/quotes → translate-on-read with original shown below
   (the Google Maps NMT pattern) — the ONE place a vendor MT API
   (Google Translate/DeepL) earns its keep, added when a market needs it.

**Lemma + stopwords ruling (the "crude list" question):** both are
ACCELERATORS, not correctness — the judge lane is the language-agnostic
correctness backstop, and creation-time identity never asserts equality.
The ideal abstraction is LANGUAGE PACKS: morphology (foodNameVariants +
its mass-noun exceptions) and connector stopwords become the English
pack of a per-language strategy; unknown languages default to
judge-only (correct, just slower to converge). Do NOT replace the
English rules with a generic stemmer (snowball over-stems food names —
"frites"→"frit" — and would need the same exception governance it
claims to remove). Refactor lands when a second language pack is
actually written; until then the lists stay, understood as pack #1.

## P2.2 RESEARCH (2026-08-02, pre-build red team of the ruled shape — all numbers executed on prod, read-only)

MACHINERY CONFIRMED AVAILABLE: sources.anchor_place_id → places centroids
gives every community a metro anchor (foodnyc → 40.66,-73.94; austinfood
→ 30.30,-97.75). "The mention's metro" = its document's community anchor;
the metro test = candidate has a location within ~80km of that anchor.

THE 81 CROSS-METRO-EVIDENCE ENTITIES CLASSIFY AS:

- 12 TRUE CHAINS (locations in both metros, 794 ev) — correct today.
- 46 ONE-METRO entities carrying 1,653 minority-metro events — splits
  into THREE classes (confirmed by reading the docs):
  (a) MISATTRIBUTION — Rudy's Bar & Grill (NYC) holds 182 r/austinfood
  events that are Rudy's Country Store BBQ taco talk; "Joe's Bakery"
  is itself NYC-grounded while holding 101 Austin events. The Joe's
  class, at scale.
  (b) CHAIN-WITH-MISSING-LOCATIONS — Dunkin'/CAVA/Raising Cane's/
  sweetgreen homed only in ATX receiving local NYC talk; Brooklyn
  Dumpling Shop ("I went today" in r/austinfood — it opened in
  Austin). The brand is right; secondary expansion is LOCATION-
  BIASED so it never attached the other metro's branches.
  (c) LONG-DISTANCE TALK — Franklin Barbecue's NYC mentions. Legitimate
  testimony; must stay on the Austin entity.
- 23 ungrounded-both (420 ev) — P1-repair / backfill territory.

PREMISE CORRECTION (2026-08-03, rederivation F353 — read BEFORE building):
class (b)'s stated mechanism ("expansion is location-biased") is FALSE.
enrichSecondaryLocations' locationBias parameter is DEAD (single caller
passes two args); expansion is a GLOBAL search — but CAP-TRUNCATED at 60
locations/run (23 brands at/past the cap, max 121; Chipotle 61) with
ranking-dependent truncation, and the brand-purity gate rejects siblings
whose Google displayName is branch-qualified ("Shake Shack 1700
Broadway…" holds ONE location for this reason). Consequence: a metro
test against a knowingly-truncated location set will mint twins for
REAL chains — the exact failure this design exists to avoid. The build
must be completeness-aware: track cap-state per brand, or do per-metro
on-demand expansion at adoption time (one biased findPlaceFromText for
the mention's metro before refusing), or both.

RED TEAM OF THE RULED SHAPE — the naive rule FAILS two of three classes:
"only adopt candidates with a local location" fixes (a), but for (b) it
would MINT A TWIN Dunkin' per metro (fragmenting a true brand solely
because expansion is location-biased), and for (c) it would mint a fake
local Franklin, splitting real testimony. THE REFINED SHAPE:

1. ADOPTION LADDER at resolution time, when the doc's metro has no
   candidate location: EXACT full-name match + single global candidate →
   adopt remotely (preserves class c); SHORTHAND/alias/fold match →
   metro-local only (kills class a — "Rudy's" in Austin can never adopt
   an NYC bar). The surface-form tier we already track (exact vs alias
   vs fold probe) is the discriminator; no new signal needed.
2. EXPANSION COMPLETES THE CHAIN on demand: when a remote-adoption
   passes rule 1 OR a local mint matches an existing brand's domain via
   Places (same canonicalDomain + restaurantNamesAgree), attach the
   local branch to the existing entity instead of minting — one Places
   findPlaceFromText with the MENTION metro's bias (class b heals to
   one brand entity with both metros' locations, exactly the model).
3. REPAIR: re-resolve the 46 entities' 1,653 minority-metro events
   under rules 1-2 during the rerun (they ride the re-extraction
   anyway); the 12 true chains and class-c talk are untouched.
   OPEN OWNER KNOBS: the 80km metro radius; whether rule-2's Places call
   is budgeted per-mention (est. rare: only fires on cross-metro name
   events, ~dozens/month) or batched nightly.
   INTERACTION WITH THE CRON FLIP: none — the 66-merge backlog is
   dominant-community-gated and same-metro; P2.2 does not block it.

## P2.2 ADDENDUM — locations follow testimony (2026-08-03, measured)

WHY chains miss locations (two distinct mechanisms, both measured):
(1) GOOGLE'S 60-RESULT TEXT-SEARCH CAP — Dunkin's stored 39 locations
are ALL California (San Jose ×5, Sacramento…): a 13k-store chain's
un-biased expansion captures an arbitrary geographic slice; no
pagination depth fixes this, Google will not enumerate a chain.
(2) EXPANSION IS A ONE-SHOT — Brooklyn Dumpling Shop's expansion
worked (8 stores, NYC/Dallas/Miami/Philly) but ran 2026-07-30; the
Austin store opened/appeared later and nothing re-runs it. (Its ATX
twin mint was already correctly merged by the sweep.)

THE MODEL: we never need ALL locations — only locations where our
communities talk. LOCATIONS FOLLOW TESTIMONY: when a mention arrives in
metro M for a brand with no location in M, ONE findPlaceFromText biased
to M's anchor attaches the local branches (bias makes mega-chains
return local stores); ~30-day cooldown when nothing is found. Solves
the 60-cap, late openings, and cost (O(brands-discussed-per-metro))
in one mechanism. Three-concept model, no schema change: brand entity
(global identity) / locations (demand-driven cache of Google presence)
/ testimony (metro-tagged events). The adoption ladder in one sentence:
a full exact name can travel across the country; a nickname can only
reach places nearby.

OPERATIONAL: CRONS_ENABLED kill-switch removed 2026-08-03 ~00:35 UTC
(owner authorized; 66-merge backlog reviewed) — night-one convergence
drains it. COLLECTION_SCHEDULER_ENABLED stays false until prompt
activation.

## P2.2 IMPLEMENTED (2026-08-03) — metro-aware resolution + locations follow testimony

Landed per the refined design, all five behaviors proven by execution on
the mirror: (P1) exact-unique remote adoption holds (Franklin from NYC);
(P2) alias-tier remote demotes ("Rudy's" from ATX can no longer reach
the NYC bar — mints locally with the existing metro-biased grounding,
and the domain-merge lane converges true branches); (P3) local
candidates adopt at any tier; (P4) exact-but-AMBIGUOUS remote demotes
("Super Burrito" — one of the 8 held merges — correctly refused); (P5)
adopted brands without local presence enqueue ONE metro-biased
expansion probe, cooldown-gated (30d), zero spend at enqueue.

Pieces: MetroAdoptionService (anchors, presence, uniqueness — one
implementation of the ladder's questions); the gate in
EntityResolutionService after all tiers (restaurant cache was already
engine-scoped, so verdicts cache per-metro); the same ladder on the
creation-path stripped probe and tombstone-redirect hop in
unified-processing (batch-level anchor, one lookup); metro probe rides
the existing secondary-expansion queue (job variant + bias param +
metro_location_probes cooldown table); mint-time metro-biased grounding
already existed. Repair of the 46 misattributed entities' 1,653 events
rides the rerun as planned.

## P2.2 RED TEAM (round 13, 2026-08-03) — two Opus agents; all findings fixed and proven

The ladder itself held everything thrown at it (boundary 79/81km, archived
twins don't spoil uniqueness, food-named twins don't, case folding, cache
is engine-scoped and never caches a demotion, poll-surface/no-anchor
stands down, the worker's cooldown mechanics all correct). The wounds
were in the WIRING and the edges:

- F1 SEVERE (both agents): reusedEntitySummaries was declared, returned,
  and NEVER populated — pre-existing dead code that made the entire
  metro-probe leg inert and the reuse debug log silently empty since it
  was written. FIXED at both adoption sources (resolver tiers + creation-
  path adopt); proven through the FULL real pipeline (processLLMOutput →
  exact-tier adoption → probe enqueued for austinfood).
- F3 HIGH: a demoted mint that GROUNDS to a branch of the brand could
  never merge back (identity lane needs equal folds; prefix lane demands
  an ungrounded stub) — permanent fragmentation. FIXED: same-canonical-
  domain merge lane (non-aggregator), proven pairing a grounded twin.
- F4: "resolve locally" actually minted — demotion now RE-RESOLVES to a
  locally-present candidate carrying the surface as name or alias before
  falling to creation (proven: swapped to the local sibling).
- F5: 22.7% of active restaurants are ungrounded and were treated as
  remote-everywhere (every nickname mention minted a twin). Unknown geo
  now stands the gate down, like a missing anchor — in the resolver gate
  AND both creation-path probes (also collapses F6's one-twin-per-
  spelling loop: the ungrounded twin is now findable).
- F2: probe bias radius was the 5km default vs the 80km metro → 50km
  (API cap). F3-worker: a permanently-failing probe now lays its
  cooldown row before rethrowing. F7: anchor cache gets a 5-min TTL
  (negative results no longer cached forever). F8: with creation
  disabled, demoted restaurants surface as explicit unmatched results
  instead of vanishing.

## FINDING A IMPLEMENTED (2026-08-03): per-lane is_category_item read fix

The phase's measurement prong found `is_category_item` computed/projected/
selected/mapped and read by NOTHING — 41.8% of scored connections (7,218)
were rollup rows served as dishes (`taco` @ LOS TACOS No.1 at 9.99).
History check confirmed no contradiction with the July taxonomy work:
predicts-the-food (346c97dc6) decides which category ENTITIES exist; the
class-⑤ flag (490388fab) was minted for one-claim-once scoring; the READ
layer was simply a decision never made. Key structural fact: a rollup row
exists ONLY as a parent of more specific dishes at the same restaurant
(projection-rebuild:546) — a direct "great tacos" mention mints a normal
connection — so excluding rollups from served dish rows can never orphan
a restaurant.

Fix (code-only, no rerun): `NOT is_category_item` in the four dish-serving
lanes — listRestaurantDishes + profile dish count (search.service), search
dish axis incl. gate window counts (search-query.builder filtered_connections),
teaser top-3 (connectionFilter), curated city dishes (cityDishes). Left
alone deliberately: user-lists (renders what a user saved), signal-demand-read
(history of what was actually viewed), autocomplete/coverage (not dish rows).
Guard: search-pooled-gate.spec asserts the predicate in both gate modes.
Proven on the mirror: LOS TACOS 35 rows → 7 rollups excluded, top list all
real dishes. 135 search/teaser/home tests green.

## PHASE 1 FORENSICS (2026-08-05): every defect is a KIND-error that passed a SHAPE-test

Traced bad rows back to raw source bodies (event -> source_document_id ->
collection_source_documents.body). The decisive discovery: in nearly every
class THE MODEL WAS NOT WRONG ABOUT THE TEXT. The testimony is real, the
extraction is faithful, and the row is still garbage — because the thing
extracted was put in a slot it does not belong to.

EVIDENCE (verbatim sources):

- H-E-B (583 ev, 94th pct): "HEB's [pumpkin pie] is perfectly fine",
  "HEB has some lovely show-cakes", "[HEB Texas Roots Butter Toffee Pecans]",
  "HEB has a 'buy Daiya pizza + free vegan ice cream' sale". All GENUINE
  food testimony. Grocery talk is real discourse in a food sub. Nothing in
  the prompt asks whether the named place is a RESTAURANT — 1.2 only asks
  whether the span is used as a NAME. NUANCE: H-E-B events include al
  pastor / beef fajitas / chicharron — plausibly its real taqueria counter.
  A blanket venue-name reject would lose true signal; the claim-level test
  (food prepared and served here for immediate eating vs packaged retail
  goods) survives that boundary.
- Itinerary: "Judge my austin food itinerary :: Headed to Austin at the end
  of the month. Here's our short list. Better Half / Suerte / Easy Tiger..."
  and "Please revise my list - Travelling to NYC". These are EXACTLY
  1.3(b)'s bare-list endorsement shape, written by authors who have never
  been. They are ASKS wearing a list's clothing.
- Intensity words are NOT a banned-word problem — they are DISLOCATION:
  "For lighter roast try the Colombian supremo" -> attribute `light`
  (light ROAST is a real filterable property; bare `light` is not);
  "a very light, fresh marinara"; "thin" from Patsy's thin-crust pizza;
  "rich" from "a lot of heavy, fatty meat". The word was peeled off the
  noun that gave it meaning, collapsing three unrelated senses into one
  entity. A word list would ban the true cases with the false ones.
- Menu-format: "It is our newest favorite tasting menu, 100% recommend!!"
  — real endorsement, wrong slot (a format is not a dish). Also
  "Zama Omakase"/"Sushi Junai Omakase"/"Joji" are restaurant NAMES
  containing the word.
- NEGATIVE CONTROLS (must keep working): "Pho phong luu, Tan My, Fresh
  Bowl, Sip Pho if central." — a bare-list COMMENT reply, genuine
  testimony. And "The Sripraphai pad Thai from Wonder was so disgusting"
  — negative testimony that must not project positive. Any rule that kills
  the itinerary by killing lists destroys the first; any rule that reads
  dish-mention as endorsement destroys the second.

THE ESSENCE: the prompt reasons about the SHAPE OF LANGUAGE (does this span
look like a name, does this modifier look peelable, does this reply look
list-like) and never about the KIND OF THING referred to. Two questions are
absent as first-class gates:

1. IS THIS TESTIMONY? — is the author VOUCHING, or asking / planning /
   announcing / informing? (generates itinerary, directory, availability,
   lukewarm classes — four defects, one missing question)
2. IS THIS THING OF THE KIND THIS SLOT REQUIRES? — restaurant slot needs a
   place that serves prepared food; dish slot needs something orderable;
   attribute slot needs a property that means ONE thing standing alone.
   (generates venue-class, dish-as-restaurant, menu-format, occasion,
   cuisine-as-dish, intensity-dislocation classes)
   Both are KIND questions. Every measured defect is a kind-error that passed a
   shape-test. This is why rule-stacking kept failing: the rules were all
   shape-rules, and no quantity of shape-rules answers a kind-question.

## PHASE 1 RED TEAM (self, 2026-08-05): two of my own claims refuted

1. "H-E-B's al pastor / beef fajitas / chicharron are plausibly its real
   taqueria counter" — REFUTED, and I had asserted it from plausibility, not
   data. Every one of those events traces to PACKAGED GROCERY text: "all of
   the Mi Tienda meats from H-E-B... gets watery when you cook it on the
   stove", "pretty dang solid for store-bought, packaged stuff", "hill
   country fare chicharrones, packaged in the styrofoam near the deli",
   "HEB's in-house tortillas". H-E-B carries ZERO prepared-and-served
   claims. The boundary case I worried about does not exist here — which
   SIMPLIFIES the rule rather than complicating it.

2. "post body vs comment is the clean discriminator for itineraries" —
   REFUTED. Genuine-testimony POST bodies are everywhere: "Had an incredible
   meal from the Bunbelly truck", "2026 NYC Food Trip Review — The Hits:
   Radio Bakery: Salmon lox focaccia. Best bite of the trip", "Went to Sour
   Duck last Sat", "Post-trip food ratings". A post-body rule would destroy
   all of them. The measurement pass saw a correlation in its sample and I
   repeated it as a rule.
   THE ACTUAL DISCRIMINATOR IS EXPERIENTIAL STANCE, and it is the thesis
   itself: "Headed to Austin at the end of the month, here's our short list"
   (future / intent) vs "Went to Sour Duck last Sat" (past / experience).
   Not position in the thread — WHETHER THE AUTHOR HAS EATEN THE FOOD.
   Note "2026 NYC Food Trip Review how did I do overall?" is testimony even
   though it asks a question: asking for feedback ON AN EXPERIENCE HAD is
   still vouching. The gate is experience, not the presence of a question.

3. Intensity-dislocation CONFIRMED with a sharper example: "Really great
   focaccia type Roman style pizza. LIGHTER THAN Jets or 313 but very high
   quality" -> food_attribute `light`. The word was not merely peeled off
   its noun, it was peeled off a COMPARISON — its entire meaning was
   relational to two other pizzerias. Standing alone it asserts nothing.

4. Scare investigated and dismissed: 15,829 exactly-doubled event groups are
   BY DESIGN — every one differs only in evidence_type (food_category +
   food_mention 8,364; food_category + menu_item_food 7,465), same run, same
   input. One claim, two evidence rows. OPEN QUESTION (code, not prompt):
   whether score inputs dedupe by claim or count both rows, which would give
   category-bearing foods double the evidence mass of non-category foods.

THESIS AFTER RED TEAM (refined, and stronger): every defect class WITH
MATERIAL MASS is a kind-error that passed a shape-test. The residual
shape-errors (truncated tokens, slash-splits, plural/word-order twins) were
all measured at noise level AND belong in code — identity keys and a
denylist — not in the prompt. So the prompt rewrite is exclusively a
kind-question problem.

## PHASE 2 (2026-08-05): the derived abstraction — four kind-gates, and one reordering

THE ATOMIC UNIT the prompt should be built around, which it currently never
names: A CLAIM IS SOMEONE WHO HAS EATEN X AT Y SAYING SOMETHING ABOUT IT.
Four things must each be of the right KIND for a claim to exist, and the
current prompt tests the SHAPE of all four and the kind of none:

GATE 1 - STANCE. Has the author eaten it? Testimony is a report of
experience. A plan ("headed to Austin, here's our short list"), an ask, an
announcement (a fundraiser roster), an availability note ("X has Y"), and
hearsay ("I hear it's good") are all NOT reports of experience. Asking for
feedback on an experience HAD is still testimony ("Trip Review — how did I
do?"). Kills: itinerary, directory, availability, lukewarm, hearsay.
GATE 2 - VENUE KIND. Is Y a place that prepares and serves food for
immediate eating? Not: a shop selling packaged goods to take home (H-E-B,
proven 100% packaged), lodging, a stadium/museum whose business is not
food, a caterer with no premises, or a DISH PHRASE mistaken for a name
("Bihari Kabab"). Landmark-plus-vendor -> extract the vendor.
GATE 3 - DISH KIND. Is X a thing a diner can be handed? Two tests that
already exist in the prompt and are GOOD, kept and named:
ORDER TEST (could you say this to a server) and PREDICTION TEST (if a
diner names only this, do you know what arrives). Menu formats fail
prediction (a tasting menu is many dishes); cuisines fail it; `dinner`
fails it; `breakfast`/`dessert` PASS it (this is the 346c97dc6 ruling,
preserved intact and now stated as one of the four gates rather than a
rule buried in Step 4).
GATE 4 - PROPERTY KIND. Does this word mean ONE thing standing alone,
severed from the noun it modified? `gluten-free`, `spicy`, `smoky` do.
`light` does NOT — light roast, light marinara, and light portions are
three unrelated senses, and "LIGHTER THAN Jets or 313" is not even a
property, it is a comparison to two other pizzerias. This replaces every
prior banned-word list, which is the right shape because the word lists
kept banning true cases along with false ones (`light roast` is real).

THE REORDERING (structural root cause of the intensity class): the current
prompt PEELS PROPERTIES IN STEP 3 AND COMPOSES THE DISH IN STEP 4 — it
strips modifiers off spans BEFORE it knows what the dish is. That ordering
is why "lighter than Jets" became attribute `light` and why "breakfast" was
peeled out of "breakfast taco" (82e731058 fixed that ONE case by hand; the
ordering that generates the whole class was never touched). Compose the dish
FIRST, then ask what is left over and whether it survives Gate 4, and the
dislocation class cannot form — no ban list required.

CONSEQUENCE FOR THE REWRITE: gates are cheap-to-expensive and each one that
fails ends the work, so the order is STANCE -> VENUE -> DISH -> PROPERTY,
with composition inside Gate 3 and property extraction after it. Rules that
survive as-is: predicts-the-food, order test, dietary NEVER-dropped, one
carrier for praise, per-mention source_id. Rules that DIE as unnecessary
once the gates exist: the bare-list endorsement clause (Gate 1 subsumes it),
the meal-period ban lists (Gate 3), the intensity carve-outs (Gate 4), the
duplicated ask-handling statements (x4) and general_praise restatements (x7).
Examples must be rebuilt against the enforced schema — the only full output
example is currently invalid (missing required temp_id, wrong property
order, teaches plurals against the singular rule) and both flagship examples
teach `rich`, which Gate 4 forbids.

## GATE 2 RE-DERIVED (2026-08-05): Google types CAN carry most of the venue gate — but the current filter is the wrong abstraction

THE FILTER THAT EXISTS: `PREFERRED_PLACE_TYPES` in
restaurant-location-enrichment.service.ts:54 — 64 entries, DERIVED from
GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP + 'restaurant'. Applied by
isRestaurantishPlaceTypes() as `types.some(t => PREFERRED.has(t))` —
ANY match against the venue's FULL type array.

WHY THE JUNK GOT IN (measured, per venue):
H-E-B types include `bakery` (also cake_shop, butcher_shop)
Whole Foods `bakery`, `deli`
Randalls `deli`, `bakery`
H Mart `food_court`
MUSEUM OF ICE CREAM `ice_cream_shop`, `dessert_shop`, `confectionery`
Alamo Drafthouse literally `restaurant`
Every one of them ALSO carries a primaryType that is NOT food-service:
grocery_store, grocery_store, grocery_store, asian_grocery_store,
tourist_attraction, movie_theater. Google already knows what these places
are; we throw that away by matching ANY type instead of the PRIMARY one.

THE DEEPER PROBLEM: the list is a CUISINE-ATTRIBUTE NAMING MAP being reused
as a VENUE-CLASS GATE — one list doing two jobs, and wrong at both edges.
TOO WIDE, because any-match admits a supermarket through its bakery counter.
TOO NARROW on primaryType: the map has no taco_restaurant,
tex_mex_restaurant, chicken_restaurant, cajun_restaurant, halal_restaurant,
korean_barbecue_restaurant, dim_sum_restaurant, brewery, brewpub, bistro,
pastry_shop, hot_dog_stand... 890 REAL restaurants (11.4k events) sit on
primaryTypes absent from the map. A naive switch to
`PREFERRED.has(primaryType)` would delete them.

THE MEASURED IDEAL: gate on primaryType with an explicit NON-FOOD-SERVICE
deny list (grocery/supermarket/market/food_store/wholesaler/convenience/
liquor/butcher/department/gas_station, movie_theater/tourist_attraction/
museum/stadium/event_venue, hotel/lodging, night_club, catering_service).
Yield on today's corpus: 81 entities / 2,088 events removed — which is
essentially the entire measured venue-class defect (97 ent / 2,051 ev),
at zero LLM cost and using Google's own authoritative classification.
This belongs at GROUNDING-TIME ADMISSION, not in the prompt: the extractor
cannot know a Google type, and by the time we have one the entity exists.

WHY IT CANNOT BE THE ONLY GATE (and this is a CORRECTION to the phase's
measurement pass, which reported "0 of 6,922 active restaurants are
ungrounded — the 31%/850 figure is stale"): THAT IS WRONG. 1,626 active
restaurants (23.5%) have NO googlePlaces.placeId AND no
core_restaurant_locations.google_place_id — truly ungrounded, ~9,543
events. They include real venues (Otoko, Garbos, Easy Tiger, Olamaie) AND
two of the catalogued offenders, Yankee Stadium and Plaza Hotel, both of
which carry NO Google types at all. Google can decide 76% of the corpus;
the remaining 24% has nothing to decide with. Dish-phrases minted as
restaurants ("Bihari Kabab") never reach Google either.

CONSEQUENCE FOR THE PROMPT: Gate 2 SHRINKS but does not vanish. Google owns
the retail/lodging/entertainment kill at grounding time; the prompt keeps
only what Google structurally cannot see — is this span a PLACE at all
rather than a dish phrase, and is the claim about food served here versus
goods sold to take home (the H-E-B text test, which also covers ungrounded
venues Google never classified).

## GATE 2 SETTLED (2026-08-05): full primaryType census — Google owns the clean core, the CLAIM owns the boundary

Censused all 168 distinct primaryTypes on the active corpus. Owner ruling
accepted: MUSEUM OF ICE CREAM (tourist_attraction) and Alamo Drafthouse
(movie_theater) STAY — they serve prepared food; the venue's business
category is not the question.

THE CLEAN CORE — retail is the whole business, and the data shows ZERO
prepared-food claims. Safe to deny at grounding-time admission on
primaryType alone:
grocery_store 22/1228, asian_grocery_store 8/190, supermarket 7/117,
hypermarket 1/2 (Japan Village), department_store 1/13 (Walmart),
wholesaler 1/42 (Lammes Candies HQ), manufacturer 2/9 (distilleries),
gas_station 1/11 (QuikTrip), clothing_store 1/1, florist 1/3,
health_food_store 2/2. ~= 1,620 events, high precision.

THE BOUNDARY IS NOT A VENUE PROPERTY — PROVEN. Retail-typed venues host
REAL prepared-food testimony, so a type-only rule would delete true claims:
Quality Seafood Market (primaryType `market`, 169 events) carries BOTH
"I like their FISH TACOS and I had my first whole lobster for my bday"
(prepared, served, eat now) AND
"in the chest freezer between the meat and fish counters", "Quality
Seafood has a nice market", "buy a 40 lb bag" (retail).
ONE VENUE, BOTH KINDS OF CLAIM.
Spec's (liquor_store): "Second Specs Deli. TURKEY WITH PEPPER BACON is my
go to." Buc-ee's (convenience_store): fudge, brisket.
La Michoacana Meat Market (butcher_shop): Texas chain WITH a taqueria.
Hotels (The Mark, Hotel Chelsea, South Congress) host notable restaurants.
So convenience_store, market, butcher_shop, liquor_store, hotel, food,
store, tea_store are NOT deniable by type — they need the claim test.

THEREFORE BOTH, and this is the ideal split rather than a compromise:
GOOGLE (grounding-time admission, free, authoritative) kills the clean
retail core — the 76% of the corpus it can see, where the venue does
nothing but sell packaged goods.
THE PROMPT keeps Gate 2 as a CLAIM-LEVEL test — "is this claim about food
PREPARED AND SERVED HERE to eat now, or goods SOLD TO TAKE HOME?" —
because (a) 1,626 active restaurants (23.5%) have no Google data at all,
(b) dish-phrases minted as restaurants never reach Google, and (c) the
Quality Seafood case proves the same venue emits both kinds, which no
venue-level rule can ever separate.
The claim test also handles H-E-B correctly WITHOUT the type rule (every
H-E-B claim is packaged), so the two layers are independent confirmations,
not a single point of failure.

## GATE 2 REVERSED (2026-08-05): there is NO safely deniable Google type — the claim is the only unit that works

I recommended a primaryType deny list one section above. THAT RECOMMENDATION
WAS WRONG, and it was wrong for the classic reason: I sampled H-E-B and
Whole Foods, found pure retail, and generalized to their TYPE. Excluding
those two chains and re-querying the same types destroys the claim:

grocery_store / supermarket — JD'S SUPERMARKET #8: "JD's on east riverside
has some TACOS THAT HAVE NO BUSINESS BEING AS GOOD AS THEY ARE. try the
carnitas and beef fajita for sure. they also have rotating daily
specials." TASHKENT SUPERMARKET: "get some of the MEAT PASTRIES FROM THE
LADIES IN THE WINDOWS, extremely cheap and VERY tasty." FILIPINO ASIAN
MART: "the CHICKEN ADOBO and PANCIT slaps man." BUTTERFIELD MARKET:
"great PREPARED FOOD... wings, chili." EATALY: squash ravioli.
gas_station — QUIKTRIP: "I enjoy the TORNADOES from QuikTrip."
convenience_store — BUC-EE'S: "I've been planning all my trips so I can
pass Buc-ee's DURING BREAKFAST HOURS for several years now" (sausage and
cheese breakfast taco). SPACE MARKET: "for late night or morning BEC" —
the bodega staple.
department_store — WALMART: "potato wedges... Walmart during LUNCH HOURS
WHEN THEY FRESH."
wholesaler — LAMMES CANDIES: pralines, fudge, "only place I have
consistently had good fudge."
florist — PLANTSHED: espresso (a flower shop with a cafe).

Bodega check (owner's question): NYC bodegas type as `deli`, `restaurant`,
`mexican_restaurant`, and `grocery_store` (Reyes Deli & Grocery). There is
no bodega type, so any grocery-family deny would cut them arbitrarily.

CONCLUSION — THE TYPE IS THE WRONG UNIT. primaryType is a fact about THE
BUSINESS; our unit of evidence is THE CLAIM. PlantShed is a florist AND a
cafe; Buc-ee's is a gas station AND a breakfast-taco destination; Quality
Seafood is a fish counter AND a taqueria. No venue-level predicate can
separate claims that the same venue legitimately produces both of.

FINAL SHAPE: NO Google type gate at all. Gate 2 is a CLAIM-level test in the
prompt — "is this food PREPARED AND SERVED HERE to eat now, or goods SOLD TO
TAKE HOME?" — and it is well within LLM reach because the source text states
the mode of consumption explicitly and unambiguously in both directions
("gets watery when you COOK IT ON THE STOVE", "in the CHEST FREEZER", "buy a
40 LB BAG" vs "during BREAKFAST HOURS", "the ladies IN THE WINDOWS", "WHEN
THEY FRESH"). This is reading comprehension, not world knowledge.
The elegant consequence: H-E-B needs no blacklist. Every H-E-B claim is
packaged-mode, so the claim test leaves it with ZERO qualifying evidence and
it falls out of ranking on its own — absent because it earned nothing, not
because we banned it.
Google's type is retained as an AUDIT SIGNAL, never a gate: flag venues
whose claims are 100% packaged-mode for human review.

## PHASE 3 (2026-08-05): candidate prompt written

`collection-prompt.candidate.md` — 627 lines vs the live 780, built on the
four kind-gates. NOT yet activated; the live prompt is untouched.

STRUCTURE: the four tests are NAMED once at the top (TESTIMONY, PLACE,
ORDER + PREDICTION, STANDALONE) and referenced by name thereafter, replacing
the old document's five restatements of "the order test" at four drifting
altitudes. Steps are the gates in cheapest-first order: A is-there-testimony
-> B what-place -> C what-was-ordered -> D what-is-left-over -> E item-or-
family -> F assemble.

THE REORDERING IS THE CENTERPIECE: composition (C) now runs BEFORE property
extraction (D), reversing live Step 3 -> Step 4. A modifier can only be
judged once you know what it modified.

DELETED (unnecessary once the gates exist, or dead): the bare-list
endorsement clause; the meal-period ban lists; the intensity carve-outs; 4x
duplicated ask-handling; 7x general_praise restatements; the six pseudo-typed
inter-step contracts (resolvedRestaurants/canonicalRestaurants/
classifiedAttributes/attributeLinks/composedFoods/itemDecisions) which no
consumer ever read; the §3.8 attributeLinks JSON block (a second, non-output
JSON shape = format-confusion risk); and ALL FIVE \*\_surface fields with their
§2.7 + six §6.2 bullets — VERIFIED ABSENT from the enforced Gemini schema, so
they were dead instructions the model could not obey.

FIXED: the sole full output example was invalid against the enforced schema
(missing required temp_id, missing ingredients, wrong property order, taught
plurals against the singular rule, and taught `rich` — the exact defect).
The new example is machine-verified: property order byte-matches
propertyOrdering, all four required fields present in every mention.
temp_id is now DOCUMENTED (it was required by schema and mentioned nowhere in
781 lines).

PRESERVED INTACT: predicts-the-food (breakfast/brunch still side with
dessert), the order test, describes-vs-judges, cuisine-on-both-sides with
inference, dietary-never-dropped with its rationale, one-carrier praise,
per-mention source_id, extract_from_post, sealed post objects, depth-aware
resolution, canonicalization + scoring, ingredients-from-source-only.

COVERAGE: 21/21 catalogued defect classes have an explicit clause.
Machine-checked against the schema; NOT yet checked against real documents —
that is Phase 4 (replay the Phase 1 sources, including the negative controls,
and confirm the defects do not reproduce and the true claims survive).

## PHASE 4 (2026-08-05): the candidate PROVEN on real data, and three of my own errors caught

Two harnesses, both through LlmService (the gateway lockdown lint caught my
first draft importing @google/genai directly — a probe that spends money must
not own a second spend gate):
scripts/prompt-ab.ts graded gold set, N repeats, PASS/FLAKY/FAIL
scripts/prompt-corpus-ab.ts random real posts, volume + defect rates

GOLD SET (18 cases, 5 repeats, real source text verbatim):
CANDIDATE 18 PASS / 0 FLAKY / 0 FAIL LIVE 12 / 1 / 5 0 regressions

CORPUS (150 random real posts-with-comments, both prompts):
live candidate
cuisine-as-food 35 -> 17 (-51%)
format-as-food 129 -> 27 (-79%)
bad-attribute 43 -> 1 (-98%)
praise mentions 1586 -> 1102 (-30%, the double-carrier dying)
attribute slots 2224 -> 2797 (+26% REAL attributes)
distinct dishes 523 -> 481 (-8%)
docs emitting 96.7% -> 94.0%
SUBSTANTIVE (non-praise) mentions: 505 -> 758, i.e. +50%.
The headline -11% mention volume is almost entirely the one-carrier rule
removing duplicate praise mentions; actual dish/attribute content went UP.

IS THE DROP RECALL LOSS? NO — verified by reading source text, not by
assuming. Per-doc restaurant retention is 86% with 70 candidate-only finds.
Every sampled drop was CORRECT:
t3_15gckti "Did anyone used to work at the Spanish restaurant Bullfight?" —
a nostalgia thread about a CLOSED place; live emitted parkside, el naranjo
and olive and junes with general_praise TRUE. "El Naranjo is there now,
right?" is a LOCATION FACT, not an endorsement.
t3_1ty7l18 "looking for Central Asian airag/kumis/fermented horse milk" —
live emitted tashkent market / tashkent supermarket / garden gourmet with
praise. Pure availability, and grocery-packaged besides.
All 4 one-sided docs were correct suppressions: a recipe question, a
reservation giveaway, a "can anyone identify this halal cart" ID request.
Precision gain, not recall loss.

THREE ERRORS OF MINE, CAUGHT BY THE HARNESSES:

1. The grader demanded restaurant "baldinucci" while the model emitted the
   correct canonical "baldinucci pizza" — a false FAIL that HID a real win
   (live emitted the `light` attribute; the candidate dropped it).
2. A control demanded general_praise on a bare-list reply to an ITEM-SPECIFIC
   ask, where Step E prescribes the dish carrying it. Live's extra praise
   mentions are the double-carrier one-claim-once forbids — grading them
   correct would have enshrined the defect.
3. THE PROMPT WAS WRONG ABOUT OMAKASE. I listed it with the failing formats;
   the model emitted it 22x anyway AND THE MODEL WAS RIGHT. The rule is now
   principled rather than a list: a format fails only when WHAT ARRIVES IS
   UNCONSTRAINED (tasting menu, prix fixe, buffet, combo plate). "omakase"
   predicts sushi chef-selected and "dim sum" predicts small Cantonese
   plates — they pass exactly like breakfast passes and dinner does not.
   C6-CONTROL-omakase-is-a-dish now guards it, and D4 (tasting menu is NOT a
   dish) still passes, so the rule discriminates instead of blanket-banning.
   Round-1 "cuisine-as-food went UP" was sampling noise at n=120; at n=150 it is
   a 51% REDUCTION. One corpus run is not a measurement.

STILL OPEN before activation: the ~22 residual omakase rows are now expected
(they are legitimate). Remaining work is the owner's campaign hash for the
Austin shadow re-extract, and the two schema decisions (surface fields;
asserted-vs-inferred marker).

## PHASE 5 (2026-08-06): the grounding hole — 1,626 restaurants with no Google place

FACTS FIRST. 1,626 active restaurants (23.5%) hold no google place id, in
metadata or on any location. They are EXACTLY the null-city rows; every
restaurant WITH a city is 100% grounded. They are not out-of-city
restaurants waiting for onboarding — the failed lookups searched Austin TX
(1,103) and New York NY (433), our two onboarded cities. Created 07-08..07-31,
avg 5.9 events, 9,543 events total. Each carries a `lastEnrichmentAttempt`,
so enrichment RAN and FAILED:
no prediction matched preferred place types 1,341 (6,502 events)
place permanently closed 195 (1,450 events)

FALSE TRAILS I FOLLOWED, RECORDED SO THEY ARE NOT RE-WALKED:

- "The reason string is a lie." The string IS hardcoded for every
  no-selection case (enrichment service, `const reason =` before
  recordNoMatchCandidates), so it cannot be trusted as attribution — but it
  turned out to be SUBSTANTIVELY CORRECT anyway. Do not dismiss it.
- "The `&` -> `and` canonicalization breaks the query." Real but small:
  3.9% of ungrounded names contain " and " vs 1.7% of grounded — 2.3x
  enriched, ~64 restaurants. Not the mass cause.
- "The chooser rejects correct matches." Inflated. 462 ungrounded had an
  exact-name candidate, but most were correctly refused as WRONG CITY
  (Uptown Sports' exact match is in Malaysia; Thai Kun's in Houston;
  Wegmans in NJ/CT). Restricting to exact name AND matching city gives
  67 restaurants / 509 events. Real, but a minority.

THE ROOT CAUSE, PROVEN BY CALLING THE API BOTH WAYS
(scripts/grounding-name-probe.ts + an ad-hoc types probe):
Google FINDS these businesses. We throw the answer away.
"Local Pastures Austin" -> Local Pastures [grocery_store, food_store]
"Asahi Imports Austin" -> Asahi Imports [food_store, grocery_store]
"Rebel Cheese Austin" -> Rebel Cheese Factory [establishment, point_of_interest]
`filterViableRankedCandidates` drops every candidate failing
`isRestaurantishPlaceTypes`, which tests against PREFERRED_PLACE_TYPES — the
64-key CUISINE-ATTRIBUTE map. grocery_store, food_store, establishment and
point_of_interest are not in it, so all three correct matches are discarded
and the entity is left ungrounded. THIS IS THE SAME LIST, DOING THE SAME
DAMAGE, that the venue-class investigation found: a cuisine-naming map
pressed into service as a classifier. It costs us real venues in TWO places.

THE NAIVE FIX IS WRONG — MEASURED, NOT ASSUMED. Passing
`types: 'restaurant'` (includedPrimaryTypes) to autocomplete DELETES the
correct answer for Local Pastures, Asahi Imports, Rebel Cheese and Trudy's
(all return zero suggestions with it). Do not add it.
Secondary, real: with NO type restriction some queries surface streets —
"Salt & Time Austin" returns Salt Block Circle / Old Salt Trail / Salt Mill
Hollow, all [route, geocode]. So the call needs to exclude geocode/route
noise WITHOUT narrowing to a cuisine list.

DIRECTION (not yet implemented): stop filtering grounding candidates by the
cuisine map. A candidate should be admitted on NAME + LOCATION agreement,
with only structural non-places (route, geocode, locality, political)
excluded; venue kind is not the question at grounding time any more than it
was at extraction time. The Gemini chooser already adjudicates same-business,
which is the right place for that judgment.

## OWNER RULINGS (2026-08-05) — decisions closed, round 2 opened

Owner declined the Austin re-extract for now. Confirmed: NO data was deleted
or written by any of the Phase-4 testing — both harnesses are read-only.

1. SURFACE FIELDS — DELETE, do not add to the schema. They were never
   emittable (absent from COLLECTION_RESPONSE_JSON_SCHEMA), so every consumer
   has run on the fallback since day one and none is broken: six months of
   production IS the experiment. The one real claimant (metro/chain matching)
   already reconstructs the same information by regex-matching the canonical
   name back into the source text, for free. Adding them would spend tokens on
   every mention forever to re-derive what we already have. Already absent
   from the candidate prompt. LEFTOVER: extraction-pipeline.service.ts:1813+
   and :1906+ still branch on mention.restaurant_surface, a branch that can
   never be true — round-2 cleanup, not urgent.
2. ASSERTED-VS-INFERRED MARKER — DROPPED (owner + agreed). The product acts on
   implication ("chicken tikka masala" -> indian) rather than requiring proof,
   so the flag has no consumer, and a field nothing branches on is cost plus
   drift. Revisit only if we ever rank asserted evidence above inferred.
3. THE 705 food_mention-ONLY PAIRS — RULED A REAL RECALL GAP; fix in round 2's
   projection phase, not as a patch now. Verified independently (5,704 pairs
   carry food_mention; 705 carry ONLY it; all 705 produce zero connections).
   They are not silently discarded — projection-rebuild:335 turns them into
   ItemSupportMentions — but they never mint a core_restaurant_items row, so
   the dish is unsearchable at that restaurant. The claims are real: "34th st
   cafe has a KILLER SALAD like this" -> asian chicken salad; "just get a
   burger and regular fries" -> fries; italian beef sandwich @ Midway Dogs.
   The is_menu_item=false gate is doing more than it was meant to.
4. GOOGLE VENUE TYPES — KEEP the 60-type list for its real jobs (cuisine
   attribute naming, grounding candidate selection). Do NOT add a venue-class
   admission gate. Type stays an audit signal only.
5. SINGLE-MENTION RANKING FLOOR — DROPPED (owner). Ranking already buries
   thin-support items; a floor would be a second mechanism doing it worse.
6. GROUNDING FAILURES — DEFERRED BY OWNER, DO NOT FORGET. 1,626 active
   restaurants (23.5%) ungrounded, exactly the null-city set; 1,341 of them
   (6,502 events) failed with "no prediction matched preferred place types",
   195 with "place permanently closed". NOT a type-list problem: 866 of the
   1,341 had a candidate carrying type `restaurant`. Root cause is upstream —
   autocomplete returned geographically irrelevant candidates (Rebel Cheese,
   Austin -> "Rebel Burger, Asheville NC" / "Chase Bank, Nicholasville KY").
   Re-running the Places backfill without fixing location bias would spend
   money to fail identically.

## ROUND 2 CHARTER: audit the JOINS and the DROPS, not the rows

Round 1's blind spot, now explicit: it measured things that EXIST AND ARE
WRONG. It never asked what SHOULD exist and is missing, nor what happens
BETWEEN layers. Both big findings since (the 705 pairs, the 1,341 ungrounded)
live in that gap, and neither was visible to any count-the-bad-rows query.

Round 2 scope, layer by layer, each asking "what entered, what left, where
did the difference go?": documents -> events -> connections -> projections ->
scores -> read path; entities -> locations; foods -> categories -> edges;
attributes -> vocabulary. Same discipline as round 1: trace to raw source,
red-team my own conclusions, prove by executed query, and treat one sample as
noise until repeated.

## ROUND 2 PHASE 1 — first census results (2026-08-05)

HOP 1 documents -> events: 89,901 docs, 87,677 extracted, 18,553 producing
entity events (21%). Not a defect on its face — most comments are not
testimony — but the denominator is now recorded so a future change to the
eligibility gate has a baseline to move against.

HOP 2 events -> connections, decomposed by evidence combination
(menu_item / food_mention / category), which is the decomposition round 1
never did:
category ONLY 10,251 pairs 7,342 with NO connection row
menu_item present 5,368 pairs ~all connected
food_mention ONLY 705 pairs 705 with NO connection (known gap)
everything else ~4,900 pairs ~all connected

FALSE ALARM RULED OUT: the 7,342 category-only pairs are NOT lost. All 7,342
appear in some connection's `categories` array (and 6,770 are reachable via
derived_food_category_edges). Representation difference, not a drop — exactly
the kind of thing a count-the-missing-rows query would have mis-reported as a
catastrophe.

REAL FINDING — THE TWO CATEGORY REPRESENTATIONS STILL DISAGREE:
food->category pairs in connection ARRAYS 10,031
food->category pairs in derived EDGES 7,312
in ARRAY but NOT edge 2,877 (28.7% of arrays)
in EDGE but NOT array 158
Part of that gap is deliberate (class ⑤'s >=2-supporting-connections minting
threshold prunes weak claims). What is NOT deliberate is that the array
survives as a second, larger, unpruned answer to the same question. Search
MATCHING was correctly moved to edges only (490388fab; the `c.categories &&`
arm is gone, per its own code comments) — but the array is still SELECTED
(search-query.builder:857, 910) and mapped into the DTO
(search-query.executor:989, 2358), and NOTHING IN THE MOBILE APP READS IT.

THE PATTERN, now seen three times: a field is computed, projected, selected,
carried to the DTO — and consumed by nobody. is_category_item (fixed this
phase), the five \*\_surface fields (deleted this phase), and now the
connection `categories` array. Each one is a second source of truth that
cannot be caught by tests because nothing depends on it, and each is exactly
the "smaller problem that becomes bigger at scale" class. Round 2 should
sweep the projection/DTO surface for the whole family rather than fixing them
one at a time.

## ROUND 2 PHASE 1 — hops 3-4 (2026-08-05): the ghost-restaurant experience

HOP 3 connections -> scores: clean. Every active restaurant is scored
(6,922/6,922). 110 dish rows lack a public score and ALL 110 are
zero-mention starved connections — the same class curated picks already
exclude (F2); nothing a user can reach renders an unscored number.

HOP 4 scores -> the screen: THE GROUNDING BUG HAS A USER-VISIBLE SHAPE.
Search and the map require a location row with lat + google_place_id +
address (filtered_locations CTE); the 1,626 ungrounded restaurants have
none, so they are excluded from every search list, every map pin, every
ranking surface. But AUTOCOMPLETE only excludes archived entities — so all
1,626 ARE suggestible by name (verified: Easy Tiger, Otoko, Garbos — all
lat-less, all active). THE USER EXPERIENCE: type "Easy Tiger", see it
suggested, tap it — no address, no pin, no hours, and the place never
appears in any browse or search result. A ghost. ~9,500 events of real
community testimony are invisible behind these ghosts. This RAISES the
stakes on deferred item #6 (task #1): it is not just un-spent enrichment,
it is 23.5% of the restaurant inventory being suggest-able but not usable.

HOP 5 events -> the score a user sees: the doubled-evidence question from the
phase-1 red team is CLOSED AS BENIGN. Dish scores read the rebuilt mentions
table, and zero (connection, document, kind) groups carry more than one row —
a dish that is both named and used as a category still earns credit ONCE per
comment. Praise likewise dedupes per (restaurant, mention_key). No dish
outranks another because of the two-row evidence design.

## OWNER RULINGS (2026-08-06)

- DEAD categories WIRE FIELD: removed same day (618c72111) — shared type,
  builder, executor, dish list, user-list mapper, poll seed, mobile adapter.
  The projection COLUMN stays (it is storage). 357 tests green.
- THE 705 food_mention-only PAIRS — ruled: they should project as a
  CATEGORY-level link ("this place is praised for salad") unless in-scope
  context supplies the concrete dish, in which case extraction should have
  produced the dish and it projects normally. Implement in the projection
  phase of round 2.
- JUNK-NAME ENTITIES (flagged by another session): "good taco", "souper
  soup", "sos" — all VERIFIED live active foods (1-2 events each). "good
  taco" fuses a judgment into a dish name (describes-vs-judges violation
  inside `food` itself, a slot the attribute gate never inspects).
  Task #1 tracks the investigation.
- GHOST RESTAURANTS: owner unblocked attribution work (was deferred item 6).

## ROUND 2 — attributes layer census (2026-08-06): HEALTHY

The filters users toggle are consistent both directions. Every restaurant
with community dietary evidence (vegan / vegetarian / gluten free / halal /
kosher) carries the matching attribute — zero lost hard-toggle coverage.
The reverse asymmetry (outdoor seating: 801 carriers vs 172 with community
evidence) is the Google enrichment source doing its job (boolean vocab from
Places details), not phantom data. No action.

## GHOST RESTAURANT ATTRIBUTION (2026-08-07) — three causes, each proven live

Empirical method: replayed the real grounding pipeline (resolvePlaceForInput,
through the gated Places client — pennies) for failed ghosts, with and
without the Austin bias, against live Google.

CAUSE 1 — THE PREDICTION TYPE FILTER kills real food venues (the dominant
class). "Rebel Cheese" TODAY returns "Rebel Cheese Factory, Austin TX" as
Google's #1 suggestion — and resolvePlaceForInput still returns NO MATCH,
because the prediction's types (food_store/store — it is a vegan cheese
shop with a deli) contain no PREFERRED_PLACE_TYPES entry and
isRestaurantishPlaceTypes() drops it before adjudication. This is the SAME
lesson as Gate 2 of the prompt work: a venue's Google TYPE cannot decide
food-service-ness (Buc-ee's, PlantShed, Quality Seafood), yet the grounding
lane still uses the cuisine-map-as-gate. 1,134 of the 1,341 failures had a
candidate carrying food/food_store/restaurant types. The pipeline already
HAS an LLM adjudicator downstream (candidateSelectionStrategy:
gemini_staged, restaurant-place-chooser prompt) — the type filter throws
away candidates before the judge that exists to judge them ever sees them.

CAUSE 2 — WRONG-GEO CANDIDATES AT RUN TIME, NOT REPRODUCIBLE TODAY. The
July-30 attempt for Rebel Cheese recorded Asheville NC / Nicholasville KY
candidates; today the same query, even UNBIASED, returns the Austin place
first. The bias encoding in google-places.service is correct (verified),
and the live lane passes bias+locale together. Whatever degraded the
July-30 run (missing bias in the batch lane, or Google index state), it
cannot be settled retroactively — but it does not need to be, because:

CAUSE 3 — ONE ATTEMPT, FOREVER. enrichRestaurantEntity catches its own
errors, so BullMQ never retries; the janitor retry arm is weekly, capped,
and OFF (LOCATION_LIFECYCLE_CRON_ENABLED=false). 90 ghosts were never
attempted at all (Easy Tiger, Otoko, Garbos among them). A one-shot failure
on July 30 froze into a permanent ghost.

PROOF THE GHOSTS ARE RECOVERABLE: re-running the real pipeline today with
proper context matched 3 of 5 sampled ghosts immediately — Easy Tiger (The
Linc), OTOKO (S Congress), Garbo's (on Mopac). Thai Kun failed correctly
(permanently closed); Rebel Cheese failed on Cause 1.

FIX SHAPE (round-2 design, not yet implemented):
  a. Prediction-stage type filter stops being a hard gate — candidates flow
     to the existing gemini_staged adjudicator, which decides "is this the
     place the community meant" from name+geo+context (the claim-level
     test, where it belongs).
  b. One re-grounding sweep over the 1,341+90 with locale+bias (expected
     recovery well over half, given 3/5 sampled), tombstoning the
     195 permanently-closed so autocomplete stops suggesting corpses.
  c. Failures become retryable: either stop swallowing the error (F354
     precedent: the queue's attempts:3 is unreachable today) or turn the
     janitor retry arm ON with a budget.
  d. Places spend rides the owner-approved envelope; measured recovery rate
     from (b)'s first 100 decides whether the rest runs.

## GHOSTS: BUILT, EXECUTED, RED-TEAMED (2026-08-08)

Shipped (one commit): the type gate is a hint, never a veto — the chooser's
verdict stands and an off-category selection is logged, not rejected; the
"restaurantish" hint now reads Google's COMPLETE food-and-drink category
(164 types, source-pinned) instead of the 64-key cuisine map; the failure
reason is honest ("chooser declined all candidate sets"); chooser rule 11b
judges store-typed candidates by the source text's mode of consumption; the
worker rethrows on transient errors so the queue's attempts:3 finally runs;
scripts/reground-ghosts.ts is the recovery + tombstone runner, deriving each
ghost's locale+bias via THE one dispatch-context builder and feeding the
chooser the ghost's highest-upvote mention snippet.

EXECUTED: 195 permanently-closed ghosts archived (Google's own verdict; 0
were user-anchored; events retained). First-100 tranche: 47 RECOVERED /
53 no_match / 0 errors — Otoko, Garbo's, Easy Tiger, la Barbecue, Louie
Mueller (Taylor), Güero's, Perla's, Din Tai Fung, KazuNori all grounded
with correct addresses.

RED TEAM: audited all 47 — store-typed admissions are exactly the intended
class (Schaller & Weber, MT Supermarket, Rebel Cheese Factory). ONE wrong
branch found: Wegmans grounded to Harrison NY while the community text said
"Wegman's Astor Place" — root cause: the sweep wasn't feeding source text,
so the chooser only had the market default. Fixed structurally (snippet
into every sweep call) and specifically (force re-ground with the snippet
→ 770 Broadway, Astor Place). A transient ".has" crash poisoned the first
tranche run and 3 stragglers; not reproducible on any replay path, classed
transient/retryable by the taxonomy, cleared on rerun.

PLACES SPEND REVIEW (owner ask): the big levers are already pulled — dollar
gate before rate gate, SKU classification from field masks, lean refresh
mask for re-polls, archived-never-enriched, spend metered per caller. One
gap noted at the time: enrichment doesn't use Places session tokens.
RETRACTED 2026-08-08 — the red-team session investigated and DELETED the
half-wired plumbing (F9520): no producer existed, sessions don't pay at
one-autocomplete-per-grounding, and the real cost lever is elsewhere (the
retry/fallback tail is ~60% of grounding cost; first-set chooser
acceptance is worth ~$0.017/location, 4x the session-token prize).

## GHOST MACHINERY RED TEAM (2026-08-08) — my own shipped code had the census disease

Owner asked whether rule 11b duplicated rule 11, whether the type machinery
still earns its keep, and for a leftover-code sweep. Findings, all executed:

1. THE UNREAD FLAG. `restaurantish` was computed on every chooser candidate
   and NEVER sent to the chooser (the judge receives raw `types`, which is
   strictly richer). Computed-projected-consumed-by-nobody — the exact
   pattern the round-2 census named, inside code shipped yesterday. Deleted.
2. DEAD FILTER. `filterViableRankedCandidates` had ZERO callers after the
   veto removal. Deleted. Two candidate-list `.filter(restaurantish)` re-add
   passes were no-ops (the unfiltered adds precede them; addCandidate
   dedupes by placeId). Deleted.
3. ONE HINT SET. `PREFERRED_PLACE_TYPES` (the 64-key cuisine-map derivation)
   had one remaining reader, resolveIncludedType — now reads the complete
   Google food-and-drink category like everything else, and the const is
   GONE. Failure metadata stops advertising `preferredTypes`.
4. WHAT TYPES STILL DO (owner question answered): nothing filters on types
   anymore. Three surviving roles, all passive: raw `types` ride each
   candidate into the chooser as evidence; `includedType` narrows a
   grounded brand's BRANCH search to its own primaryType; the audit log
   marks off-category acceptances. A place with NO food type still grounds
   — Rebel Cheese Factory (manufacturer) and Bola Pizza (wholesaler) are
   live proof from the recovered set.
5. CHOOSER PROMPT RESHAPED from scratch, not additively: 12 rules -> 6
   named principles (IDENTITY, GEOGRAPHY, STOP-OR-CONTINUE, BRAND CLUSTERS,
   WHAT-THE-PLACE-IS, TIES). Rules 4/5/6 were one concept stated thrice;
   8/9/10 were geography discipline scattered; owner's 11b merged into the
   category rule as the deciding principle rather than an appendix. The
   Wegmans lesson is now explicit: "when the text names a specific branch
   or neighborhood, pick that branch."
106 llm+enrichment tests green. Sweep resumed after session teardown:
460 grounded so far, remainder running.


## CROSS-SESSION HANDOFF ABSORBED (2026-08-08)

From the red-team session, all relevant to this lane: failure reason codes
now fill forward on every attempt (failureClass/failureReasonCode);
transient failures no longer burn strikes, so the sweep cannot mass-archive
during a Google hiccup; the janitor cron stays OFF until the owner unparks
the drain-pace decision — NOTE: the root-cause fix it was waiting on (the
type-gate veto) LANDED, so that decision is now unblocked; priceRange
backfill rides every details call this sweep makes (owner ruled no
standalone backfill); the measured cost lever is first-candidate-set
chooser acceptance (~60% of grounding cost is the retry/fallback tail) —
the snippet-feeding + six-principle chooser reshape push in exactly that
direction, worth measuring on the sweep's ledger rows; session tokens are
rejected-with-return-condition (F9520); dead selectQualifiedCandidate
deleted here.
## JUNK-NAME INVESTIGATION CLOSED (2026-08-08): all three are REAL MENU ITEMS

The flagged "junk entities" are correct extractions, verified against source:
  "good taco"   — Chino's Fusion Hacienda sells tacos named "The Good",
                  "The Bad", "The Ugly" ("I love the 'good' taco, husband
                  loves the 'bad' and 'ugly'").
  "sos"         — a Tiki Tatsuya menu item ("The SoS is so fucking good I
                  dream of it").
  "souper soup" — a named dish ("I only go there for the souper soup!").
The flag was a SHAPE judgment (praise-word inside a food name = junk) — the
same shape-vs-kind error the whole audit catalogues. The kind test (a thing
a diner orders by name) passes all three. KEEP. No prompt or code change.

## SWEEP COMPLETE + TWO CENSUS FIXES LANDED (2026-08-08)

> CORRECTION (coordinator plans-audit) 2026-08-08 — SUPERSEDED. The
> "~700 recovered / 926 remain" figures below are a mid-campaign snapshot.
> The authoritative final numbers are in "GHOST CAMPAIGN CLOSED
> (2026-08-08) — final numbers" further down this file (line ~1642):
> 1,626 ghosts of 6,922 active (23.5%) at start -> 783 of 6,571 (11.9%)
> at close, ~615 recovered + 228 tombstoned + the rest collision merges.
> Read that block, not this one.

GHOSTS: campaign total ~700 recovered of the original 1,626 (926 remain,
6,620 active). The remainder is dominated by honest no_matches — food
trucks, caterers, pop-ups, and closures Google cannot ground — plus the
tail cut short twice by the P2028 pair (below). Re-runnable any time:
the sweep is idempotent and the failure records are now honestly coded.

P2028 ROUND 2: the first fix (merge joins the caller's tx) exposed a
second level — the merge's POST-MERGE PROJECTION REBUILD opens its own
transaction over core_restaurant_items rows the still-open caller tx just
re-keyed. Same self-deadlock, one call deeper. Final shape: the rebuild is
a POST-COMMIT EFFECT — inline only for standalone merges; joined-tx
callers call rebuildAfterMerge() after their transaction commits (both
grounding collision sites wired). 151 tests green.

THE 705 FIX (owner ruling implemented + PROVEN): a direct food_mention now
MINTS the connection (isCategoryItem=false) instead of being discarded by
the menu_item-only predicate, and a minting group no longer double-counts
as a support mention (one claim, once). Executed proof on the mirror:
"fried fish @ Mr. Catfish", "sweets @ Caffè Panna", "vietnamese beef stew
@ PHO 63", "italian deli sandwiches @ ALIDORO", "soul food buffet @
Manna's" — all previously invisible, all minted with mentions=1 after
rebuildForRestaurants. The full 705 materialize corpus-wide on the next
full rebuild / nightly reconciler pass. The always-null support foodId
field and its dead matching arm were removed rather than kept as guards.

## THE TYPE SET DIES ENTIRELY (2026-08-08, owner question)

"If the types are just passed through as data, why do we even need this
typeset?" — followed to its end, the answer was: we don't. The three
surviving uses each dissolved: the branch-search membership gate only
DENIED narrowing to store-typed brands (the brand's own primaryType is
Google's classification and passes through verbatim now); the off-category
audit line duplicated data the trail already records verbatim; the size
stamp described the set itself. The 164-type copy of Google's taxonomy is
deleted, isRestaurantishPlaceTypes is deleted, and the grounding lane now
contains ZERO type judgments — the judge reads raw types as evidence,
full stop. Lifecycle of this idea across one audit: 64-key cuisine map as
VETO (234 ghosts) -> complete-category HINT (fed one log line) -> nothing.
Each step was proven, not assumed. 28 tests green.

## GHOST CAMPAIGN CLOSED (2026-08-08) — final numbers

  Start:  1,626 ghosts of 6,922 active (23.5%) — suggestible, unusable.
  End:      783 ghosts of 6,571 active (11.9%).
  ~615 restaurants RECOVERED with correct pins/addresses (plus priceRange
  riding free per owner ruling); 228 tombstoned on Google's own
  CLOSED_PERMANENTLY verdict (195 + 33 found by the sweep; zero were
  user-anchored); the rest of the delta is collision merges (ghost twins
  folding into their grounded canonicals). Final pass: 110 recovered /
  789 no_match / ZERO errors — the P2028 deadlock class is dead in
  production shape. The residual 783 are honestly-coded no_matches: food
  trucks, caterers, pop-ups, one-off vendors Google cannot ground. They
  stay active (their evidence is real; autocomplete still finds them by
  name) and are exactly the class the janitor's threshold arm exists to
  age out.

JANITOR COMPATIBILITY (pre-flip check, read-only): the retry arm keys on
enrichment_failure_count vs a threshold, capped by retryLimit per weekly
run — compatible with the sweep (transient failures no longer increment
the count; definitive ones do, so the residual no_matches will age toward
the threshold arm rather than being re-bought weekly). Flip is
owner-gated; recommendation stands: ON.

## JANITOR SLIM-DOWN SHIPPED (2026-08-08, owner-ruled)

"Do we even need the janitor?" — mostly no, and the parts we need got
better homes:
  - RETRY ARM DELETED: mention-driven retry already exists (every batch
    enqueues every mentioned restaurant; the worker skips grounded ones;
    transient failures rethrow into Bull's attempts:3).
  - ARCHIVE ARM DELETED, replaced by THE MONEY GUARD at the spend
    chokepoint: enrichment refuses (skipped, zero vendor calls) once
    enrichment_failure_count reaches the threshold. The ungroundable food
    truck stays ACTIVE and name-searchable — archiving was the wrong verb —
    and stops buying lookups. Guard proven by a vendor-call tripwire spec
    (a Proxy that throws on any Places touch): at-threshold refuses,
    below-threshold reaches the vendor, retryTerminal (the recovery sweep)
    and force (moved identity) bypass, unset threshold disables rather than
    invents.
  - WHAT REMAINS is the janitor's true name: GROUNDED-PLACE LIFECYCLE —
    weekly staleness refresh (DETECT) + archive-on-Google's-own-
    CLOSED_PERMANENTLY + moved-place re-enrich (ACT). The policy
    integration spec was rewritten for the new shape, including the
    mutation fixture "resurrecting the ungrounded archive arm turns this
    red" (ungrounded-many-failures must never be selected).
Flip LOCATION_LIFECYCLE_CRON_ENABLED=true remains the pre-launch checklist
item it always was — but now it enables ONLY the grounded lifecycle.

## ADVERSARIAL-LANE FINDINGS LANDED (2026-08-08: F9965/F9966/F9967)

F9967 (is_category_item lane consistency) — MEASUREMENT FIRST settled the
intent question: 1,416 of 4,643 item-bearing restaurants were rollup-only
on the mirror, BUT 1,410 of them gain a real dish row once the 705 fix's
full rebuild runs (the projection writer's "category items exist for the
childless case" premise was COMPENSATION for the food_mention drop — the
two fixes compose and the childless case shrinks to 6 residual
restaurants). Principled shape therefore: rollups are never dish rows in
EVERY lane. Extended the exclusion to the restaurant CARD's
top_dishes/total_dish_count lateral and the executor's dish_count +
top-3-dish hydrate; matching lanes (restaurant-lane EXISTS predicates)
deliberately keep rollups as match carriers. Photo-picker inherits the
profile's list. Mutation guard extended to the restaurant-card SQL.

F9966 (rebuildAfterMerge forgettability) — control INVERTED: the merge
service owns the transaction; callers cannot pass one. Pre-merge work that
must be atomic (the grounding lane's location re-point) rides a `prepare`
hook that runs inside the service's transaction and overlays
canonicalUpdate. The post-commit projection rebuild runs in the service,
always — the forgettable path is deleted, not documented. rebuildAfterMerge
is gone; both grounding sites converted.

F9965 (money-guard hygiene) — the unset-threshold branch was asserting a
state prod cannot reach (threshold is a boot-validated positive int, F365):
branch deleted, guard reads config with the same non-null contract as every
lifecycle read. `force`'s deliberately-wider-than-retryTerminal semantics
are now PINNED by spec (force bypasses both the grounded short-circuit and
the money guard — the moved-arm path needs exactly that; retryTerminal
stays narrow, proven by a grounded fixture still short-circuiting).
enrich-restaurants CLI splits --force (identity refresh) from
--retry-terminal (guard bypass) — two decisions, two flags. Config comment
rewritten from the dead archive-arm description to the money guard.
275 tests green across enrichment + search + collector.

## JUNK-ENTITY RE-DERIVATION (2026-08-09, owner-named class)

Owner asked whether food:"and"/"after", restaurant:"Best", food:"lunch"/
"dinner", and pizza-as-restaurant-attribute were addressed. Traced each:

- food "and"/"after": GONE (earlier cleanups); regeneration covered by the
  candidate's per-token order test. No action.
- restaurant "Best": active husk, 0 events — GC food. No action.
- food "dinner" (46 ev) / "lunch" (30 ev): ROOT CAUSE FOUND, and the
  candidate prompt did NOT cover it — the ask-reuse path inherits the
  ask's target as `food` without running the PREDICTION TEST, so "nice
  dinners on a budget?" manufactured food:"dinner" from every bare-name
  reply. FIXED: Step E now requires the inherited target to pass the
  PREDICTION TEST ("best burger" hands down burger; a when-only ask hands
  down NOTHING — restaurant-only mentions).
- pizza as restaurant_attribute (ACTIVE, 166 events, plus one archived
  twin): ROOT CAUSE FOUND, and this one was a REGRESSION IN MY REWRITE —
  the live prompt banned dish-type attributes in a buried §2.5 note that
  the from-scratch rewrite lost, and the word passes the STANDALONE test,
  so the gates alone don't stop it. FIXED as a principle, not a list
  (Step D.3): a dish type names a THING, not a property — a place doesn't
  HAVE pizza as a quality, it SERVES pizza, and that claim belongs in
  food/food_categories.

Both fixes proven: gold set now 20 cases x 5 repeats — candidate 20/20,
live 13/1/6 (the live prompt FAILS the new pizza-attribute case,
confirming it as a live defect, and passes ask-reuse only because its
buried note sometimes holds). Zero regressions.

DATA disposition: the dinner/lunch/pizza-attr EVENTS ride the re-extract
(the sanctioned repair path) — the prompt now prevents regeneration.
archive-dish-named-attributes.ts was dry-run and its finding BANKED: DO
NOT --apply in current form — its name-collision predicate now sweeps in
legitimate cuisine/dietary attributes (vegan, thai, sichuan...) because
cuisine-as-food residue still exists; applying would violate
dietary-never-dropped. It stays as a measurement probe.

LESSON recorded for the pass itself: a from-scratch rewrite can LOSE
buried rules the old prompt carried. The gold set is the regression net —
every buried-note rule that matters must have a case, which is exactly
what D13/D14 now are.
