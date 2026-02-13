# Frontend Runtime Re-Architecture Blueprint (V3, Executable)

Last updated: 2026-02-13 03:20  
Status: P0 tooling + P0.5 runtime/metric lock validated; implementation is ready for Slice S1  
Scope: `/Users/brandonkimble/crave-search/apps/mobile/src/**`  
Non-goal: backend architecture changes

## 0) Decision and Readiness

Decision: proceed with a full frontend runtime re-architecture.

Readiness verdict:

- architecture direction is correct,
- execution details were previously under-specified,
- this V3 document is the canonical implementation plan.

Execution prerequisites (current state):

1. live harness wiring is re-established in runtime code via `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`,
2. metric-definition contract is schema-locked between investigation reporting and parser/comparator outputs (`perf-shortcut-report.v1`),
3. migration ownership + delete-gate posture is defined in this plan and guarded by no-bypass tooling.

## 1) Product Contract (User-Visible Behavior Must Match)

This is the acceptance oracle for every migration slice.

Global invariants:

- no user-visible UX changes unless explicitly approved,
- no stale result flash after newer submit reaches phase-A commit,
- no map snap-back while user gesture is active,
- sheet drag/snap responsiveness remains equivalent to current behavior,
- tab/filter/pagination semantics remain unchanged.

### 1.1 Interaction Contracts (Authoritative)

| Interaction           | Required event order                                                                                                           | Synchronous JS budget                            | Cancellation precedence                                       | Visible parity rule                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| Shortcut submit       | `submit_intent -> submitting -> response_received -> phase_a_committed -> visual_released -> phase_b_materializing -> settled` | phase-A commit <= 1 frame target                 | newest submit cancels prior submit and dependent phase-B work | no full-screen blank between old/new results   |
| Natural/entity submit | same order as shortcut via mode adapters                                                                                       | same as shortcut                                 | newest submit wins across all search modes                    | no stale previous-query snapshot after phase-A |
| Map pan/zoom          | `gesture_start -> camera_user_controlled -> viewport_update -> map_read_model_update -> gesture_end -> settle`                 | camera gesture lane has strict priority          | user gesture overrides programmatic camera writes             | no active-gesture snap-back                    |
| Sheet drag/snap       | `drag_start -> drag_active -> snap_resolve -> settle`                                                                          | drag lane never blocked by search/map phase-B    | drag lane preempts phase-B                                    | no hitching caused by submit/map enrichment    |
| Filter mutation rerun | `filter_intent -> query_mutation_apply -> submit_intent -> ...`                                                                | filter apply stays lightweight                   | newest filter mutation wins                                   | chips reflect latest filter immediately        |
| Pagination append     | `end_reached -> page_request -> page_response -> append_phase_a -> append_phase_b -> settled`                                  | append cannot block active scrolling             | new submit cancels pending append                             | no duplicates, no stale append onto new query  |
| Overlay switch        | `overlay_intent -> shell_transition -> overlay_settled`                                                                        | shell transition isolated from heavy search work | newest overlay intent wins                                    | no overlay/search state bleed                  |

### 1.2 Performance Contract (Current Baseline + Target)

Current canonical signal from investigation log (`/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md`):

- floor is currently around `~3.27` on recent baseline,
- dominant bottlenecks: `results_hydration_commit` and `marker_reveal_state`.

Program objective:

- repeatable floor lift `> +20` from locked baseline, then continue toward `+25`.

Merge-blocking global gates:

- minimum completed runs `>=3` for both baseline and candidate reports,
- no catastrophic `>300ms` stage in `>=2/3` runs (JS and UI lanes),
- `floorMean` regression > `0.30` fails,
- `stallP95` regression > `10%` fails,
- `uiFloorMean` regression > `0.30` fails,
- `uiStallP95` regression > `10%` fails,
- baseline/candidate `harnessSignatureStable` must match,
- baseline/candidate environment parity (`launchTargetMode`, `runtimeTarget`, `launchPreferDevice`) must match,
- all required harness markers present,
- comparator inputs must share the same `schemaVersion`.

## 2) Current Frontend Reality (Code-Evidenced Map)

### 2.1 Runtime hotspots

| File                                                                                          | Signal                                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`                  | ~10k LOC, mixed orchestration + render + map + overlay    |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`  | heavy map query/label/control plane                       |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts` | broad response apply and submit fan-out                   |
| `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx`            | socket + fetch + autocomplete + UI in one module          |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Onboarding.tsx`                    | auth + step logic + animation orchestration in one module |

