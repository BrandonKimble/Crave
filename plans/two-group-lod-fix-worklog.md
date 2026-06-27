# Two-Group Pin LOD — diagnosis + fix worklog (2026-06-18)

From on-device testing: several behaviors don't match the intended model. Investigation
(3 agents) found one central defect + two specific issues. Two of this session's earlier
changes worsened things. Do NOT stop until #1-#3 + #5 are fixed; #4 (jitter) is deferred per
the user (it is a steady-pin geometric anchor shift, NOT crossfade churn — separate problem).

Status: [ ] todo · [~] in progress · [x] done+committed
Validate native with IOS_RUN=1. API on :3000. Sim UDID 7B0DD874-3496-46F7-9480-3EDDABCE2F31.

---

## CENTRAL DEFECT — the native visible set is stale and never re-triggers a decision

`nativeVisibleMarkerKeys` / `lastVisibleMarkerSetSignature` is the load-bearing input to the LOD
decision (buildMarkerRenderModel requireVisibility). Flaws:

1. Computed ONLY on camera-move/idle (handleNativeCameraChanged) — never on catalog arrival.
   SearchMapRenderController.swift sets lastVisibleMarkerSetSignature=nil on catalog push and
   defers to "next camera tick" (~1301-1303).
2. When the visible set updates, it does NOT re-run the JS decision: publishNativeVisibleMarkerKeys
   is a silent setter (search-map-source-frame-port.ts ~261), and the render-owner handler
   (use-search-map-native-render-owner.ts ~2247) does not call publishSourcesRef.
