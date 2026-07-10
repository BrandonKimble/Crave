# S-C.5 item 3 + S-D restaurant — "profile open" becomes a stack fact (design)

**Status: DESIGN (2026-07-09 ~10:20PM). Survey facts verified against source (file:line cited).
Implementation = a fresh focused session, slices below.**

## What the survey killed

The ideal-shape auditor framed the ref-bridge as "a second nav mechanism parallel to the
stack." The 83-file profile-machine survey shows that's WRONG on open: **every profile open
already emits `request_overlay_switch → targetSceneKey 'restaurant'`** (route-intent
normalizer :78-127; `updateActive` when a search-sourced restaurant route exists, else
`push`). There is no presentation-only open. Autocomplete fast-path and result-card taps
share ONE entry function (`openRestaurantProfilePreview` → `executeProfilePreviewAction`),
differing only in options. The stack fact already exists.

## What the ref quartet actually is (all `.current` assigned by ONE publication effect,

use-search-root-profile-bridge-publication-runtime.ts:16-25)

1. `profilePresentationActiveRef` — mirror of `profileViewState.presentation.isPresentationActive`.
   Consumers: beginCloseSearch dismiss routing (already checked ALONGSIDE
   `activeRouteKey === 'restaurant'`), clear gating, transient cleanup.
2. `prepareRestaurantProfileForTerminalSearchDismissRef` — imperative
   `focusPreparedProfileCamera(savedCamera)` — the SECOND camera-restore path, existing only
   because the terminal search dismiss bypasses the profile's own close (whose route intent
   carries `cameraIntent = resolveProfileCameraIntent(restoreCamera)`, normalizer :158).
3. `clearRestaurantProfileForSearchDismissRef` — hydration cancel + highlight clear +
   `finalizePreparedProfileCloseState` — profile teardown for when the session is torn down
   AROUND the profile instead of closing it first.
4. `resetRestaurantProfileFocusSessionRef` — focus-session record reset, same reason.

So the quartet = ONE state mirror + THREE compensations for the search dismissal not closing
the restaurant child through its own machinery.

## The ideal shape

**The search dismissal never handles "profile" at all.** A dismissal issued while a
restaurant child tops the stack FIRST closes the restaurant through the profile machine's own
close (the closeActive pop whose route intent carries the camera restore — ONE camera-restore
owner), and THEN dismisses the session beneath. Equivalently: popping the restaurant ENTRY
drives profile close finalization — entries-as-values, teardown owned by the entry's pop.
Consequences when done:

- `terminalDismissSource` collapses to one value and DIES; `outgoingSheetSceneKey` derives
  from route state at armDismissMotion time; the intent-runtime options bag empties.
- The ref quartet + the publication effect + the bridge-authority runtime DIE (the state
  mirror's consumers read route facts; the three compensations become the entry-pop's own
  close path).
- `clearSearchAfterProfileDismiss` (the ~90% fork of clearSearchState, S-C.5 item 8) loses
  its reason to exist.
- The camera-restore dual path collapses (map-adjacent RISK: this is the one place the cut
  touches camera choreography — the pop-driven close must fire the SAME
  `cameraIntent`/`restoreCamera` the back-button close fires today; instrument the composite:
  camera position after dismiss == camera position before profile open).

## S-D restaurant piece (rides slice D)

`resolveEntityRefAction(restaurant)` = the existing composite the launch-intent arm built:
warm-seed `openRestaurantProfilePreview(id, name)` + committed `runRestaurantEntitySearch`
(the restaurant-only world; auto-open resolves to the warm profile). The launch arm
(use-search-foreground-launch-intent-runtime.ts:82-194, ~110 lines incl. the no-name fetch
fallback) becomes the policy fn's restaurant implementation; EntityLink calls it; the arm
deletes. NOTE the S-D plan line "restaurant → restaurantProfile push" is IMPRECISE — it is a
push+world composite, not a bare push (the profile rides the search world for results/dishes).

## SLICE-A PROBE RESULT (2026-07-09 ~10:15PM — measured on-rig, probe stripped after)

The [SC5A-DIVERGE] probe (publication effect, isPresentationActive vs activeKey==='restaurant')
fired EXACTLY ONCE across a full open→back-close cycle, on the CLOSE side: the route pop
committed active='search' (switchId 6) and the presentation flag cleared one render later.
OPEN showed zero divergence (the openChild push and the view-state flip commit together).

