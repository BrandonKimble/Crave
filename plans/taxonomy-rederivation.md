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

## SEQUENCING
Types-promotion backfill + invariant: post-v13-activation window (rides
with reground/dedupe). Consumable facet + X-food ontology drain: with the
wave. Rename (if ratified): pre-wave dedicated campaign. Coffee-pane
relevance ranking: ladder session (A1).
