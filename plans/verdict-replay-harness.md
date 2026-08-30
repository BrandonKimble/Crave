# The standing verdict-replay regression harness

Owner-ordered 2026-08-30, built the same day. Uncommitted; sits entirely in
new files plus one additive method on the word-vocabulary judge.

## What it is

One runner for every judged lane: sample that lane's ledgered verdicts
(`claim_verdicts`), re-ask each question under the CURRENT prompt/rule
version, and print the change table — **unchanged / flipped (old→new with
both reasons) / unreplayable (counted honestly, per cause)**. Drift
detection for every judge, on demand, cheap enough to schedule later
(machine-readable JSON out; no cron registered).

```
yarn workspace api ts-node scripts/verdict-replay.ts --lane=entity_match
yarn workspace api ts-node scripts/verdict-replay.ts --all --sample=50 --out=/tmp/replay.json
```

Point `DATABASE_URL` at staging for a staging replay (the harness only
reads).

## Files

- `apps/api/src/modules/content-processing/verdict-replay/verdict-replay.types.ts`
  — contracts, registry, the caps (default sample 100, hard cap 500/lane).
- `.../verdict-replay-sampler.ts` — stratified sampler: every outcome class
  (3 rows each) + recent half + random fill, deduped by claim identity,
  rehearsal rows excluded, ALL rule versions (replaying an old-version
  verdict under today's rule IS the drift question; each row carries its
  stored version).
- `.../verdict-replay-adapters.ts` — per-lane adapters + the lane roster.
- `.../verdict-replay.service.ts` — the orchestrator (`VerdictReplayRunner`;
  deliberately NOT a Nest provider — the script constructs it, so nothing in
  production can wire or schedule it by accident).
- `.../verdict-replay.spec.ts` — 11 unit specs, mock LLM/DB: sampler
  stratification + dedupe + rehearsal exclusion, per-adapter flip/unchanged/
  unreplayable discrimination, runner change-table math, hard-cap refusal,
  loud no-adapter reporting.
- `apps/api/scripts/verdict-replay.ts` — the CLI.
- `WordVocabularyJudgeService.replayClaims(lane, rows)` — new public method;
  `probeLane` (the bench prober) now delegates to it, so both compare-only
  seams share one re-judge implementation.

## Read-only, and the budget ruling

The harness can never write a verdict: no adapter holds a reference to
`ClaimVerdictLedgerService.record`, and the runner's only writes are stdout
and `--out`. **Replays do NOT ride `ClaimRehearingBudgetService.authorizeDrain`,
deliberately:** that budget bounds verdict-BUYING drains — spend that
mutates the ledger and then the corpus, which is the runaway it exists to
stop. A replay buys zero verdicts, is operator-invoked, and is bounded
instead by the per-invocation hard cap (500/lane) with measured usage
printed per lane. If a cron ever runs this, the cap is the envelope; revisit
the exemption then.

## Adapter coverage

| Lane | Status | How the hearing is rebuilt |
|---|---|---|
| `entity_match` | **implemented** | subject `{kind, term, candidateEntityId}`; candidate name refetched from today's corpus; judged via `matchEntitiesBatch`. Gone candidate → unreplayable `candidate-entity-gone`. **Known limit:** the live hearing's D2 context (verbatim mention, thread restaurant) is not stored, so the replay is context-degraded — a flip can mean "context was doing the work", which is itself the ablation study's signal. |
| `entity_dedupe` | **implemented** | subject `{aId, aName, bId, bName}`; kind from entity type; home restaurants + same-place flag re-derived from today's corpus (same SQL as the live hearing); `match`→`merge`, else `hold`. Merged-away side → unreplayable. |
| `attribute_merge` | **implemented** | subject `{type, aId, bId, ...}`; carriers via `fetchAttributeCarriers`; `judgeAttributeMergesBatch`; `merge`/`hold` mapping. Rule version resolved LAZILY (see below). |
| `concept_satisfies` | **implemented** | pair from subject or from the claim key (`from>to`); names from today's corpus; `buildSatisfiesPrompt` (the shared rule text) at temperature 0. |
| `word-genericness` / `word-negation` / `word-role` | **implemented** | thin shims over `WordVocabularyJudgeService.replayClaims` — the subject IS the claim. |
| `place_grounding` | no adapter, deliberate | the hearing chose among LIVE Google Places candidates that are not stored; rebuilding them costs fresh Places spend and yields a different candidate set — not a replay. |
| `restaurant_name` | no adapter, pending | the subject stores the EFFECT, not the hearing inputs; implementable via the hearing service's docket rebuild. |
| `word_claim` | no adapter, pending | collision context rebuilt from the live `entity_surface` graph inside the adjudicator. |
| `dish.knowledge_synthesize` | no adapter, deliberate | generative synthesis, no scalar outcome to diff; guarded by its own gold gate. (The documented orphan lane.) |
| relevance gate | out of scope, documented | not a `claim_verdicts` lane at all — its verdicts live in `collection_relevance_verdicts`, keyed by prompt hash; a hash bump already isolates old from new by construction, so "replay under the current prompt" is its normal operation, not a missing probe. |

Every no-adapter lane is REGISTERED and reported loudly on every `--all`
run — never silently skipped.

