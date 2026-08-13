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

## PROMPT QUEUE DRAINED (2026-08-12, pre-activation sweep — uncommitted)

Queue items 4–7 + the ingredient-sense label test are DONE, each with a live
gold A/B in scripts/prompt-gold.ts (extended with 5 new kinds; predecessors
pinned under scripts/fixtures/; results in scripts/fixtures/*-gold.result.json,
repeat=3):
- cuisine-prompt.md REDERIVED (TRADITION TEST + error economics + granularity):
  candidate 8/8, predecessor 7/8 (RED: emitted "steakhouse" as a cuisine).
- labels.vocabulary v7 (THING-vs-MATERIAL boundary test): 10/10 incl. all 10
  measured drift names; v6 also 10/10 on single-concept asks (drift was
  v4-era) — vs the pinned v4 builder, v4 FAILS margarita→"margarita pizza".
  First v7 wording itself regressed margarita (composed-food framing) —
  caught by the harness, reworded, now clean.
- attribute-placement compressed into the 3 shared named tests
  (DESCRIBE-VS-JUDGE / STANDALONE / SCOPE): 14/14 = 14/14 incl. 3 novel-class
  probes — behavior-preserving consolidation, no predecessor RED found.
- chooser (named IDENTITY/GEOGRAPHY gates + explicit error economics) and
  dish-knowledge (named IDENTITY-MODIFIER TEST): light retouches; gold sets
  pinned 6/6 and 8/8 both arms — the real rederivations shipped earlier
  (944487208, d35b91af1); no separation vs their immediate predecessors on
  these sets.
Estimator/campaign/sweep-rail items from the same mandate also landed —
campaignAttributableRates one-rate-authority, campaign transition table +
assertDispatchable (sync+batch), stale-running watchdog, dish-knowledge
period deadline, shared unanswered-outcome event, and the two new invariants
(campaign.attribution-crosses-every-queue-boundary,
identity.merge-group-sites-carry-the-accent-veto).

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

## MASTER SEQUENCE (owner mandate 2026-08-12) — no deferrals, ideal shapes only

P1 (v8 batches cooking): compile+verify red-team fixes; design calls ideal
(concurrent locale sweeps w/ period-sized deadlines; alias evidence to the
single judge); prompt-queue backlog (chooser, dish-knowledge, cuisine,
attribute-placement, ingredient-sense label test); dedupe groundwork
(refusal ledger, ingredient widening) staged for post-v8.
P2: WIDENING RED-TEAM LOOP — lens 1 = phase-1 work; lens 2 = every path
outward from touched code + RETROSPECTIVE MULTILINGUAL-COORDINATION AUDIT
(every change in this arc: should it have gone through the multilingual
lens, did it, rehash+rederive with ⭐05 where not); widen until a full pass
finds nothing serious. Termination = quiet pass, not a count.
P3 (v8 drained): exhaustive DATA red team — raw mentions vs v8 output vs
expected, both directions (loss + junk), anomalies grounded in real text;
quote-vs-actual (first live test of replay-prior estimation); owner
decisions; activation; GC; enrichment backfill.
P4: dedupe (mine) + retraction (⭐05) per ratified lane split → language
wave handed to ⭐05, who audits those runs (calibration law applies).

## OWNER RULING — ghosts/pop-ups survival law (2026-08-12, via ⭐05)

"Don't create anything we can't hook to a real restaurant." Pop-ups: if
the name grounds to a real (grounded) restaurant, LINK the mention;
otherwise IGNORE — no entity. Survival as an active searchable entity is
decided at ENRICHMENT, not extraction: extraction still emits real venue
mentions (v13 keep-cases stay valid at the extraction layer); the
lifecycle rule is that a restaurant that fails grounding after a real
attempt does not remain active/searchable. IMPLEMENTATION (post-v13-
activation sequence, with reground): (1) reground sweep attempts Places
grounding on the 4,057 ungrounded first (~4,057 × $0.045 ≈ $183 — SPEND
NEEDS OWNER HASH via campaign flow); (2) failures then get the ignore
rule: archive/suppress from search, mentions re-attach to grounded
referents where the resolver can; (3) the ungroundable-survival gate
becomes a standing enrichment-lifecycle invariant, not a one-off sweep.