Verdict: the mirror equals the stack fact everywhere except a 1-frame close-side lag where
the STACK FACT IS THE MORE CORRECT SIGNAL (the profile is already gone; the mirror would
route a search-X in that frame as a 'profile' dismissal of a closed profile, and would run
the profile-dismiss clear redundantly — both harmless today, both wrong-shaped). Slice A is
green-lit: replace mirror reads with route facts outright; no divergence-window special case
is needed. Rig lever discovered: `tapOn: text: 'View <restaurant name>'` (the result card's
accessibilityLabel) opens the profile reliably — coordinate and bare-name taps both fail.

## Slices (each rig-proven before the next)

- **A. Deriving the mirror.** Replace `profilePresentationActiveRef` reads with route facts
  where provably equivalent (beginCloseSearch already half-does this); keep the view-state
  read ONLY where presentation-vs-route divergence is real (identify the divergence window
  first with a probe: log when `isPresentationActive !== (activeRouteKey === 'restaurant')`).
- **B. One camera-restore owner.** The terminal dismissal with a restaurant on top first
  pops the restaurant child via the profile close path (closeActive + cameraIntent), then
  runs the plain home dismissal. `prepareRestaurantProfileForTerminalSearchDismissRef` dies.
  Composite camera probe before/after.
- **C. Entry-pop-owned teardown.** Profile hydration-cancel/highlight-clear/focus-reset run
  from the profile close finalization on ANY pop of the restaurant entry (incl. popToRoot
  sweeps); `clearRestaurantProfileForSearchDismissRef` + `resetRestaurantProfileFocusSessionRef`
  - the publication effect + bridge authority die; `terminalDismissSource` axis +
    `outgoingSheetSceneKey` fork die; `clearSearchAfterProfileDismiss` folds into
    clearSearchState options.
- **D. S-D.1 restaurant arm.** `resolveEntityRefAction` restaurant branch = the warm-profile
  composite; launch-intent restaurant arm deletes; EntityLink's first restaurant consumer
  (poll spans) proves byte-parity with today's comment-span tap.

## IMPLEMENTATION STATUS (2026-07-09 ~11PM)

- **Slice A SHIPPED (45525a80):** beginCloseSearch's two mirror reads → stack fact; ref prop
  threading dropped through the presentation-owner chain.
- **Slices B+C SHIPPED (2ad31448):** pop-owned teardown live — the pop-teardown writer
  (registerTarget on the navigation authority) runs the COMMIT half (camera restore +
  hydration cancel + highlight clear + focus reset; machine-close guard via live transition
  state) at the pop and defers the SETTLE half (panel-snapshot clear) to PF outgoing==null so
  the dismissal slide never renders a nulled snapshot. prepare/clear bridge refs DELETED end
  to end; clear-owner profile block + skipProfileDismissClear + finalizeCloseSearch's source
  param DELETED. profilePresentationActiveRef survives for foreground-UI consumers only;
  closeRestaurantProfileRef survives (live consumers). Rig: back-close correctly skips both
  halves; terminal X dismiss fires one commit + one settle in order; pop-shaped
  profile-over-favorites-session fires both and restores Favorites; canonical home end
  states. ⚠️ Owner finger check: camera-restore FEEL on the terminal dismiss.
- **Slice D = S-D.1 (NOT started):** EntityRef + resolveEntityRefAction + EntityLink; the
  launch-intent restaurant arm becomes the policy fn's warm-profile composite. This is the
  first S-D slice proper — fresh session.
- **Deferred residue for the S-D/S-C.6 passes:** the terminalDismissSource axis is now
  INERT plumbing (still selects outgoingSheetSceneKey freeze + intent-state labels; no
  behavioral consumer) — delete with the close-chain collapse (S-C.5 item 2); the
  profilePresentationActive foreground consumers (editing/clear runtimes) can move to the
  stack fact when a route getter reaches them; applyPreparedProfileOverlayDismissUpdate is
  DEAD (zero callers) — delete or wire deliberately.

## Risks / verification

- Camera choreography is the precious surface (map is DONE): slice B needs the composite
  camera probe + finger feel-check. Do NOT touch LodEngine/render-controller internals.
- The updateActive branch (search-sourced restaurant route reuse) must keep working for
  in-session re-opens (result card → profile → back → another card).
- Rig entry points: result-card tap (needs a results world — set_map_camera_and_resolve_market
  first), autocomplete restaurant pick, poll comment span (blocked on seeded comments —
  owner finger test).
