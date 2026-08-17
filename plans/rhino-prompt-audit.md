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
