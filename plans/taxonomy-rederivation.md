# Taxonomy rederivation — the working file (opened 2026-08-15)

Owner mandate: from-scratch derivation of the ideal shape for venue kinds,
consumable kinds, category/attribute naming ("X food"), entity-type naming,
and their search semantics — QUESTIONING EVERYTHING, implications first,
nothing changed in a silo. This file is the working plan while we lock it in.

## MEASURED FACTS the design rests on (all verified personally 2026-08-15)

F1. Google types are SIBLING TAGS, multi-applied — Google agrees with the
    owner's taxonomy instinct. Stored types for 5,233 grounded venues:
    'restaurant' on 4,348 (83%); cafés 661 of which 328 (50%) ALSO
    'restaurant'; bars 1,141 / 898 (79%) also; bakeries 492 / 200 (41%)
    also. So: coffee shop is NOT under restaurant; a meal-serving café is
    BOTH; 17% of venues are NOT restaurants. 'restaurant' is a real,
    discriminating, completable tag — my earlier "it would tag everything"
    was WRONG.
F2. Types→attribute promotion EXISTS (google-place-type-attributes.ts, 647
    lines; evidence source places_api = 44,374 rows) but is INCOMPLETE:
    3,508/5,290 grounded have any places attr; 1,487 have a venue-KIND tag.
    Raw types are STORED for 5,283/5,290 → completion = free local
    backfill + invariant, zero Places/LLM spend.
F3. The attribute-ontology worker EXISTS and covers BOTH food_attribute AND
    restaurant_attribute (promote/merge/reject/rename, LLM, async). The
    owner's remembered "attribute merger" is real and is the right court
    for X-food questions.
F4. Restaurant pane ranks by OVERALL restaurant score (percentile_rank),
    not by matched-dish quality; for a food query the pane = venues
    serving it, ranked overall. "Ranked by their coffee" is the
    sectioned/A1 future, off by owner ruling today.
F5. X-food entities exist in corpus: 'dominican food' (food type),
    'comfort food' (food AND restaurant_attribute), 'red sauce italian
    food'. Class is real; mechanism needs ⭐04 investigation for the
    red-sauce case.

## THE DERIVED IDEAL (proposed, owner ratification pending per section)

### T1. Venue axis = Google's own multi-tag taxonomy, promoted completely
Every grounded venue carries ALL its types-derived venue-kind tags
(restaurant, cafe/coffee shop, bar, bakery, ...), multi-tag, from stored
data. 'restaurant' becomes a real mapped tag (add to the map). Standing
invariant: grounded ⇒ types-promoted. ⭐04's knowledge-attribute lane =
residue filler (vibe, truck nuance) under identity-entailment + provenance
separation. Composes with the pop-up lifecycle law (grounded ≡ tagged).

### T2. Search semantics for venue-kind words
"restaurants" → venues tagged restaurant (NOT browse-all; excludes
pure coffee shops/bakeries — matches user expectation AND Google's
behavior). "coffee shops" → venues tagged cafe/coffee_shop. Complete
because T1 is complete. BROWSE-ALL remains ONLY for frame-word queries
(best/top/near me). Bare "food": provisional frame-equivalent (browse);
final semantics = consumable-axis question (T3) — candidate: all venues
serving food-kind items. DECIDE at ratification.

### T3. Consumable axis = one judged facet (food | drink) over food-type
entities, via the hearing ledger (the "word court": one-time LLM
judgments, recorded permanently with reasons, re-heard only on rule
change). ~24k entities ≈ $3. Google cannot supply this axis. Finer kinds
(dessert, soup, cocktail) remain ordinary categories beneath it.

### T4. X-food doctrine — fix in DATA via the ontology court, not in parsing
Principle: AN ATTRIBUTE'S NAME IS THE MINIMAL FORM NATIVES USE.
'comfort food' is irreducible (the term itself). 'dominican food' reduces
to 'dominican' — merge, with 'dominican food' kept as an ALIAS/surface of
the canonical. Then search needs NO "X food" composition rule at all:
the typed query matches through the surface. Extend the attribute-ontology
prompt with this principle + gold cases (comfort food stays; dominican
food → dominican; jamaican food → jamaican) and let it drain the existing
population. Extraction side (⭐04): gold case so '<cuisine> food' mints as
the cuisine attribute (or its alias), never a food entity; investigate
'red sauce italian food' minting mechanism.

