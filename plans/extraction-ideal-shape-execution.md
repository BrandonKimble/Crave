# Extraction Ideal-Shape Execution (ratified 2026-07-26)

Owner ratified ALL proposals from the extraction audit deep-dives, PLUS the
category-item foundation (his design). Execute in order; verify each phase;
ledger every landing. Full evidence trail: plans/austin-extraction-audit.md
+ session task outputs (carbonara-udon payload walkthrough, banking proof,
timing map, ramen root cause).

## Phase 1 — Collection prompt tightening (NO additive rules)

File: apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.md

1. §5.2.2 ask-inheritance gains its missing precondition, CHECKED not
   assumed: may only fire when the reply contains no dish language of its
   own (if the reply restates the ask's dish — "I've had carbonara udon" —
   run normal 5.2.3 itemhood instead). This fixes the fan-out class: the
   model pattern-matched the ask→bare-restaurant-list template onto a
   comment that had its own dish text.
2. §5.2.3 escape clause made operational: "context makes it specific when
   the source names the dish itself (not merely a meal-period/cuisine
   modifier on a category noun) and ties it locally to the restaurant."
   Ladder check: carbonara udon ✓, "Kura's udon" ✓ (borderline-ok per
   owner), "breakfast tacos" ✗ (meal-period modifier), sushi ✗.
3. §1.3 origin example gets the same condition stated inline (prevents the
   memorized unconditional template).
4. §2.5 name-trimming example list: remove `ramen` and any dish nouns
   (keep bbq/steakhouse/cafe — legitimate venue styles). This primed
   ramen-as-attribute.
OPERATIONAL: prompt edit self-invalidates the Gemini cache at NEXT BOOT
(full-text fingerprint) — rebuild+restart required; prod via deploy.

## Phase 2 — Attribute/food collision integrity (REDESIGNED 2026-07-26 after
## dry-run falsified the direction-blind gate)

DISCOVERY (scripts/archive-dish-named-attributes.ts dry-run): collisions
are BIDIRECTIONAL junk. 'ramen' = legit food, junk attribute twin. But
'vegetarian', 'breakfast', 'brunch', 'sweet', 'sour', 'comfort food',
'bakery', 'bar', 'cocktails' = LEGIT attributes whose junk twin is on the
FOOD side (extraction minted them as foods). A gate that auto-rejects the
attribute side would destroy real vocabulary — Phase 2a as first committed
was WRONG and was reverted (c26d74da reverted).

CORRECTED DESIGN — the deterministic part is the CONSTRAINT, the direction
is one deliberate judgment per word:
1. INVARIANT (deterministic, code): no normalized name may be ACTIVE as
   both a food and an attribute. Enforce at adjudication promotion AND at
   food-entity creation: a collision doesn't auto-resolve — it enqueues a
   DIRECTIONAL adjudication.
2. DIRECTIONAL adjudication (one-shot per word, durable): the orderable-
   item test decides the word's true home — "can a diner order this as an
   item?" ramen/pho/tacos/wings → food (archive attribute twin);
   vegetarian/breakfast/sweet/comfort food/bakery → property (archive the
   junk FOOD twin + rehome its evidence sensibly or drop if junk-only).
   Implement as a small placement-prompt extension with BOTH sides'
   usage evidence in context; result recorded once (the archived twin is
   the durable memory — resolution reuses tombstones as sinks).
3. Cleanup pass runs the directional adjudication over today's ~53 active
   collisions (14 food_attribute + 39 restaurant_attribute) + their food
   twins; scripts/archive-dish-named-attributes.ts becomes the lever but
   MUST use the directional decision, never blanket-archive one side.
NOTE: archiving a junk FOOD twin needs care — check connections/mentions
attached to it (e.g. 'breakfast'-as-food may hold real banked category
evidence that belongs on the category graph instead). Study before
executing; same abstraction-first law.

## Phase 3 — Duplicate identity, timing-honest

Evidence: creation-time has ONLY name text (no domain/place on reddit side;
47% of entities ungrounded); codebase doctrine "synchronous paths never
block; sweeps heal what's missed" — sweep-as-backstop is native, the HOLD
rule was the flaw.
1. Places-path (poll-entity-seed.resolveRestaurant): add name check + the
   same advisory-lock discipline before entity.create (currently place-id
   lookup ONLY — the actual jollibee hole).