**Placement note:** the bench-prober law says adapters live with their
lanes; these live in the harness module for now because every lane service
file (food-dedupe-merge, attribute-dedupe-merge, concept-satisfies,
entity-resolution) is owned by in-flight agents this week. Co-locating is a
mechanical follow-up. **Lazy rule loading:** rule modules throw at import
while their prompt text is mid-edit and unversioned (the release-ledger
law — correct per lane, wrong as a harness-wide outage), so each adapter
resolves its version only when its own lane runs. Found live: BOTH
`entity-match-prompt.md` and `attribute-merge-prompt.md` are currently
unversioned in the working tree (other agents' in-flight edits), which also
means the working tree cannot boot the app at all right now — the smoke ran
from a temporary worktree at HEAD (removed after).

## The prober-seam unification decision

The bench prober (`iteration-bench/bench-prober.ts`) IS a narrower instance
of this harness: same registry pattern, same no-writes law, same flip
table — but it samples OUTDATED verdicts only (the carry-forward question
after a rule bump), where this harness replays the whole ledgered
population including current-version rows (the drift question). Decision:
**share the judging, not the registry (yet).** The word lanes' re-judge
logic now lives once, in `replayClaims`, and both seams call it; the
registries stay separate because folding them means editing
iteration-bench + word-judge registration flows while the bench is in
active use, for zero behavior gain. Clean follow-up: express the bench's
probe as `replayLane` over an "outdated-only" stratum and retire
`BenchLaneProber`.

## The two prototype scripts — kept, and why

The no-leftovers law says absorb-or-delete, gated on the reports' tables
staying reproducible. Neither survives absorption, so both stay:

- `scripts/judge-context-ablation.ts` replays GOLD-CASE FIXTURES twice
  (bare vs enriched context) — a context-ablation experiment over curated
  cases, not a ledger replay. The harness cannot reproduce its flip table
  (different population, different question).
- `scripts/attribute-replay-rulings.ts` replays sampled
  `llm_decision_records` — necessary because the attribute PLACEMENT lane
  is unledgered (systems-map divergence #11) and the attribute MERGE lane
  has **zero** `claim_verdicts` rows anywhere (gated off; never ran a
  ledgered hearing). Until those populations exist in the ledger, this
  script is the only replay path for them.

When the attribute lanes start writing real ledger rows, the second script
becomes absorbable and should then be deleted.

## Live smoke (staging, 2026-08-30, N=20/lane + one N=25 entity_match run)

Populations on staging: word-role 64,868 · word-negation 40,489 ·
word-genericness 32,666 · entity_match 9,727 · place_grounding 6,349 ·
word_claim 4,819 · restaurant_name 119 · entity_dedupe 38 ·
concept_satisfies 0 · attribute_merge 0.

| Lane | sampled | unchanged | flipped | unreplayable | flip rate |
|---|---|---|---|---|---|
| entity_match | 20 | 13 | 1 | 6 (candidate-entity-gone) | 7.1% |
| entity_dedupe | 20 | 12 | 0 | 8 (4 merged-away, 4 subject-missing-inputs: pre-current-shape rows) | 0% |
| concept_satisfies | 0 | — | — | — | no ledgered population (pre-ledger verdicts live in `entity_satisfies`; unit-proven with mock LLM) |
| attribute_merge | 0 rows anywhere | — | — | — | lane gated off; unit-proven with mock LLM |
| word-genericness | 20 | 20 | 0 | 0 | 0% |
| word-negation | 20 | 18 | 2 | 0 | 10% |
| word-role | 20 | 18 | 2 | 0 | 10% |

Real drift signal on the first run:

- **entity_match**: `bubbles` → boba tea, stored `match` ("shorthand for
  bubble tea alias"), now `new` ("component or generic category"). Note the
  degraded-context caveat above.
- **word-negation**: `零` (und) and `menos` (und) both stored `negates`,
  now `does-not-negate` — the current rule reads them as quantity/number
  words, not denial. Same family as the v2→v3 negation bump's 24 silent
  flips.
- **word-role**: `đứng` (vi), `owned` (en) — `frame`→`particular` under the
  current role rule.

None of these are actioned here — the harness measures; re-ruling is a
rule-bump + budgeted drain decision.

## Cost per 100 replays, measured

Entity lanes: the N=25 entity_match run measured **2 Gemini requests,
2,938 in / 305 out tokens** for 18 replayable rows (10 pairs/call) — so
~11 requests and ~18k tokens per 100 replays; at flash pricing that is
around a cent, and the invocation prints its own measured usage every run
(no-fake-estimates: requests/tokens are read back from `api_usage_ledger`
for the run window; dollars stay BigQuery's). Known meter gap: the word
lanes' hearings showed 0 usage rows inside the run window (their recording
path lands rows outside the per-lane window) — the count is honest about
being a window read, not a per-call attribution; fixing attribution there
is a follow-up if the number starts mattering.

## Verification

- `yarn tsc --noEmit` green; `nest build` green; eslint clean on all new
  files + the word-judge edit.
- `yarn jest verdict-replay` — 11/11; `judged-vocabulary.spec` (word-judge
  neighbor) still green.
- `yarn invariants` green by printed verdict: "43 invariant(s), 88 proof(s)
  run. Every invariant rejected the defect it was bought with." (judged on
  the summary text, not a piped exit code — the swallow class).
