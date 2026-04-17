# Search Nav Switch Performance Architecture Working Plan

Last updated: 2026-04-17
Status: active working plan
Owner: Codex + Brandon
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/perf/**`
- `/Users/brandonkimble/crave-search/scripts/perf-nav-switch-loop.sh`
- Native surfaces touched by Search map / sheet presentation as needed

## Why This Exists

This is the working document for getting Search nav switches, sheet movement, and associated content loading to the ideal shape:

- repeatable
- self-documenting
- clean
- simple
- measurable
- robust against regressions
- fast enough that transitions feel polished rather than merely acceptable

The goal is not to keep locally shaving milliseconds off an architecture that fundamentally invites frame loss. The goal is to identify and remove the classes of problems that produce JS stalls, render churn, visual hitching, and startup/switch inconsistencies.

## Product Target

The target user experience is:

- screen switches feel immediate
- sheet movement is native-feeling and never appears to fight the runtime
- loading work does not visibly stall active transitions
- hidden or inactive scenes do not consume meaningful JS budget
- startup, tab switches, and overlay transitions all use the same deterministic contracts
- performance can be verified repeatedly with harness runs, samplers, and trace logs

## Non-Goals

- patching isolated symptoms without identifying the owning architectural seam
- adding more fallback logic to mask runtime uncertainty
- preserving legacy writer paths after ownership has been promoted elsewhere
- accepting unstable identity churn as “normal React behavior”

## Current Measurement Surface

### Existing instrumentation

- Nav switch handler / attribution probes:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-foreground-overlay-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/search-nav-switch-perf-probe.ts`
- Scene definition / scene layer diagnostics:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/SearchRouteMountedSceneOwners.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/BottomSheetWithFlashList.tsx`
- Profiler + stall instrumentation:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-runtime-profiler-instrumentation-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-runtime-stall-instrumentation-runtime.ts`
- JS/UI frame samplers:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/perf/js-frame-sampler.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/perf/ui-frame-sampler.ts`
- Harness config + nav switch harness:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/perf/harness-config.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/telemetry/nav-switch-harness-observer.ts`
  - `/Users/brandonkimble/crave-search/scripts/perf-nav-switch-loop.sh`

### Harness baseline we should keep using

- Real signed-in app session
- `search_nav_switch_loop` scenario
- JS frame sampler enabled
- UI frame sampler enabled
- repeatable nav sequence, default:
  - `search -> bookmarks -> profile -> bookmarks -> search`

### Required evidence for every performance claim

Every future claim should be backed by at least one of:

- harness run output
- JS frame sampler window
- UI frame sampler window
- `NAV-SWITCH-PERF` / `NAV-SWITCH-SCENE-LAYER-PERF` trace
- a concrete redbox / loop reproduction trace

If a change cannot be tied back to one of those, it is probably architectural speculation and should be treated as such.

## Baseline Harness Evidence

### Baseline run

- Run id:
  - `nav-switch-baseline-20260417a`
- Scenario:
  - `search -> bookmarks -> profile -> bookmarks -> search`
- Evidence files:
  - `/tmp/perf-nav-switch-loop-nav-switch-baseline-20260417a.log`
  - `/tmp/expo-metro-nav-switch-baseline-20260417a.log`

### What the baseline proves

- The current regression is primarily JS render / commit pressure, not a persistent UI-thread stall.
- Hidden scene work still exists, but it is not the dominant remaining cost.
- The dominant remaining cost is active-scene invalidation in `polls` and `profile`.

### UI frame sampler summary

- `search -> bookmarks`
  - `avgFps` around `60-61`
  - `floorFps` around `53-56`
  - `stallCount` `0`
- `bookmarks -> profile`
  - `avgFps` around `58-62`
  - `floorFps` around `31-50`
  - `stallCount` `0`
- `profile -> bookmarks`
  - `avgFps` around `60-61`
  - `floorFps` around `55-57`
  - `stallCount` `0`

Interpretation:

- there are no long UI stalls in the baseline
- but `bookmarks -> profile` has the weakest floor and worst max-frame behavior
- that matches the JS traces, which show `profile` injecting a second update wave during the switch window

### Trace summary

- `bookmarks -> search`
  - active `polls` body repeatedly reaches about `6.6ms`, `7ms`, and `11ms`
  - `SearchRouteOverlayHost` reaches about `16.9ms` total work in the worst observed sample
- `bookmarks -> profile`
  - active `profile` body reaches about `6.5ms`
  - `profile_fetch_start` happens around `39-47ms`
  - `created_fetch_start` happens again around `193ms` in the worst observed run
  - `fetch_settled` lands around `158-242ms`
- `profile -> bookmarks`
  - hidden `profile` body leakage is down to about `0.5-3.6ms`

Interpretation:

- `polls` remains the main active-scene switch hotspot
- `profile` remains the next active-scene hotspot
- `profile` is not expensive only on first render; it also injects fetch-driven follow-up commits after activation
- hidden-scene cleanup still matters, but active-scene restructuring is now the higher-value class

## Latest Verified State

### Verified run

- Run id:
  - `nav-switch-autonomous-20260417b`
- Evidence file:
  - `/tmp/perf-nav-switch-loop-nav-switch-autonomous-20260417b.log`

### What this run proves

- The signed-in harness is no longer showing sampler-confirmed dropped-frame windows on nav switches.
- UI frame sampler windows stayed at:
  - `stallCount: 0`
  - `maxFrameMs` about `17.8-19.4`
  - `floorFps` about `51.6-56.2`
- JS frame sampler emitted no windows at all for this run.

Interpretation:

- with the current architecture, the harness no longer sees low-FPS JS windows worth logging
- the remaining profiler spans are real work, but they are not currently translating into harness-confirmed frame drops
- future cuts should only continue if a fresh harness run reintroduces a sampler failure, not because a single React profiler span looks subjectively high

### Remaining non-failing noise

- `search -> bookmarks`
  - `bookmarks` still shows a first-run `query_fetch_start`
  - active `bookmarks` body still reached about `8.1ms` in the verified run
- `bookmarks -> profile`
  - first run still showed `profile_fetch_start,created_fetch_start`
  - second run was already warm and showed `fetch_settled` instead
- `bookmarks -> search`
  - active `polls` body was down to about `3.4ms` in the verified run

Interpretation:

- there is still cold-path fetch timing noise
- there is still visible-scene body work to watch
- neither currently crosses the harness threshold into a failing JS/UI frame-drop window

## Rejected Experiments

### Immediate inactive-tab scene mounting

- Trial:
  - promote `bookmarks` and `profile` scene owners to mount as soon as the search shell had visual state, without the existing `InteractionManager` prewarm gate
- Touched file:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/SearchRouteMountedSceneOwners.tsx`
- Outcome:
  - rejected and reverted

Why it failed:

- it moved more hidden-scene work into the first `search -> bookmarks` switch window
- the harness got worse, not better
- the degraded run showed:
  - `search -> bookmarks` `floorFps: 32.4`
  - `maxFrameMs: 30.9`
  - heavier `bookmarks` body / host nested-update work

Architectural takeaway:

- cold-path query timing was not primarily caused by the inactive-tab owner mount gate
- early hidden-scene ownership without a narrower surface budget is the wrong shape
- if we revisit cold-path prewarm later, it must happen through a lighter-weight owner or cache lane, not by mounting heavier scene owners earlier

## Current Root-Cause Catalogue

These are not generic mobile performance tips. These are classes already observed in this codebase.

### 1. Idempotence violations in runtime writers

Observed pattern:

- runtime code re-commits state that is semantically unchanged
- React state setters accept the “new” value anyway
- render surfaces then see prop identity churn and keep re-rendering
- in the worst case, this becomes an update loop

Confirmed example:

- Signed-in `Maximum update depth exceeded` loop
- root cause was the map camera writer path accepting identical `center`, `zoom`, and `mapCameraAnimation` updates
- fixed in:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-runtime-owner.ts`

Class of bad practice:

- imperative runtime owners writing into React state without semantic equality guards

Ideal target shape:

- every runtime writer that bridges imperative/native/controller state into React state must be idempotent by default
- “set” should mean “commit semantic change”, not “assign payload object”

### 2. React identity churn on performance-sensitive contracts

Observed pattern:

- large runtime contracts are recreated frequently
- downstream layers rely on reference equality
- registry/surface/host layers re-render more than necessary

Seen in:

- scene definitions
- scene surfaces
- map render props
- overlay host models

Class of bad practice:

- using raw object identity as the ownership boundary for high-frequency contracts without ensuring the producer is stable

Ideal target shape:

- performance-critical contracts are semantic-first and memo-stable
- producers own stability
- consumers should not need defensive local patching unless they are true ownership boundaries

### 3. Hidden or inactive scene work leaking into active transitions

Observed pattern:

- hidden scenes still publish body/header work
- non-visible content trees continue participating in switch commits
- active scene cost gets mixed with inactive scene noise

Seen in traces as:

- hidden `profile` body work during unrelated switches
- hidden `polls` body/header work
- scene registry layer activity for non-active scenes

Class of bad practice:

- treating mounted as equivalent to live
- keeping hidden scenes on live render/update policy without proving the user-visible benefit

Ideal target shape:

- mounted is allowed
- live is opt-in
- hidden scenes default to frozen surfaces, suspended data churn, and no expensive derived work

### 4. Startup / navigation geometry derived from inconsistent coordinate spaces

Observed pattern:

- startup contracts and rendered layout were using different viewport sources
- sheet and nav disagreed about the same positions
- this produced visual gaps, sheet drift, and assertion failures

Seen in:

- startup `bottomNav.top` drift assertion
- polls header floating above the nav

Class of bad practice:

- using multiple coordinate systems for the same UI contract

Ideal target shape:

- one deterministic startup geometry contract
- one rendered layout contract
- they are derived from the same root viewport semantics

### 5. Active-scene body work is too heavy during nav switches

Observed pattern:

- even after hidden-scene churn is reduced, active scene bodies still dominate switch cost
- `polls` and `profile` body work remain the major JS cost during transitions

Seen in traces as:

- `NAV-SWITCH-SCENE-LAYER-PERF` body durations for active `polls`
- `NAV-SWITCH-SCENE-LAYER-PERF` body durations for active `profile`
- `SearchRouteOverlayHost` commit spans tracking those bodies

Class of bad practice:

- rendering detail/computation that does not materially affect the current snap or visible state
- allowing fetch state / list state / view-model state to invalidate large content surfaces during transition frames

Ideal target shape:

- per-scene content surfaces stratified by snap and activity
- collapsed view renders collapsed content only
- detail surfaces mount only when actually reachable or visible
- data invalidation is narrowed to the smallest visible surface that needs it

Concrete examples in this repo:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx`
  - one scene surface still owns both collapsed poll-lane behavior and expanded detail / vote / suggestion behavior
  - `ListFooterComponent` is rebuilt from active poll, voting totals, restaurant autocomplete state, dish autocomplete state, and submit handlers
  - the collapsed lane therefore inherits invalidation from detail-state it does not visually need
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/ProfilePanel.tsx`
  - one monolithic `ProfileSceneContent` owns profile hero, stats, segments, poll lists, and favorites grids
  - fetch-driven updates re-render that single content boundary instead of hydrating a narrower nested surface

### 6. React state used as a transport for transition mechanics

Observed pattern:

- transition mechanics move through React state even when they originate from controller/native/gesture logic
- this inflates render frequency and couples render commits to transport bookkeeping

Seen in:

- camera / presentation transport
- sheet snap requests and intermediate runtime contracts

Class of bad practice:

- pushing transport-state volatility through render-state ownership

Ideal target shape:

- transport/state machine lanes are imperative and minimal
- React consumes stable projections of those lanes
- render state is the view contract, not the transport bus

## Current Root-Cause Attribution Rules

When we see a frame drop, we should classify it into one primary class before changing code.

### Class A: writer loop / churn

Signals:

- repeated identical model deltas
- same route / same visible scene
- repeated `rootRuntime:outputs` or host updates without user input
- redbox risk

Owning fix:

- idempotent writer boundary

### Class B: hidden scene leakage

Signals:

- non-active scene body/header work during a switch
- high layer cost while `active: false`

Owning fix:

- freeze / suspend / stop publishing hidden scene work

### Class C: active surface overweight

Signals:

- active scene body dominates cost
- hidden scene cost is already low
- switch still drops frames

Owning fix:

- reduce active scene invalidation domain
- split heavy subtrees by snap and visibility

Concrete current owners:

- `polls`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx`
- `profile`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/ProfilePanel.tsx`

### Class D: layout/geometry instability

Signals:

- startup drift
- gap between nav and sheet
- assertion mismatches
- post-mount realignment pressure

Owning fix:

- deterministic geometry contract

### Class E: transport-through-render

Signals:

- controller or native state changes force React tree churn
- motion/presentation coordination changes appear as prop storms

Owning fix:

- move transport ownership out of render state

### Class F: fetch lifecycle injected into switch lifecycle

Signals:

- route is already active
- second-wave commits appear from fetch start / fetch settle
- scene surface changes without a route or snap change

Owning fix:

- keep scene chrome stable
- move fetch-driven invalidation beneath a narrower nested data surface
- do not let query startup rewrite the whole scene contract

## Ideal Target Architecture

This is the shape we should deliberately move toward.

### 1. Deterministic contracts at every expensive boundary

Performance-critical boundaries should be:

- semantic
- stable
- versionable
- easy to assert

Important boundaries:

- startup geometry
- active scene shell contract
- active scene surface contract
- map render surface model
- profiler / harness event boundaries

### 2. Single-owner runtime lanes

Every volatile concern should have one owner:

- geometry
- camera transport
- overlay route/session state
- active scene resolution
- scene content model
- native presentation transport

If the same concern is being rewritten in multiple places, that is architecture debt, not flexibility.

### 3. Freeze-by-default for non-visible work

Rules:

- hidden scenes freeze
- inactive data queries disable unless explicitly justified
- hidden list bodies do not participate in switch commits
- live hidden updates require a documented reason

### 4. React consumes projections, not transport

React-facing models should be:

- stable projections of runtime/controller/native state
- not the place where transport coordination is performed

In practice:

- controller lanes can be imperative
- render lanes must be semantic and minimal

### 5. Snap-aware scene composition

Each scene should have explicit render tiers:

- collapsed tier
- middle tier, if needed
- expanded/detail tier

A collapsed sheet should not build expanded-only UI.

### 6. Perf budgets as code, not folklore

We should define explicit budgets for:

- nav switch JS floor FPS
- nav switch UI floor FPS
- per-switch worst stall
- active scene body max duration
- hidden scene body max duration

Those should eventually be gated by scripts, not remembered by humans.

## Panel-Specific Root Causes

These are the current concrete architectural issues we should design out rather than continue to patch locally.

### Polls panel: collapsed and expanded states are coupled into one surface

Evidence:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx`
- harness traces from `bookmarks -> search` show active `polls` body work around `6.6ms`, `7ms`, and `11ms`

Current bad pattern:

- the `polls` scene publishes one list surface for every snap state
- that surface still carries:
  - list data
  - header action state
  - create button state
  - empty/loading state
  - active poll detail
  - voting state
  - restaurant autocomplete state
  - dish autocomplete state
  - submit-option state
- the collapsed poll lane is therefore invalidated by expanded-only detail state

Ideal target shape:

- split `polls` into explicit snap-owned surfaces:
  - `collapsedLaneSurface`
  - `detailSurface`
  - `composeSurface`
- collapsed search-root re-entry should mount only the collapsed lane contract
- expanded-only detail and suggestion flows should not participate in the collapsed transition budget
- the scene definition should switch semantic surfaces by snap instead of keeping one union surface alive

### Profile panel: fetch startup and content rendering are coupled

Evidence:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/ProfilePanel.tsx`
- harness traces from `bookmarks -> profile` show:
  - `profile_fetch_start` around `39-47ms`
  - `created_fetch_start` around `193ms` in the worst observed run
  - `fetch_settled` around `158-242ms`
  - active `profile` body around `6.5ms`

Current bad pattern:

- `ProfileSceneContent` is a single monolithic content tree
- profile entry turns on query activity and content rendering on the same scene boundary
- once the scene is active, fetch lifecycle changes rewrite `contentComponent`, which rewrites `sceneSurface`, which causes a second update wave during the switch window

Ideal target shape:

- split profile into:
  - `profileChromeSurface`
  - `profileSummarySurface`
  - `profileSegmentSurface`
  - `profileSegmentDataSurface`
- entry should render chrome and summary from a stable contract immediately
- segment data fetches should hydrate a nested section without invalidating the whole scene surface
- `sceneSurface` identity should not change when only segment data loading state changes

### Profile panel: content is not shape-bounded

Evidence:

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/ProfilePanel.tsx`
- `ProfileSceneContent` maps active polls and favorite lists directly inside one content component

Current bad pattern:

- a single memoized component still owns potentially large mapped trees
- the component is not split by segment ownership
- the component is not bounded by smaller owned surfaces
- any change to active segment data or loading flags can regenerate the entire subtree

Ideal target shape:

- each profile segment owns its own surface and list strategy
- lists that can grow use virtualization or bounded preview surfaces
- segment switching swaps owned segment surfaces instead of re-rendering a monolith

## Working Performance Hypotheses

These are the current likely high-value remaining causes after the signed-in crash fix.

### Hypothesis 1

`PollsPanel` active body work is still too broad for collapsed docked mode.

Why:

- traces repeatedly show active `polls` body as a dominant switch cost
- `search` re-entry activates `polls`

Ideal fix class:

- collapsed-specific surface
- narrower invalidation inputs

### Hypothesis 2

`ProfilePanel` active scene content still invalidates too much during entry and fetch transitions.

Why:

- `profile` body work remains one of the largest active-scene spans
- harness traces show `profile_fetch_start` followed by a second `created_fetch_start` wave during the same switch window
- fetch transitions likely invalidate large content surfaces

Ideal fix class:

- explicit loading skeleton surface vs full content surface
- narrower segment/list invalidation

### Hypothesis 3

Map render surface is still doing more root-level prop churn than ideal, even after the camera loop fix.

Why:

- `rootRuntime:outputs` still shows frequent `mapRenderSurfaceModel` / `searchMapProps` changes
- not necessarily a crash anymore, but still a potential frame-budget consumer

Ideal fix class:

- stabilize root map projections
- split high-frequency map transport from render props

## Repeatable Investigation Workflow

For every nav-switch slice:

1. Reproduce with harness:
   - `search_nav_switch_loop`
   - signed-in session
   - JS and UI samplers enabled
2. Capture:
   - JS frame sampler windows
   - UI frame sampler windows
   - `NAV-SWITCH-PERF` trace
3. Attribute each bad run to one class:
   - writer churn
   - hidden leakage
   - active overweight
   - geometry instability
   - transport-through-render
4. Fix only the owning class seam.
5. Re-run the same harness.
6. Update this document with:
   - what changed
   - what class was addressed
   - what evidence improved or failed to improve

## Working Rules For Future Changes

- Do not add a fallback if the correct owning contract can be made deterministic.
- Do not preserve redundant writer paths after a promotion is complete.
- Do not treat reference churn as harmless in hot paths.
- Do not keep hidden scenes live unless that behavior is explicitly justified in this document.
- Do not accept “it only happens on startup” or “only while loading” as a reason to avoid fixing the owning architecture.

## Immediate Next Slices

### Slice 1: Establish nav-switch perf baselines with signed-in harness

Deliverables:

- documented harness invocation
- saved baseline outputs for current nav sequence
- worst-run attribution table

Status:

- complete for `nav-switch-baseline-20260417a`

### Slice 2: Attribute remaining active `polls` switch cost

Deliverables:

- collapsed vs expanded invalidation map
- identified unnecessary collapsed-body work
- target render-tier split

Current attribution:

- active overweight confirmed
- current owner is the union `sceneSurface` in `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/PollsPanel.tsx`

### Slice 3: Attribute remaining active `profile` switch cost

Deliverables:

- entry/loading/content invalidation map
- identified large content surfaces that can be split or frozen
- target surface model

Current attribution:

- active overweight confirmed
- fetch-lifecycle-in-switch confirmed
- current owner is the monolithic `contentComponent` / `sceneSurface` pairing in `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/ProfilePanel.tsx`

### Slice 4: Audit root map render prop churn

Deliverables:

- list of `searchMapProps` fields that still change during idle or nav switches
- classification of each as required vs architectural leakage
- target projection boundary

## Change Log

### 2026-04-17

- Removed temporary harness route override from `AppRouteCoordinator`.
- Reproduced signed-in `Maximum update depth exceeded` loop on the real auth path.
- Confirmed the root loop was not the harness.
- Fixed the actual crash by making camera writer state updates idempotent in:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-runtime-owner.ts`
- Verified signed-in simulator path returns to the Search screen without the redbox.
- Started this working architecture plan to keep future performance work tied to measurable root-cause classes instead of symptom patches.
- Added signed-in harness baseline evidence from `nav-switch-baseline-20260417a`.
- Attributed current switch cost primarily to:
  - `polls` active-body overweight caused by collapsed and expanded behavior sharing one surface
  - `profile` second-wave fetch invalidation during switch windows
  - `profile` monolithic content ownership
