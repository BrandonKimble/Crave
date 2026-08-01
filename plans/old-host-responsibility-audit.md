# THE RESPONSIBILITY AUDIT — old sheet system → ONE TRACK

2026-08-01. The process fix for the red-team round: the old host carried
INVISIBLE DUTIES (scene-key policy, the hit-test carve, the join seal) that no
plan enumerated, so the migration ported the visible things and dropped the
invisible ones. This ledger enumerates every duty of the old system with its
status in the track world. Nothing gets deleted until its row here is PORTED,
SUPERSEDED, or deliberately dropped with the owner's sign-off.

Statuses: PORTED (where) / SUPERSEDED (by what) / DROPPED (gap) / NOT-YET
(search/results + child dismiss, deliberately last).

## Closed by the 2026-08-01 red-team round

- Presented-vs-active scene resolution — PORTED (TrackSheetRouteHost, both sites).
- Native posture carry across legs — PORTED (THE POSTURE REGISTER in
  TrackScrollPhysics: one sheet posture, written by the presented leg's
  didScroll, read by refuse, seeded at attach).
- Transition-join SEAL — PORTED (ack bridge arms {paint,chrome} + seals).
- Zero-pixel settle — PORTED (executeMotionCommand completes the token
  synchronously when the snap short-circuits; 700ms timer is safety net only).
- Hit-test carve above sheetTop — IN FLIGHT (native carve, the
  CraveBottomSheetHostView pointInside analogue).

## DROPPED — ranked by user impact (the work queue)

1. Dismiss choreography / 'hidden' snap — sheet can never hide; onHidden never
   fires (motion controller still emits snap:'hidden').
2. Shell residency visibility bit has NO WRITER — useShellLiveness panels
   (messaging, notifications, child scenes) read frozen state; background
   data + shimmer liveness wrong app-wide. (Also the hidden-skeleton-shimmer
   finding from the residents round — same family.)
3. Snap-gated body activity hardcoded all-true — every mounted body runs its
   data lane + expanded content permanently (Rung 4 "derive from τ" never landed).
4. Touch-blocking + interactionEnabled gates — nothing can freeze sheet input
   during choreography.
5. Drag/settle/snap_start/momentum signal fan-out — riders see a permanently
   at-rest sheet (map/search choreography timing).
6. Keyboard policy per scene (keyboardShouldPersistTaps/dismissMode) —
   dmSession/compose flows revert to defaults.
7. Freeze-mode dismissal chrome + PF headerNavAction clock — header flips a
   frame early on freeze dismissals; plus↔X timing off the chrome clock.
8. Static-scroll divider publications — dmSession-style bodies never fade the
   divider (track divider is τ-only).
9. Entry-keyed child mounts (W1) — stacked child entries lose buried mounted
   state on pop.
10. Dismiss-return scroll restore lane + imperative scene scroll handles —
    return restore and drag-reorder auto-scroll no-op.
11. World-desire session close from the X (fold into NOT-YET search work).
12. Dev contracts (RED instruments): chrome-geometry bark vs
    computeSceneChromeHeight, missing-descriptor/inverse-strip barks,
    foundation-driven skeleton rowType (+ strip holes), grabHandle from
    foundation spec (not hardcoded settings), header Extras slot.

## Also noted

- Ack bridge over-acks paint without evidence (old host offered a warm paint
  ack only with hasPaintedSceneKeys evidence) — the join's "presented ⇒
  painted" guarantee is nominal on the track.
- sceneScrollStateRegistry boundary-facts has no writer — verify no residual
  reader before deleting.
- 700ms settle fallback can complete a token before a slow spring rests.
- Skeleton branch: hardcoded rowType="restaurant", no per-scene foundation
  shape, no withFilterStripHoles.
- Per-scene flashListProps transport ignored (fixed subset forwarded).
- CraveBottomSheetHostView.swift has NO JS mount — dead native code, safe to
  delete in the cleanup pass.
- Android shadow variant dropped (track is iOS-native; flag if Android matters).

## SUPERSEDED (no action)

Sheet drag/detent resolution, scroll-vs-sheet arbitration, four-lane
transition player, held-switch strip law (per-leg chrome), boundary-facts for
the track itself (native range law), 12% scrim (owner-deleted), MVCP-off.

## PORTED (verified by the auditor)

Programmatic snaps + motion target (+resolveCurrentSnapTarget), posture
memory (gesture-only writer split), publications bridge
(sheetTranslateY/sheetScrollOffset), redraw 'sheet' leg, chrome+paint acks,
nav exclusion (SearchRouteSheetFrameHost reuse), touch arbitration between
legs, pagination activity, a11y labels, docked-lane composition, shadow/
silhouette/frost/white-plate laws, close/create nav actions (minus the two
dropped branches in #7/#11).
