# Angry-rhino prompt audit — verdict ledger (P12, owner-ordered 2026-08-16)

Method per the strengthened canon: every rule/list/paragraph gets (a) git
provenance, (b) a principle-or-patch verdict, (c) a model's-shoes
rederivation, tested through prompt-ab certification. This ledger is the
running record; rules land in certified rounds.

## Round 1 — B.3 normalization + C.1 filler (certified 102/103 ×3; the one
## fail, ML4, reproduced identically on unchanged HEAD = drift band)

| Rule | Provenance | Verdict | Rederivation |
|---|---|---|---|
| "Remove leading articles: the/a/an" (B.3) | Born v1 (Apr 30) via the Aug-5 four-kind-gates rewrite; no incident found that bought it | **PATCH — DELETED** | Corpus data: among the 60 most-praised non-"The" venues, 2.25% of mentions carry a spurious leading "the" (29/1,289), and every sampled case is attributive grammar on a dish phrase ("the Minetta Tavern burger"), which a competent read never emits as a name. Meanwhile 201 active places store "The …" names with article-intact identity keys — the corpus's own convention keeps articles; the strip rule fought it and minted the Corner/Side/Place ghosts. The naming-frame doctrine (B.1 "The fronting it as a title") alone carries the load: V15a/c pass with NO article rule. My v15 conditional exception deleted with it — simpler than either ancestor. |
| "The Smith" → `smith` example (B.3) | Same | Follows above | Now "The Smith" → `the smith`, matching the stored identity convention. |
| Generic-filler word list (C.1: "food","meal","dish","the food","restaurant","place","spot") | Aug-5 rewrite; canon-violating non-exhaustive list (the 2026-08-16 reckoning's specimen) | **LIST → PRINCIPLE** | "A wanting-anything word fails by definition: 'food', 'a meal', 'the food here' name the desire to eat, not a thing a server could bring." First attempt added "words about the venue are not food language" — over-extended: the model read "pizza place" as venue language and dropped the pizza (D14 0/3, HEAD control 6/6 = mine). Tightened to the wanting-anything clause alone; D14 recovered 4/4. The venue-word members of the old list ("restaurant","place","spot") proved dead weight — no case needs them; venue words were never food language to a competent read. |

Regression-control protocol used throughout (drift-band discipline): any
non-pass gets a stashed-HEAD control at ≥x6 before it counts as caused.
Band members observed this round: V14j, G65, ML4 (each failing/flaky on
unchanged HEAD under identical conditions).

## Queue (next rounds)
- B.1 naming/shorthand cluster: keep-frames, one-word-shorthand rule,
  answer-frame — provenance + walk.
- B.3 remaining normalization bullets (suffix-drop, &→and, apostrophes,
  possessive-clitic strip, variant unification) — same data-first question
  as articles: what does each solve, measured?
- C.1 head-noun/wrapper cluster (wrapper list is canon-suspect: does the
  PREDICTION principle alone carry it?).
- C.2 order-name steps; C.3 category builder (+ common-parents mapping —
  list-as-teaching vs list-as-rule).
- D praise/describe lists; D.4 attribute sides; final gate.
- A.1/A.2 testimony catalogs (largest paragraphs; genre doctrine).
- E/F sections + examples block.
- Week-of-edits self-review (v14+v15 boundary changes under the same lens).
- Schema descriptions under the same lens (equilibrium constraint: any move
  re-certifies).

## Round 2 — B.3 punctuation + suffix rules (IN FLIGHT, staged)

| Rule | Provenance | Verdict | State |
|---|---|---|---|
| `"&"→"and"` + strip apostrophes/trailing punctuation (B.3) | Aug-5 rewrite | **PATCH, and an active identity bug**: canonicalFold folds "&" to a space, so the prompt's "pho and co" NEVER exact-matches the stored `pho co` identity key of an &-named venue — the rule fights the fold. Rederivation: keep punctuation as observed (observed-forms doctrine; folding is the identity layer's job). | **STAGED, not committed.** The edit certified through every semantically-related case (typo law re-aligned: "Switf's" stays `switf's`; B4's stale stripped-era needle updated) but knife-edged D14 — an ask-dish-inheritance case with no semantic link — during the 02:00 drift window where controls are least trustworthy. Variant + fixture pair preserved (scratchpad/staged-rhino/); re-certify at a calm hour before landing. Meta-lesson re-confirmed: the first wording's justification tail ("…is the identity layer's job") was foreign-system meta-commentary and broke G64 (two-hop referent) until cut — same token class as V14j's earlier breaks. |
| Trailing-location-suffix drop ("les","chelsea","midtown","queens") | Aug-5 rewrite | KEEP as example-teaching-class, with a flag: the example list is NY/Austin-locale-bound; generalize wording when a non-US city lands. Branch-tag handling interacts with secondary-locations machinery — deeper walk queued. | unchanged |
| Possessive-clitic strip ("Nixta's duck taco" → nixta) | Aug-5 rewrite | KEEP — principled (grammar attachment, stable identity). | unchanged |
| Lowercase + whitespace-collapse | v1-era | KEEP — mechanical, matches fold. | unchanged |

## Round 2 LANDED (calm-hour cert 2026-08-17 20:30): keep-punctuation is in.
Knife-edge five at x6: G64/V14l/V14q/B4 green; D14 flaky on BOTH prompts =
band, not attributable. The &→and identity bug is dead.

## Round 3 FINDING (attempted + reverted): C.1 is SATURATED, and dish
## inheritance is MIS-HOMED
The ask-dish inheritance rule lives ~925 lines in, inside the
`is_menu_item` section — downstream of its decision point (C.1's "is there
a dish at all?"), the exact v13 "lunch special lost 9/9" class. Anchoring a
minimal exception at C.1 fixed the whole flicker family (D14/ML3/V15i
PASS x5) but broke the OTHER C.1 families (V15f 0/6, G6 0/6, P2 flaky) —
C.1 now carries eight rule clusters and is past its attention budget:
every addition trades one family for another. Verdict: the fix is the
FULL C.1 REDERIVATION (decision-tree shape, one pass through the named
tests, inheritance at its decision point, wrapper/X-food/filler
redistributed), constrained by BOTH gold families as paired pins. Queued
as round 4's centerpiece; the anchor is reverted until then. D14 stays a
band member documenting the mis-homing cost.

## Round 4 LANDED — C.1 rederived as THREE GATES (cert 100/103 ×3; the 3
## flaky are band members that each passed ≥x5 on identical text same hour)

The section's eight accreted rule-piles became one ordered walk:
Gate 1 HEAD NOUN (wrapper triage: food-modifier extracts the food;
time/price/bare = value testimony that still EMITS restaurant-only;
prediction-passing formats are food) → Gate 2 ORDER TEST (drinks included;
failing by definition: wanting-anything words, traditions/styles however
modified w/ comfort-food exception, holistic when-words, venue kinds — all
landing in Step D as attributes) → Gate 3 VERDICT (survivor → C.2; nothing
→ restaurant-only, with THE INHERITANCE stated at its decision point: a
pick answering a dish-targeted ask walks the ASK's food language through
THESE SAME GATES — what survives inherits as `item`, what fails inherits
nothing). The same-gates formulation is what dissolved the round-3
trade-off: "inherit the ask's dish" and "that's not a dish" stopped being
adjacent opposed rules and became one rule applied twice — both gold
families green simultaneously (11-case paired probe x4, first time ever;
D14 exits the band).
Two compression casualties caught by cert and repaired, each a lesson:
(1) the meal-deal "mention still EMITS" consequence lost prominence when
subordinated into a bullet (V8l/V8m dropped whole mentions) — promoted to
bold; (2) the "great weekday lunch special - 2 tacos…" verbatim example
was LOAD-BEARING (it disambiguates value-testimony from A's
price-list-stays-PRICE-ONLY rule; V8m failed without it) — examples that
teach a class are pins, not decoration; deleting one is a behavior change.
Net: −20 lines, one decision tree, inheritance homed, wrapper doctrine
stated once.

## Round 5 LANDED — restaurant-level ask-inheritance, via the same-gates
## pattern (cert 103/104 ×3; V14j = band, flaky on live AND HEAD x6)

The owner's fit-assertion principle is in, after ten wordings whose
failures were each mechanism-traced rather than re-rolled:
- Wordings 1-7 (last week): exception clauses beside an absolute rule —
  sprayed or never fired. Parked.
- Wording 8 (final gate, same-gates form): spray pins all held, but never
  fired — the rule legitimized the ask as a SOURCE at a gate a bare pick
  never reaches.
- Wording 9 (decision-point paragraph): reframed inheritance as an
  INSTANCE of predicates-from-this-source ("an unqualified pick answering
  a constrained ask asserts fit — the ask's venue words are that pick's
  own claim") — J Carver's own-words attributes recovered, bare pick still
  silent: D's ENTRY line ("look at what remains") exits before the rule
  for modifier-less mentions.
- Wording 10: the entry line hands over the candidates ("for a bare pick
  answering a constrained ask, the ask's venue-level constraint words ARE
  what remains") → V15h PASS x5, first ever; V14f (ask emits nothing),
  V14o (grocery suppression), ML3/V15i (dish inheritance) all green.
V15h unparked into the suite. The lesson joins the canon: a rule fires
only if the model's PATH reaches it — decision-point placement includes
the section's entry framing, not just its interior.
