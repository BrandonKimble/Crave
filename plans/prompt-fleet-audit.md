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

## v13 SHADOW — pre-arm red team GO (2026-08-12) + named diff-review checks

Final red team: GO with 3 conditions (76-case certification on final
text+schema pairing — running; absolute-path push + same-env DB/worker;
named checks below). Two AT-RISK consumer items are MEASUREMENT checks
for the shadow-diff review, not blockers:
1. PRAISE-MASS SHIFT: ANSWER TEST + F.1 both-at-once create praise
   carriers the old prompt suppressed; praise feeds restaurant lane at
   2.0x weight — measure corpus-wide score shift in the diff review;
   also two divergent praise dedupe keys noted.
2. CURATED-LIST ATTRIBUTE THINNING: home lists bucket on dish/venue-word
   attributes the candidate forbids minting (sushi/burgers/bakery/cafe);
   places_api + cuisine_llm writers still supply them — measure thinning
   rate; bbq canonical spelling never picked (teaser pins 'barbecue').
Owner line-items surfaced: schema hash should eventually fold into the
registered prompt hash (schemas are load-bearing prompt text now); the
verbatim-alias surface banking path is dead (pre-existing) and the
rewrite makes it permanent.

## CROSS-SESSION RED-TEAM INTAKE (2026-08-13, ⭐05's 4-lens pass) — my-lane queue

Sequenced BEHIND ⭐05's wave-1 landing (their SEVERITY-1 fix in the shared
effect-replay path: record()'s ON CONFLICT re-opens executed effects +
non-idempotent CASE arms — 15.5k default-label rows exposed, executed
proof). DO NOT un-gate the nightly dedupe until their 'wave-1 landed'
ping, despite adapters being live/condition-met.
1. Resolution-time entity-match verdict memory: entity-resolution
   :1571 runs the same judge food-dedupe adopted through claim_verdicts —
   adapter needed (same rule fingerprint), plus the place_grounding lane
   (permanent groundings currently have NO seam) — the two most expensive
   irreversible judgments.
2. Relevance-gate verdict table: add rule_version to (platform, post_id)
   PK usage + due-predicate — 8,197 rows currently can never re-open on a
   prompt bump; fingerprint already stored but unusable.
3. VOCABULARY_PROMPT_VERSION=7: last hand-maintained version constant —
   convert to asset-fingerprint + append-only ledger (throw on unlisted).
4. llm_decision_records has zero readers — fold sites into hearing lanes
   as each is touched, not as a big-bang.
(FYI theirs: Han negation inversion 不辣→spicy queued for owner ruling;
label-sweep >= watermark fix is their wave-1.)

## POST-v13 DEDUPE DOCKET (2026-08-13 intake from ⭐05's read-door wave)

Runs when DEDUPE_JUDGE_LANES_ENABLED flips (post-activation, per sequence):
1. chili / chile / chili pepper TRIPLICATE ingredient (unmasked by the
   read-door identity fix; 7 newly-attributed serving rows).
2. 179 duplicate identity pairs (1,055 entities) newly visible to identity
   probes — full dedupe pass over that population once v13 settles; some
   are camarones/shrimp-class extraction twins.
Note: adapter is LIVE with verdict memory; the FLAG stays off until
activation — un-gate clearance != run clearance. ⭐05 residual awaiting my
adjudicator file to settle: 321 und rows outside the claim-judge due
predicate (theirs to pick up).

## INTAKE 2026-08-13 (⭐05 finisher findings, my lanes)

