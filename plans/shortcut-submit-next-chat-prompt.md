# Next Chat Kickoff Prompt (Shortcut Submit Perf)

Use this as the first user prompt in a fresh Codex chat.

---

Continue the autonomous shortcut-submit JS performance investigation in full no-user-in-loop mode.

Read first and follow exactly:

- `/Users/brandonkimble/crave-search/AGENTS.md`
- `/Users/brandonkimble/crave-search/plans/autonomy-playbook.md`
- `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md`
- `/Users/brandonkimble/crave-search/plans/agent-log.md` (append your task entry first)

Primary goal:

- Drive JS performance toward sustained 60 FPS during shortcut submit.
- Current milestone objective: move JS floor from around `~3` toward `>=25` with UX parity.

Process rules:

1. Instrumentation and synthesis first.
2. Run as many instrumentation-only loops as needed before behavior changes.
3. Architectural changes are allowed when evidence shows local fixes are insufficient.
4. Preserve user-visible behavior/look/feel.
5. After every loop, restart immediately; do not stop unless blocked.

Strict reply policy (persistent):

- Treat strict no-checkpoint mode as active unless the user turns it off.
- Do not post interim progress/checkpoint summaries.
- Only respond when:
  1. requested improvement threshold is achieved (use latest explicit user threshold in thread; otherwise use playbook default),
  2. a hard blocker requires user action, or
  3. the user asks for an update.

Harness/run requirements:

- Run harness yourself (no user taps in loop).
- Keep baseline and candidate knobs identical.
- Default config:

```bash
EXPO_FORCE_START=1 \
FOLLOW_METRO_LOGS=1 \
EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS=3000 \
EXPO_PUBLIC_PERF_HARNESS_RUNS=3 \
yarn ios:device:perf-shortcut-loop
```

- Iteration mode: runs `1-3` only.
- For high-impact keep/revert decisions, rerun with stronger confidence sample (`runs=6-8`) when practical.
- Treat a run as valid only when both markers exist:
1. `shortcut_loop_run_start`
2. `shortcut_loop_run_complete`

Required output block per loop:

- Baseline/candidate metrics (stall max/p95, sampler FPS, stage timings)
- Dominant bottleneck statement
- Synthesis checkpoint summary (why this hypothesis)
- Exact change made (or `no behavior change`)
- Validation result
- Next loop decision

Continuity/documentation:

- After each loop, append findings to:
  - `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md`
- Keep this file current with:
  - dominant hypothesis
  - rejected candidates
  - accepted candidates
  - latest baseline/candidate metric snapshot
- If context compaction occurs, re-read the 4 files listed above before continuing.

Start sequence:

1. Verify current working tree state and preserve unrelated edits.
2. Claim task in `plans/agent-log.md`.
3. Run fresh valid baseline.
4. Continue autonomous loops until measurable, repeatable JS step-forward.

---
