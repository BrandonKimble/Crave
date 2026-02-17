# Search JS Run-1 Handoff Burst Breaker Plan

Last updated: 2026-02-15
Status: Implementation-ready
Scope: `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`

## 1) Objective

Raise JS floor by eliminating the run-1 commit burst during hydration -> marker reveal handoff and by shrinking the largest single hydration commit spans that remain after burst separation.

Definition of done:

- run-1 worst JS frame decreases materially versus immediate pre-change control,
- overlapping commit pressure during run-1 worst window is reduced for:
  - `SearchScreen`
  - `SearchMapTree`
  - `SearchResultsSheetTree`
  - `SearchOverlayChrome`
  - `BottomNav`
- top heavy-component single commit span in run-1 worst window is reduced materially,
- no UX parity regressions.

## 2) Confirmed Causal Model

What we know from current evidence:

- worst run-1 frame repeatedly occurs in `marker_reveal_state` / `visual_sync_state`,
- explicit map/list compute contributors are too small to explain 400ms+ spikes,
- overlapping commit bursts across screen/map/sheet/chrome/nav are present in the same run-1 window.
- a large hydration-related commit window (~87-111ms observed) remains and must be reduced in size.

Therefore the primary target is scheduling/commit fanout, not map math.

## 3) UX Contract (Non-negotiable)

Behavior to preserve:

- sheet appears quickly when search intent is acknowledged,
- map camera remains stable unless user/system explicitly requests movement,
- marker reveal still feels immediate,
- **bottom-nav slide-down/hide/show transition is visual-critical** and must remain responsive,
- no stale-result flash,
- no drag/gesture hitching.

Important nuance:

- bottom-nav animation is critical,
- bottom-nav heavy subtree updates are not.
- We keep nav transform animation live while deferring non-essential nav/chrome recomputation during handoff.

## 4) Strict Handoff Phases (Frame-Budgeted)

Target frame budget:

- each phase should avoid co-committing more than one heavy domain in a frame,
- practical budget target per interactive frame: ~16ms.

### Phase H0: Intent Ack (frame 0)

Allowed:

- loading + sheet shell visibility,
- lightweight map/screen shell updates.

Deferred:

- non-critical chrome/meta writes.

### Phase H1: Phase-A Commit (frame 0/1)

Allowed:

- initial `setResults` (phase-A preview),
- `setActiveTab` if needed for visible correctness,
- start visual sync candidate.

Deferred:

- submitted query text update,
- pagination metadata writes,
- non-critical overlay/nav updates.

### Phase H2: Marker Reveal (next frame)

Allowed:

- marker reveal transition and map visual release path,
- minimal list visibility required for parity.

Blocked during H2:

- `SearchResultsSheetTree` non-critical header/chrome recomputation,
- `SearchOverlayChrome` non-critical reflows,
- `BottomNav` non-essential prop-driven content updates (animation stays live).

### Phase H3: Hydration Ramp (next frame)

Allowed:

- phase-B list hydration ramp and commit,
- chunked list growth.

Still deferred:

- low-priority metadata/history writes.

### Phase H4: Chrome/Meta Resume (+1 frame after reveal settled)

Allowed:

- `submittedQuery`, `hasMore*`, `currentPage`, `isPaginationExhausted`,
- history refresh/secondary updates,
- full chrome/nav/sheet behavior resumes.

Locked timing:

- `H4` starts exactly one frame after marker reveal settles.
- settle source is **runtime marker-reveal completion signal**, not timeout fallback.
- fallback timers may preserve UX safety only; they must not advance handoff phase.

### 4.1 Exact Phase Write Matrix (Function/Setter Level)

This matrix is authoritative for run-1 page-1 handoff. Any write outside allowed phase is a contract violation.

`/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`:

- `setResults(...phaseAResponse...)` (near `:820`) -> allowed in `H1` only.
- `setActiveTab(...)` (near `:842`, `:848`) -> allowed in `H1` only.
- `onPageOneResultsCommitted?.()` (near `:838`) -> allowed in `H1`, must emit visual candidate before `H2`.
- `emitShadowTransition('visual_released', ...)` (near `:910`) -> marks start of `H2`.
- phase-B full apply `setResults(...normalizedResponse...)` (near `:960-971`) -> allowed in `H3` only.
- `setSubmittedQuery(...)` (near `:938-940`) -> blocked in `H1/H2/H3`, allowed in `H4`.
- `setHasMoreFood(...)`, `setHasMoreRestaurants(...)`, `setCurrentPage(...)` (near `:944-947`) -> blocked in `H1/H2/H3`, allowed in `H4`.
- `loadRecentHistory(...)` / history refresh (near `:1064-1067`) -> blocked in `H1/H2/H3`, allowed in `H4`.

`/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`:

- marker reveal gating (`shouldHoldMapMarkerReveal`, `markersRenderKey`, `markVisualRequestReady` near `:3900-3958`) -> `H2` critical path.
- heavy subtree recompute inputs (`SearchOverlayChrome`, `SearchResultsSheetTree`, `BottomNav` near `:5325-5453`) -> non-critical prop churn blocked in `H2/H3`, resumed in `H4`.

Enforcement behavior:

