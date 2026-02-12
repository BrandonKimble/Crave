# Autonomy Playbook (Evidence-Scaled)

## Mission

Drive JS performance toward sustained 60 FPS for shortcut submit using an autonomous loop that never stops at a single cycle. The loop ends only when we achieve a significant, repeatable step forward or hit a concrete blocker.

## Non-Negotiables

- Metric-first: JS is the primary decision metric; UI FPS is secondary.
- UX contract: user-visible behavior, look, and feel must remain equivalent unless explicitly approved otherwise.
- Evidence before change: no speculative fixes.
- Loop semantics: every cycle ends by immediately starting the next cycle.
- Hard autonomous-stop rule: do not stop/exit autonomous mode until JS floor improves by at least `+25 FPS` versus the active investigation baseline, unless an explicit blocker is proven.
- Scope is evidence-scaled: minimal patch or full architecture rewrite are both valid if evidence justifies it.

## Strict Reply Policy (Latch)

When the user requests strict no-checkpoint autonomy, enforce this until the user cancels it:

- Run loops back-to-back without interim "status" replies.
- Do not treat context compaction/reload as latch reset.
- Reply only when:
  1. the active user-requested threshold is met (if none specified, default to this playbook's hard rule), or
  2. a hard blocker requires user action, or
  3. the user explicitly requests an update.

## Scope Priority Rule (Explicit)

- Do not default to micro-optimizations after repeated weak results.
- When evidence shows parent orchestration/dataflow/render-topology is the bottleneck, prioritize architectural changes over additional local tuning.
- Treat architecture work as the expected path to reach major floor lifts (for this track, ~3 -> >=25), not as an exceptional last resort.

## Compaction-Safe Read Order

1. `/Users/brandonkimble/crave-search/AGENTS.md`
2. `/Users/brandonkimble/crave-search/plans/autonomy-playbook.md`
3. `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md`
4. `/Users/brandonkimble/crave-search/plans/agent-log.md` (append task entry before edits)

## Core Process

### Phase 0: Claim + Protect Shared Tree

- Run `git status --porcelain` and preserve unrelated edits.
- Append task entry in `plans/agent-log.md` before any code/doc changes.

### Phase 1: Reproduce With Valid Harness Data

- Default loop config:

```bash
EXPO_FORCE_START=1 \
FOLLOW_METRO_LOGS=1 \
EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS=3000 \
EXPO_PUBLIC_PERF_HARNESS_RUNS=3 \
yarn ios:device:perf-shortcut-loop
```

- Iteration mode: runs `1-3` only, all other knobs fixed.
- Promotion/keep decision for high-impact changes: rerun with higher confidence sample (`runs=6-8`) when practical.
- Valid run requires both markers:
  - `shortcut_loop_run_start`
  - `shortcut_loop_run_complete`

### Phase 2: Deep Synthesis Checkpoint (Mandatory)

Before changing behavior, explicitly produce:
- Dominant bottleneck candidate (single sentence).
- Ranked alternative explanations.
- Why current data supports or rejects each explanation.
- What remains unknown.
- Highest-value next probe.

If confidence is weak, do instrumentation-only loops and repeat Phase 2.

### Phase 3: Instrumentation-Only Loops (As Many As Needed)

- Add narrow probes only for unresolved questions.
- Prefer stage-scoped summaries over event spam.
- Keep probe overhead low and measurable.
- Remove or gate probes that do not move decisions.

### Phase 4: Hypothesis and Scope Selection

Write a one-line hypothesis tied to measured evidence and expected metric movement.
Then choose scope based on bottleneck level:
- Local: small component/state/timing change.
- Cross-cutting: state ownership, memo boundaries, render topology, scheduling strategy.
- Architectural: route flow, dataflow pipeline, feature decomposition, interaction model internals.

Architectural changes are explicitly allowed when repeated evidence says local optimizations cannot meet target.

### Phase 5: Change Implementation

- Implement one coherent hypothesis track at a time.
- Preserve UX contract.
- Avoid stacking unrelated changes in the same validation loop.
- For broad refactors, keep old/new behavior parity observable via instrumentation or assertions.

### Phase 6: Matched Validation

- Re-run baseline and candidate with identical knobs.
- Compare at minimum:
  - JS stall max and p95
  - JS sampler floor/avg FPS
  - stage timings (`submit_resolved`, `coverage_fetch_success`, `visual_sync_state`, `results_list_ramp`)
- Keep only if improvement is repeatable and causal story remains consistent.

### Phase 7: Decision + Immediate Restart

- Accept, reject, or park candidate.
- Append required iteration block to canonical log.
- Immediately restart at the appropriate phase:
  - accepted change: restart at Phase 1 with refreshed baseline
  - rejected/inconclusive: restart at Phase 2-3
- Do not exit autonomous mode after a single accepted loop; continue until the hard stop rule is satisfied.

## Evidence Ladder (When To Escalate Scope)

Escalate from local fixes to architecture-level redesign when any of these are true:
- Same bottleneck window remains dominant across multiple rejected local candidates.
- Commits/stalls concentrate in parent orchestration layers (`SearchScreen`, sheet tree, route-level coordination) rather than a single leaf component.
- Improvements in one window reliably regress another due shared control flow.
- Harness and instrumentation consistently show floor stuck near low single digits despite reducing isolated stall outliers.

## Acceptance Gates

Gate A: Data validity
- Required markers present and baseline/candidate knobs match.

Gate B: Causal confidence
- Hypothesis directly supported by instrumentation and synthesis.

Gate C: JS improvement
- Directional and repeatable improvement in primary JS metrics.

Gate D: UX parity
- No unintended user-visible regression in behavior/look/feel.

Gate E: Sustainability
- Change simplifies or clarifies ownership; avoids new complexity debt.

## Significant Progress Definition

A loop is a meaningful step forward when it delivers repeatable gains such as:
- material stall p95 reduction, and/or
- clear JS floor increase across matched runs.

Hard completion threshold for autonomous mode on this track:
- validated JS floor improvement of at least `+25 FPS` relative to the active baseline snapshot used for the investigation cycle.
- validation should be repeatable on matched runs and promoted with higher-confidence sample (`runs=6-8`) before declaring completion.

Program-level milestone target for this track: major floor lift with UX parity. This usually requires architectural bottleneck removal, not only micro-tuning.

## Required Iteration Log Format

For every loop in `plans/shortcut-submit-investigation-log.md` include:
- Baseline/candidate metrics (stall max/p95, sampler FPS, stage timings)
- Dominant bottleneck statement
- Synthesis checkpoint summary (why this hypothesis)
- Exact change made (or `no behavior change`)
- Validation result
- Next loop decision

## Harness As Productized Infrastructure

Harness improvements are first-class work when they increase loop speed or data fidelity.
Examples:
- deterministic run IDs and marker-scoped parsing
- reliable auto-stop at configured runs
- stable startup delay/readiness behavior
- simulator/device targeting policy that avoids accidental mode drift

Any harness change must be validated before using its output for product conclusions.

## Anti-Patterns (Do Not Do)

- Speculative fix stacking.
- Declaring completion after one successful loop.
- Re-running rejected candidates without new evidence.
- Making architecture changes without a behavior parity contract.
- Keeping high-noise probes that no longer influence decisions.

## Continuous Log Compaction (Required)

- Treat log compaction as part of every loop, not a periodic cleanup task.
- Every time you append an iteration entry to `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md`, compact older content in the same edit.
- Keep only high-signal memory in the canonical log:
  - accepted stack
  - rejected/do-not-retry set
  - latest baseline/candidate snapshots
  - latest few loop decisions needed for continuity
  - active hypothesis + next loop plan
- Remove repetitive raw transcripts and collapse stale details into short summaries.
- If the investigation log grows beyond roughly `500` lines, run a dedicated compaction pass immediately before continuing normal loop updates.
