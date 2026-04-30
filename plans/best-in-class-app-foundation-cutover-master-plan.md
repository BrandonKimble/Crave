# Best-In-Class App Foundation Cutover Master Plan

Last updated: 2026-04-18
Status: active master plan
Owner: Codex + Brandon
Program mode: direct cutover, continuous execution
Scope:

- `/Users/brandonkimble/Crave/apps/mobile/src/navigation/**`
- `/Users/brandonkimble/Crave/apps/mobile/src/navigation/runtime/**`
- `/Users/brandonkimble/Crave/apps/mobile/src/overlays/**`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/**`
- `/Users/brandonkimble/Crave/apps/mobile/src/perf/**`
- `/Users/brandonkimble/Crave/scripts/perf-nav-switch-loop.sh`
- native presentation surfaces touched by route, overlay, map, and sheet runtime promotion

Related plans:

- `/Users/brandonkimble/Crave/plans/search-runtime-ideal-shape-master-plan.md`
- `/Users/brandonkimble/Crave/plans/global-overlay-route-runtime-cutover-plan.md`
- `/Users/brandonkimble/Crave/plans/search-route-mounted-scene-shell-plan.md`
- `/Users/brandonkimble/Crave/plans/search-nav-switch-performance-architecture-working-plan.md`
- `/Users/brandonkimble/Crave/plans/overlay-sheet-system-redesign-v3.md`
- `/Users/brandonkimble/Crave/plans/overlay-sheet-unification.md`

## Status Of This Document

This is the active source of truth for the frontend foundation cutover.

The related plans above still matter as execution evidence and subsystem detail, but they should now roll up into this document instead of competing for architectural authority.

The goal is not to continue incrementally optimizing the current hybrid Search-owned runtime. The goal is to directly cut the app over to the target shape that can support many more screens, much richer UX, and much tighter runtime performance without reopening core ownership questions later.

## Objective

Build a best-in-class foundation for the mobile app by replacing the current hybrid Search-rooted orchestration with:

- one app-shell route runtime
- one app-level overlay route runtime
- one mounted-scene registry with explicit lifecycle policy
- scene-local runtime ownership for each major screen
- a UI-thread/native-owned motion plane after intent dispatch
- a smaller root composition layer with hard delete gates for legacy ownership

Success is not just cleaner code. Success means:

- new screens can be added without threading behavior through Search
- screen and overlay switches stay smooth as the app gets denser
- cold and warm behavior are predictable
- React is no longer the hot-path coordinator for route and shell motion
- future UX work happens on top of stable runtime contracts instead of transitional glue

## Why We Are Doing A Full Cutover

The app already contains strong pieces of the target architecture, but they still coexist with older root-owned orchestration:

- `navigation/runtime/**` has the beginning of app-route authority
- `overlays/**` already owns much more of the global host and route stack than before
- `screens/Search/runtime/**` contains strong bus, scheduler, runtime, and scene ideas
- the hot path still crosses Search-owned host-model derivation and route-specific compatibility layers

That hybrid shape is good enough to avoid obvious jank today, but it is not the right long-term foundation for:

- many more screens
- richer end-state content on existing screens
- global overlay and detail flows that should not be Search exceptions
- best-in-class consistency under load

We should not keep layering new product work onto a runtime whose main job is still partially split across old and new ownership lines.

## Non-Negotiable Rules

1. Delete gates are mandatory.

- When ownership is promoted, the legacy writer path dies in that same promotion.
- No long-lived dual writers.
- No compatibility bag survives once the new owner is proven.

2. App-level route authority wins.

- Search may produce route intent.
- Search may not remain the de facto route coordinator for the app.
- Overlay, detail, and scene activation policy must converge under app-shell ownership.

3. React stays out of hot-path orchestration.

- React renders stable scene shells and scene surfaces.
- React should not mediate active route selection, shell transitions, or motion choreography through large re-derivations on every switch.

4. Motion is UI-thread/native owned after intent dispatch.

- JS chooses the target state.
- UI-thread/native runs the transition.
- JS receives completion and telemetry, not per-frame responsibility.

5. Preserve UX parity by default during the cutover.

- Snap behavior, back behavior, sheet behavior, and route semantics should stay equivalent unless a deliberate behavior change is recorded here.

6. Performance claims require evidence.

- Harness output, frame samplers, traces, or concrete redbox/repro logs only.
- Subjective smoothness comments are helpful, but they do not close a slice.

7. The harness is an architectural checkpoint, not a per-slice veto.

- If the nav-switch harness reports a clear regression at a checkpoint, treat it as a real product issue.
- Do not dismiss harness failures as simulator-only noise.
- During active cutover, do not force a harness run after every architecturally meaningful slice.
- Prefer batching several aligned delete-gate-closing promotions before re-running the harness, especially while the app is still in the hybrid middle state.
- Do not discard a delete-gate-closing architectural promotion solely because an intermediate aggregate moved inside a near-noise band.
- Use the harness to reassess the new architecture after a coherent ownership segment has been fully promoted.
- Keep iterating until the measured path and the felt path are both in the target range.

## North Star Architecture

### 1. App Shell Runtime

The app shell becomes the single authority for:

- current app route
- current overlay route
- route transition phase
- app chrome state
- scene lifecycle state
- auth/bootstrap gating
- global modal and sheet ownership

The app shell does not own scene-local data derivation or scene-local JSX assembly.

### 2. App Route Runtime

One normalized route runtime owns:

- tab routes
- overlay routes
- pushed detail routes
- future modal and multi-step flow routes

Every route change becomes:

- intent in
- normalized transition contract out

No feature should negotiate navigation by publishing sidecar route assumptions to another feature.

### 3. Scene Registry

Every scene registers:

- `sceneKey`
- route mapping
- mount policy
- inactive policy
- preload policy
- shell contract
- required runtime owner
- motion participation
- teardown policy

The default policy is:

- mount on first access
- remain retained
- become frozen and non-interactive when inactive

### 4. Scene Runtime Modules

Each screen or route family gets a runtime module with the same shape:

- scene contract
- runtime owner
- read-model owner
- action runtime
- motion hooks
- surface component

The app root consumes a narrow scene boundary. It does not assemble the scene itself.

### 5. Motion Runtime

The motion plane becomes its own runtime, separate from scene business logic.

It owns:

- sheet motion
- map and camera motion
- shared transition choreography
- gesture handoff
- settle signals
- snap and chrome interpolation

### 6. Data And Read-Model Runtime

Each scene or domain owns:

- entity and query sources
- cache and invalidation policy
- derived read models
- optimistic mutation policy
- scene-local view state

The root must stop deriving large merged host models for children.

### 7. Observability Runtime

Performance and correctness stay first-class:

- nav-switch harness
- frame samplers
- route transition telemetry
- scene activation timing
- mount churn counters
- scene warm/cold classification
- real-device acceptance traces

## Target Repo Shape

The target shape should fit the current repo instead of inventing a second architecture beside it.

### Navigation and app-shell authority

`/Users/brandonkimble/Crave/apps/mobile/src/navigation/runtime/**` becomes the home for:

- app route runtime
- overlay route runtime integration boundary
- scene registry
- scene lifecycle coordination
- app-shell chrome runtime
- app bootstrap and auth gates

The likely long-term center of gravity is:

- `AppRouteCoordinator.tsx`
- `app-route-types.ts`
- new app-shell and scene-registry runtime modules added beside them

### Overlay host and shared shell

`/Users/brandonkimble/Crave/apps/mobile/src/overlays/**` should own only:

- the shared overlay shell
- overlay route host composition
- route-family host adapters
- shared sheet and header motion
- shell contracts and host runtime contracts

It should stop being a compatibility zone for Search-owned route-state publication or host-model reconstruction.

### Scene-local runtime ownership

`/Users/brandonkimble/Crave/apps/mobile/src/screens/<Scene>/**` should own each scene end to end.

That means:

- Search stays under `screens/Search/**`
- Profile runtime should stop living under `screens/Search/runtime/profile/**` long term
- Bookmarks, Polls, and future scenes should have explicit scene-local runtime homes

If a runtime is not truly Search-specific, it should not stay under the Search runtime namespace.

### Performance harness ownership

`/Users/brandonkimble/Crave/apps/mobile/src/perf/**` and `/Users/brandonkimble/Crave/scripts/perf-nav-switch-loop.sh` remain the acceptance surface for the cutover.

## Current Structural Problems We Are Intentionally Removing

The main blockers are not isolated slow components. They are ownership and hot-path shape problems:

1. `use-search-root-runtime.ts` still carries too much app-like responsibility.

2. `useResolvedSearchRouteHostModel.ts` and related route-host derivation still reconstruct too much state on the switch path.

3. `useSearchRouteFrozenOverlayRenderModel.ts` and adjacent freeze layers are still compensating for upstream churn that should be removed instead of normalized.

4. Search-owned overlay publication still leaves Search as a special coordinator even after the global overlay host became real.

5. Some motion and transition behavior still depends on JS and React coordination during the active switch window.

6. A non-trivial part of the route and overlay stack still behaves like a compatibility bridge instead of a final contract.

## Architectural Decisions We Are Locking In Up Front

### Persistent scenes are the default

- scenes mount once on first access
- scenes stay retained by default
- inactive scenes become frozen and non-interactive
- remount-on-switch is an opt-out only for very specific memory cases

### Global route ownership is final

- features produce intents
- app shell owns route resolution
- route back behavior belongs to the route stack, not to feature-local state

### One app shell, scene-provided shell specs

- scenes declare what shell mode they need
- scenes do not own shell containers
- shell rendering stays centralized

### UI-thread/native motion is the target

- sheet, header, backdrop, and camera transitions should not require JS to stay smooth mid-flight

### Scene-local data ownership is final

- root does not own merged scene data bags
- scenes consume narrow read models owned by their own runtime

### Observability is part of the architecture

- no promotion closes without fresh perf evidence
- simulator evidence is useful
- real-device evidence is required for final acceptance

## Direct Cutover Program

This is one continuous program, not a loose backlog of unrelated slices.

We should move through these phases without reopening the old direction between them. The point is to keep cutting until the target shape is real, not to permanently stabilize the hybrid middle state.

### Phase 0: Freeze Architectural Drift

Before new product expansion:

- stop adding new route ownership to Search-root compatibility layers
- stop adding new host-model assembly to the current overlay resolver path
- stop adding new scene-specific publication bags to bridge old and new owners

Exit criteria:

- the master plan is the active architectural source of truth
- new work routes through the target direction only

Delete gate:

- no new transitional wrapper may be introduced without a same-plan delete point

### Phase 1: Establish App-Shell Authority

Promote `navigation/runtime/**` into the real top-level owner for:

- app route state
- overlay route state
- scene lifecycle state
- app-shell chrome state
- bootstrap/auth gating

Add or formalize:

- app-shell runtime contract
- scene registry contract
- scene lifecycle contract
- normalized route transition contract

Exit criteria:

- the app shell can describe the active scene and active overlay route without consulting Search-owned state as the authority

Delete gate:

- no feature-local runtime remains the effective route authority for app-level route selection

### Phase 2: Promote Overlay Runtime To Final App-Level Ownership

Thin `AppOverlayRouteHost.tsx`, `SearchAppShellHost.tsx`, and adjacent overlay stores until the overlay layer owns:

- route stack interpretation
- overlay host composition
- route-family host selection
- shared shell motion inputs

Search should publish intent and Search-scene-local content only.

Exit criteria:

- route selection happens under app-shell and overlay runtime authority
- the overlay host no longer reconstructs Search-owned compatibility state to decide what route is active

Delete gate:

- no Search-only resolver or Search-local route state decides the app-level overlay route

### Phase 3: Install The Mounted Scene Registry

Promote the mounted-scene ideal shape beyond Search-route overlays and make it the app-level standard.

The scene registry should own:

- active scene identity
- mounted scene set
- inactive policy
- preload policy
- focus and interactivity status

Exit criteria:

- scene activation is mostly a lifecycle state change
- scene identity is stable across switches

Delete gate:

- no host path rebuilds scene JSX trees or scene specs on every route switch

### Phase 4: Reduce The Shell Contract To A Thin Stable Boundary

`OverlaySheetShell.tsx` and related hosts should render from a narrow shell contract:

- `activeSceneKey`
- shell visibility
- target snap
- header mode
- backdrop and chrome state
- motion status

They should not receive:

- full scene view models
- scene query inputs
- large compatibility bags
- duplicated route-resolution data

Exit criteria:

- shell props are stable and small
- scene switches stop causing host-wide derivation churn

Delete gate:

- no resolved-host-model compatibility layer survives that exists only to rebuild scene-specific shell state for the host

### Phase 5: Re-home Search Into A True Scene Runtime

Reduce `use-search-root-runtime.ts` until it becomes composition only.

Promote Search into a self-contained scene runtime that owns:

- Search data and read models
- Search commands and interactions
- Search local overlay and results semantics
- Search map intent and Search-specific motion requests

Exit criteria:

- Search is a scene under the app shell, not the hidden coordinator of the app
- Search-root runtime no longer assembles the rest of the app's overlay and scene state

Delete gate:

- no Search-root orchestration file remains the place where app-level route or scene coordination actually happens

### Phase 6: Re-home Profile, Bookmarks, Polls, Restaurant, And Future Scenes

Move each major scene to the common scene contract.

Critical consequence:

- runtime clusters that are not truly Search-specific should stop living under `screens/Search/runtime/**`

This especially applies to:

- profile runtime
- bookmarks scene runtime
- polls scene runtime
- restaurant route runtime

Exit criteria:

- each scene has its own runtime owner, read-model owner, action runtime, and surface
- scene responsibilities are explicit and local

Delete gate:

- no cross-scene ownership remains hidden under the Search runtime namespace

### Phase 7: Promote The Motion Plane

Move hot-path motion fully under UI-thread/native-friendly contracts.

This phase should cover:

- sheet motion
- header and backdrop interpolation
- camera and map motion
- gesture handoff and settle events

Exit criteria:

- JS chooses targets and receives completion
- JS does not need to coordinate per-frame transition execution

Delete gate:

- no React-driven motion choreography remains on the active switch path unless a documented platform limitation forces it

### Phase 8: Normalize Data And Read-Model Ownership

Finalize the data layer for long-term scale:

- move merged host data bags out of the root
- keep normalized domain data and scene read models local to the owning scene or domain runtime
- formalize invalidation and optimistic update policies

Exit criteria:

- roots and hosts consume narrow read models
- scenes own their own query and derivation policies

Delete gate:

- no root-level merged scene presentation model survives as a permanent abstraction

### Phase 9: Delete The Hybrid Middle State

Once the new owners are live, remove the remaining legacy path aggressively:

- compatibility wrappers
- duplicate stores
- fallback route publication layers
- Search-owned bridge models
- freeze layers that only exist to compensate for old churn
- feature-to-feature route side channels

Exit criteria:

- there is one authority for each runtime concern
- the active path reads like the final architecture, not an upgrade scaffold

Delete gate:

- no duplicated ownership survives for convenience

### Phase 10: Lock In The Future-Screen Standard

Only after the foundation is real:

- create the canonical new-scene template
- document how new screens join the app shell
- resume heavier UX and content expansion on top of the new contracts

Exit criteria:

- adding a new screen is deterministic and local
- no one needs to understand Search internals to add a new route family

Delete gate:

- no new screen may be added through deprecated bridge surfaces

## What Must Be Deleted By The End

These categories should not survive the program:

- Search-owned app coordination
- feature-owned route authority
- large resolved host-model compatibility bags
- host-owned scene JSX assembly
- duplicate route stack and publication state
- root-owned merged scene view models
- JS hot-path motion orchestration
- freeze and compatibility layers that only exist because upstream ownership is still wrong

## Acceptance Criteria

### Architectural acceptance

- app shell owns route and overlay authority
- scene registry owns scene lifecycle
- each major scene owns its own runtime module
- root composition is materially smaller and more stable
- each runtime concern has one clear owner

### Developer-experience acceptance

- a new scene can be added by implementing the standard scene contract
- scene work is local to its module
- routing, motion, and shell integration are declarative
- app-level changes do not require threading new state through Search-root glue

### Performance acceptance

Measured on the real device path that matters for daily development and release confidence:

- no JS or UI stall events during the standard nav-switch harness
- warm screen-to-screen switches stay near 60fps on both samplers
- inactive scenes show negligible or zero measurable commit work during unrelated switches
- shell transitions stay UI-thread smooth
- cold-to-warm variance drops materially from the current hybrid baseline

Target guidance for the final state:

- warm switch median roughly in the low-200ms range or better on the target iPhone
- warm switch p95 below the visibly-laggy range
- no repeated host commits above the single-digit-millisecond range during normal switches

The exact numbers can be tightened once the first app-shell and scene-registry baselines are recorded on the final architecture.

## Required Evidence At Major Promotion Points

Every major promotion should capture:

- harness run id
- JS frame sampler summary
- UI frame sampler summary
- route or scene trace highlights
- what delete gate was closed
- what legacy files or abstractions were removed

This remains true even late in the program:

- if the architecture looks cleaner but the harness still shows bad switch behavior, the job is not done
- if the harness goes red again after a promotion, return to the owning seam and keep cutting

## Future Scene Standard

Every future screen should provide one explicit scene contract that includes:

- route identity
- mount policy
- inactive policy
- preload strategy
- shell mode
- runtime owner
- read-model owner
- action surface
- motion hooks
- surface component

Every future screen should avoid:

- feature-local route authority
- root-owned data derivation for its surface
- “temporary” compatibility publication bags
- list-shaped screens used to fake static content surfaces
- shell ownership inside scene-local render trees

## Decisions That Need To Stay Stable During Execution

These are the decisions most likely to create churn if we revisit them mid-program:

- persistent scenes are the default
- global route ownership is final
- app-shell ownership is final
- motion is promoted out of React hot paths
- scene-local runtime ownership is the scaling model
- delete gates are not optional

If one of these needs to change, the plan should be updated explicitly before code keeps moving.

## Immediate Next Moves

1. Treat this document as the master execution plan.
2. Reconcile active in-flight Search and overlay work against the target module map above.
3. Start Phase 1 by formalizing app-shell authority and scene-registry contracts in `navigation/runtime/**`.
4. Close the first delete gate before taking on new UX expansion work.