2. Enrichment-time handleEntityNameConflict: widen the no-domain branch
   from exact-name to the existing fuzzy/trigram matcher in
   EntityResolutionService (reuse, don't duplicate).
3. Sweep hold rule: replace bothGroundedDisjoint with the evidence
   hierarchy — domain match (aggregator domains like chowbus.com NEVER
   count as match), else metro/community overlap, volume only as canonical
   tie-break. Name grouping gains normalization (collapse
   whitespace/punctuation: "Mr. Natural" == "Mr.Natural").
4. scripts/merge-duplicate-restaurants.ts kept in sync with the service
   rule (script = manual lever; service cron = the mechanism).

## Phase 4 — CATEGORY-ITEM FOUNDATION (owner's design, ratified)

The ideal end state: category claims are a SPECIAL CASE OF DISH — honest,
first-class, presentable. "This place is known for their burgers" as a
category card in the dish list, with a real score. Foundation now; UI later.
- Projection: build CATEGORY ITEMS in core_restaurant_items — a connection
  whose food_id IS the category food entity, flagged (new column
  `is_category_item boolean` via drift migration) — from category-claim
  evidence (the banked food_mention/food_category support mentions),
  regardless of whether specific dishes exist (presentation decides
  visibility; owner sketch: show when no specific dishes under it).
- SCORING: category items score through the SAME mention-sum machinery
  (claims carry upvotes). CRITICAL VERIFICATION: restaurant-level rollup
  must not double-count a mention that both feeds a category item and
  supports a specific dish — verify public-crave-score's rollup dedupe
  semantics by mention key before landing; if it double-counts, dedupe at
  rollup, never by dropping either artifact.
- BANKING UNCHANGED: support-mention replay onto specific dishes stays
  exactly as is (proven design). Category items are an ADDITIONAL
  materialization of the same events, not a replacement.
- Search: no query changes needed — category items match the existing food
  clause + category-edge expansion naturally (c.food_id = burger). Expose
  `isCategoryItem` on the wire (FoodResult) for the future UI; ranking
  falls out of scores.
- Restaurant profile dish list: include category items (flag on wire; UI
  presentation deferred — owner will design the card).
- Values check: a category-only restaurant with huge consensus MUST be able
  to rank high (the "best burgers, no named burger" case).
- SCORING RESOLUTION (owner dialogue 2026-07-26): category cards PERSIST
  after dishes exist (category-vs-dish praise asymmetry is information —
  the "order any pasta with confidence" value). Each claim counts ONCE at
  restaurant rollup (dedupe by mention key — verify; pre-fix reality:
  support mentions duplicated onto N dishes = N-counted, AND category-only
  claims counted ZERO until first dish; both wrong, both fixed by exactly-
  once rollup + category items). Category card score = its own direct
  category claims. Dishes KEEP the equal-boost replay for ranking (verified:
  support attaches to every dish under the category; differentiation only
  via specific callouts) but direct vs support stay separate counts on the
  wire (columns already exist) so display never inflates named-vote counts.
  NO distribution/splitting (a new dish would steal score from siblings).

## Phase 5 — Prove, then replay

1. Localized replay test: pick ~20 stranded strong-claim documents
   (fan-out + dish-named classes), re-extract JUST those via
   ReplayService.activateExtractionRunForDocuments, verify the
   carbonara-udon trio + others convert to menu-item connections.
2. If converted: both-metro targeted replay (7,886 docs, $3.36 measured).
   Full corpus ($30.47) only if owner wants after seeing metrics.
3. Baselines to move (from austin-extraction-audit.md): food_mention-only
   docs 7,886 ↓; menu_item:food_mention ratio 17,207:12,209 ↑; re-sample
   strong-claim rate (was 67.5%).

## Standing laws for this work
- Abstraction-first: verify every "X is lost" claim against banking/replay
  mechanisms; trace real inputPayloads before diagnosing the LLM.
- Drift-path migrations only; rebuild+restart :3000 after; boot-test.
- RED-able specs per phase; suites green before each commit; deploy via
  ./scripts/rig/deploy.sh.
