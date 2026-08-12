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

- IDEAL-ALREADY: candidate collection prompt; labels.vocabulary;
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