### T5. Naming (owner deciding)
Internal/entity types: spot / spot_attribute / dish / dish_attribute if
the full rename is taken (owner willing; execute pre-wave so the rebuilt
corpus is born under final names; prompt schema renames force prompt
re-certification — cheap in dollars, one-day campaign with full gates).
UI panes: owner shortlist was Places/Menu, Where-to-Go/What-to-Get,
Spots/Fare, Venues/Items, Where/What. Recommendation: **"Where to Go" /
"What to Get"** as the pane headers (names the ASK, teaches the two-axis
model, self-explanatory), with Spots/Dishes as the short nouns for
buttons ("Best Spots" / "Best Dishes").

### T6. Coffee vs coffee shop
Stay DISTINCT (what-ask vs where-kind-ask). Correction on record: today
both panes rank by overall score and differ only in filter; the
"restaurant pane ranked by their coffee" reading is the A1/sectioned
future and lands with the ladder session.

## PHASE 1+2 AUDIT TASKS (against this direction)
- [ ] Phase 2 (in flight): amendment SENT — browse for frame-only;
      category words keep today's grounding; no category demand; bare
      food/restaurants provisional-browse pending T2/T3 ratification.
- [ ] After it lands: audit word-role facet verdicts for venue-kind words
      vs T2 (category verdicts should align with venue-kind tags).
- [ ] Phase 1 items: no conflicts identified (doors/queue/budget/zh are
      direction-independent). Verify on audit pass.
- [ ] ASK_FRAME/BARE_CATEGORY retirement: confirm it lands via facet, and
      that T2 (not browse) governs category words.

## OPEN QUESTIONS FOR THE OWNER
- O1. Ratify T1/T2 (venue axis + strict "restaurants" semantics)?
- O2. Bare "food" final semantics (browse vs food-serving-venues filter)?
- O3. T5 naming: full rename go/no-go + word pair.
- O4. T4 doctrine ratification (ontology-court merge, minimal-native-form).

## RULINGS LANDED 2026-08-16 (owner)
- R1. UI panes: **"Where to Go" / "What to Get"** RATIFIED.
- R2. Shortcut buttons OVERHAUL: collapse Best Restaurants + Best Dishes
  (duplicates — both = unfiltered browse) into ONE agnostic button; fill
  the row with venue-category buttons (Google-style) once the venue axis
  lands. Naming + "best"-prefix question answered in session (rec: drop
  "best", plain nouns, first button "Everything").
- R3. SECTIONED RELEVANCY: owner re-affirms it is RULED OUT PERMANENTLY —
  he believed it deleted; verified it still exists inert
  (resolveSectionedRanking + SEARCH_RANKING_MODE + 11 match_tier sites,
  off by default). DELETE the dead machinery (queued; compatible with A1 —
  the ladder governs ADMISSION, ranking stays pure Crave-Score).
- R4. Consumable-kind ownership: moves to ⭐04's knowledge-attribute
  program as its first CLOSED-ENUM exhaustive pass (writes verdict
  ledger); NOT a word-court facet (word court judges words; this judges
  entities — one entity-knowledge lane, not two).
- R5. X-food division: primary fix = extraction prompt (⭐04); secondary =
  attribute-ontology merge doctrine (minimal-native-form + alias kept —
  verified mechanically sound: merges fold name+aliases through the one
  projection writer). Third layer verified NOT needed (search matches
  through surfaces).

## CROSS-SESSION CONSENSUS (2026-08-16, both plans exchanged + hole-poked)
- H1 (⭐04's catch, ACCEPTED): venue-axis SEMANTIC flip ('restaurants'
  strict, venue buttons) activates only AFTER reground+survival resolves
  ghosts to grounded-or-archived — else strict search silently excludes
  real-but-ungrounded venues (food trucks worst). Data backfill may run
  earlier as prep. T2 activation condition.
- H2 ACCEPTED: types→kind mapping = ONE authority in
  google-place-type-attributes.ts + kind-vs-noise classification + an
  unmapped-types census invariant (Google adding a type = loud event).
- H3 ACCEPTED: sync first-search hearing → budget-gated, fails closed to
  degrade; timeout writes NO verdict (record-only-on-complete); hearing
  drains OFF during shadow windows until ⭐04's P6 sandbox lands.
- H4: entailment-vs-convention meal-timing boundary co-signed in
  direction; formal co-sign at their design presentation.
- MY POKES K1-K5 sent (Places spend cap on shorthand A/B; single
  re-baseline at their scoring-epoch flip; joint shadow-write enumeration
  incl. my doors; C4a name-lane = the court for their P5 census;
  containment-reads-surfaces stays in wave scope).
