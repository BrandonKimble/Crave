# Holistic red team — scope decision (2026-09-04)

Owner ask: "find exactly how far we should red team back, and how." This
is the evidence-based answer, not a gut one. Written while the v23 Austin
shadow drains on staging.

## The evidence

**Two prior baselines exist, and both have expired for the backend.**

| Baseline | What it was | Covered |
|---|---|---|
| 2026-08-07 | Exhaustive per-file rederivation, ledgered in `audit/COVERAGE.md` (4,498 rows, one status per file) | whole repo |
| 2026-08-19 | "Everything" red team: legacy plans + subagent breadth reads + 5 fix waves | backend end-to-end; mobile findings-only (owner docket, unresolved); map untouched |

**What changed since 2026-08-19 (commit 4994a7faf → HEAD):**

- 452 files, +107k lines; of that **35,610 lines of CODE across 330 files**
  (the rest is fixtures, archives, docs).
- The pre-commit hook resets a ledger row to UNREVIEWED when its file
  changes. Result: of the 330 changed code files, **122 are UNREVIEWED and
  208 have no ledger row at all. Zero are reviewed.**
- Concentration (files): content-processing 75, search 40,
  external-integrations 40, restaurant-enrichment 35, judge-contracts 19,
  attribute-ontology 9, polls 8, entity-display 8, identity 5. Mobile: 6.
- These are exactly the campaigns of Aug 20–Sep 3: v17→v23 prompt program,
  judge contracts + governance envelope, sameness/widening architecture,
  alias grade law + clean slate, same-business court, unknown-search
  intake, merge routing. Each was certified in its own lane; **the SEAMS
  between them have never been read as one system.**

**What was already unreviewed before 08-19 and still is:** 966 rows
(UNREVIEWED or PARTIAL) whose files have NOT changed since 08-19 —
overwhelmingly mobile (mobile-search 310, nav-overlays 113, app-core 107,
native 37) plus api-scripts 67 and repo-tooling 52. The 08-19 pass read
mobile "findings-only" and left an owner docket: the P0 double-instantiated
feed runtimes, scroll-restore dead path, inert shell-residency subsystem,
120Hz frame-budget constants. None of it is closed.

**CI has been red since 2026-08-09.** Last green run: Aug 9. Every run
since fails at the doc-claims static guard (7 stale script paths in
`docs/llm-systems-map.md` and `scripts/alias-clean-slate/README.md`),
which sits at step 93 of the build job — BEFORE type check, lint, build,
unit tests, DB-integration specs, the track-sheet/native lanes, and
`yarn invariants`. **Nothing after that step has executed in CI for 25
days.** Verified locally today: tsc clean, unit suite 287/288 suites and
2,494 tests green. The DB-integration lane, invariant mutation proofs, and
mobile static guards have NOT been verified anywhere since Aug 9. (Same
disease as the 100-red-runs lesson of 2026-08-02; the deploy gate only
consults CI for PROD, and we have been staging-only since 08-09, so it
never bit.)

## The decision: how far back

**Backend: back to 2026-08-07** — i.e., every file the ledger does not
mark reviewed at its current blob. That is the 330 changed files plus the
backend share of the 966. Reading only "since 08-19" would skip the seams
the 08-19 pass itself flagged and never closed.

**Mobile: not a re-read; a docket drain.** The 08-19 findings are owner
decisions waiting to be made. Re-reading 176k lines of mobile to
rediscover them is waste. The map stays untouchable (CLAUDE.md law).

**Not further back than 08-07.** Files reviewed IDEAL-VERIFIED/REDERIVED
at 08-07 and unchanged since (2,600+ rows) get a sampled fresh-eyes
re-hunt (the CLEAN-PASS shape already in COVERAGE.md), not a re-read.

## Wave plan (sequenced by dependency, each wave commits per territory)

**Wave 0 — restore the safety net (today, before anything else).**
Fix the 7 doc paths; push; watch the FULL build job go green (DB specs,
invariants, mobile guards). Any failure behind the doc-claims step is a
finding with 25 days of unknown age. Add a hard rule: the staging deploy
gate treats known-red CI as a refusal too, not a warning.

**Wave 1 — the six backend territories, in pipeline order, read END TO
END as one system** (the seams are the target):
1. content-processing: extraction pipeline → replay/verdict-replay → entity
   resolution → widening/satisfies → dedupe merges (food/attribute) →
   surface/alias grade law.
2. external-integrations: LLM gateway, batch rail, usage ledger, judge
   caller profiles, prompt registry, completion-work timers.
3. restaurant-enrichment: same-business court, merge routing, location
   enrichment, janitor.
4. search: unknown intake, match-explain, concept primitive, servable-place
   chokepoint.
5. shared/judge-contracts + governance: every LLM decision under a contract
   and a campaign; DAG probes; invariants registry (47).
6. attribute-ontology, entity-display, polls, identity deltas.
Scripts that SHIP (rig/, reextract, clean-slate kit) are read with their
territory; probe scripts get a dated-history banner or deletion.

**Wave 2 — drain every standing docket** opened 08-19 → 08-30 (red-team
ledger, dormant-systems, entity-type-coverage, merge-batch,
normalization-coherence, judge-ledger audits). Each item: FIXED, MOOT
(with proof), or OWNER-DECISION (batched, UX-framed). A red team that
opens new findings on top of unclosed ones is theater.

**Wave 3 — mobile docket + the 966.** Owner rulings on the P0s; fixes
under the perf/command-bus harness; the unreviewed rows get status.

**Wave 4 — coverage census + fresh-eyes sample** over the 08-07-verified
remainder; cost-reconcile; ledger shows zero UNREVIEWED code rows.

The v23 shadow diff (running now) is a Wave 1 INPUT: corpus behavior
under the certified prompt is the extraction territory's live probe.

## Standards (all pre-existing laws; restated so the brief is one page)

- **Executed proof.** A finding exists when a failing probe, spec, or
  harness shows it — a grep verdict or a plausible reading is a lead, not
  a finding. Every fix ships with the proof that would have caught it.
- **Read end to end, including tangential code.** Grep-based verdicts have
  repeatedly been wrong here; the seams live in the callers.
- **Attribute before ideate.** Instrument the running system yourself for
  runtime claims; subagents for breadth, me for every decisive check.
- **No guards, no patches.** A guard is a finding; propose the shape that
  makes it unnecessary. Redesign a strained abstraction; never wrap it.
- **Fix the class, not the instance.** A confirmed class gets a registered
  invariant with a mutation proof (`yarn invariants`) or a static scanner
  that can show RED.
- **Silence is the recurring disease.** Look hardest for: swallowed
  errors, refusals that only log, always-green metrics, spend doors outside
  the campaign gate, tool-absence-swallow in gates, derived rebuilds with
  no output-count expectation.
- **Destructive paths are community-scoped and anchor-preserving.** Every
  wipe/GC/migration path re-verified against preserved-anchors.sql.
- **Numbers are facts or owner choices.** No estimated hours, no seeded
  priors, no "should be fine".
- **Ledger everything.** Each file read gets a COVERAGE.md status at its
  current blob; commit per territory; owner gets one digestible batch per
  wave, framed by user impact, with a "take all recommendations" path.

## What the owner decides

1. GO on this scope (backend to 08-07; mobile as docket drain; map
   untouched).
2. Whether Wave 0's staging-gate hardening (red CI refuses staging deploys
   too) is wanted.
3. The mobile P0 rulings when Wave 3 presents them.
