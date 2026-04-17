# Search Route Mounted-Scene Shell Plan

Last updated: 2026-04-14
Status: active
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`

Related plans:

- `/Users/brandonkimble/crave-search/plans/search-runtime-ideal-shape-master-plan.md`
- `/Users/brandonkimble/crave-search/plans/global-overlay-route-runtime-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/search-performance-plan.md`
- `/Users/brandonkimble/crave-search/plans/search-js-frame-budget-optimization-plan.md`
- `/Users/brandonkimble/crave-search/plans/overlay-sheet-unification.md`

## Objective

Get the Search route overlay system to the real ideal end-state:

- one permanent route-sheet shell
- one shell state machine
- mounted scene components under that shell
- inactive scenes frozen/hidden
- scene switches reduced to a tiny JS state change

The success condition is not just architectural cleanliness. The goal is:

- no visible JS FPS drop during `search <-> bookmarks <-> profile <-> polls` switches
- `SearchRouteOverlayHost` no longer dominating switch-time JS work
- shell gestures and snap/chrome motion remaining smooth and UI-thread driven

## Why This Plan Exists

The current route-host path has already proven the wrong boundary:

- the shell identity is mostly stable now
- `SearchScreen` is mostly isolated
- cold scene mount cost is no longer the main problem
- but `SearchRouteOverlayHost` still owns too much React reconciliation

The attempted spec-registry approach improved diagnosis but not the final outcome. The remaining smell is structural:

- the host still participates in scene assembly
- panel-spec hooks still build large scene trees on the host path
- retained scenes still leak host-owned reconciliation cost

The fix is not another local memo layer. The fix is to move to mounted scene components and make the host thin.

## Non-Negotiable Rules

1. Keep the shell thin.

- The route host may own shell state, shell commands, and shell animation inputs.
- The route host may not own scene queries, scene JSX assembly, or scene-local presentation logic.

2. Delete in the same slice that promotes ownership.

- Do not keep both the spec-driven route path and the mounted-scene path alive for long.
- Every promoted slice must delete the legacy hot-path writer for the migrated scenes.

3. Optimize the JS boundary before chasing more UI-thread polish.

- UI-thread animation matters, but it is not the primary blocker while `SearchRouteOverlayHost` still spends 10ms-30ms+ in React reconciliation.

4. Preserve UX behavior unless a deliberate behavior change is documented.

- Shell snap behavior, close behavior, and tab semantics should remain equivalent during the migration.

5. Profile after every promotion.

- No slice is done until nav-switch traces confirm a directional win and the delete gate is complete.

## Target End-State

### Architectural shape

- `SearchRouteOverlayHost` becomes a shell-level coordinator only.
- `OverlaySheetShell` becomes a stable shell renderer only.
- Route scenes become mounted components:
  - `PollsScene`
  - `BookmarksScene`
  - `ProfileScene`
  - `SearchScene`
  - `ResultsScene`
  - `SaveListScene`
  - `PollCreationScene`

### Shell contract

The shell contract should be limited to:

- `activeSceneKey`
- `targetSnap`
- `headerMode`
- `isVisible`
- shell chrome/cutout/backdrop state
- a narrow scene-to-shell command surface

The shell contract must not include:

- scene JSX
- scene panel specs
- scene hook bundles
- scene query ownership
- scene-local render models

### Scene behavior

- Scenes mount once on first access.
- After first mount, scenes stay retained.
- Hidden scenes become:
  - frozen
  - pointer-disabled
  - accessibility-hidden

### Repeatable scene standard

Every new route sheet should choose one of two scene body shapes:

- `content` surface for static/detail/form-heavy scenes
- `list` surface for real virtualized collections only

Rules:

- Do not model a mostly-static screen as an empty list with a giant `ListHeaderComponent`.
- Keep scenes mounted after first access, but keep inactive scenes work-free.
- Split large scene bodies into memoized presentational sections with narrow props.
- Keep callbacks, config objects, and snap inputs stable across scene switches.
- Subscribe only the smallest scene section that actually needs changing state.

What this means in practice:

- `Profile`-style scenes should be content surfaces.
- `Bookmarks`-style scenes should stay list surfaces, but rows, form panels, and header blocks must be isolated from broad scene rerenders.
- `inactiveRenderMode: 'live'` is an opt-in escape hatch for specific retained detail scenes whose freeze wake-up cost is measurably worse than their hidden idle cost.
- `inactiveRenderMode: 'freeze'` remains the default for list and grid scenes, especially any scene backed by virtualized collections.
- Do not promote a scene to live-hidden unless traces show that:
  - its own activation cost drops materially
  - hidden-body churn for unrelated switches stays negligible
- The hot switch path should only flip shell state plus a small active-scene activation boundary.

### Switch behavior

A route switch should become:

- update `activeSceneKey`
- update `targetSnap`
- update `headerMode`
- update shell visibility/chrome when necessary

It should not:

- rebuild scene specs
- rebuild scene JSX trees in the host
- cause host-wide scene registry reconciliation

## JS vs UI Thread: What Actually Matters

### Current diagnosis

UI-thread work is relevant, but it is not the main blocker for this problem.

Why:

- the hot path in logs is `SearchRouteOverlayHost`
- that is JS/React reconciliation work
- `SearchScreen` and the map path are no longer the main nav-switch bottlenecks

### Practical implication

The migration should prioritize:

1. reducing JS switch-time work to near-zero
2. keeping snap/chrome/backdrop transitions on the UI thread
3. avoiding any new host-owned render assembly on switches

### UI-thread work still matters for

- sheet snap animation
- backdrop dimming
- cutout movement
- header-action interpolation
- gesture ownership and drag/settle mechanics

### UI-thread work does not solve

- host-owned scene JSX assembly
- panel-spec hook churn
- route-host reconciliation across retained scenes

So the order of operations is:

1. fix the JS boundary
2. keep motion UI-thread owned
3. only then polish animation details if needed

## Migration Strategy

### Strategy 1: Replace spec-driven route rendering with mounted scene components

This is the main strategy. The route host should no longer reduce state into one active scene spec. It should render stable scene slots and toggle activation.

### Strategy 2: Move scene ownership to the scenes themselves

Each scene should own:

- its hooks
- its data fetching
- its memoization
- its refs
- its local render tree

The host should not own those concerns.

### Strategy 3: Centralize shell decisions in a shell state machine

Scenes may request shell changes, but they should not define the shell contract themselves.

Examples:

- a scene can request `expanded`
- the shell decides the final `targetSnap`
- a scene can request a header mode
- the shell decides the active header state

### Strategy 4: Freeze hidden scenes instead of rebuilding them

Retention only buys performance if hidden scenes stop participating in work. Retained-but-reconciling scenes are not the end-state.

### Strategy 5: Delete legacy paths slice-by-slice

The migration must aggressively delete:

- `useSearchRoute*PanelSpec` usage from the hot path
- active-scene spec assembly
- spec-registry bridging once equivalent mounted scenes exist

## Slice Plan

### Slice A: Shell contract definition

Goal:

- define the final shell contract and command interface before more implementation churn

Deliverables:

- a shell state contract with:
  - `activeSceneKey`
  - `targetSnap`
  - `headerMode`
  - `isVisible`
  - shell chrome inputs
- a narrow scene-to-shell command API

Exit gate:

- route host public shape no longer requires scene specs as its conceptual model

Delete gate:

- stop expanding the current spec-registry contract once the shell contract exists

Immediate cutover note:

- The first direct-cutover slice is to collapse the current wrapper pipeline:
  - `useSearchRouteOverlaySceneRegistry`
  - `useSearchRouteOverlaySheetVisibilityState`
  - split scene-registry/visibility wrapper objects that exist only to feed the resolved host model
- The resolved host model should build:
  - normalized mounted scene registry
  - shell visibility state
  - active scene ownership
    directly, then freeze that thinner host input only when close handoff requires it.

Exit gate:

- `useResolvedSearchRouteHostModel` becomes the sole place that assembles:
  - normalized scene registry
  - active scene key
  - overlay sheet visibility
  - search interaction ownership

Delete gate:

- delete wrapper-hook usage from the hot path in the same slice
- do not keep a second "scene registry state" abstraction once the resolved host model owns that responsibility

### Slice B: Mounted scene slots for hot tab scenes

Goal:

- migrate `Polls`, `Bookmarks`, and `Profile` into real mounted scene components

Deliverables:

- `PollsScene`
- `BookmarksScene`
- `ProfileScene`
- stable scene slot renderer under the route shell

Exit gate:

- those scenes render as components, not panel specs, in the active route-shell path

Delete gate:

- remove hot-path `useSearchRoutePollsPanelSpec`
- remove hot-path `useSearchRouteBookmarksPanelSpec`
- remove hot-path `useSearchRouteProfilePanelSpec`

### Slice C: Shell state machine ownership

Goal:

- move snap/header/visibility decisions fully into the shell state machine

Deliverables:

- shell-owned snap resolution
- shell-owned header mode resolution
- scene-to-shell request interface

Exit gate:

- migrated scenes no longer define shell behavior through spec objects

Delete gate:

- remove shell-control fields as the primary driver from migrated scene specs

### Slice D: Search and results migration

Goal:

- move `SearchScene` and `ResultsScene` to the mounted-scene model

Why this is separate:

- those surfaces have more coupling to search runtime, suggestions, and results presentation

Exit gate:

- Search/results route rendering no longer depends on active scene spec assembly

Delete gate:

- remove the spec-driven Search/results route path

### Slice E: SaveList and PollCreation migration

Goal:

- move the remaining route scenes into mounted-scene ownership

Exit gate:

- all route scenes are mounted component scenes

Delete gate:

- remove spec-registry bridge entirely

### Slice F: Legacy route-spec deletion

Goal:

- finish deleting the old model

Delete targets:

- `useSearchRoute*PanelSpec` hot-path usage
- spec-driven scene assembly in the route host
- route-scene registry bridge used only to support the old model

Exit gate:

- the route host is a shell coordinator, not a render assembler

## Expected Wins

If the migration succeeds, expected wins are:

- smaller first-commit JS work on scene switches
- fewer host-level nested updates after scene change
- less route-host reconciliation fanout
- simpler attribution because the host only owns shell state

Expected log shape:

- `SearchRouteOverlayHost` first commit should stop dominating nav switches
- remaining work should mostly be the active scene and shell snap/header changes
- hidden scenes should stop producing meaningful switch-time work

## Risks

1. Mixed model drift

- Keeping spec scenes and mounted scenes alive together for too long will recreate the same complexity problem.

2. Shell behavior regressions

- Snap/header/close behavior may regress if shell ownership is moved without an explicit contract.

3. Hidden-scene state leaks

- Retained scenes can keep subscriptions or query churn alive if not frozen/guarded carefully.

4. Gesture ownership regressions

- The shell must remain the sole owner of gesture/snap runtime even as scenes move out.

## Validation Plan

After each promoted slice, test:

1. `search -> bookmarks`
2. `bookmarks -> profile`
3. `profile -> bookmarks`
4. `bookmarks -> search`

Capture:

- `[NAV-SWITCH-PERF]` spans for:
  - `SearchRouteOverlayHost`
  - `SearchScreen`
  - `BottomNav`
- `[NAV-SWITCH-ATTRIBUTION]` lines

Primary success metric:

- first `SearchRouteOverlayHost` commit materially drops and no longer dominates switch-time JS work

Secondary success metric:

- no visible FPS drop during the above switches

## Stop Conditions

Stop and reassess only if:

- a slice requires carrying both the old and new route models without a clear short delete path
- the shell contract cannot be expressed without scene specs re-entering the host
- a regression shows the host still owns scene render assembly after a slice that was supposed to delete it

Otherwise, continue until the old spec-driven route path is gone.