1. CONFIRMED: v13 shadow BANKED a live recall surface (pan → und/
   extraction, 01:17 local, during the replay) that flipped es hg-01.
   Design gap: shadow replays run full resolution incl. surface banking,
   and surfaces are globally live for recall (unlike shadow entities,
   which sweeps can't see). RULING NEEDED at activation review:
   shadow-banked surfaces carry a pending status until activation, OR
   banking is accepted live and the homograph guard subscribes. Until
   ruled: known interference with gates during shadow windows.
2. Gender-fold gap: cuisine adjectives banked one gender only (griega/
   griego, mexicana/italiana/tailandesa class) — vocabulary-generator
   fix: bank both genders or fold gender at banking.
3. camarones containment root cause: name-containment-edge-builder reads
   identity_key only, never entity_surface — banked plurals invisible.
   Wave design: containment reads recall surfaces.
4. Site-3 identityScope adoption (restaurant-cuisine-extraction.ts:346/
   356): +1,911 rows / 424 attribute entities, deltas reproduce 2x —
   adopt in the dedupe window.
5. Docket-population trap: my four lanes' claim keys are not locale-
   enumerated — not exposed to the und-docket class, by construction.

## INTAKE 2026-08-13b: second shadow-banking witness + romanization landed

Second, STRONGER shadow-surface witness: shadow banked accented 'bơ'
(und/extraction 01:29) onto the junk 'bo' entity — typed bơ now
exact-grounds junk through shadow-written data (their acc-02 red,
65/66). Strengthens PENDING-STATUS-UNTIL-ACTIVATION for the docketed
ruling: shadow surfaces going live bank WRONG accent claims, not just
homograph flips. Romanization endgame landed their side (110bd999f);
one HELD_FOR_RULING for owner: coctel→es re-tag costs 21 groundings
(ca-phe trade class). normalizeCuisineName delete-not-fold bug FIXED
(Niçoise→nicoise not nioise; canonicalFold, verified on built output).

## P7 — FLEET ARCHITECTURE RED TEAM (2026-08-17, pre-shadow; full-lane pass)

Method: fresh per-lane inventory (caller profiles, prompt source, schema,
verdict memory, gold, batch) verified against code end-to-end, plus
empirical DB/invariant probes run directly. Extraction-prompt TEXT was
covered by the rhino audit; this pass is the fleet as a SYSTEM.

### Found and FIXED tonight (both were red on the clean tree)

- **`yarn invariants` was failing on a clean tree, twice.** (a) The rhino
  C.1 rewrite rephrased the line the item schema-description quotes →
  quote-mirror drift nobody saw because commits don't run invariants.
  (b) RescoreCoordinatorService grew an OpsAlertsService param and the two
  interactive scoring scripts (rebuild-crave-scores,
  validate-crave-score-fixtures) were left at 4 args → tsc-based
  invariants all red. Both fixed; suite back to 39/39 green.
- **The mirror fix produced the campaign's hardest schema datum:**
  aligning the description to the rhino's phrasing — semantically nil —
  flipped V15h 6/6 → 0/6 DETERMINISTICALLY (pre-edit control 6/6).
  Schema descriptions are knife-edge load-bearing prompt text. The
  certified quote is restored verbatim; KNOWN_DRIFT doctrine gains
  admissible reason (2): a re-mirror that is itself a behavior change
  waits for the next certification window (death date: v15 activation).
  LAW GOING FORWARD: a schema-description edit gets the same cert
  treatment as a prompt edit — no exceptions for "cosmetic".

### Confirmed healthy (big movement since the 08-11 inventory)

photos.is_food schema-enforced ({answer: YES|NO}, throws on garbage);
residue.interpret ceiling reads its caller profile; every judge lane at
temp 0; five lanes carry fingerprint-derived rule versions with
re-openable claim_verdicts memory (entity_match/entity_dedupe,
place_grounding — including remembered rejections, concept-satisfies,
word_claim, restaurant_name) plus genericness/negation/word_role, all
budget-gated through ClaimRehearingBudgetService. ⭐05's word courts get a
clean architectural bill: fingerprint versions, mandatory reasons,
rehearing budget — the healthiest corner of the fleet.

### Residual docket (ranked; none block the shadow)

1. **DONE 2026-08-17 (owner-ordered, same day).** Config-scoped verdicts:
   promptHash (the F3/R7 discriminator) joined the PK, reuse filters on it,
   tombstones ('parent_unfetchable', 'fetch_failed_decisive') carry the
   sentinel config 'unfetchable' and never re-open, the A(τ) calibration
   reader moved to latest-judgment-wins fail-open, and the orphan sweep
   stays deliberately hash-agnostic (re-judge, never re-fetch). RED-capable
   spec pins the re-open; tsc caught a 4th writer the grep sweep missed.
   ORIGINAL FINDING: **Relevance-gate memory cannot re-open.** Empirically confirmed: PK (platform, post_id), reuse query
   ignores the stored prompt_hash; 8,846 verdicts already permanent. The
   ~117k-doc archive completion will write tens of thousands more
   permanent verdicts; a later gate-prompt improvement can never re-hear
   its drops. Ideal shape = the pattern the five versioned lanes use:
   version in the key + due predicate. Owner call: land before the load,
   or accept the frozen-verdict cost knowingly.
2. **vocabulary.word_role_judge has NO caller profile** → silently rides
   the session model with content/LOW thinking while its two sibling
   facets run query/MINIMAL; the taxonomy completeness spec text-scans
   llm.service.ts only, so generateForCaller callers escape coverage.
   Fix = profile entry + spec widened to the wrapper.
3. **VOCABULARY_PROMPT_VERSION = 7 is the last hand-maintained version**
   and buildVocabularyPrompt has no fingerprint — an edit without a bump
   is undetectable and the due predicate would see nothing owed. Migrate
   to resolvePromptRule like the other five.
4. **dish.knowledge_synthesize due predicate is a bare timestamp**
   (knowledgeSynthesizedAt, no version) — a prompt bump never re-opens
   old syntheses.
5. llm_decision_records: 203,507 rows, zero readers — standing stance
   confirmed (fold into hearing lanes as each is touched, no big-bang).
6. Process: invariants run neither at commit nor on any schedule — the
   two clean-tree breaks above lived undetected across multiple commits.
   Cheapest durable fix: a nightly/pre-shadow `yarn invariants` rung, or
   a lefthook entry for the fast subset.
