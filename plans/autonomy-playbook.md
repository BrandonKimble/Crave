# Autonomy Playbook (Lean Refactor Cycle)

## Mission

Ship the frontend refactor with steady slice-by-slice progress, strict UX parity, and promotion-quality evidence.

Default posture:
- implementation progress first,
- perf loops as checkpoint validation (not always-on),
- investigation looping only when explicitly requested.

## Modes

### Mode A: Implementation (default)

Use for normal refactor execution.

### Mode B: Investigation (opt-in)

Use only when the user explicitly asks for repeated perf probing/threshold loops.

## Non-Negotiables

- Preserve UX contract unless a behavior change is explicitly approved.
- One runtime owner per concern; no long-lived dual control planes.
- Delete-gate rule: when a cluster becomes `owned`, legacy writer path must be removed in the same promotion.
- No speculative patch stacking.
- Shared-checkout safety: merge around existing diffs; do not clobber unrelated work.

## Judgment Override (Anti-Ritual)

- Process is a decision aid, not a ceremony requirement.
- Before each planned step, ask: "Can this step change a decision or reduce risk for the active cluster?"
- If no, skip the step and log one-line reason in the cycle note.
- If two consecutive cycles produce no new decision signal, stop looping and reframe architecture/hypothesis.
- Prefer careful design work over repetitive loop execution when signal is saturated.

## Compaction-Safe Read Order

1. `/Users/brandonkimble/crave-search/AGENTS.md`
2. `/Users/brandonkimble/crave-search/plans/shortcut-submit-architecture-refactor-plan.md`
3. `/Users/brandonkimble/crave-search/plans/autonomy-playbook.md`
4. `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md`
5. `/Users/brandonkimble/crave-search/plans/agent-log.md`

## Slice Card (Required Before Coding)

Write this in 5 lines before each burst:
- cluster,
- target owner,
- delete gate,
- required validation,
- rollback trigger.

## Cycle Cadence (Target)

- 5-10 min: contract and scope check.
- 45-90 min: single-cluster implementation burst.
- 15-25 min: validation pass.
- 5 min: promote/iterate decision + log update.

If a cycle exceeds ~2 hours without clear slice movement, split scope or ask for direction.

## Mode A Loop

### Phase 0: Claim + Protect

- Run `git status --porcelain`.
- Append task entry in `plans/agent-log.md`.
- For each file touched, inspect existing diff before editing.

### Phase 1: Implement One Cluster

- Move one coherent concern to its target owner.
- Keep changes inside the selected cluster boundary.
- Avoid unrelated refactors in the same slice.

### Phase 2: Run Always-Required Checks

- Relevant lint/tests for touched runtime modules.
- `bash ./scripts/no-bypass-search-runtime.sh`
- Contract/fixture checks when parser/comparator/no-bypass scripts are touched.
- Relevance rule: skip checks that cannot affect the touched cluster or promotion decision, and record the skip reason.

### Phase 3: Run Conditional Perf Gate

Run local perf gate when submit/map/list/hydration/gesture runtime changed, or when promoting runtime ownership slices.

Commands:
- Baseline refresh: `bash ./scripts/perf-shortcut-local-ci.sh record-baseline`
- Candidate gate: `bash ./scripts/perf-shortcut-local-ci.sh gate`

Notes:
- Use direct script entrypoints (not plain `yarn`) in Node 24 shells.
- Baseline is invalid for promotion if harness run completion is timeout-shaped.
- Do not run perf gate "just because"; run it only when it is promotion-relevant for this slice.

### Phase 4: Enforce Delete Gate

Before promotion:
- delete legacy writer path for that cluster,
- confirm no-bypass constraints still pass,
- update cluster state (`legacy`/`shadow`/`owned`/`deleted`) in plan evidence.

### Phase 5: Promote or Iterate

Promote only when all relevant required checks pass; otherwise keep the cluster active and run another cycle.

## No-Ceremony Promotion Criteria

A slice is promotion-ready when all are true:
- cluster owner and delete gate are satisfied,
- correctness/parity checks relevant to touched behavior pass,
- perf gate passes when runtime-critical paths were touched,
- no-bypass/static contract checks pass,
- evidence is clear enough for another engineer to reproduce the decision.

## Promotion Packet (Minimal, Not Verbose)

For each slice promotion, record:
- slice + cluster,
- files changed,
- check results (pass/fail),
- skipped checks with one-line reason,
- perf compare summary path (if perf-required slice),
- delete-gate evidence (what legacy path was removed).

## Mode B Loop (Investigation, Opt-in)

- Run matched baseline/candidate loops.
- Keep metric definitions and schema version fixed.
- Continue loop-to-loop until threshold is met or a blocker is proven.
- Log rejected candidates in `plans/shortcut-submit-investigation-log.md`.

## Strict Latch Policy

When user requests strict no-checkpoint autonomy:
- keep latch active across context reload/compaction,
- respond only on milestone/threshold achieved, blocker, or explicit user update request.

## Compact Update Format

Use concise updates:
- `Now:` current action.
- `Evidence:` strongest pass/fail signal.
- `Next:` immediate next step.

Only expand beyond this when a blocker or decision tradeoff needs explanation.
