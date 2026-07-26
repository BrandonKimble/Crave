# Austin Extraction Audit (2026-07-26)

Owner-ordered full audit of what extraction got wrong for the Austin corpus
(and NYC, measured alongside). Every number below is a real count or a
measured-unit-cost derivation — provenance stated per section. Companion
mechanisms already fixed the same week: creation race (advisory lock),
same-name duplicate sweep (nightly), orphaned-projection repair (nightly).

## Verdicts by area

### 1. MENU-ITEM LABELING — the one big problem (all the loss concentrates here)

Population: 7,857 active-run food_mention events / 5,710 (restaurant, food)
pairs with NO connection (local DB); prod-wide 12,209 food_mention events
across 7,886 documents (4,457 Austin). Random 40-sample judged with quoted
evidence: **67.5% carry STRONG serving claims** ("the best burger is
McDonalds", "great pizza for sure") yet built no searchable dish.

Two distinct mechanisms:

- **(a) BY-DESIGN broad-noun suppression** (~half of strong-claim misses):
  Step 5.2's specificity rule forbids `is_menu_item: true` for broad dish
  nouns ("sushi", "pizza", "burger", "coffee", "bbq") regardless of claim
  strength. A firm "best burger in town → X" recommendation is deliberately
  routed to a non-connection mention. THIS IS A PRODUCT RULING TO MAKE:
  should claim strength override noun breadth? (Hungry-customer doctrine
  says yes — a "burger" search should find the place famous for burgers.)
- **(b) Fan-out list context loss**: a dish named once + several restaurants
  listed ("the three places I've had carbonara udon: X, Y, Z") doesn't
  match any prompt example, and truncated list-style replies lose the
  thread's ask. Uncontroversial prompt fix.

### 2. ATTRIBUTES — healthier than feared (earlier alarm corrected)

40.35% of connections carry food attributes / 73.87% of restaurants carry
restaurant attributes — but marker-based miss floors are small and NOISY
(5.13% dish / 3.40% restaurant, and sampled quotes show most markers attach
to a DIFFERENT dish/restaurant in the same thread). True emission misses
are rare edge patterns: praise-adjacent properties ("great patio" — praise
filter swallows the property) and menu-wide dietary claims ("all vegan" with
no dish named). Two surgical prompt additions cover both. The
vocabulary-miss channel is unmeasurable from the DB (no row is written on a
resolution miss) — now warn-logged (2026-07-26) so the rate becomes visible.

### 3. CATEGORIES — essentially healthy

99.42% of food-bearing mention groups co-emit a category. Of 1,763
edge-less foods, 1,531 simply never materialized as dishes (problem #1
again); only 232 are a true category-projection gap. One prompt-line edit
(the "conservatively" closer reads as license to skip non-listed families)
plus a self-check bullet.

### 4. DUPLICATES — fixed structurally

Race closed (advisory xact lock + case-insensitive guard); nightly sweep
merges pre-enrichment dupes (local: 49 merged / 2 correctly held).
Regression gate: same-name active pairs should hold ≈ 0 (holds are
legitimate distinct businesses).

## The prompt revision (PROPOSED — awaiting owner ratification)

Full verbatim diff-style proposal in task output af53e2d18d086244b
(session 0f76cd6e). Summary of the five edits, in the prompt's own voice:

1. §5.2 new bullet **Fan-out list ties**: dish named once + N restaurants
   listed → N (restaurant, dish) menu-item entries; the shared dish noun IS
   the tie.
2. §5.3 new worked example for the fan-out pattern (use the real carbonara
   udon trio).
3. NEW §5.5 pre-emission checklist: re-scan for one-dish-many-restaurants
   patterns before finalizing.
4. §3.5/§3.6 attribute additions: split praise-adjacent property phrases
   (keep "patio", drop "great"); menu-wide dietary claims are restaurant
   attributes with no dish required; two worked examples + a re-check step.
5. §4.4 closer rewritten: conservative on AMBIGUOUS dishes, but the family
   list is illustrative not exhaustive; `food_categories == [food]` on a
   dish with an obvious parent is under-emission.

PLUS the product ruling for 1(a): if ratified ("claim strength can make a
broad noun a menu item"), §5.2's Specificity test gains: "a broad type DOES
qualify when the source makes a firm serving/recommendation claim tying it
to the restaurant ('best burger in town', 'their pizza is great') — the
claim supplies the specificity the noun lacks."

Operational law (verified in llm.service.ts): the collection prompt is
Gemini-cached with a full-text fingerprint — an edit self-invalidates the
cache at NEXT BOOT, so a prompt change requires the standard rebuild+restart
(and prod deploy); until restart the old cached instruction keeps serving.

## Re-extraction economics (all measured — spend_unit_costs, prod counts)

Measured cost: gemini.reddit_extraction = $0.00042597/document (30d window,
n=68,579). Replay mechanics proven (replay.service.ts: re-extract from
stored inputPayloads, re-point active_extraction_run_id, rebuild
projections; no Reddit re-read, no Google spend).

| Scope | Docs | Cost |
|---|---|---|
| Targeted: docs with food_mention events, Austin | 4,457 | **$1.90** |
| Targeted: both metros | 7,886 | **$3.36** |
| Full corpus re-extraction | 71,528 | **$30.47** |

RECOMMENDATION: land the ratified prompt revision → deploy → run the
TARGETED both-metro replay ($3.36) → measure the audit metrics against the
baselines below → if labeling recall moves as expected and the owner wants
maximum coverage, the full-corpus pass is still only ~$30.

## Baselines (regression gates for the prompt change)

- food_mention-only documents: 7,886 prod (4,457 Austin) — should DROP.
- menu_item_food : food_mention event ratio: 17,207 : 12,209 — should RISE.
- Strong-claim rate in stranded sample: 67.5% (N=40) — re-sample after.
- Connections with ≥1 food attribute: 40.35%; restaurants: 73.87%.
- food_categories == [food] share: unmeasured pre-change — measure both sides.
- Same-name active restaurant pairs: ~0 post-sweep.
