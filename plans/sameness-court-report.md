# The Sameness Court — judge-layer rederivation (D1+D2), 2026-08-30

Executed against plans/ideal-architecture.md D1+D2, grounded in
plans/judge-ledger-audit.md's measured failures. Everything below is
implemented and certified; nothing is committed.

## What the court is now

ONE doctrine, split by what sameness MEANS per kind, carried by three rule
documents (down from four judgment surfaces that shared no language):

- **The IDENTITY court** — `entity-match-prompt.md` (rule ledger:
  entity-dedupe-rule.ts, now **v3**). Backs the birth judge
  (`entity_match`), the dish sweep (`entity_dedupe`), the intra-batch
  overlay judge, and demand-vocabulary. Names (places/items/ingredients)
  match on IDENTITY: THE ONE-THING TEST.
- **The INTERCHANGEABILITY court, intake bench** —
  `attribute-placement-prompt.md`. Gates new attribute vocabulary (3 named
  tests + the new REGIONAL-STYLE ruling) and places survivors by THE
  INTERCHANGEABILITY TEST.
- **The INTERCHANGEABILITY court, pair bench** —
  `attribute-merge-prompt.md` (rule ledger: attribute-merge-rule.ts, now
  **v2**). Judges live-pair merges by the literally same
  INTERCHANGEABILITY TEST (renamed from "ONE-INTENTION" so the two benches
  cite one doctrine).

**Why not fewer documents.** The two attribute benches share their sameness
test verbatim but cannot be one prompt: the intake bench must run the
attribute GATE (is this junk at all?) which the pair bench must never run —
both of a pair's tags already passed it, and re-gating live vocabulary
would let a placement-era doctrine change silently archive live tags.
`attribute-name-prompt.md` stays: it performs a different ACT (picking a
display label among already-judged synonyms), not a sameness judgment. The
entity prompt already served both its lanes through one text; that stands.

## Owner rulings encoded

1. **REJECT outcome (birth judge).** Three-verdict schema (match/new/
   reject) on both transports. Doctrine: severed from its thread, does the
   term name one orderable thing / one business / one food substance? The
   measured junk classes (bare quantity "5 piece", thread-local reference
   "South Lamar Location"/"Lee"/"mushroom based one", generic
   adjective/material "crispy"/"clay"/"cask") are worked examples of that
   one test. Asymmetry pinned: doubt between new and reject says NEW (a
   wrong reject silences a real dish permanently; a wrong new is
   sweep-recoverable). A reasonless reject is degraded to `new` in code —
   the sink is permanent, so it is never minted on silence.

   **Downstream design (existing tombstone machinery reused):** a rejected
   term becomes an ARCHIVED entity with no entity_redirect — exactly the
   shape the attribute vocabulary has used for years. New in
   entity-resolution.service.ts: a **tombstone pre-sink** at the top of the
   judge tier (archived, redirect-free rows matching the term's
   identity_key absorb the mention before recall or the judge is paid), and
   `ensureRejectTombstone` (advisory-collision-safe find-or-create) after a
   reject verdict. The mention resolves onto the tombstone; the existing
   time-of-use revalidation in unified-processing then DROPS redirect-free
   archived ids from the tempId map, so no mention rows, connections, or
   surfaces are written — the junk is absorbed at zero corpus cost.
   Rehearsal runs never mint live tombstones (shadow isolation); their
   rejects fall through to quarantined creation as before. Rejects are
   deliberately NOT written to the pair-keyed `entity_match` ledger lane —
   a reject is a term-level ruling and the tombstone row IS its durable
   memory.

2. **Survivor policy — no canonical dictionary.** `OWNER_CANONICAL_
   SPELLINGS` deleted from attribute-dedupe-merge.service.ts. Survivor =
   more evidence references (counted over the same reference registry the
   repoint iterates); tie → shorter/plainer name. Aliases always preserved,
   so an early "wrong" survivor self-corrects. Spec updated to pin the
   overruling (the old "affordable beats cheap at 999:1" test now asserts
   the opposite).

