# The Toggle Primitive, Rederived (OA12, 2026-08-08)

Owner ruling OA12: variant A — strip stays live, skeleton beneath where results land —
is THE canonical behavior of every toggle strip, current and future, baked into the
primitive so a surface gets it by construction and cannot opt out. The A/B flag and the
bare-white arm die. This document is the ground-up rederivation (mandated: a cohesive
design, not a retrofit), written BEFORE the implementation.

## 1. What exists today (the Phase-1 audit)

| Surface | Strip home (spec) | Press path today | Awaiting face today |
|---|---|---|---|
| Polls feed (Live/Closed + All/Place/New) | `header` chrome (PollsFeedStrip) | store write -> `subscribeToPollsFeedControlChanges` -> `useContentToggle<'feed_query'>` in polls-feed-runtime-controller | OA9 refetch skeleton behind `__CRAVE_POLLS_TOGGLE_SEAM_SKELETON` A/B flag; disarmed arm = bare white (`resolvePollsToggleSeamAwaitingMaterial(false) -> null`) |
| Lists home (Restaurants/Dishes + Recent/Custom) | `header` chrome (ListsHomeStrip) | module-scope `createToggleStripConsequenceSeam` with `settleMs: 0`, press edge = store subscription | none observable: synchronous re-slice, 'awaiting' set and cleared in one call stack |
| List detail (sort / open-now / price / city chips) | `in-list` strip | `useContentToggle<'sort'|'open_now'|'price'|'city'>` (`surfaceName: 'list-detail'`); world-flip or query refetch runner | **bare white** — `contentPhase === 'awaiting' ? null : ...` (ListDetailPanel.tsx:939) |
| Search results (dish/restaurant bands, open-now, etc.) | search-owned strip | `createToggleStripConsequenceSeam` with `consequence: 'world'` + presentation floor gate (use-results-presentation-toggle-coordinator) | the world reveal system: strip live, results region covered by search's own presentation skeleton — the ORIGIN of variant A |
| SaveList side flip (Restaurants/Dishes) + visibility | bare `SegmentedToggle`s | local `setState`, synchronous re-slice, no seam | n/a (no async gap exists) |
| ListEditHost segmented control | bare `SegmentedToggle` | synchronous edit-mode control | n/a |
| Profile / Home | no toggle strip today (`strip` per spec) | — | — |

Skeleton owners today (the twins seam, 018542e8e / d3f48d685):
1. the track handoff skeleton (`use-track-leg-resolver` rendererForSkeleton, painted on the
   flip frame and held by `planTrackHandoffRelease` until flip-painted AND resolution-ready);
