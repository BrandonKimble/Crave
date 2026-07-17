# [SUPERSEDED 2026-07-16] The Transition Work Scheduler — absorbed into THE PAGE v2

**Do not execute this document.** The owner rejected the coordination-layer framing;
the from-scratch replacement is plans/page-composition-from-scratch-design.md (THE PAGE
v2), which absorbs this sketch's valid parts: work classes → L4's reveal-only law +
the per-shell CONTENT-LANDING CLOCK; mount reduction → L3 shell residency; the frame-
budgeted executor survives only as L4's sliced above-fold row mounting.

# (original sketch below, for the record)

2026-07-15. Status: QUEUED — sketch written at owner request; the release-lane baseline
(in flight) prices the work classes before this hardens into a ratifiable design (H3:
never design the optimization before the honest measurement).

## 0. The problem

A screen switch runs a CHAIN of JS work — route commit, scene-stack render cascade
(legs × chrome × panels), world response processing, row preparation, marker projection,
FlashList mounts, hydration fan-out — and today that chain runs WHEREVER the event that
triggered it lands. Measured (dev lane): a list open blocks JS ~2s in 300-700ms chunks;
the press-up window alone carries 400-550ms tasks. Animations that need a JS beat hitch
through exactly those windows. The L-1 law (no JS task >16ms during a transition outside
declared quiet windows) is aspirational until the chain is SCHEDULED, not incidental.

## 1. The ideal shape

**The TransitionTxn becomes the work scheduler.** The engine already reifies every
transition with explicit phases (staged → committed → joining → revealed → settled) and
already owns the one clock consumers trust. Work joins the transition the way readiness
already does — declared, not incidental:

Three work classes, each with a home:

- **MOTION-CRITICAL** (the press-up task): route commit, skeleton paint, motion arm.
  THE ONLY work allowed synchronously in the press-up window. Budget: one frame.
- **REVEAL-CRITICAL** (needed AT the joint): row preparation, marker projection,
  FlashList data land. Scheduled DURING the slide in budgeted slices (the sheet motion
  is UI-thread; the JS thread is idle-ish through it — that idle is the quiet window
  L-1 names), landing at 'revealed'. The P-12 list-data fence is the crude v0 of this
  class (hold renders); the scheduler generalizes it (run the work, sliced, off the
  critical path).
- **DEFERRABLE** (after settle): hydration fan-out, prewarms, telemetry, cache
  maintenance. Scheduled at 'settled'.

Mechanism: `scheduleTransitionWork(phase, work, {budgetMs})` on the engine — work
queues against the LIVE txn's phase edges (the every-edge notification already exists);
slices run through a frame-budgeted executor (yield when the frame budget is spent;
resume next frame). Supersession cancels queued work with the txn (gate-reset-by-
construction extends to work-reset-by-construction).

## 2. Why this is the from-scratch shape

Every alternative smuggles a scheduler in somewhere worse: InteractionManager (blind to
WHICH transition, no supersession), per-site setTimeout defers (clock proliferation —
the exact Q-3 disease), or more fences (each fence is a one-off deferral policy; the
scheduler is the policy generalized). The txn is the only object that already knows the
transition's identity, phases, and supersession — the scheduler is a natural extension,
not new machinery.

## 3. What the baseline must price first (why this waits)

- The real release-lane cost of each chunk (switch commit cascade vs response
  processing vs FlashList mounts vs projection build). Dev numbers are 3-10x inflated
  and dev double-rendering distorts counts — proven this session.
- Whether the UI thread ALSO drops frames in release (dev showed floorFps ~25-30
  during transitions — if UI-thread drops persist in release, part of the jank is
  Fabric mount cost, which JS scheduling alone cannot fix; the fix there is mount
  reduction: pre-mounted shells + progressive hydration, R2-C1 precedent).
- Which flows violate L-1 in release at all — schedule only what measurably hurts.

## 4. Execution sketch (post-baseline, post-ratification)

- S1: the engine's `scheduleTransitionWork` + frame-budgeted executor + specs
  (supersession cancels; budget yields; phase ordering).
- S2: move the measured top offender into the reveal-critical class (likely row
  preparation / marker projection off the press-up window).
- S3: sweep the remaining offenders by measured rank; L-1 becomes a release-lane
  asserted gate (the sampler protocol from the baseline, run per leg).