- START CONDITION (owner): both sessions begin execution only after ⭐04
  acks K1-K5 → then report agreement to owner.

## RULINGS/REFINEMENTS 2026-08-16 (round 2)
- R6. Categories-never-demand DEMOTED from standing rule to TRANSITIONAL
  guard: owner's reasoning accepted — once the venue axis + wave complete,
  category words always ground and structurally never reach unmet-demand;
  the code guard matters only for the un-banked-language window (餐厅
  pre-wave). RETIREMENT CONDITION written: delete the guard when axis
  semantic flip + wave land; until then it prevents category junk in
  demand for unbanked locales.
- R7. Button row FINAL noun set (time-of-day dynamic slot rotates):
  All · Food · Drinks · [Breakfast|Brunch|Lunch|Dinner|Late Night by
  local time] · Restaurants · Bars · Coffee Shops · Dessert · Bakeries ·
  Food Trucks. Late Night pairs with hours data (open-late machinery).
- R8. Button attribution BEFORE tap-event stream: search requests gain a
  tiny origin field ('shortcut:<button>' | 'typed' | ...) flowing into the
  existing kind:'search' signal — ships WITH the button row; identical
  text typed-vs-tapped is indistinguishable today without it. Full UI
  tap-event stream deferred.
- R9. Containment-reads-surfaces = EXTEND the existing nightly
  name-containment job (its input widens from canonical identity_key to
  include recall surface forms; same law, same job) — not a new job;
  wave scope (⭐04 K5 confirmed).
- R10. Pinyin RULED YES (owner 2026-08-16): romanization is a LAYER of
  the zh wave (extra generator output banked at 'und'), not a separate
  language — same shape for romanized ko later. Wave scope.
- R11. GOOGLE-TYPES AUDIT (owner-ordered, my venue-axis lane): review the
  full Google type set + the existing map; produce keep-as-attribute vs
  ignore lists (establishment/point_of_interest = ignore; store = lean
  no). Google changes types rarely — owner re-audits manually on their
  next big release; between releases the unmapped-types census invariant
  alarms via opsAlerts (feasible: types arrive AS-IS from Places
  responses, unpicked, stored raw — so new types ARE detectable;
  email/sentry ride the existing ops-alert rails). Nice-to-have priority.