3. The decision reads getNativeVisibleMarkerKeys only when publishSources runs for some OTHER reason
   (use-direct-search-map-source-controller.ts ~1592).
   Natural-search residency (#3 of red-team, commit 6c02810f) made the decision lean 100% on this
   gate (full catalog), so it WORSENED symptoms 1+2.

### 1. [DECIDED: KEEP FALLBACK] fallback removal closed as won't-fix (2026-06-19, user's call)

DECISION: keep the padded-AABB fallback. It is only a one-frame SEED bootstrap before the native
projection answers (one async hop); native is already the sole visibility truth for every steady-state
frame the user sees, so keeping the fallback does NOT compromise "native is the gold source" in any
user-visible way. Removing it requires teaching the reveal to absorb a mid-flight marker population
(see A.4) — real surgery in the fragile reveal handshake, not worth the regression risk for an invisible
benefit. The two-group GEOGRAPHIC model (B) is also KEPT per the user (rank badge = inside search area).
Full root cause + the scoped real-fix are preserved below if ever revisited. Do NOT re-attempt blindly.

### 1-history. [REVERTED] visible-set fix attempt backed out — it reversed the fresh-search reveal

ATTEMPT (project-on-arrival + JS subscribe-re-publish + inRegionVisibilityNotReady bootstrap guard)
REVERSED THE REVEAL: on submit the shared pins+dots+labels opacity ramped in, then the guard preserved
the EMPTY initial in-region set (starved promotion) while the subscriber churned viewport_lod
re-publishes → dots flashed then faded back out, pins/labels never showed. User chose "rip out today's
#1 only". Reverted in b8b85f52 (surgical — kept residency arch + motion-pressure cutover d1607742 +
dormancy-revert/no-hang 3b72da20). Validated in-sim: pins+dots+labels fade in and HOLD on a fresh
"best restaurants" search. Trade-back: ranks-40s returns (the thing #1 tried to fix).

### DIAGNOSTIC SESSION FINDINGS (2026-06-18, NSLog-instrumented native builds) — TWO conclusions:

**A. The native projection CAN be made reliable, but it is NOT the only job the fallback does.**
NSLog in projectAndEmitOnScreenMarkers proved the lifecycle on a fresh search:
  catalog_arrival     state=hidden        → GATED (isVisualSourceInactiveOrDismissing blocks .hidden)
  source_frame_arrival state=hidden        → GATED
  source_frame_arrival state=preparingReveal → EMIT keys=206   (only here does the set first appear)
So on a fresh search the catalog arrives while `.hidden`; the projection is blocked; the set is null
until `.preparingReveal`. Adding `forceDespiteHidden:true` to the catalog_arrival call (the projection
is pure geometry — camera+coords, independent of paint) made it EMIT keys=206 during `.hidden` — set
ready at frame 1, stable (all later projections coalesce to NOCHANGE), no loop. NATIVE PART SOLVED.
BUT removing the padded-AABB fallback (map-render-model isVisible → native-only) STILL HANGS the reveal
(lifecycle stuck at preparingReveal, list spins forever). Cause: the fallback is ALSO load-bearing for
the REVEAL LABEL-GATE's first frame — the early native emit isn't consumed by JS into a non-empty
promotion before the gate checks, so the first promotion is momentarily empty → no labels → the
labels-before-pins gate never opens → whole sheet+map reveal hangs. The fallback bridged this by always
giving a non-empty first promotion. ⇒ To remove the fallback, the REVEAL LABEL-GATE must tolerate a
momentarily-empty first promotion (open once the subscriber re-decide promotes pins), OR the first
decision must be guaranteed non-empty synchronously (native set + resolved overlap region both ready).
The forceDespiteHidden native change is correct and reusable but was REVERTED with the rest (working
tree restored to HEAD) since it hangs without the gate fix. Build is fallback-present working state.

**A.2 — PINNED the exact stall + why both simple fixes fail (2026-06-18, second NSLog session).**
Instrumented startEnterPresentationIfReady's else-branch to log which guard holds the reveal with the
fallback removed (+ forceDespiteHidden + the JS subscriber). STEADY-STATE stuck line:
  reveal_blocked state=preparingReveal status=pending_mount phase=enter_requested
    mountedHidden=false hasStartToken=false labelReady=false
    | labels=2124 observationEnabled=true hasCommittedObservation=TRUE
      effectiveRendered=0 visibleLabels=0 layerRendered=0
So the reveal NEVER reaches the "entering" phase — it sits at JS status `pending_mount`/`enter_requested`.
Persistently-false guards (530/530 lines): mountedHidden, hasStartToken (both follow from not-entering),
and labelReady. labelReady=false because the label observation COMMITTED on the empty seed frame
(hasCommittedObservation=true) with effectiveRendered=0, and never re-measured once labels populated.
NB the gate returns TRUE for labelCount==0 (line ~6497) — so "empty → hang" was the WRONG mechanism;
the real one is "reveal MOUNTS/observes on the empty FIRST marker frame and latches there."
TWO simple fixes were tried and BOTH fail (do not retry either):
  (1) HOLD the publish: early-return from publishSources when nativeVisibleMarkerKeys==null &&
      rankedCandidates.length>0 (wait for the catalog_arrival emit → subscriber → re-publish populated).
      RESULT: breaks the RESULT SHEET — publishSources also publishes the whole source-frame snapshot
      (mapSearchSurfaceResultsSourcesReady, label/coverage sources) that drives the sheet reveal, so a
      blanket early-return leaves the sheet spinning forever (no data shown). PROVEN by an A/B: reverting
      ONLY the JS to HEAD (same native binary, same clean metro) → search loads instantly; the hold-fix
      JS → endless spinner.
  (2) PRESERVE in-region pins but still publish (the old inRegionVisibilityNotReady guard) → the
      fade-out reversal (documented above in §1 REVERTED).
⇒ REAL FIX must keep publishing the source frame (sheet needs it) AND make the reveal not latch on the
empty seed: re-arm the label observation when the promoted marker set first goes empty→populated
(reset hasCommittedObservationForConfiguredRequest + re-schedule the placement observation for the same
reveal request), so labelReady re-evaluates once the native-set-driven labels actually render. ALSO
verify what advances JS status pending_mount→entering (it may itself wait on the map's first healthy
frame); if so, that healthy-frame signal must fire on the populated re-publish, not the empty seed.
Metro hygiene: a pile of stale `expo start` (8081+8082) + `tail -F` perf processes accumulate and serve
stale bundles → false "data hangs"/Refreshing. Kill them (pkill -f "expo start") and run ONE metro.

**A.3 — the re-arm-observation fix is INSUFFICIENT; the stall is the native MOUNT ELECTION, before the
label gate.** Reading the mount path: the reveal sits at status `pending_mount` because
maybeElectMountedHiddenExecutionBatch never advances enter_pending_mount → enter_mounted_hidden
(mountedHidden stayed false 530/530). That election runs BEFORE the label gate matters, so re-arming the
label observation alone cannot help — the reveal never reaches the gate. The election has ~9 guards, each
emitting `enter_mount_not_elected reason=...` via emitVisualDiag → emit() (JS bridge, gated on
enableVisualDiagnostics, deduped) — NOT NSLog, so the prior captures missed it. NEXT DIAGNOSTIC: add an
NSLog at the top of emitVisualDiag (before the enable/dedup guards), re-apply
no-fallback+forceDespiteHidden+subscriber, capture the `enter_mount_not_elected reason=` for the empty
seed frame — that names the exact mount guard. Likely the JS↔native enter handshake (presentation
machine executionStage / execution-batch election / source-ready) assumes a non-empty first frame.
CONCLUSION: removing the fallback is a multi-component reveal-handshake change (mount election +
presentation machine + label observation), ALL of which assume the first frame has content — NOT a
single re-arm. Cost/benefit to revisit: the fallback only fills the sub-second SEED window before the
native set arrives; native is already the sole truth for every steady-state frame. So keeping the
fallback does not compromise "native is the truth" in any user-visible way — it is a one-frame bootstrap.

**A.4 — DEFINITIVE characterization (emitVisualDiag→NSLog builds, diag3/diag4).** Mirrored emitVisualDiag
to NSLog and ran two no-fallback variants:
  - diag3 (no-fallback ONLY, native NEVER projects → markers stay 0 forever): reveal COMPLETES fine —
    frame_begin reaches phase=live opacity=1.0, reveal_apply_result frame:3 phase=entering renderPhase=
    live with all marker counts 0. The labelCount==0 gate path opens; an all-empty reveal is healthy.
  - diag4 (no-fallback + source_frame project + subscriber, but NO forceDespiteHidden): native emits too
    late/gated → markers also stay 0 → reveal COMPLETES empty again.
  - diag2 (no-fallback + forceDespiteHidden + catalog_arrival project + subscriber): native emits 206
    keys DURING `.hidden`, so labels populate 0→2124 WHILE the reveal preroll is in flight → HANGS at
    pending_mount (mountedHidden=false 530/530).
⇒ ROOT, definitively: the hang is NOT emptiness and NOT populated-steady-state (both reveal fine). It is
the empty→populated TRANSITION *mid-reveal* — markers arriving while the reveal preroll is in flight.
The mid-flight population spawns a new frame generation the in-flight reveal can't absorb; the transient
mount reason seen is `enter_mount_blocked_source_not_ready` (likely persistent for that new generation —
its source admission/markFrameSourceAdmission isn't synthesized for the subscriber-driven re-publish
during preroll). This is inherent to "native answers one async hop late": the answer lands mid-reveal.
REAL FIX (Option 3, now scoped): make the reveal ABSORB a mid-flight marker population — i.e. ensure the
subscriber-driven populated re-publish during reveal preroll marks its frame-generation source ready so
the mount can (re-)elect on it, and re-arms the label observation for that generation. Targeted at the
source-admission/mount path, not a full rewrite — but still in the fragile reveal handshake.

**B. ranks-40s is NOT a projection/timing bug — it is the GEOGRAPHIC in/out-region split (= complaint #1).**
NSLog of the on-screen markers' RANKS on a fresh "best restaurants": ranks(min24) =
6,7,8,10,11,13,15,17,19,23,28,29,30,34,36,37,40,41,43,44,45,46,47,49 (ranks 1-5 are OFF-screen). Yet the
in-region RANK-badge pins shown were 10,11,13,15,23,28,29,30,36,37,44,45,47,56,60,62,64 — i.e. the
on-screen top ranks (6,7,8) are NOT shown as rank pins, while 56/60/64 ARE. Reason: in-region vs
out-region is split by GEOGRAPHY (isWithinOverlapRegion — the frozen submitted-viewport/radius), NOT by
rank. Top-ranked results that fall outside the overlap radius become OUT-region (crave-SCORE badge), so
the in-region RANK badges only ever show whatever ranks happen to sit inside the overlap region — which
skews high/mid. So "rank badges ≠ top ranks" BY DESIGN. This validates the user's complaint #1 (is the
two-group split even right?). Fixing ranks-40s = rethinking what earns a rank badge: e.g. the globally
top-N (1..maxFullPins) should get rank badges regardless of overlap region, OR the overlap region must
encompass the top results, OR collapse the two-group model. Decide the model before coding.

NEXT (sequenced):
- [ ] (Prereq for fallback removal) Make the reveal label-gate not hang on a momentarily-empty first
      promotion — open it once pins ARE promoted (subscriber re-decide), never latch closed on the
      empty seed frame. Then re-apply forceDespiteHidden (project-on-arrival, catalog bypasses .hidden)
      + the JS subscriber + delete the padded-AABB fallback (map-render-model native-only). Validate:
      fresh search HOLDS the reveal with native-only (lifecycle reaches `visible`, no spin).
- [ ] (ranks-40s) Decide the two-group model: should rank badges be the global top-N (rank-filtered)
      rather than geography-filtered? Then implement. The native set + ranks are already correct inputs.
      Evidence: in/out split = use-direct-search-map-source-controller.ts isInRegionFeature /
      isWithinOverlapRegion (~1663-1665); overlap region resolve (~1619-1646); diagnostic NSLog data in
      /tmp/mapdiag2.txt (with-fallback) + /tmp/mapdiag3.txt (no-fallback, hung at preparingReveal).

## 3. [x] FIX label-gate reveal deadlock (REGRESSION from dormancy rewrite cec34d26)

Reveal-start (startEnterPresentationIfReady ~5442) hard-gates on isActiveFrameLabelPlacementReady
(~6302-6316: needs committed observation with effectiveRenderedFeatureCount>0). The dormancy
rewrite made label layers visibility:none until reveal preroll; queryRenderedFeatures on un-laid-out
layers returns 0 -> gate never opens -> the WHOLE reveal (pins+dots+labels share one opacity
animation) stays at ~0 opacity until a camera move re-triggers observation. = "labels/dots don't
show until I zoom." Also configureLabelObservation can drop the enable if it arrives while native
is still .hidden (~8885). Passed Maestro because the flow checks JS redraw phase, not pixels.
USER INTENT (confirmed): KEEP the gate — labels-locked-before-pins is wanted, on reveal, for both
sheet + map. Do NOT bypass it / do NOT force-start reveal with unplaced pins. Gate is reveal-ONLY
(startEnterPresentationIfReady; flag reset at beginRevealVisualLifecycle) — must NOT affect
post-submit LOD promote/demote (separate live-transition path). Fix = make labels actually PLACE so
the gate opens as designed.

- [ ] REAL FIX: make label observation reliably commit on reveal — fix the .hidden-race where the
      observation-ENABLE config is dropped (configureLabelObservation !canRefreshRenderedLabels ~8885
      cancels + schedules nothing) by re-applying/re-scheduling the last config when native flips to
      .preparingReveal (layers now woken); the 16ms retry then covers layer-layout delay.
- [ ] SAFETY NET (not a bypass): keep re-attempting PLACEMENT if it hasn't committed; if it still
      can't after N tries, log loudly — never silently reveal unplaced pins.
- [ ] Verify the gate does NOT gate post-submit LOD changes (reveal-only invariant holds).
- [ ] Validate with a PIXEL assertion (screenshot) that pins+dots+labels are visible right after a
      fresh search with no camera move.
      Evidence: SearchMapRenderController.swift:5456,6302-6316,7446-7449,6008/6078,8885-8889,9123-9156,
      10665-10668; use-search-map-native-render-owner.ts:2705-2713,2856.

## 4 (group 2). [ ] Out-region collision-based selection (ideal shape; depends on #1)

Out-region today: async-coverage-fetch-gated (batch, not live) + flat top-30 budget + always-draw
layer (allowOverlap:true) -> too many overlapping. Team previously tried collision-ON out-region and
REVERTED it (search-map.tsx ~2393) because collision on the RESIDENT layer flickered mid-crossfade.

- [ ] Out-region promotion = Mapbox symbol collision: separate out-region layer with
      icon-allow-overlap:false + icon-ignore-placement:false + symbol-sort-key = rank, fed ONLY
      promoted (opacity>0) out-region features so resident opacity-0 pins stay out of placement.
- [ ] Demote the flat OUT_REGION_MAX_FULL_PINS to a loose safety cap; let the renderer arbitrate
      one-per-area, highest-rank-of-colliders wins, isolated pins always show.
- [ ] Make out-region as LIVE as in-region (decouple from the async fetch where possible, or
      re-eval on the resident coverage set).
      Requires #1 (stable promoted set) first.

## 2/jitter. [ ] DEFERRED — steady pin anchor shift (NOT crossfade churn)

User correction: the pin never demotes; it shifts in place. pin/dot anchor difference is not it.
Genuine per-frame geometric/placement disturbance on a steady symbol. Investigation ruled out steady
per-frame feature-state writes and found badge/coordinate swaps instrumented ~0. Re-attribute with
frame tooling (extract-frames/frame-mad/align-residual, recreate in /tmp) on a real recorded pan.
Fix AFTER #1/#3/#4.

## 5. [~] Pixel-level validation + promote-vs-viewport cross-reference

- [ ] Maestro/screenshot assertion that markers are actually painted (not just JS chrome_ready).
- [ ] Auto cross-reference: pins leaving the viewport == pins demoted; pins entering == promoted,
      during pan/zoom flows. Contracts exist (raw_visible_set_shrink_contract, lod_target_change_contract,
      lod_membership_churn_contract, demoteLostVisibility) — wire into perf-scenario-contract-gate.js.