2. the data-gate skeleton (`SceneBodyReadyGate` inside a mounted body, painted while the
   body's query is pending, minHeight 320 owned by the gate).
They are pixel-continuous (same material via `trackSkeletonMaterialForScene` /
`resolveSceneLoadingMaterial`, same geometry via `SceneSkeletonWidthHintContext`) but they
are two component instances — a seam, not one owner.

## 2. The rederived design

### 2.1 The one law

A toggle press on any strip-bearing surface produces, in the SAME commit as the
press-edge content exit: the strip stays mounted and interactive; the results region
paints the scene's declared refetch material (`resolveSceneLoadingMaterial(scene,
'refetch')` — never strip holes, because the real strip is live above it); results
reveal per the OA11 reveal law (text/structure in the ready commit, images fade from
reveal). There is no other awaiting face. Not configurable.

### 2.2 Where the law lives: the primitive owns the face

`useContentToggle` — the React face of the `consequence: 'content'` seam — gains a
REQUIRED creation argument `scene: OverlayKey` and returns, in addition to
`{ seam, phase }`, an `awaitingFace: React.ReactElement | null`:

- `phase === 'awaiting'` and the scene has a foundation material ->
  `<SceneLoadingSurface rowType={material.rowType} withFilterStripHoles={false} />`
  built from `resolveToggleAwaitingMaterial(scene)` =
  `resolveSceneLoadingMaterial(scene, 'refetch')` (the ONE material path — all
  variants, cold strip-replacing / refetch under-strip / per-scene rowType, stay one
  family through that resolver).
- otherwise `null`.

Structural no-opt-out: the declaration has no field that suppresses or replaces the
face; the disarmed/bare-white arm is not representable. TypeScript makes `scene`
mandatory, so a NEW content-toggle surface cannot compile without joining the law.
Surfaces render `awaitingFace` where their results land; the phase alone remains
available for list-data gating (emptying the FlashList data on 'awaiting' is still the
exit mechanism), but the face they paint in that window is the primitive's.

Why the face is an ELEMENT and not a material: returning data would leave each surface
re-deciding the component (the exact per-surface bespoke-face class OA12 kills). The
element is built once, from one resolver, by the one hook every async toggle rides.

### 2.3 The family, per consequence class

- `consequence: 'content'` + async runner (polls, list detail, future strips): the hook,
  as above. Canonical variant A.
- `consequence: 'content'` + synchronous re-slice (lists home, saveList flip): the
  awaiting window is unobservable by construction (`settleMs: 0` — set and cleared in
  one call stack), so variant A holds vacuously; the seam still records the press for
  instrumentation. A surface whose slice ever becomes async must move to the hook —
  the module-scope creator is for the degenerate synchronous case only (stated in
  use-content-toggle's doc).
- `consequence: 'world'` (search): the presented-world swap IS the consequence and the
  world reveal system is the face — strip live, results region covered until the world
  fade completes. That is variant A, implemented by the reveal machinery the OA9 ruling
  promoted in the first place; it does not additionally ride `awaitingFace`.
- Bare `SegmentedToggle`s off any strip (saveList visibility, edit-mode controls):
  form controls, not content toggles — no results region, no seam.

### 2.4 Kill-list

- `__CRAVE_POLLS_TOGGLE_SEAM_SKELETON` (the A/B flag) — dead.
- `isPollsToggleSeamSkeletonArmed`, `resolvePollsToggleSeamAwaitingMaterial` — dead
  (the primitive's awaitingFace replaces both; polls-toggle-seam.ts keeps only the
  [PERF] press->painted probe).
- The bare-white arm in PollsPanel's ListEmptyComponent (`awaitingMaterial == null ->
  return null`) — dead.
- ListDetailPanel's `contentPhase === 'awaiting' ? null` bespoke face — dead.
- The per-surface right to choose an awaiting face at all — dead (the hook returns it).

### 2.5 One skeleton owner (the twins-seam collapse) — the from-scratch shape

The ideal: ONE `SceneLoadingSurface` instance spans press -> data-ready. The twins
exist because of two constraints pulling opposite ways: the handoff must NOT mount the
real body in the flip frame (expensive-body falsifier), and the body must be mounted to
fetch (fetch-once-mounted), after which only IT knows query readiness. No single
component can currently satisfy both, hence the seam.

The from-scratch answer (the strip-choreography doc's named follow-up, confirmed here):
move pending-height/paint ownership OUT of SceneBodyReadyGate into the leg cell. The
gate inverts from painter to REPORTER: when a `SceneBodyPendingReporterContext` is
provided (the track leg provides it), the gate renders nothing and reports its pending
fact upward; the resolver keeps its ONE skeleton mounted — as the cell's overlay, which
now owns the pending height — from the flip commit until BOTH release facts hold AND
the reported pending clears. The handoff release then mounts the body UNDER the
persistent skeleton instead of swapping skeleton for body, and the skeleton's unmount
is the reveal commit. One instance, no remount, no seam; off-track (old host) the gate
keeps painting as today.

Status: DESIGNED, NOT IMPLEMENTED in this change. Two reasons, both honest: (a) the
implementation lives in `use-track-leg-resolver.tsx`, which a concurrently-running
agent is restructuring this same session (the mounted-body-registry rung — the parent
explicitly fenced that territory); (b) it re-times the handoff release semantics that
three live falsifiers pin (release-law bark, expensive-body, reveal-law), which must be
re-proven RED in the same change that moves them — not around a concurrent rewrite of
the same file. It is the next rung, with this section as its spec.

## 3. Falsifiers (same change, RED by mutation)

1. `resolveToggleAwaitingMaterial` returns the scene's refetch material and NEVER mints
   strip holes — RED by mutating the seam argument to 'cold'.
2. The hook's awaiting window carries a non-null `awaitingFace` bearing the resolved
   material, and settles back to null — RED by mutating the hook to return null while
   awaiting (the resurrected bare-white arm).
3. The bare-white arm is unrepresentable in source: no `=== 'awaiting' ? null` awaiting
   face and no `__CRAVE_POLLS_TOGGLE_SEAM_SKELETON` anywhere in src — RED by
   reintroducing either token.
4. Existing OA9 material falsifiers (variant selection is data; refetch never mints
   holes; material identical across seams) stay, minus the dead disarmed-arm case.
5. Existing handoff/expensive-body falsifiers stay green untouched.
