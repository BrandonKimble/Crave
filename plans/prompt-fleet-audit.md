# Fleet-wide LLM prompt audit — inventory & rederivation queue (2026-08-11)

Owner ruling: every prompt standardizes on the extraction-prompt philosophy
(principle-driven from-scratch rederivation, named tests, gold-case pinning,
no non-exhaustive lists — see memory/prompt-philosophy-canon.md). This file
is the campaign's working state, from the line-by-line inventory pass.

## Inventory headline (19 call sites, one gateway)

Mechanically healthy fleet: one gateway (usageCaller enforced), one
caller-profile table, thinking defaults MINIMAL/LOW (no accidental HIGH),
schemas enforced everywhere EXCEPT photos.is_food (free-text YES/NO parse).
Batch pricing + 30h system cache exist but serve ONLY collection extraction.
Only the collection prompt is versioned/harnessed; every inline-string
prompt (match_batch, dish knowledge, canonicalize, hubs, claim judge,
satisfies) has no version hash and no harness.

## Text verdicts vs the exemplar (collection-prompt.candidate.md)

- IDEAL-ALREADY (labels.vocabulary WITH A CAVEAT, 2026-08-12 — see the
  ingredient-sense drift item under the queue); candidate collection prompt;
  relevance gate (near); aliases.claim_judge (near); poll-subject (good).
- ACCRETED: live collection prompt (v8 supersedes); query-prompt.md
  (predates the rederivation; 20-item classifier list, "still feels
  dish-like"); attribute-placement (EXCEPTION-patch tell).
- UNDER-SPECIFIED: cuisine-prompt (18 lines, example-defined);
  dish.knowledge_synthesize (three subtle jobs, unnamed tests);
  entity-match BATCH twin (9-line inline paraphrase of the single-item
  prompt — one judgment, two divergent texts, volume path runs the weaker).
- Chooser (places.choose_candidate): real procedure, no named tests, no
  error economics despite buying permanent Places grounding.

## Ranked rederivation queue (blast radius × distance from ideal)

1. Activate v8 collection prompt (work done; front-door run pending owner).
2. query-prompt.md — every search; SAME ORDER/PREDICTION tests as
   collection, applied in the searcher's direction; gold set from real
   query logs (cache makes regressions persist).
3. entity-match single+batch UNIFIED — wrong-merge asymmetry as master
   principle; one text, parameterized; destructive-merge risk.
4. restaurant-place-chooser — identity + geography as independent gates;
   "reject = continue retrieval" stated as the cheap error.
5. dish.knowledge_synthesize → .md asset; alias-exclusivity + identity-
   modifier governance as named tests.
6. cuisine-prompt — a test for what a cuisine IS (cooking tradition a
   diner would name; not dish/diet/format).
7. attribute-placement — compress reject list into the shared
   STANDALONE/describe-vs-judge doctrine (same doctrine as collection,
   stated twice, drifting).
8. moderation/poll-subject/canonicalize/satisfies — fit-for-purpose;
   consistency touches only (add fail-direction sentences).

### Observation queued 2026-08-12 — labels.vocabulary answers the
### INGREDIENT-SENSE question with a NEIGHBOUR'S name

Measured on all 812 active English default labels: 10 render a DIFFERENT
live concept's name — `cinnamon roll` -> "cinnamon", `key lime pie` ->
"key lime", `spring roll` -> "spring roll wrapper", `bbq` -> "bbq sauce",
`matcha` -> "matcha powder", `gyro` -> "gyro meat", `dairy product` ->
"dairy", `deli` -> "deli food", `lunch special meal` -> "lunch special",
`asada` -> "carne asada". Two more of the same shape (`margarita` ->
"margarita mix", `stew` -> "stew meat") exist but are not mechanically
detectable, because nothing is NAMED "margarita mix".

The shape is one-directional and diagnostic: asked to name a COMPOSED food
in its ingredient sense, the generator slides to the head ingredient or to
the material the thing is made OF. That is a prompt problem, not a data
problem — the drifted ROWS have been deprecated
(`apps/api/scripts/repair-drifted-en-labels.ts`, display falls back to
`core_entities.name`) precisely so the next sweep re-asks under whatever
text this queue lands. Nothing was hand-written in their place.

For the rederivation: the missing named test is the one that separates
A THING from WHAT IT IS MADE OF, in the direction the label reads.

## Cost-hygiene fixes (mechanical, ship before text work)

1. Batch-price the non-interactive sweeps (dish synthesis, vocabulary,
   satisfies, archive match_batch) — GeminiBatchService.submit is generic.
2. photos.is_food: enforce {answer: enum} schema (kills parse-and-pray;
   currently fail-OPEN on garbage).
3. query.interpret ceiling reads llmConfig.maxTokens, not caller profile.
4. Temp 0 on classification lanes (satisfies, claim_judge) — vocabulary
   earned it with measured flip-rate; same task class.
5. Judge system-prompt caching — only worth it where a lane batches.

## Cross-cutting philosophy additions (validated by the inventory)

- State the ERROR ECONOMICS inside the prompt (which mistake is cheap).
- ONE DOCTRINE, ONE HOME: dish-decomposition stated 3x (collection, query,
  attribute-placement); entity sameness 2x — shared tests instantiated per
  direction, or they drift again.
- Inline strings are the unaudited tier — promote to versioned .md assets
  (the satisfies SATISFIES_PROMPT_VERSION column is the right pattern).
- "Reasons must be evidence" (quote the ask / name the rule) generalizes
  to all judge prompts.
- The prompt-ab.ts harness shape (real docs + must/must-not + --repeat
  flake detection) ports directly to query, entity-match, chooser.

## 326-collision plan — FINAL (cross-session rulings folded in, 2026-08-12)

Provenance established by ⭐05 (queried rows): the mis-banked-surface class
came from the 2026-08-09 v4-era VOCABULARY SWEEP, not extraction; their
spine fix closed a different tap. Three plan-shaping facts: (a) some
collisions are CORRECT and judge-v3-UPHELD (bún→vermicelli) — retraction
candidates must exclude judge-stamped rows or settled law re-litigates;
(b) the truly wrong rows (bánh cuộn→wrap) are v4-era UNSTAMPED; (c) the
still-open hole is that ONLY CONTESTED claims get hearings — an uncontested
wrong surface never gets heard. LANE SPLIT: ⭐05 owns retraction (their
claims registry + rehear machinery, extended to hear single-claimant
suspicious rows; refusal memory exists there via status+judge_version);
this lane owns entity merges — refusal ledger, food+ingredient widening,
squeeze-key lane. SEQUENCE (⭐05 preference, pending owner ratification):
v8 activation → dedupe + retraction → language wave (sweep a deduped
entity set so fresh vocabulary isn't churned through post-hoc merges).