### 2.2 Concrete root-cause anchors

1. Root map writes in screen scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6877`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6878`

2. Full-catalog fallback candidate path:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:4841`

3. Root-owned hydration scheduling (`InteractionManager` + RAF):

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8565`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8585`

4. Broad response fan-out:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts:361`

5. Pre-request clear branch still present:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts:718`

### 2.3 Existing architecture assets to preserve

1. Overlay shell and snap persistence are strong:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/OverlaySheetShell.tsx`

2. Sheet interaction utility is already separable:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-sheet.ts`

3. Search session origin coordinator exists:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/session/use-search-session-coordinator.ts`

4. Edge-fade and marker LOD guardrails are documented and must be honored:

- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md`

### 2.4 Red-Team Reality Check (2026-02-13)

Current hard facts from repository inspection:

1. Harness plumbing files under `/Users/brandonkimble/crave-search/apps/mobile/src/perf/**` now have active runtime call sites in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` that emit `shortcut_loop_*` markers and JS/UI sampler events.
2. CI P0 jobs remain fixture-backed and validate parser/comparator/no-bypass wiring; live runtime perf is enforced through local gate flow (`scripts/perf-shortcut-local-ci.sh`) until hosted live perf CI is reintroduced.
3. Reported investigation snapshot metrics and parser-derived metrics can diverge unless metric definitions are explicitly version-locked.

## 3) Target Runtime System (Reverse-Engineered from UX)

### 3.1 Domain boundaries

Target boundaries:

- `features/search/runtime`: request lifecycle, submit orchestration, map/list/header/chip read-models,
- `features/overlay/runtime`: shell transitions, snap/scroll persistence, panel mount policy,
- `features/polls/runtime`: socket + fetch + autocomplete orchestration,
- `features/onboarding/runtime`: step state machine + auth lane + username lane,
- `features/profile/runtime`: selector-first profile actions,
- `platform/navigation-runtime`: bootstrap and gating ownership,
- `platform/telemetry-runtime`: production-safe event schema and counters.

### 3.2 Runtime event protocol (non-negotiable)

All state-mutating runtime events use one envelope.

```ts
export type RuntimeDomain =
  | 'search_session'
  | 'map_presentation'
  | 'overlay_shell'
  | 'list_sheet'
  | 'polls_runtime'
  | 'onboarding_runtime'
  | 'navigation_runtime';

export type RuntimeEvent<TType extends string = string, TPayload = unknown> = {
  domain: RuntimeDomain;
  type: TType;
  sessionId: string;
  operationId: string;
  seq: number;
  requestId?: string;
  atMs: number;
  payload: TPayload;
};
```

Acceptance rules:

- reducer accepts event only when `(sessionId, operationId, seq)` dominates current lane tuple,
- stale events are dropped and counted (`staleEventDropCount`),
- illegal transition emits `transitionViolation` and fails contract tests.

### 3.3 Search session state machine (authoritative)

States:

- `idle`
- `submitting`
- `receiving`
- `phase_a_ready`
- `phase_a_committed`
- `visual_released`
- `phase_b_materializing`
- `settled`
- `cancelled`
- `error`

Legal transitions only:

- `idle -> submitting`
- `submitting -> receiving | cancelled | error`
- `receiving -> phase_a_ready | cancelled | error`
- `phase_a_ready -> phase_a_committed | cancelled | error`
- `phase_a_committed -> visual_released | cancelled | error`
- `visual_released -> phase_b_materializing | settled | cancelled | error`
- `phase_b_materializing -> settled | cancelled | error`
- `settled -> submitting | idle`
- `cancelled -> submitting | idle`
- `error -> submitting | idle`

### 3.4 Lane priority and preemption

Runtime priority order:

1. `sheet_drag` and `user_camera_gesture`
2. `selection_feedback`
3. `phase_a_commit`
4. `overlay_shell_transition`
5. `phase_b_materialization`
6. `telemetry/non-critical logging`

Preemption rules:

- lane 1 preempts all lower lanes,
- new `submit_intent` cancels older search operation and all dependent phase-B work,
- overlay transitions may pause phase-B but do not cancel active submit operation.

### 3.5 Read-model architecture (frontend CQRS style)

Write model owners:

- `SearchSessionController` owns request phase transitions and operation tuple,
- `MapPresentationController` owns camera intent arbitration and map presentation tuple,
- `OverlayRuntimeController` owns overlay shell transition tuple.

Read models (pure projections):

- `ListReadModelBuilder`: sections, rows, pagination projection,
- `HeaderReadModelBuilder`: titles/counters/status strings,
- `ChipReadModelBuilder`: filter chip projection,
- `MapReadModelBuilder`: viewport subset and incremental marker diff payload.

UI rule:

- presentation components consume selectors only,
- no heavy derivation in JSX or screen-level callbacks.

## 4) Source-of-Truth Matrix (Current -> Target)

| Concern                            | Current source(s)                                                                                              | Target owner                                           | Delete gate                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| Query text and submitted label     | local Search state + store mix in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` | `SearchSessionController` write model + selector reads | no direct query submit writes in screen root             |
| Request lifecycle + response apply | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`                  | `SearchSessionController` + adapters                   | direct response fan-out branches removed                 |
| Map camera writes                  | screen root handlers in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`           | `camera-intent-arbiter`                                | no `setMapCenter`/`setMapZoom` in root map idle handlers |
| Marker candidateing                | screen-derived catalog fallback                                                                                | map index/query service                                | no `return markerCatalogEntries` candidate fallback path |
| Hydration/reveal scheduling        | root effect in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`                    | `phase-b-materializer` scheduler                       | no root-owned hydration scheduler calls                  |
| Overlay transitions                | mixed root + store imperative branches                                                                         | overlay runtime controller + shell                     | root cross-domain overlay/search branches deleted        |

### 4.1 Store ownership clarifications (required before S3 promotion)

To avoid dual-source drift between local state and Zustand stores:

- `useSearchStore` remains user-preference + durable filters store (`preferredActiveTab`, `scoreMode`, filter defaults/history),
- request-scoped runtime state (`submittedQuery`, results phase, request tuple, hydration stage) moves to `SearchSessionController`,
- overlay navigation stack state remains in `useOverlayStore`, but search-data derivation cannot mutate overlay store directly,
- any field with both local state and store representation must be resolved to one owner in the slice that first touches it.

## 5) Map Subsystem Contract (Critical)

This section is mandatory because map is a primary bottleneck and has sensitive UX behavior.

### 5.1 Protected behavior constraints (from LOD v2)

Do not regress these without explicit dedicated map UX approval:

- edge-fade behavior and `visibleMarkerKeys` semantics,
- overscan geometry assumptions and `getCoordinateFromView` polygon sampling,
- no flash/jitter in pin/dot handoff,
- no duplicate key or gap states during transitions.

References:

- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md:24`
- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md:33`
- `/Users/brandonkimble/crave-search/plans/map-marker-lod-v2.md:40`

### 5.2 Split map control plane from map presentation

Target modules:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/camera-intent-arbiter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-query-budget.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-viewport-query.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-spatial-index.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`

### 5.3 Map migration invariants

1. Keep edge-fade and sticky-label behavior equivalent while moving candidateing/index logic.
2. Remove full-catalog fallback from screen scope.
3. All expensive feature queries flow through one budgeted service.
4. Marker updates are diff-based and versioned by snapshot id.
5. Camera writes are authorized only through arbiter.

### 5.4 Query and apply budgets

- `indexQueryDurationP95 <= 2ms`
- `readModelBuildSliceP95 <= 4ms`
- `mapDiffApplySliceP95 <= 3ms`
- `fullCatalogScanCount == 0` after map cutover slice

## 6) Concrete Module Plan (What to Build)

### 6.1 New runtime modules (search)

Controller/event model:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-reducer.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-events.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/controller/search-session-state-machine.ts`

Adapters:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/natural-adapter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/shortcut-adapter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/entity-adapter.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/adapters/search-response-envelope.ts`

Scheduler:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/runtime-work-scheduler.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`

Read models:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/list-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/header-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/chip-read-model-builder.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors.ts`

Cross-cutting runtime services:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/viewport/viewport-bounds-service.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/mutations/query-mutation-orchestrator.ts`

### 6.2 Existing modules to shrink or re-home

| File                                                                                                         | Required end-state                                                   |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`                                 | composition shell only (selector reads + intent dispatch + layout)   |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`                | request construction + dispatch bridge only                          |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`                 | presentation component with runtime-controller inputs only           |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-sheet.ts`                 | keep as UI shell utility; remove search-lifecycle authority          |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/session/use-search-session-coordinator.ts` | keep as overlay-origin coordinator; remove submit lifecycle coupling |
| `/Users/brandonkimble/crave-search/apps/mobile/src/hooks/useSearchRequests.ts`                               | transport-only request client                                        |

### 6.3 Non-search modules to decompose in scope

| File                                                                               | Required split                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx` | split into polls runtime hook(s) + presentational sections            |
| `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Onboarding.tsx`         | split step state machine + auth lane + animation hooks + presentation |
| `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/RootNavigator.tsx`   | extract navigation bootstrap/gating runtime owner                     |

## 7) Vertical Migration Slices (Replace "single extended effort")

Each slice is independently promotable and rollbackable.

### Slice P0: Preconditions and toolchain alignment

Goal:

- make the plan executable with real CI hooks and scripts.

Status:

- implemented for fixture-mode tooling validation.

Required actions:

1. Add `/Users/brandonkimble/crave-search/scripts/perf-shortcut-loop-report.sh`.
2. Add `/Users/brandonkimble/crave-search/scripts/ci-compare-perf-reports.sh`.
3. Add `/Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`.
4. Keep GitHub CI focused on static/contract checks (`search-runtime-contract-tests`, `no-bypass-search-runtime`).
5. Add local live perf-gate orchestration (`/Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh`) and expose package scripts.

Exit gate:

- parser/comparator/no-bypass/local-perf scripts exist and run locally,
- GitHub CI includes contract/static gates only for this refactor phase,
- local perf gate command exists and is documented for slice promotion decisions.

Rollback:

- if scripts are noisy/flaky, keep analyzer jobs non-blocking until parser stability is validated for two consecutive runs.

### Slice P0.5: Live harness reactivation + metric lock (new hard prerequisite)

Goal:

- make P0 metrics meaningful for real implementation slices.

Status:

- runtime wiring for harness markers + JS/UI sampler emission has been reintroduced in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`,
- live validation is complete on current runtime path (`plans/perf-logs/perf-shortcut-loop-20260213T023338Z-signin-rerun.log`) with `markerIntegrity.complete=true`.

Required actions:

1. Re-introduce runtime harness emission points for:

- `[SearchPerf][Harness]` `shortcut_loop_start`,
- `[SearchPerf][Harness]` `shortcut_loop_run_start`,
- `[SearchPerf][Harness]` `shortcut_loop_run_complete`,
- `[SearchPerf][Harness]` `shortcut_loop_complete`.

2. Reconnect JS/UI frame sampler startup to active harness scenario path.
3. Add `schemaVersion` to parser output and enforce same version in comparator.
4. Lock metric definitions (see section 9.3) and append one calibration entry to `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md` that maps old vs new metric semantics.

Exit gate:

- `scripts/perf-shortcut-loop.sh` produces live logs with complete marker integrity,
- parser succeeds on a fresh live log from the current commit,
- comparator hard-fails on schema mismatch,
- investigation log includes calibration note tied to parser `schemaVersion`.

Rollback:

- keep fixture-mode jobs green and retain local gate as promotion source of truth until hosted live perf CI is added.

### Slice S1: Runtime scaffolding in shadow mode (no behavior change)

Goal:

- create runtime controller/event/reducer scaffolding and mirror existing events.

Files touched:

- add `runtime/controller/*`, `runtime/adapters/*`, `runtime/scheduler/*` scaffolds,
- add event emission bridge from existing paths.

Exit gate:

- shadow traces show legal transitions only,
- `transitionViolation == 0` on shortcut loop baseline,
- no user-visible behavior changes.

Rollback:

- disable shadow bridge and keep old runtime path; no state ownership change yet.

### Slice S2: Operation identity protocol in active paths

Goal:

- enforce `(sessionId, operationId, seq)` on all mutating events.

Files touched:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- new runtime reducers/guards

Exit gate:

- stale events are rejected and counted,
- integration tests cover stale accept/reject paths.

Delete gate:

- remove legacy unguarded mutation branches where they overlap with guarded path.

Rollback:

- keep guard checks in monitor-only mode if unexpected false positives occur, then fix tuple propagation.

### Slice S3: Natural-mode submit cutover (phase-A then phase-B)

Goal:

- cut natural submit through controller with minimal first-paint phase.

Files touched:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- runtime controller/adapters/scheduler/read-model selectors

Exit gate:

- natural submit uses controller phase transitions only,
- no pre-request full-null clear for natural path,
- no regressions in parity checklist.

Delete gate:

- remove natural-mode direct apply branches in old submit hook.

Rollback:

- keep feature-scoped fallback for natural mode only until 2 matched runs pass.

### Slice S4: Shortcut and entity submit cutover

Goal:

- route shortcut/entity through same controller path via adapters.

Exit gate:

- all modes use same state machine,
- no mode-specific bypass around controller transitions,
- floor/stall metrics non-regressive by gate policy.

Delete gate:

- remove mode-specific direct fan-out branches.

Rollback:

- rollback only affected mode adapter while keeping shared controller enabled.

### Slice S5: Root hydration ownership removal

Goal:

- move hydration/reveal scheduling out of screen root.

Current anchor to remove:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8565`

Exit gate:

- root no longer owns `InteractionManager`/RAF lifecycle scheduling for result hydration.

Delete gate:

- remove root hydration effect branch entirely.

Rollback:

- allow one guarded fallback branch for a single release candidate only if parity breaks.

### Slice S6: Map candidate/index cutover (without edge-fade regression)

Goal:

- replace full-catalog candidateing with viewport-indexed read-model while preserving existing edge-fade/label behavior.

Current anchor to remove:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:4841`

Exit gate:

- `fullCatalogScanCount == 0` in map verdict scenarios,
- edge-fade parity checklist passes,
- no pin/dot duplicate/gap errors.

Delete gate:

- remove full-catalog fallback return path in root.

Rollback:

- keep index service present but switch candidate provider back if parity break occurs.

### Slice S7: Camera arbiter cutover and root map-write deletion

Goal:

- remove direct root camera writes and enforce arbiter ownership.

Current anchor to remove:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6877`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6878`

Exit gate:

- no direct root camera writes remain,
- no snap-back during active gesture,
- camera burst budgets pass.

Delete gate:

- delete root `setMapCenter`/`setMapZoom` idle handler writes.

Rollback:

- arbiter fallback mode can mirror old state one-way, but old root writer must stay deleted once slice is promoted.

### Slice S8: Overlay/list contract hardening and cleanup

Goal:

- stabilize request-scoped list contracts and remove duplicate debug/legacy sheet paths.

Actions:

1. enforce stable selector-fed list contract identity,
2. remove redundant prop-change logging paths,
3. evaluate and remove unused legacy sheet component if no references remain.

Note:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-results-sheet.tsx` appears legacy.
- deletion prerequisite: `rg -n "search-results-sheet|SearchResultsSheet" /Users/brandonkimble/crave-search/apps/mobile/src` must show no runtime imports (type declaration references are allowed only if deleted in same slice).

Exit gate:

- reduced sheet commit churn during submit/reveal windows,
- no overlay/search cross-domain imperative coupling in root.

### Slice S9: Non-search domain decomposition

Goal:

- bring onboarding/polls/profile/navigation to same runtime quality bar.

Actions:

- split `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx` into runtime hooks and presentation,
- split `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Onboarding.tsx` into state machine + auth lane + animation hooks,
- isolate bootstrap gating runtime from `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/RootNavigator.tsx`.

Exit gate:

- parity suites for onboarding/polls/profile/navigation pass,
- maintainability and incidental churn measurably reduced.

### Slice S10: Debt cleanup and hardening

Goal:

- remove temporary paths, probes, and bypasses.

Validation sweep:

- `rg -n "searchPerfDebug|EXPO_PUBLIC_PERF_|\[SearchPerf\]|console\.log\(" /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search /Users/brandonkimble/crave-search/apps/mobile/src/overlays`

Exit gate:

- one clear runtime path per concern,
- no cluster remains in `shadow` or `owned` with undeleted legacy writers.

## 8) Cluster Ownership Ledger (Mandatory)

| Cluster                     | Current anchor                                                                                    | Target owner                         | Slice | Delete gate                            |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ | ----- | -------------------------------------- |
| Submit + response apply     | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-submit.ts:361` | `SearchSessionController` + adapters | S3/S4 | old fan-out branches deleted           |
| Hydration/reveal scheduling | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:8565`                 | `phase-b-materializer`               | S5    | no root hydration scheduler            |
| Map idle camera writes      | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:6877`                 | camera arbiter                       | S7    | no root camera writes                  |
| Marker candidate derivation | `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx:4841`                 | map index/read-model                 | S6    | no full-catalog fallback               |
| Filter rerun fan-out        | root filter submit branches                                                                       | query mutation orchestrator          | S4/S8 | no direct mode-specific rerun branches |
| Overlay/search coupling     | root imperative overlay-search branches                                                           | overlay runtime controller           | S8    | root cross-domain branches deleted     |

Cluster state machine:

- `legacy`
- `shadow`
- `owned`
- `deleted`

Rules:

- `owned` requires deletion of legacy writer in same promotion,
- `shadow` overlap allowed only during explicitly declared slice,
- no bypass flags after delete gate.

## 9) CI and Harness Plan (Reality-Aligned)

### 9.1 GitHub CI (required, production-relevant)

1. `search-runtime-contract-tests`

- validates parser output contract and marker integrity on canonical fixture log,
- ensures required perf fields exist and are numeric.

2. `no-bypass-search-runtime`

- static guard for prohibited legacy paths.

Intent:

- keep GitHub CI deterministic and merge-blocking for contract/static regressions,
- avoid treating fixture perf comparisons as runtime perf truth.

### 9.2 Local perf gate (required for refactor promotions)

Command surface:

- `bash ./scripts/perf-shortcut-local-ci.sh record-baseline`
- `bash ./scripts/perf-shortcut-local-ci.sh gate`

Script:

- `/Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh`

Flow:

1. capture/refresh locked live baseline report,
2. run live candidate shortcut loop harness,
3. parse candidate report,
4. compare baseline vs candidate with comparator thresholds and schema checks,
5. attach compare summary evidence to slice promotion notes.

Promotion rule:

- slices that touch submit/map/list runtime ownership cannot promote without a passing local perf gate report from current branch.
- local gate evidence is invalid when either report has `runCountCompleted < 3`.

### 9.3 Parser/comparator contract

Parser script responsibilities (`perf-shortcut-loop-report.sh`):

- input: loop log path,
- output JSON fields include:
  - core: `schemaVersion`, `markerIntegrity`, `runCountStarted`, `runCountCompleted`,
  - JS metrics: `floorMean`, `stallP95`, `stallMaxMean`, `stageHistogram`, `catastrophic`,
  - UI metrics: `uiFloorMean`, `uiStallP95`, `uiStallMaxMean`, `uiStageHistogram`, `uiCatastrophic`,
  - parity metadata: `harnessSignatureStable`, `environment`.
- metric definitions (canonical):
  - `floorMean`: mean of per-run minimum `floorFps` values from `[SearchPerf][JsFrameSampler]` windows between `shortcut_loop_run_start` and `shortcut_loop_run_complete`,
  - `stallMaxMean`: mean of per-run maximum `stallLongestMs` values from the same scoped windows,
  - `stallP95`: p95 over all scoped window `stallLongestMs` values,
  - `uiFloorMean`: mean of per-run minimum `floorFps` values from `[SearchPerf][UiFrameSampler]` windows between `shortcut_loop_run_start` and `shortcut_loop_run_complete`,
  - `uiStallMaxMean`: mean of per-run maximum `stallLongestMs` values from the same scoped windows,
  - `uiStallP95`: p95 over all scoped UI window `stallLongestMs` values.
- local CI sampler defaults (enforced in `perf-shortcut-local-ci.sh`):
  - `EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS=120`
  - `EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS=120`
  - `EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS=240`
  - `EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS=240`

Comparator script responsibilities (`ci-compare-perf-reports.sh`):

- input: baseline JSON, candidate JSON, threshold config,
- output: non-zero exit on any of:
  - regression gate violation (JS or UI metrics),
  - schema mismatch,
  - missing required metrics,
  - insufficient run counts (`runCountExpected`/`runCountCompleted` below `PERF_MIN_RUNS`, default `3`),
  - signature/environment parity mismatch,
  - catastrophic gate breach (absolute, not baseline-relative).

Artifact paths (local gate flow):

- locked baseline default: `/Users/brandonkimble/crave-search/plans/perf-baselines/perf-shortcut-live-baseline.json`
- candidate report: `/tmp/perf-shortcut-candidate-<timestamp>.json`
- compare summary: `/tmp/perf-shortcut-compare-<timestamp>.json`

### 9.4 Future hosted perf CI graduation (optional later)

Re-introduce merge-blocking hosted perf jobs only when:

1. dedicated runtime environment is stable/repeatable (for example, controlled Mac runner),
2. live harness logs are produced in that environment with complete marker integrity,
3. hosted results are statistically consistent with local-gate outcomes over multiple runs.

Until then:

- GitHub remains contract/static gate only,
- local live perf gate is the source of truth for refactor runtime promotion decisions.

## 10) Test Matrix (Implementation-Ready)

### 10.1 Unit tests

- reducer legality tests for every search state transition,
- guard matrix pass/fail tests for each event type,
- stale tuple drop tests,
- lane preemption resolution tests.

### 10.2 Integration tests

- submit->phase-A->visual release ordering,
- stale response rejection after newer submit,
- pagination cancellation on submit reset,
- camera gesture preemption over programmatic camera intents,
- overlay switch isolation from search heavy work.

### 10.3 Parity tests

- no stale rows/markers,
- no missing cards/pins,
- no tab/filter/pagination semantic drift,
- no map snap-back during active gesture,
- onboarding/polls/profile/nav flows preserve behavior.

## 11) Non-Negotiables

1. No direct render-state mutation in adapters.
2. No mode-specific bypass around controller transitions.
3. No synchronous full phase-B materialization commit.
4. No direct camera writes from screen-level components after S7.
5. No bounds capture ownership outside viewport service after S6.
6. No stale request writes; strict tuple guards mandatory.
7. Debug/probe branches cannot gate production runtime behavior.
8. No cluster promotion without legacy delete gate evidence.
9. No long-lived dual-path overlap outside explicit `shadow` slices.
10. Do not treat map edge-fade/overscan as refactorable collateral.
11. Architecture program is incomplete until non-search domain slices pass.

## 12) Explicit Improvements vs Prior Plan

This V3 intentionally fixes the prior gaps:

1. Replaces single extended effort model with rollbackable vertical slices.
2. Adds source-of-truth migration matrix for mixed local/store state.
3. Aligns CI/harness scope with actual code reality today.
4. Elevates map edge-fade/label constraints to first-class migration contract.
5. Includes missing module owners (`use-search-sheet`, `use-search-session-coordinator`, `useSearchRequests`) in final ownership model.
6. Adds explicit missing-script precondition so "ready" status is factual.

## 13) Next 72 Hours (Post-P0.5)

1. Lock the promotion baseline in local CI:

- run `bash ./scripts/perf-shortcut-local-ci.sh record-baseline` in the chosen target environment (simulator or device),
- publish baseline report path and environment details into the investigation log,
- require `bash ./scripts/perf-shortcut-local-ci.sh gate` pass before each slice promotion.

2. Execute Slice S1:

- scaffold runtime modules,
- wire shadow event emission,
- add transition legality tests.

3. Execute Slice S2:

- propagate operation tuple across existing submit/mutation paths,
- enforce stale-event drop telemetry,
- ship with no behavior change.

4. Start Slice S3 (natural mode only):

- move natural submit through controller phase-A then phase-B,
- remove natural-mode direct fan-out branch once parity passes.

Success condition for this window:

- promotion baseline is explicit and repeatable,
- runtime ownership becomes enforceable/measurable with rollbackable slices,
- no user-visible UX change during scaffolding slices.

## 14) Red-Team Residual Risks (Explicit)

These are known risks that must stay visible during execution.

1. CI perf gates are fixture-backed in Phase 1 and therefore validate tooling, not live runtime behavior.
2. `search-runtime-contract-tests` is currently a parser/contract smoke gate; full reducer/transition test suite is still a slice deliverable.
3. Map label-sticky internals remain highly coupled in current code; migration must preserve behavior while extracting candidate/index ownership.
4. Shared-checkout churn can reintroduce legacy writes unless cluster state (`legacy`/`shadow`/`owned`/`deleted`) is enforced in every promotion.
5. Harness marker/sampler wiring is now connected and validated once in live run, but it is not yet continuously enforced in hosted CI.
6. Metric naming can look comparable while semantics differ; without schema lock, trend decisions can be invalid.
