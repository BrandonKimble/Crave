# The Iteration Bench — prompt-iteration as a first-class machine (2026-08-25)

Owner mandate (2026-08-22..25): "the system should spin the choreography at
us"; automate everything except the narrow decisions only a human can make;
never again discover a dead queue or a poisoned meter by archaeology. Built
from the v16 incident family — every failure was one sentence: a fact or
obligation living in two places, one of which forgot.

## The three laws (the spine every phase obeys)

1. CONTEXT TRAVELS WHOLE. A run's settings (rehearsal, campaign, prompt
   version, corpus) are one sealed object carried intact from submit to
   ingest. No hand-projection may reproduce it (the v16 leak: a nine-field
   projection dropped the tenth).
2. WORK ENDS THROUGH ONE DOOR. Complete, cancel, fail, stale — every
   terminal transition runs the one terminalizer that meters remote spend,
   closes the run, releases the claim, and notifies. Paths carry no
   individual obligations (v16: cancel didn't meter, sweep didn't cancel,
   cancel didn't close runs — three forgettings, one missing door).
3. PROGRESS IS OWNED; COVERAGE IS DERIVED. The bench drives its own queue
   (poll/ingest/retry) while its replay phase is live — "nothing moved in
   N minutes" is a loud pushed state, never silence (v16: 25 silent hours
   because polling was a cron on a cron-less host). Coverage is computed
   from run/input facts, never a parallel tally.

## The state machine

One durable row per iteration (`iteration_runs`), phases strictly ordered;
`advance()` executes automatic phases and STOPS at human gates, always
able to answer "what is the single next required action":

  inventory → proofs → approval(OWNER) → replay → diff →
  review(COORDINATOR/OWNER) → activate-or-reject(OWNER) → closed

- **inventory** (automatic): diff every registered prompt/rule fingerprint
  against the versions the corpus's standing verdicts and coverage carry.
  Output: the changed-prompt list. Forgetting a changed prompt becomes
  impossible — it is a computation, not a recollection.
- **proofs** (automatic): per changed judge lane with standing verdicts,
  re-hear a stratified sample under the new rule via the lane's existing
  rehear machinery (bounded by ClaimRehearingBudget). Output per lane:
  flip rate + side-by-side reasoning for flips + a recommendation —
  carry-forward (flips ≈ 0, auto-declared with the proof recorded),
  re-buy (flips high; population + cost stated), or OWNER-BAND (ambiguous
  middle — the only proofs a human sees).
- **approval** (OWNER GATE): one sheet — proof reports, carry-forward
  declarations, and the spend manifest — one hash. The manifest quotes
  from the LAST COMPARABLE BENCH RUN's per-phase actuals first (the v16
  estimate was 5x over because it priced a replay from a live-collection
  window mix); window-derived rates are a labeled fallback with stated
  uncertainty, and lines a replay structurally cannot spend (admission
  gate) are excluded by construction.
- **replay** (automatic once approved): PREFLIGHT GATES first, machine-
  checked — pool meter agrees with its ledger (the poisoning becomes a
  refusal), queue quiescent, deployed code hash == expected HEAD, prompt
  version registered on the target. Then arm, submit, and DRIVE to done
  under law 3, with per-phase actuals recorded for the next estimate.
- **diff** (automatic): the diff SQL + the standard triage deliverables
  (lost-support source-triage, new-entity junk audit) dispatched as the
  phase's own work products; the review sheet is generated, not remembered.
- **review** (HUMAN GATE): named checklists + triage verdicts; closure is
  recorded on the run row — activation refuses without it (already law).
- **activate-or-reject** (OWNER GATE): the existing activation machinery
  (pointer flip, GC, rollback-until-discard) or the rejection sweep.
- **closed** (automatic): campaign completed, BigQuery reconcile scheduled,
  env disarmed, actuals banked as the next run's estimate basis.

## Bench config

- Default corpus: **austinfood** — the owner's palate is the oracle there;
  encoded, not habitual. Other corpora are explicit arguments.
- The bench serves the fleet rhino too: any judge/prompt bump anywhere
  enters through inventory, so the carry-forward economics apply fleet-wide.

## Lump-ins bound to this build (from the 2026-08-19..25 red team)

estimator-from-history; carry-forward verdict machinery (release-ledger
`verdictPolicy` required field + the rehear-sample prober); preflight
meter/ledger-agreement + quiescence + code-hash gates; campaign auto-close
+ reconcile as the closed phase; diff triage as standard deliverable;
lifecycle alarms replacing ad-hoc monitors (push on stall, push on gate
refusal). Explicitly OUT: prompt-content work (fleet-rhino phase), mobile
docket, post-activation docket.

## Build stages

S1 LANDED (4fe932db5): iteration_runs migration; the state machine with
advance()/nextAction(); computed inventory; poisoned-meter/quiescence/
stale-candidate preflight refusals; the drive contract with loud stall;
one active run per prompt kind; scripts/rig/bench.sh.
S2 LANDED: the flip-rate prober seam (bench-prober.ts — lanes register
their own probers at module init; the three word lanes are live via
WordVocabularyJudgeService.probeLane, compare-only, writes nothing;
unregistered lanes are REPORTED, never faked); the hash-bound approval
sheet (approve refuses a hash that doesn't match the sheet that was
read); estimate-from-history (closed runs bank campaign actuals;
the sheet quotes the last comparable run first, window-mix demoted to a
labeled upper-bound fallback).
S3 LANDED: `bench.sh diff` generates the review file AND the two required
triage briefs; recordTriage()/closeReview() make the triage deliverables
structurally unforgettable (review refuses to close without both); the
stalled-queue state emits a critical ops alert (deduped per run);
reextract.sh carries the escape-hatch label.
NEXT CANDIDATES (not owed): probers for place_grounding/word_claim/
restaurant_name lanes as their modules are next touched; replay
arm/disarm as bench-owned verbs (today the reextract arm is recorded via
recordCampaign).