3. **Kind-name mismatch — already fixed, verified.** Commit 7dc77f8d9
   (R14, 2026-08-16) renamed the vocabulary end to end. Staging check
   2026-08-30: all placement rows after 08-16 carry `place_attribute` /
   `item_attribute`; the audit's 9,567 `restaurant_attribute`/
   `food_attribute` rows are pre-rename history. No code change needed.

## The modifier-swarm doctrine (from data)

Type specimen (staging, live rows — item name, connections, homes):

| name | conns | homes |
|---|---|---|
| omakase | 22 | Soto, OTOKO, Uchi, Sushi Endo, Osome, Tare, +16 |
| soto omakase | 1 | Soto |
| sushi omakase | 1 | OTOKO |
| 20 course omakase experience | 0 | — |
| take home omakase | 1 | Lucky Robot |
| in-home omakase | 0 (rehearsal) | — |
| home-makase | 2 | Tare, Teddy Simon |
| vegan omakase / vegetarian omakase | 0 / 2 | Uchi, Uroko |

A blanket "same-restaurant sub/super pairs unify" rule would be
catastrophic: sampling all co-located specific/general suffix pairs shows
most are GENUINE distinct orders (pepperoni pizza vs pizza at Alamo,
chicken vs steak burrito at Asado's, vegetarian tasting menu vs tasting
menu at Barley Swine). The classes, and their handling:

