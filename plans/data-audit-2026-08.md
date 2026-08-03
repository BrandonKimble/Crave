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
nothing scheduled runs until reverted). Standing residue, deliberate:
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