- R12. TRUST-GOOGLE MAPPING POLICY RULED: restaurant+bar → appears under
  "Restaurants" (Google's restaurant tag means it serves food); bar-only
  → does not. Extend the same trust to other kind combinations; revisit
  only if real data shows Google's tagging misleads.
- R13. Button-origin tracking → SPLIT to its own owner session (chip
  spawned, task_5009f71b); not part of this session's execution round.

## RULING 2026-08-16 (round 3)
- R14. O3 RULED: internal entity-type rename = **place / item**
  (place, place_attribute, item, item_attribute). UI names stay
  Where-to-Go/What-to-Get (R1). Execution: dedicated campaign on a clean
  base AFTER the current red team lands; the efficient slot folds the
  extraction-schema field renames into v15's natural certification
  boundary (one cert covers both) — flagged to ⭐04 for timing consent.
  Scope: DB enums + migration, code sweep, prompt schema fields
  (⭐04's files, their lane), docs; UI already decoupled.
- R15. Name-prefix fallback: from-scratch rederivation COMMISSIONED
  (research agent) — Google/industry behavior, full autocomplete code
  read, ideal shape across every search type given the new flow.

## RED TEAM LENS-B VERDICTS (2026-08-16; foundational hindsight)
FIVE OF SIX LAYERS SAME-AGAIN (entity model, hearing ledger, word court,
doors, spend — spend "genuinely one model, not accretion"). Findings:
- B1 CONFIRMED+FIX DISPATCHED (user-visible): browseMode has ZERO
  orchestration consumers — typed 'best' still hits the empty-targets
  scold; only the All-chip's separate door serves browse. My earlier
  "works end-to-end" report was WRONG (probe bypassed orchestration);
  fix converges on ONE serve path + orchestration-driven probe.
- B2 for the LADDER SESSION: F3 clean delete; F1 band-0 is a REBUILD
  (sectioned gate was deleted, all C4 numbers measured ungated); F8
  fights the composition's name-matching clause — A1 must arbitrate
  No-Name-Burgers vs F8 in the same span filter, not pre-wired.
- B3 → RENAME CARRIES IT: venue-kind exists only in the TS map;
  facet ∈ {venue_kind,cuisine,amenity} persisted on 59/~2000 rows —
  persist for ALL in the rename migration or T2/R7 re-instantiate the
  law per consumer (the pre-disease state). First-class column would be
  WRONG (kinds are multi-tags); the facet column is the ideal.
- B4: hearing budget is OPT-IN per lane — 4 of 9 lanes guarded by
  comments only; ideal = due-scan on the ledger refuses unmetered lanes
  (~1 day). + lane-declared outcome enums (free-text outcome typos
  record forever). QUEUED post-rename.
- B5: role<>'display' hand-spelled ~10 sites incl. ONE LIVE VIOLATION
  (cuisine-extraction und identity probe — in the B1 fix dispatch);
  door-lockdown allowlist spec = the enforcement. takeTheWord evict
  UPDATE exists twice, unowned — QUEUED.
- B6: places-promotion latent double-drain (recordSpend direct + would
  meter again under runInWorkContext) — safe by wiring coincidence;
  QUEUED small fix. Places pre-call ledgering over-meters failures.
- B7 small: pickPlacedWinner indexOf -1 bug (in B1 dispatch); dup
  autocomplete-entity switch (one unreachable); tokenizer
  re-instantiated twice vs A2 law; detectedLocale??request hand-rolled
  4+ sites; sync-hearing 5% headroom with no gate. QUEUED sweep.
RENAME CARRY-LIST (R14 executes WITH these): persist facet for all
attributes; rename denormalized columns (restaurant_attributes→
place_attributes, Connection.foodId/restaurantId, restaurantMetadata,
model names); collapse EntityScope dup enum into renamed EntityType;
stamp food's dish|category|drink kind while the prompt reopens for v15;
sweep raw table/column literals in invariant scripts + fixtures
(resolution-gate fixture hand-mimics addSurfaces — drift risk).

## R15 REDERIVATION VERDICT (2026-08-16; industry + code + live probes)
INDUSTRY: autocomplete vs submitted search are separate ENGINES everywhere
(Google/Yelp/Foursquare/Apple) — but that's a billion-row latency fact,
not semantics; submitted generic/name queries are CLASSIFY-THEN-ROUTE
(Yelp name-probability arm; DoorDash intent taxonomy). Nobody blends
blindly.
OUR SHAPE VERDICT: ONE recall engine + TWO policies is what we already
have (EntityTextSearchService feeds both; autocomplete optimistic —
prefix 0.9; linker conservative — admission floors) and it is CORRECT
at our corpus size. Do not fork recall; do not merge policies.
THE IDEAL: prefix = an evidence tier every consumer reads + ONE missing
consumer policy — a NAME-INTENT arm in submitted flow at grounds-nothing
∧ ¬browse ONLY: serve venues whose names carry prefix/edit evidence as a
SUBORDINATE name-suggestion set (never competes with grounding; disjoint
from dense — "same word unfinished" vs "different words same concept").
'frankln barbecue' should show Franklin Barbecue, not generic barbecue +
a futile demand probe. Two-pane for 'the': Where-to-Go = The-X venues by
score; What-to-Get = empty-with-affordance, NEVER a concept guess.
'brisk' mirror: dishes side carries brisket (today's accidental fuzzy
behavior made deliberate). Prefix NEVER earns a link — suggestion only.
BUILD-NOW DEFECTS (dispatch when browse-hole agent lands — file
collision): (1) 'jo'→'jos' pluralization accident mints an EXACT alias
link from a 2-char prefix (foodNameVariants must not pluralize sub-3-char
residue into exact claims); (2) C4a DENIAL IS COSMETIC FOR AUTOCOMPLETE —
name arms match core_entities.name/identity_key directly, bypassing
surface deprecation; notAName verdicts must suppress the name arms for
that (entity,form) — and note ghost 'Best' was NOT in census batch 1
(autocomplete serves it exact-top today); (3) out-of-viewport exact-name
grounding ('the alcove': 0 results, silent) needs its coverage message.
(Browse-serve wire = already in the in-flight fix.)
LADDER-GATED (A1 agenda additions): the name-suggestion arm's floor +
response-contract seat (distinct nameSuggestions band); ratify-or-replace
the fuzzy-tier accident as an explicit dish-prefix band; prefix
never-links ratification.

## SEQUENCING
Types-promotion backfill + invariant: post-v13-activation window (rides
with reground/dedupe). Consumable facet + X-food ontology drain: with the
wave. Rename (if ratified): pre-wave dedicated campaign. Coffee-pane
relevance ranking: ladder session (A1).