| class | example | handling |
|---|---|---|
| **venue-name-in-dish** | soto omakase @ Soto; village taco @ Taco Village | JUDGE: match when term = candidate + the home venue's own tokens (`same_place`). EXTRACTION NOTE: the v17 canon already bans venue names inside dish names — these are legacy rows; re-extraction heals the source, the judge folds the residue. |
| **narration decoration** | 20 course omakase experience @ Sushi Endo | JUDGE: match at the same restaurant; `new` across restaurants (can't know two menus collapse). EXTRACTION NOTE: emit-as-spoken stays correct; no prompt change wanted. |
| **channel** | take home omakase, in-home omakase | JUDGE: match at the same restaurant — the modifier names how the same kitchen's offering reaches you. `home-makase` is a branded NAME (cross-venue, 2 homes) and stays its own concept. |
| **genuine variant** (diet/ingredient/preparation) | vegetarian omakase @ Uchi | NEVER folds, even same-restaurant — the venue itself distinguishes them. Reinforced: when the mention CONTRASTS two offerings (OTOKO's Wednesday sushi omakase vs kaiseki omakase), the contrast is proof of two things. |
| **subtype vs category** | shanghai lumpia / lumpia; texmex taco / taco | Never folds in either direction (the audit's wrong-merge class). Dietary words are specifications: vegan ≠ veggie. |

The dish sweep can now actually SEE these swarms: an **embedding recall
lane** was added to food-dedupe-merge (pgvector top-K lateral over
`core_entities.name_embedding`, distance-ranked, 200 hearings/run,
ledger-memory drained — the attribute ontology's meaning-first finder
generalized). Measured on staging: ~2s for the full 3.7k-item corpus, and
the top of the docket is exactly the blind spots ("japanese fried chicken"
/ "chicken karaage", "muffaletta sandwich"/"muffuletta", "soft
drink"/"soda"). Substring pairs are no longer excluded on this lane —
the enriched judge now carries the doctrine that decides them.

## D2 context curation — built and validated

Every judge hearing now carries (all optional on the wire; legacy callers
unchanged):

- **Birth judge**: `mention` (the verbatim sentence, extracted
  deterministically from the stored source doc — `mentionSentenceOf`,
  never invented), `thread_place`, and per candidate `aliases` +
  `home_places` (top-3 by mention weight; connections for items,
  evidence-array containment for ingredients) + `same_place`
  (canonical-fold compare against the thread restaurant).
- **Dish sweep**: `term_home_places` + candidate `home_places` +
  `same_place` (shared restaurant_id).
- **Attribute benches**: `used_by` / `a_used_by`+`b_used_by` — up to 3
  real carriers per tag (places carrying a place_attribute; dishes
  carrying an item_attribute), one shared `fetchAttributeCarriers`
  implementation for both benches.
- **Schema-forced evidence reasons**: every schema's `reason` description
  now bans the bare decision word; placement's parse maps a degenerate or
  missing reason to `(unstated)` instead of laundering the decision token
  as a ground (the audit's 58% "match" reasons); reject/dedupe verdicts
  without a stated ground are never honored/recorded.

**Context-ablation replay** (`scripts/judge-context-ablation.ts`, owner-
mandated): all 41 gold cases (every audit WRONG verdict + controls) judged
twice through the rederived prompts — bare (old context) vs enriched (D2
wire):

| flip | count | cases |
|---|---|---|
| wrong→correct | 4 | soto-omakase-folds, course-count-narration-folds, channel-wording-folds, menu-number-alias-via-mention |
| wrong→wrong | 0 | — |
| correct→broken | 0 | — |
| correct→correct | 37 | all doctrine/regression pins |

Reading: the rederived doctrine alone already fixes the audit's
wrong-merges and junk-mints even bare; the context is the *necessary*
ingredient for exactly the class the audit predicted (same-restaurant
folds and menu-local references) and regresses nothing. Enriched context
is demonstrably not the limiting factor for any remaining case.

## Certification (all through the production LLMService transports)

- `scripts/entity-match-gold.ts` — **25/25 PASS ×3** (new harness; every
  audit wrong verdict pinned correct-side, every doctrine boundary pinned
  both sides, diacritics/brand/cross-language regression pins).
- `scripts/attribute-placement-gold.ts` — **16/16 PASS ×3** (new harness;
  piano-bar/pizza-truck/great-batter/double-meat/32oz/farm pins,
  regional-style both sides, gate + interchangeability regressions).
- `scripts/attribute-merge-gold.ts` — **20/20 PASS ×3** (existing 18 +
  narrower-want keeps for piano bar/live music, pizza truck/food truck)
  at prompt v2.

Code proofs: `sameness-court-context.spec.ts` (context wire caps/omission,
reasonless-reject degradation, mention-sentence provenance rules), updated
conformance spec (the long-pinned `name` residue is fixed — every wire
field is now named by the prompt, asserted to stay that way), updated
dedupe-merge survivor spec. `yarn build` green; full `yarn test` +
`yarn invariants` runs recorded below.

## THE OWNER DOCKET — re-ruling candidates (judge error vs rule error)

Graded every audit "violation" class. These are the ones where the RULE
(not the judge) may be what the owner wants changed. No semantics were
changed unilaterally; each ships under the current rule with a pin, and a
flipped ruling means flipping the pin + a rule-version bump.

1. **Piano bar → live music (and pizza truck → food truck).** Current rule
   (narrower-want): KEEP separate — someone typing "piano bar" wants a
   piano. Your instinct said the fold may be RIGHT (a live-music searcher
   would be happy with a piano bar). The rule is directional: the fold
   fails only one way. If you rule that popular-subtype filters should
   fold UP into the broad tag (with the subtype kept as an alias), say so —
   the pins flip and both attribute prompts get a version bump. My
   recommendation: keep the current rule; folding erases the diner's own
   word ("pizza" in pizza truck).
2. **bar + pub** (and the other aggressive merge previews: modern+trendy,
   kebab shop+shawarma, deli+sandwich shop, citrus+lemony, fudgy+gooey,
   grass fed+pasture raised). The pair bench currently KEEPS bar/pub
   (distinct wants) but the merge-lane preview once said merge. Plain
   language: should a person filtering "pub" see every bar? Today: no.
   Each of these needs a one-word ruling; whichever way, it becomes a gold
   pin.
3. **The regional-style ruling I derived** ("X-style WHAT?" — dish-class
   style like nashville hot / detroit style = attribute; a region's whole
   tradition like sonoran / malaysian = cuisine, reject). The audit showed
   coin-flip behavior; SOME consistent rule was required to certify. Bless
   or amend.
4. **Severed-shorthand folds**: "farm" → farm to table? "winter" →
   seasonal? I pinned "farm" as reject (a severed word guessing at its
   phrase is not a filter); "winter" left unpinned. If you'd rather
   shorthand fold into the obvious phrase, that's a rule change.
5. **Channel modifiers fold** (take home / in-home omakase → that
   restaurant's omakase). I ruled fold-at-same-restaurant (logistics, not
   a different dish). If you consider an in-home private-chef service a
   distinct offering a diner books on purpose, flip this pin.
6. **Rule-bump rehearing cost** (a consequence, not a rule): entity rule
   v2→v3 re-opens every remembered entity_match verdict (~9.7k rows) and
   the 22 dedupe pairs; attribute-merge v1→v2 re-opens its 12 preview-era
   holds. The rehearing budget meters the trickle; the bulk drain wants an
   approve-by-hash during the reload window. Flag when to spend it.
7. **venue_kind facet scope for the merge lane** (carried over from
   attribute-merge-system.md open question 2) — most aggressive merge
   previews are venue kinds; excluding the facet shrinks risk.

## Extraction-side notes (for the collection-prompt agent / coordinator)

- Venue-name-in-dish rows still exist in the corpus ("soto omakase",
  "bird bird bacon"); the v17 rule already bans them — worth a gold pin in
  the collection campaign so they never re-mint.
- Pro-form leakage: "mushroom based one", "5 piece" reached resolution —
  the resolve-or-drop rule leaked these; judge-side reject now absorbs
  them, but a collection pin would stop them upstream.
- Narration decoration ("20 course omakase experience") is CORRECT
  extraction under emit-as-spoken; no change wanted — the court owns it.

## Fleet-standards violations (for the coordinator; not fixed here)

Standards set here: (a) evidence-style reasons schema-forced and
degenerate reasons refused, (b) D2 context on every sameness hearing,
(c) every judged prompt carries a *-rule.ts release ledger, (d) verdicts
in claim_verdicts. Call sites in docs/llm-systems-map.md violating them:

1. `attribute-placement-prompt.md` + `attribute-name-prompt.md` have NO
   rule ledger — placement decisions (llm_decision_records) aren't keyed
   to a prompt version, so this rederivation silently re-rules the lane on
   deploy (the D6 disease; placement also never writes claim_verdicts —
   systems-map overlap #11).
2. `cuisine-prompt.md` / `cuisine-hub-prompt.md` / `residue-prompt.md` /
   `poll-subject-prompt.md` / `moderation-prompt.md` / photo-vision's
   inline prompt: unversioned (registry or rule-ledger), change silently
   on deploy.
3. `concept-satisfies` judges substitutability on two bare names — the
   same blindness this campaign just fixed; it should carry carriers/homes
   (D2) when it re-runs.
4. `demand-vocabulary` uses `matchEntity` with no context fields — legal
   (fields optional) but bare; it should pass the unmet-ask query text as
   `mention` when touched next.
5. Relevance gate's private verdict table (D8 item) — unchanged, still
   outside claim_verdicts.

## Files touched

Prompts: entity-match-prompt.md, attribute-placement-prompt.md,
attribute-merge-prompt.md (full rewrites). Rules: entity-dedupe-rule.ts
(v3), attribute-merge-rule.ts (v2). Wire/schemas: llm-response-schemas.ts,
llm.types.ts, entity-match-prompt.ts, llm.service.ts. Services:
entity-resolution.service.ts (+types), unified-processing.service.ts,
mention-sentence.ts (new), food-dedupe-merge.service.ts,
attribute-ontology.service.ts, attribute-dedupe-merge.service.ts,
attribute-reference-registry.ts (classified the other agent's new
knowledge_categories column). Harnesses/fixtures: entity-match-gold.ts +
fixtures, attribute-placement-gold.ts + fixtures, judge-context-ablation.ts,
attribute-merge-gold-cases.json (+2), sameness-court-context.spec.ts,
updated entity-match specs + dedupe-merge spec.

## Rulings applied 2026-08-30 (attribute lanes; coordinator-amended same day)

The docket's attribute items were ruled and then scope-adjusted the same
day: THE SEARCHER-TOLERANCE PRINCIPLE is now the stated basis of both
attribute prompts (merge when each side's searcher would be happy with the
other's results, judged generously; attributes widen options, not
taxonomize; precision — and doubt→keep — reserved for hard constraints:
dietary/safety, measured steps, polarity). But the specific cross-word
pair FOLDS (piano bar/live music, pizza truck/food truck, bar/pub,
deli/sandwich shop, kebab shop/shawarma, modern/trendy, citrus/lemony,
fudgy/gooey, grass fed/pasture raised) are ON HOLD as storage merges: a
search-side mechanism (soft-concept OR-arms, concept-membership.compiler.ts)
may deliver the widened experience reversibly, and the owner is deciding
storage-merge vs search-arm. Those pairs stay pinned at their current
court verdicts (keep separate), each why-field noting the pending
decision; the prompts name search-layer widening as the mechanism that
may serve those searchers instead of a vocabulary fold.

What DID land:

- Both prompts restate the doctrine on the searcher-tolerance basis with
  the hard-constraint carve-outs prominent; new principled keep grounds
  ("adjacent descriptions that assert different facts": fudgy/gooey,
  grass fed/pasture raised; lemony as a narrower want than citrus).
- Regional-style ruling BLESSED as derived; severed-shorthand "farm"
  REJECT stands (trace confirmed extraction severing); channel-modifier
  folds BLESSED (entity court, no attribute change).
- attribute-merge-rule.ts bumped to **v3** (fingerprint 3f350f3de7cc).
  NO placement rule ledger exists in the tree — still-open
  fleet-standards item 1 (not built here).
- Gold: attribute-merge-gold now 28 cases (raw-vegan hard-constraint pin
  + the nine pending-pairs pinned keep), attribute-placement-gold 18
  (pub-keeps + raw-vegan-keeps added). Certified: merge 28/28 ×3,
  placement 18/18 ×3, entity-match 25/25 ×1 regression. yarn build,
  targeted jest (41), yarn invariants (42/83) green.
- venue_kind facet: confirmed IN sweep scope (only the cuisine facet is
  excluded in attribute-dedupe-merge.service.ts). The first full drain's
  owner preview is served by the runner's default dry-run:
  `attribute-dedupe-merge.ts --sample=N` prints per-pair DRY-RUN verdicts
  without recording; run that and hand the list to the owner before any
  `--apply`.

### Population replay (scripts/attribute-replay-rulings.ts, staging read-only)

Historical llm_decision_records replayed through the new prompts (dev
Gemini; no writes). Merge lane: ALL 480 recorded pairs. Placement lane:
350 sampled decisions (250 match + 50 new + 50 reject).

| lane | unchanged | changes | headline |
|---|---|---|---|
| merge (480) | 439 | 22 keep→merge, 19 merge→keep | keep→merge = true synonyms the old bench under-folded (cold/iced, soft/tender, bakery/pastry shop, take-out/takeout, comfortable seating/cozy). merge→keep = exactly the held pairs + different-facts pairs the rulings pin (bar/pub, deli/sandwich shop, kebab/shawarma, citrus/lemony, fudgy/gooey, grass fed/pasture raised, griddled/grilled). |
| placement (350) | 285 | 57 match→other, 6 match→match(diff), 4 new→reject, 4 reject→new | Old wrong-folds now caught: praise laundering (killer wine list, great batter, decadent), order slips (double meat, extra sauce), severed shorthand (farm, 32 oz, heritage, classic), cuisine (european style), narrower wants kept their word (piano bar, taco truck, coffee truck, mesquite grilled). reject→new recoveries incl. new haven style (regional-style ruling) and curried. |

Resisted the principle (for the owner): with the fold pins reverted, the
bare doctrine still wants to merge citrus/lemony, fudgy/gooey and grass
fed/pasture raised (all three merged 3/3 before the explicit keep grounds
were added) — if the storage-vs-arm decision lands on storage merges,
delete the "adjacent descriptions" bullet and re-flip those pins. Also
~10% of replayed placement matches turn reject under the stricter gate:
that is vocabulary-intake tightening, worth an eye on the first drain
preview to confirm none of those terms is a filter users actually use.

### Superseded same day: THE SAME-CLAIM TEST (owner ruling 2026-08-30, final)

The owner chose search-time WIDENING (satisfies arms) as the generosity
mechanism, so storage merging tightened to identity-of-claim. Both
attribute prompts now carry **THE SAME-CLAIM TEST** as the doctrine: two
attribute names merge ONLY when they make literally the same claim — the
operative question is "could the difference between these words ever
change what arrives or what the place is like?" Yes → keep (widening's
job); no → merge. The "adjacent descriptions assert different facts"
bullet is now THE LAW of the keep side (polarity, measured steps,
dietary strength, specific-vs-generic are its instances); searcher
tolerance is demoted to the widening system's test, and the prompts say
every keep on a close pair is a widening candidate (the judge's keep
verdicts feed the future satisfies docket). Doubt says keep, everywhere.
The prompt retains "THE INTERCHANGEABILITY TEST" verbatim as the formal
name (the wire schema quotes it; llm-response-schemas.ts is another
agent's file).

- attribute-merge-rule.ts bumped to **v4** (fingerprint f9305ebbdc33).
- Pins: the nine cross-word pairs' why-fields now read "owner ruled
  2026-08-30: widening owns generosity; storage merges only same-claim"
  (definitively keep). New keep pins from re-examining the v3 replay's
  22 keep→merge flips under the same-claim test: cold/iced, soft/tender,
  bakery/pastry shop (merge gold now 31 cases). Owner canons stand and
  stayed pinned merge: spelling variants, killer/dope/great atmosphere
  tiers, the value canon.
- Certified on final text: attribute-merge-gold **31/31 ×3**,
  attribute-placement-gold **18/18 ×3**. yarn build + targeted jest
  green; quote-mirror green.
- Invariants: 2 residual clean-tree failures are the CONCURRENT widening
  agent's in-flight edits, not this work — widening-satisfies.service.ts
  registers usageCaller `concepts.widening_satisfies` with no
  gemini-caller-profiles entry, and verdict-replay-adapters.ts has four
  unresolved imports (ENTITY_DEDUPE_RULE_VERSION, SATISFIES_PROMPT_VERSION,
  buildSatisfiesPrompt) failing tsc. All other invariants pass.

Population replay re-run under the final doctrine (same staging samples):

| lane | unchanged | changes | headline |
|---|---|---|---|
| merge (480) | 446 | 3 keep→merge, 31 merge→keep | keep→merge collapsed from 22 to 3 — only true same-claim folds survive (take-out only/takeout, fast casual/quick lunch). merge→keep grew to 31: every historic generous fold now held apart (cafe/coffee shop, all-you-can-eat/buffet, bar/pub, deli/sandwich shop, kebab shop/shawarma, modern/trendy, griddled/grilled, dried/dry, sugar free/unsweet, citrus/lemony, fudgy/gooey, grass fed/pasture raised) — all widening candidates now. |
| placement (350) | 255 | 61 match→new, 18 match→reject, 5 match→match(diff), 2 new→reject, 9 reject→new/match | The strict test moves ~24% of historic matches to `new` — each a factual distinction preserved for widening (jazz/live music, taco truck/food truck, courtyard/outdoor seating, beer battered/battered, zabiha/halal, no salt/low sodium, silky/smooth). Gate corrections unchanged from v3 (farm, 32 oz, double meat, great batter → reject). reject→new recoveries: new haven style, edomae (regional-style ruling), curried, scratch-made, non-dairy. |

Note for the drain: under same-claim the placement lane will mint many
more `new` tags than history did — that is the intended shape (the
vocabulary records facts; satisfies arms connect them), but the widening
docket must actually get built, or the extra tags are fragmentation with
no compensating reach.