- dev/test: write-matrix violations throw and emit `handoff_phase_violation`.
- prod: violating write is dropped, logged, and counted (no crash).
- strict phase-write enforcement applies to `shortcut` run-1 page-1 only in this tranche.
- `natural`/`entity` paths stay shadow-instrumented first, then opt into strict enforcement later.

## 5) Ownership Model

No rollback of architecture ownership.

- Keep domain owners distributed (submit/map/sheet/chrome/nav).
- Add one narrow run-1 handoff coordinator to sequence owners during H1-H4.
- coordinator phase state is single-owned in runtime controller; root/UI reads phase and must not
  independently derive/advance phase from local booleans.
- Use one shared frame-budget coordinator for heavy work:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/frame-budget-governor.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/runtime-work-scheduler.ts`
- Rule: heavy domain writes must flow through scheduler lanes; ad-hoc `setTimeout`/`requestAnimationFrame` chains are allowed only for visual-critical shell animation.

Coordinator responsibility:

- publish current handoff phase,
- gate non-critical commits in other domains based on phase.
- enforce frame budget with lane priority order:
  - `phase_a_commit`
  - `selection_feedback` (marker reveal)
  - `phase_b_materialization` (hydration/list ramp)
  - `overlay_shell_transition` + chrome/meta follow-up

### 5.1 Coordinator Contract Semantics (Reset/Cancel/Supersede/Append/Error/Retry)

Coordinator keys:

- `sessionId`, `operationId`, `seq`, `phase`.

Rules:

1. New submit supersede:
   - immediately cancel queued/running tasks for previous `operationId` in lanes:
     - `selection_feedback`
     - `phase_b_materialization`
     - `overlay_shell_transition`
   - allow only in-flight visual shell animation to finish.
2. Append:
   - allowed only if append identity matches active request identity.
   - mismatch -> cancel append path and start fresh submit operation.
   - mismatch behavior is silent refresh (no toast/banner).
3. Error:
   - transition to `idle`.
   - clear pending tasks for failed `operationId`.
4. Retry:
   - always create new `operationId` and increment `seq`.
   - restart from `H0` (never in-place retry of old operation).
5. Reset:
   - on clear/cancel/navigation-away, cancel all pending scheduler tasks and reset phase to `idle`.

Execution safety rule:

- queued callbacks (`requestAnimationFrame`, `InteractionManager`, scheduler tasks) must carry
  `operationId` and no-op if active tuple no longer matches at execution time.

### 5.2 Adaptive Backpressure Policy

Backpressure levels are computed each frame from governor stats + queue depth:

- `healthy`: scheduler spent <= `8ms`, queue depth <= `2`, no yield.
- `pressured`: scheduler spent `>8ms` or queue depth `>2` or yielded in previous frame.
- `critical`: scheduler spent `>12ms` or two consecutive yields.

Locked threshold:

- keep soft/hard thresholds at `8ms / 12ms` for this tranche.

Adaptive behavior:

- `healthy`:
  - hydration step rows = `4` (cap by remaining rows),
  - map publish may advance one stage (`dots->pins->labels`).
- `pressured`:
  - hydration step rows = `2`,
  - map labels deferred, pins allowed.
- `critical`:
  - hydration step rows = `1` or paused one frame,
  - map publish restricted to dots/pins only,
  - chrome/meta lanes paused until pressure drops to `pressured` or `healthy`.

Adaptive burst-fallback (commit-span pressure):

- detect run-1 handoff commit-span pressure when top heavy-component commit span in the active
  worst-window exceeds `80ms` (default threshold).
- on breach:
  - delay `H4` by one extra frame (only for current run-1 operation),
  - force hydration step rows to `1` for next two scheduler frames,
  - keep nav transform animation live (no visual freeze of motion path).
- this fallback is additive safety, not a replacement for B2.5 commit-size reduction.

### 5.3 Scheduler Execution Model (Locked)

Scheduler loop:

- use persistent RAF-driven drain loop while queue is non-empty.
- stop loop when queue reaches empty state.

Task-cost model for governor:

- lane-default estimated cost is used on enqueue.
- scheduler updates estimates with EMA from observed task durations.
- `canRun` uses current lane estimate, not static constants only.

Starvation guard:

- apply max deferred-frame guard per lane.
- default guard:
  - `selection_feedback`: max 2 deferred frames,
  - `phase_b_materialization`: max 6 deferred frames,
  - `overlay_shell_transition`: max 8 deferred frames.
- on guard breach, force run next eligible frame.

Setter enforcement point:

- enforce phase write-matrix via centralized guard helpers in
  `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`.
- do not rely on scattered inline per-setter checks.

## 6) Concrete Code Changes

## 6.1 `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`

Primary owner of response fanout (`handleSearchResponse`).

Changes:

1. Introduce explicit handoff phase emissions for run-1 page-1 path:

   - `handoff_phase: h1_phase_a_committed`
   - `handoff_phase: h2_marker_reveal`
   - `handoff_phase: h3_hydration_ramp`
   - `handoff_phase: h4_chrome_resume`
   - emissions must target runtime handoff coordinator owner (not root setter callback).

2. Keep phase-A minimal:

   - `setResults` + visible-tab correctness only.

3. Move non-critical root writes (`setSubmittedQuery`, pagination meta) behind H4 gate.

4. Ensure phase-B hydration apply starts after marker reveal phase starts, not in same heavy commit window.

5. Remove stale A/B/C/D probe branches from this file.

6. Replace local frame/deferred helpers with scheduler-lane dispatch:
   - current local helpers to retire:
     - `runDeferredTupleMutation` (near `:754`)
     - `scheduleAfterFrames` (near `:785`)
   - new dependency to add to hook args:
     - `runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>`
   - lane mapping in `handleSearchResponse`:
     - phase-A apply -> `phase_a_commit`
     - marker reveal release -> `selection_feedback`
     - hydration apply -> `phase_b_materialization`
     - `setSubmittedQuery` + pagination/meta -> `overlay_shell_transition`
   - each scheduled task must carry `operationId` for cancellation on supersede.
   - append/retry paths must use same scheduler contract and identity checks.

## 6.2 `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`

This is where heavy trees currently co-commit.

Changes:

1. Add handoff-phase state read and derived freeze flags:

   - `isRun1HandoffActive`
   - `isChromeDeferred` (true in H2/H3)
   - derive from runtime coordinator snapshot/selector, not root-local source-of-truth state.

2. Gate heavy subtree participation while preserving visual parity:
   - `SearchResultsSheetTree`: keep shell + core list path, defer non-critical header/chrome churn,
   - `SearchOverlayChrome`: keep essential visibility/animation, defer optional surface/layout churn,
   - `BottomNav`: keep animation/transform active, defer non-essential content recompute.

2a. Freeze boundaries by subtree (exact scope):

- `SearchOverlayChrome` (`/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:5325`):
  - freeze suggestion/result metadata props and optional panel richness in `H2/H3`,
  - do not freeze overlay visibility or gesture/interaction handlers.
  - do not fully freeze suggestion surface interaction.
- `SearchResultsSheetTree` (`/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:5417`):
  - freeze header/chrome recomposition and non-essential footer richness in `H2/H3`,
  - keep shell mount, drag/snap wiring, and core row rendering live.
- `BottomNav` (`/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:5439`):
  - keep `bottomNavHideProgress` animation live,
  - freeze non-critical content/label/icon recompute in `H2/H3`.

Locked freeze implementation style:

- use explicit frozen-props read-models with stable object identity per subtree.
- do not use broad conditional JSX branching as primary freeze mechanism.

3. Keep map visual-ready contract intact (`resultsVisualSyncCandidate`, `markVisualRequestReady`).

   - `index.tsx` must consume (not derive) phase transitions from coordinator.
   - `shouldHoldMapMarkerReveal` and timeout paths cannot directly advance to `H4`.

4. Keep run-scoped profiler and stall correlation hooks only:

   - profiler attribution,
   - profiler span logs,
   - stall probe,
   - all run-scoped via `runNumber` + `harnessRunId`.

5. Wire scheduler/governor from runtime composition into search submit + panel spec:

   - add `runtimeWorkSchedulerRef` to composition destructure (around current composition call near `:350-357`),
   - pass scheduler ref into `useSearchSubmit(...)`,
   - pass handoff phase and freeze flags into `useSearchResultsPanelSpec(...)`.

6. Preserve visual-critical nav motion while deferring non-critical nav subtree recompute:
   - keep `bottomNavHideProgress` timing path active (near `:1414-1421`),
   - only defer low-priority prop/content updates during H2/H3.

## 6.3 `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`

Changes:

1. Keep staged publish (`dots -> pins -> labels`) behavior for handoff smoothing.

2. Ensure marker reveal path is prioritized during H2 and not forced to share frame with deferred chrome/meta work.

3. Remove stale reconcile-freeze probe branch(es) not used by final verification.

4. Replace fixed `setTimeout` staged publish timers with scheduler-aware steps:
   - current timer-based block is around `:1377-1393`,
   - schedule phase transitions as low-cost `selection_feedback` tasks,
   - on budget pressure, postpone labels before pins (never reverse).
   - skip/resume rules:
     - if pressure is `critical`, hold at dots/pins and queue label stage for next `healthy` frame,
     - if operation superseded, drop pending label stage tasks,
     - never regress order (`labels` cannot run before `pins`).
   - locked stage promotion policy:
     - dots are always first and never skipped,
     - pins may run in `healthy` and `pressured`,
     - labels run only in `healthy`.
     - labels resume only after two consecutive `healthy` frames.
5. Emit explicit `marker_reveal_settled` handoff signal from map transition completion.
   - this event is the authoritative unlock for `H4` (+1 frame).
   - visual-ready fallback timeout cannot emit `marker_reveal_settled`.

## 6.4 `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-results-panel-spec.tsx`

Changes:

1. Introduce handoff-aware lightweight mode for H2/H3:

   - keep core rows rendering,
   - defer non-critical header/chrome recomputation and low-priority adornments,
   - avoid unnecessary list header churn until H4.

2. Keep hydration ramp path active and chunked.

3. Accept and apply handoff freeze contract:
   - add `isRunOneChromeDeferred` arg,
   - when true, keep core list rows + shell, defer optional header/chrome recompute,
   - avoid header title recomposition churn while deferred.

## 6.5 `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts`

Changes:

1. Keep run-scoped correlation support stable:

   - `getActiveShortcutRunNumber`,
   - harness run id propagation,
   - no pre-run event pollution.

2. Include scheduler pressure signals in emitted run payload:
   - lane deferral count,
   - yield count,
   - queued task max depth during run.
   - overlap-gate summary fields when present.
   - field names must be stable for gates:
     - `schedulerYieldCount`
     - `schedulerLaneDeferrals`
     - `schedulerMaxQueueDepth`

## 6.6 `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/*` and `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-runtime-composition.ts`

Changes:

1. Add `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/frame-budget-governor.ts`.

   - implement `FrameBudgetGovernor` with:
     - `beginFrame(frameStartMs: number): void`
     - `canRun(lane: RuntimeWorkLane, estimatedCostMs: number): boolean`
     - `recordRun(lane: RuntimeWorkLane, durationMs: number): void`
     - `shouldYield(): boolean`
     - `snapshot(): { frameCount; yieldCount; laneDeferrals }`
   - budget policy:
     - target frame: `16.67ms`,
     - reserved headroom: `>=4ms`,
     - scheduler work budget: soft `<=8ms`, hard `<=12ms`.

2. Upgrade `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/runtime-work-scheduler.ts`.

   - extend task model:
     - `estimatedCostMs?: number`
     - `phase?: 'h1' | 'h2' | 'h3' | 'h4'`
   - add loop APIs:
     - `startFrameLoop()`
     - `stopFrameLoop()`
     - `drainFrame(): { executed; yielded; deferred }`
     - `cancelLaneTasksByOperation(operationId, lane?)`
     - `snapshotPressure()`
   - use governor before each task dispatch; defer when budget exhausted.

3. Update `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`.

   - constructor accepts shared scheduler instance (already accepts scheduler; keep shared singleton from composition),
   - hydration ramp uses scheduler-governed stepping instead of standalone timing loop as control source,
   - keep cancellation semantics via `operationId`.
   - `resultsHydrationKey` is data-version key only, not cancellation authority.
   - do not schedule/cancel using hydration key as operation identity.

4. Update `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-runtime-composition.ts`.
   - instantiate one `FrameBudgetGovernor` and one `RuntimeWorkScheduler`,
   - pass scheduler into `createPhaseBMaterializer(scheduler)`,
   - instantiate and return `runOneHandoffCoordinatorRef`,
   - return `runtimeWorkSchedulerRef` (and governor snapshot accessor if needed) to index/hook consumers.

## 6.7 `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx` + `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`

Goal: shrink the largest single hydration commit (`results_hydration_commit`) after burst separation.

Changes:

1. Split hydration finalization into two scheduler-controlled steps (same `operationId`):
   - `h3_hydration_key_commit`: commit hydration identity/version transition only.
   - `h3_hydration_rows_release`: release remaining rows/chrome-sensitive list richness on subsequent frame budget.
2. Avoid one-frame global release:
   - do not combine hydration key commit and full row-limit release in same frame.
   - maintain shell + core rows, then ramp remaining rows in budgeted steps.
3. Make phase-B materializer expose explicit finalize APIs:
   - `scheduleHydrationFinalizeKeyCommit(...)`
   - `scheduleHydrationFinalizeRowsRelease(...)`
   - both lane=`phase_b_materialization`, both cancellable by `operationId`.
4. In read-model selector runtime:
   - keep `hydrationRowsLimit` constrained through key commit frame.
   - release to full only via scheduled rows-release step(s), never via immediate null flip in same commit.
5. Instrument commit-span contributor labels for this path:
   - `hydration_finalize_key_commit`
   - `hydration_finalize_rows_release`
     so B2.5 can prove commit-size reduction and not only overlap redistribution.

## 7) Implementation Slices

### Slice B0: Cleanup + Guardrails

- delete stale probe branches (A/B/C/D),
- keep only run-scoped attribution hooks,
- ensure no pre-run stall/profiler noise.

Exit:

- lint/no-bypass pass,
- unchanged UX behavior,
- diagnostics still available.

### Slice B1: Coordinator + Phase Signals

- add run-1 handoff phase signal publication/consumption,
- add frame-budget governor + scheduler loop plumbing (no heavy behavior cutover yet),
- wire scheduler into runtime composition and submit/materializer owners.
- wire explicit `marker_reveal_settled` runtime event path (map -> coordinator).

Exit:

- phase signal visible in logs,
- `marker_reveal_settled` events visible and correlated to run-1/harness ids,
- scheduler pressure metrics visible in harness payload,
- no regressions.

### Slice B2: Commit-Burst Breaker (Core)

- enforce H1-H4 gate order,
- move `handleSearchResponse` deferred writes from ad-hoc timers to scheduler lanes,
- defer non-critical chrome/sheet/nav commits during H2/H3,
- preserve nav slide animation.

Exit:

- run-1 worst-frame improvement vs immediate control,
- reduced overlap totals for core heavy components.

### Slice B2.5: Hydration Commit Shrink (Single-Commit Reduction)

- shrink largest single run-1 hydration commit span after B2 separation,
- split hydration finalization into key-commit then rows-release steps,
- keep core shell/list parity while reducing `results_hydration_commit` burst size.

Exit:

- median top heavy-component commit span in run-1 worst-window improves vs immediate control,
- no heavy component max commit-span regression > `+10%` median,
- run-1 worst-frame does not regress while commit span is reduced.

### Slice B3: Sheet Header/Chrome Trimming

- reduce `SearchResultsSheetTree` optional churn during handoff,
- convert map staged publish timers to scheduler-governed stage steps,
- keep shell/list parity.

Exit:

- additional overlap reduction and/or run-1 frame improvement.

### Slice B4: Stabilization

- remove dead branches,
- lock minimal attribution hooks for regression checks.
- ensure no direct heavy writes bypass scheduler in run-1 path.
- activate strict multi-run policy for shortcut (run-1 strict + run-2/run-3 non-regression required).

Exit:

- clean runtime path with no temporary branches left.

### Slice B5: Promotion + CI Enforcement Wiring

- add overlap gate evaluation as hard pass/fail in local promotion script.
- add commit-span gate evaluation as hard pass/fail in local promotion script.
- wire CI job to fail when overlap or commit-span gate fails.
- preserve catastrophic gate and no-bypass guard as blocking checks.
- enforce this in both PR and main workflows.

Exit:

- local `promote-slice` fails on overlap or commit-span regression,
- CI surfaces overlap/commit-span failures as blocking.

## 8) Validation Protocol (Per Slice)

Required each slice:

- `yarn eslint <touched files>`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

Perf verification command (run twice):

- `EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION=1 EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG=1 bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh gate`

Overlap verification command (run after matched gates):

- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-overlap-gate.sh --control <control_candidate_log> --candidate <candidate_log_a> --candidate <candidate_log_b> --components SearchScreen,SearchMapTree,SearchResultsSheetTree,SearchOverlayChrome,BottomNav`

Commit-span verification command (run after matched gates):

- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-commit-span-gate.sh --control <control_candidate_log> --candidate <candidate_log_a> --candidate <candidate_log_b> --components SearchScreen,SearchMapTree,SearchResultsSheetTree,SearchOverlayChrome,BottomNav`

Primary stall-kill verification (required in corrective tranche):

- compare immediate control vs candidate on:
  - run-1 worst `maxFrameMs`,
  - run-1 JS-window count `>80ms`,
  - run-1 JS-window count `>50ms`,
  - dominant worst stage.
- stall metrics are primary keep/revert criteria.
- overlap and commit-span are secondary diagnostics/guardrails in this tranche.

Locked overlap gate math:

- aggregate using median of two matched candidate runs.
- evaluate component deltas independently, then enforce global policy.

Locked overlap window:

- overlap is computed only inside run-1 worst JS window
  (`windowStart = nowMs - windowMs`, `windowEnd = nowMs`).
- do not use full run-1 duration for gating.

Locked commit-span window:

- commit-span evaluation uses the same run-1 worst JS window as overlap gating.
- aggregate decision uses median of two matched candidate runs.

Locked commit-span policy:

- required directional signal: median top heavy-component commit span must improve vs immediate control.
- hard regression guard: no heavy component median max-commit-span may regress by more than `+10%`.
- default improvement target for B2.5: `>=10%` reduction in median top heavy-component commit span.

Capture for each run:

- compare JSON path,
- candidate JSON path,
- candidate log path,
- run-1 worst frame ms + stage,
- run-1 count of JS windows `>80ms`,
- run-1 count of JS windows `>50ms`,
- top overlapping profiler spans in worst run-1 window.
- overlap-gate JSON summary path.
- top heavy-component commit span in worst run-1 window.
- commit-span-gate JSON summary path.

## 9) Success Criteria

Do not use gate PASS alone.

A slice is successful in corrective tranche only if all hold:

1. run-1 worst-frame `maxFrameMs` improves vs immediate pre-change control.
2. run-1 JS windows `>80ms` do not regress and trend downward.
3. run-1 JS windows `>50ms` do not regress and trend downward.
4. overlap gate is non-regressive; preferred pass.
5. commit-span gate is non-regressive; preferred pass.
6. run-2/run-3 are non-regressive on catastrophic counts for shortcut mode.
7. for non-shortcut mode slices, no regression in floor/stall metrics beyond comparator thresholds.

Target outcome for this mission:

- drive run-1 worst-frame toward `<50ms` with sustained downward trend across matched gates.

## 10) Rollback Conditions

Rollback/disable slice if any:

- visible UX parity break,
- gesture/sheet responsiveness regression,
- repeated run-1 catastrophic worsening vs control,
- marker reveal visually delayed beyond acceptable threshold.
- overlap gate persistent failure over two consecutive implementation attempts.
- commit-span gate persistent failure over two consecutive implementation attempts.
- no run-1 stall improvement after two consecutive micro-clusters (`maxFrameMs` flat/worse).

Runtime kill switches (all default `1`/enabled):

- `EXPO_PUBLIC_SEARCH_RUNTIME_HANDOFF_GOVERNOR_ENABLED`
  - master gate; when `0`, bypass new scheduler-based handoff orchestration.
- `EXPO_PUBLIC_SEARCH_RUNTIME_SCHEDULER_ENABLED`
  - toggles frame-budget scheduler loop; fallback to existing deferred behavior.
- `EXPO_PUBLIC_SEARCH_RUNTIME_MAP_STAGE_GOVERNOR_ENABLED`
  - toggles map staged publish budget control.
- `EXPO_PUBLIC_SEARCH_RUNTIME_CHROME_FREEZE_ENABLED`
  - toggles H2/H3 subtree freeze behavior.

Rollback policy:

- disable smallest-scope flag first (`map` or `chrome`) before master.
- if master is disabled, keep diagnostics and overlap gate reporting enabled.

Locked fallback behavior when scheduler is disabled:

- keep run-1 handoff phase coordinator active.
- keep diagnostics and overlap instrumentation active.
- fallback only execution strategy (deferred scheduling), not phase protocol.

## 11) Immediate Next Task

Enter STALL-KILL corrective tranche now (B5 infrastructure is already implemented).

Immediate sequence:

1. run two matched control gates,
2. apply one micro-cluster focused on run-1 worst-window stall reduction,
3. validate with two matched gates + overlap + commit-span summaries,
4. keep only if stall metrics improve; otherwise revert and try next micro-cluster.

Priority micro-cluster order:

1. `SearchOverlayChrome` non-critical churn isolation during H2/H3,
2. `SearchMapTree` non-critical update isolation during run-1 worst window,
3. hydration finalize separation (no same-frame finalize + chrome/map heavy work),
4. stage=`none` heavy-write deferral into governed phases.

## 12) Line-by-Line Execution Script (Authoritative)

Use this section as the execution script. Do not skip steps or reorder slices.

### 12.0 Pre-flight Control (required before any code edit)

1. Run control with run-scoped attribution enabled:
   - `EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION=1 EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG=1 bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh gate`
2. Record these artifact paths:
   - compare JSON
   - candidate JSON
   - candidate log
3. Extract control evidence from candidate log:
   - run-1 worst `maxFrameMs` and `shortcutStage`
   - top overlapping `profiler_span` contributors in the same run-1 worst-frame window.
   - top heavy-component single `commitSpanMs` in the same run-1 worst-frame window.
4. This control is the only baseline for judging the next slice result.

### 12.1 Slice B0 Script: Cleanup + Guardrails

Goal: remove stale probe branches and keep only run-scoped diagnostics needed for verification.

1. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts` (anchor block around `PHASE_A_RESPONSE_ROW_LIMIT` and `RUN_ONE_HANDOFF_*` constants; currently near `:248-254`).
   - Remove temporary JS-floor probe-only constants and branches:
     - `JS_FLOOR_PROBE_PHASE_A_ROW_LIMIT`
     - `JS_FLOOR_PROBE_PHASE_B_APPLY_DELAY_MS`
     - `JS_FLOOR_PROBE_SKIP_PHASE_B_APPLY`
   - Keep `RUN_ONE_HANDOFF_CHROME_STAGE_FRAMES` and `RUN_ONE_HANDOFF_PHASE_B_STAGE_FRAMES`.
2. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts` in `handleSearchResponse` (anchor around `buildPhaseAPreviewResponse`; currently near `:739-747`).
   - Always use `PHASE_A_RESPONSE_ROW_LIMIT` for phase-A preview row limit.
3. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts` in deferred phase-B apply scheduling (anchor around `:955-983`).
   - Remove JS-floor probe special path (`setTimeout + probe delay`).
   - Keep one production path: `scheduleAfterFrames(...) -> InteractionManager.runAfterInteractions(...) -> requestAnimationFrame(setResults)`.
4. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx` (anchor around staged publish constants and effect; currently near `:126-130` and `:1373-1393`).
   - Remove stale probe-only publish timing toggles that exist only for A/B/C/D experiments.
   - Keep one staged publish behavior (`dots -> pins -> full`) used by runtime.
5. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` profiler/stall diagnostics (anchor around `handleProfilerRender` `:3108-3190` and stall probe block `:3542-3600`).
   - Keep only these diagnostics:
     - profiler attribution
     - profiler span log
     - stall probe
   - Ensure each emitted event includes `runNumber` and `harnessRunId`.
   - Ensure no pre-run noise: if active run is null, do not emit.
6. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts` (anchor around `getActiveShortcutRunNumber`; currently near `:207-213`).
   - Preserve run scoping contract:
     - return `null` when no active run
     - no fabricated run numbers outside active harness windows.
7. Validate:
   - `yarn eslint <touched files>`
   - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`
   - run two matched gates with the two profiler flags.

### 12.2 Slice B1 Script: Run-1 Handoff Phase Coordinator

Goal: introduce explicit handoff phase signaling without changing visible behavior yet.

1. Create `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/run-one-handoff-phase.ts`.
   - Add:
     - `type RunOneHandoffPhase = 'idle' | 'h1_phase_a_committed' | 'h2_marker_reveal' | 'h3_hydration_ramp' | 'h4_chrome_resume'`
     - `const isRunOneHandoffDeferredChromePhase = (phase) => phase === 'h2_marker_reveal' || phase === 'h3_hydration_ramp'`
2. Create `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/run-one-handoff-coordinator.ts`.
   - Add owner API:
     - `beginOperation(operationId, seq, page)`
     - `advancePhase(phase, metadata?)`
     - `getSnapshot()`
     - `subscribe(listener)`
     - `reset(operationId?)`
   - enforce monotonic phase progression (`idle -> h1 -> h2 -> h3 -> h4 -> idle`).
   - reject stale operation phase updates.
3. Create `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/frame-budget-governor.ts`.
   - Add `FrameBudgetGovernor` and `FrameBudgetGovernorSnapshot`.
   - Minimum methods required:
     - `beginFrame`
     - `canRun`
     - `recordRun`
     - `shouldYield`
     - `snapshot`
4. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/runtime-work-scheduler.ts`.
   - Add governor dependency in constructor.
   - Add `startFrameLoop` + `stopFrameLoop` + `drainFrame`.
   - Add per-task `estimatedCostMs` and budget-aware deferral.
5. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-runtime-composition.ts`.
   - Instantiate one governor + one scheduler.
   - Pass scheduler to `createPhaseBMaterializer(scheduler)`.
   - Instantiate and return `runOneHandoffCoordinatorRef`.
   - Return `runtimeWorkSchedulerRef`.
6. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts` args type (anchor in `UseSearchSubmitArgs`; currently near `:80-128`).
   - Add coordinator arg:
     - `runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>`
   - Add scheduler arg:
     - `runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>`
7. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` phase consumption block (anchor around visual sync state near `:786-815`).
   - Read `runOneHandoffPhase` from coordinator using subscription snapshot (no root-writer callback).
   - Derive `isRun1HandoffActive` and `isChromeDeferred` from coordinator phase only.
8. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` call into `useSearchSubmit` (anchor near `:4081-4133`).
   - Pass `runOneHandoffCoordinatorRef`.
   - Pass `runtimeWorkSchedulerRef`.
9. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts` in `handleSearchResponse` only for signal emission.
   - Emit phase transitions for run-1 page-1 path:
     - after `phase_a_committed` shadow event accepted -> `h1_phase_a_committed`
     - before marker reveal work begins -> `h2_marker_reveal`
     - before phase-B hydration ramp scheduling -> `h3_hydration_ramp`
     - after `marker_reveal_settled` + one frame -> `h4_chrome_resume`
   - Do not gate behavior in this slice.
   - Remove any timeout-based direct `h4` advancement from submit/root logic.
10. Validate:

- `yarn eslint <touched files>`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`
- two matched gates with profiler flags; verify phase signal and scheduler snapshot fields appear in logs.

### 12.3 Slice B2 Script: Commit-Burst Breaker (Core)

Goal: enforce frame-separated commit domains during run-1 handoff.

1. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts` in non-append run path (anchor around `:905-995`).
   - Keep `phase_a_committed` write as H1.
   - Set H2 before `visual_released`.
   - Move non-critical chrome/meta writes into H4 apply function.
   - Start phase-B scheduling in H3 and ensure it cannot land in the same frame as H2 reveal.
   - Replace:
     - `runDeferredTupleMutation(...)`
     - `scheduleAfterFrames(...)`
       with scheduler tasks carrying lane + `operationId`.
2. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` map reveal gating block (anchor near `:3900-3958`).
   - Keep marker visual-ready logic intact.
   - Ensure H2 reveals markers first; do not couple with deferred chrome/meta updates.
   - Advance to `H4` only from coordinator after map emits `marker_reveal_settled` + one RAF.
3. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` render tree gating (anchor near `:5325-5453`).
   - Introduce derived booleans:
     - `isRunOneHandoffActive`
     - `isChromeDeferred` from handoff phase.
   - Keep animation live:
     - nav hide/show transform stays active.
   - Defer non-critical subtree churn in:
     - `SearchOverlayChrome`
     - `SearchResultsSheetTree`
     - `BottomNav` content-only updates (not transform/visibility animation).
4. Validate with two matched gates and compare to immediate control.
   - Success requires reduced run-1 worst-frame pressure and overlap contributor totals.

### 12.3a Slice B2.5 Script: Hydration Commit Shrink (Single-Commit Reduction)

Goal: reduce the largest single run-1 hydration commit span, not just overlap concurrency.

1. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`.
   - Add finalize APIs:
     - `scheduleHydrationFinalizeKeyCommit(...)`
     - `scheduleHydrationFinalizeRowsRelease(...)`
   - Ensure both tasks are scheduled in `phase_b_materialization` lane with shared `operationId`.
2. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`.
   - Keep `hydrationRowsLimit` constrained through hydration key commit frame.
   - Move full rows release behind scheduled finalize rows-release step(s).
   - Prevent immediate same-frame `hydrationRowsLimit -> null` + hydration key commit burst.
3. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` or submit handoff coordinator integration points.
   - Apply adaptive fallback hook:
     - if top run-1 commit span crosses threshold, delay `H4` one extra frame and lower hydration step rows for two frames.
4. Add/keep attribution labels for B2.5 verification:
   - `hydration_finalize_key_commit`
   - `hydration_finalize_rows_release`
5. Validate with two matched gates + overlap gate + commit-span gate.
   - Success requires top heavy-component commit span reduction in run-1 worst window without UX parity regressions.

### 12.4 Slice B3 Script: Sheet/Header/Chrome Trimming

Goal: reduce non-critical sheet/chrome recomputation in H2/H3 without changing perceived UX intent.

1. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-results-panel-spec.tsx` args type and function params (anchor near `:120-201`).
   - Add `isRunOneChromeDeferred: boolean`.
2. Edit same file at filter/header composition points (anchors around `filtersHeader` and `listHeader`; currently near `:219-396`).
   - In deferred phase:
     - keep shell and list body render path,
     - defer optional header/chrome adornments and expensive header recomposition.
3. Edit same file around selector wiring (anchor near `:405-443`).
   - Preserve `useSearchResultsReadModelSelectors` call.
   - Avoid extra recomputation keys when `isRunOneChromeDeferred` is true.
4. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` `useSearchResultsPanelSpec` call (anchor near `:5077-5145`).
   - Pass `isRunOneChromeDeferred`.
5. Edit `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx` staged publish block (anchor near `:1373-1393`).
   - Replace timer-based phase switches with scheduler-governed `selection_feedback` tasks.
   - Keep order strictly `dots -> pins -> labels`.
   - If budget pressure occurs, delay labels first.
6. Validate with two matched gates and overlap extraction.

### 12.5 Slice B4 Script: Stabilization and Lock

Goal: remove temporary branches and leave one clear runtime path.

1. Remove dead conditional branches introduced during B1-B3/B2.5 experiments.
2. Keep only minimal diagnostics needed for regression attribution:
   - profiler attribution
   - profiler span logs
   - stall probe
3. Confirm no dual control:
   - one owner for run-1 handoff phase signal,
   - consumers read phase and do not re-derive conflicting phase state.
4. Final validation:
   - `yarn eslint <touched files>`
   - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`
   - two matched gates with profiler flags
   - explicit before/after run-1 worst-frame + overlap report + top commit-span report.

### 12.6 Slice B5 Script: Overlap + Commit-Span Gate + Promotion Wiring

Goal: make overlap and single-commit-span criteria hard blocking in local promotion and CI.

1. Create `/Users/brandonkimble/crave-search/scripts/perf-shortcut-overlap-gate.sh`.
   - inputs:
     - control candidate log
     - matched candidate logs
     - heavy component set
   - outputs:
     - JSON summary with median overlap deltas per component
     - non-zero exit on regression policy violation.
2. Create `/Users/brandonkimble/crave-search/scripts/perf-shortcut-commit-span-gate.sh`.
   - inputs:
     - control candidate log
     - matched candidate logs
     - heavy component set
   - outputs:
     - JSON summary with median max-commit-span deltas per component
     - non-zero exit on regression policy violation.
3. Edit `/Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh`.
   - in `promote-slice`, call overlap gate after matched gate artifacts are produced.
   - call commit-span gate in same promotion pass.
   - fail promotion when overlap or commit-span gate fails.
   - both gates must run for both PR and main-targeted promotion flows.
4. Edit `/Users/brandonkimble/crave-search/.github/workflows/ci.yml`.
   - add blocking step for overlap gate and commit-span gate in search runtime contract workflow.
   - apply blocking behavior to PR and main branch runs.
5. Validate:
   - run local `promote-slice` once and verify overlap + commit-span gate fields in summary JSON.
   - run workflow lints/validation for modified YAML.

### 12.7 STALL-KILL Corrective Loop (Active Mission)

Goal: directly reduce run-1 stalls (`maxFrameMs`) using existing B5 infra as validation rails.

1. Run immediate control (two matched gates with profiler flags enabled).
2. Extract and record:
   - run-1 worst `maxFrameMs`,
   - run-1 windows `>80ms`,
   - run-1 windows `>50ms`,
   - worst stage.
3. Implement one micro-cluster only (single causal change set).
4. Run:
   - `yarn eslint <touched files>`
   - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`
   - two matched gates with profiler flags
   - overlap gate + commit-span gate summaries
5. Keep/revert decision:
   - keep only if stall metrics improved vs immediate control (`maxFrameMs` primary).
   - if flat/worse, revert micro-cluster and try next.
6. Repeat until run-1 worst frame is materially lower and trending toward `<50ms`.
7. Attempt `promote-slice B5` only after at least one clear stall-kill win.

## 13) Beyond Run-1 Policy

Phase rollout:

1. STALL-KILL corrective tranche (current):
   - run-1 strict stall reduction mission.
   - overlap/commit-span remain guardrails.
2. B0-B2.5:
   - strict run-1 optimization target.
   - run-2/run-3 must be non-regressive (catastrophic counts and stall metrics).
3. B3-B4:
   - strict run-1 + strict run-2/run-3 non-regression for shortcut mode.
4. Post-B5:
   - apply scheduler contract in this order:
     1. natural submit path
     2. entity submit path
   - require no-regression gates for non-shortcut paths before program completion.

Locked adoption mode:

- natural path: shadow mode first, then active cutover.
- entity path: shadow mode first, then active cutover.

## 14) Detail Standard for All Future Slices in This Plan

From this point forward, every new slice added to this document must include:

1. exact files to edit (absolute paths),
2. anchor symbols and current line ranges,
3. explicit writes to move/defer/delete,
4. event/order expectations (what must happen before/after),
5. required validation commands,
6. measurable success criteria tied to immediate control evidence.

A slice without this detail is not implementation-ready and should not be executed.
