# LOD v5 Canonicalization — worklog (delete v4, make v5 the only path)

Driven by the 2026-06-24 red-team (60 agents, code-proven). Root cause: **v4 was gated
OFF only on the camera/pan-zoom path (`driveNativeLod` has the v5 early-return), but the
DATA-CHANGE (`live_update`) path was never gated** — so on any search/refresh/marker
add-remove-reorder, JS still ships a `markerRoleFrame` and native runs the full v4
reconcile, writing the SAME feature-state keys (`nativeLodOpacity`/`nativeDotOpacity`)
the v5 engine owns. Shared sources (no parallel v5 sources were built) → genuine
two-authority collisions, not harmless dead writes. The fix == the v4 deletion.

Validation rule: harness must be HONEST first (it lies today, see Phase A), then one
change at a time, re-measure each on the sim. `fix/map-lod-wiggle-dismiss` branch.

## Phase A — make the harness honest (PREREQUISITE; do + verify ALONE first)
- [ ] A1 (V5-6) `v5anchors` pinOpacity reads `nativeLodOpacity` alone; painted pin =
      `presentationOpacity × nativeLodOpacity`. During reveal/dismiss it reports
      visiblePins=30/ghosts=0 while pins are invisible. → multiply by the same
      `nativePresentationOpacity` coalesce the style uses (fs ?? baked ?? 1).
      @ SearchMapRenderController.swift:12281-12296, 12320-12322
- [ ] A2 (V5-7) `oracle` event pinVisible/wrongPin/ghostN ignore presentationOpacity AND
      default `?? 1` (should be 0 under v5) AND consult dead v4 transitions. → engine
      truth × presentation, default 0, drop livePinTransition consult.
      @ SearchMapRenderController.swift:12469-12476, 12529-12539, 12553-12559
- [ ] A-verify: drive a reveal + a dismiss; confirm harness now shows pins NOT visible
      mid-fade (was the blind spot). Expect to SEE the V5-1 two-authority anomaly too.

## Phase B — cut the live v4 wires (BLOCKER fix)
### CRITICAL DISCOVERY (2026-06-24, proven on-device): B1 the obvious cut is WRONG.
The `markerRoleFrame` is NOT a pure LOD/promotion signal — it is entangled with source
ADMISSION + presentation mount/ack (native `sources_applied_visible` requires
`markerRoleFrame != nil`, SwiftController:2419). Gating it OFF in JS (`shouldUseNativeRoleFrame
= !LOD_V5_ENABLED && …`) dropped the map instance to `life:hidden` for 844/857 camera frames
(vs 603/605 `visible` baseline) → heartbeat oracle stopped firing. REVERTED; revert restored
`life:visible` + clean settle. ⇒ The v4 role-table / reconcile / transitions are SHARED
infrastructure for membership+lifecycle+label-render-state, exactly as the red-team inventory
flagged (`deletable:false`). "Delete v4" is a STAGED refactor, not a flag flip: v5 must grow
its OWN membership/lifecycle/label-render plumbing BEFORE the role table can be removed.
The two-authority cut must be NATIVE-side and OPACITY-ONLY (keep the frame flowing).
- [x] B1 ATTEMPTED + REVERTED (lifecycle regression, see above). JS back to baseline.
- [x] B2 DONE (2026-06-24) — and the "blocker" was overstated. RUNTIME FINDING: applyV5OpacityWrites
      DOES populate `transientFeatureStateById` (via applyTransientFeatureState @8516/8527/8539), so the v4
      SYNCHRONOUS feature-state write (@4380 prepare, @3655-3658 publish) is ALREADY skipped under v5
      (`pinFeatureState.isEmpty` is false → reuses the engine's transient state). The ONLY live v4 opacity
      authority left was the SOURCE `['get']` re-bake: prepare baked `placementPrerollOpacity`, publish baked
      `settledPinOpacity = targetOpacity` (=1 for a promoted pin) — CLOBBERING the JS reveal-seed bake-0, so a
      NEW promotion painted FULL via the `['get']` fallback for ~1 frame before the engine faded it (group-snap
      on every data-change publish; likely the filter-change #5 + part of zoom-out #6). FIX: gate
      `placementPrerollOpacity` (replace_all, both fns) + `settledPinOpacity` to 0 under lodV5Enabled →
      source fallback = v5 baseline, engine fade-from-0 is sole authority. Resident markers unaffected
      (feature-state overrides the bake). Does NOT touch membership/admission/lifecycle (unlike B1).
      VALIDATE: reveal ramp stays clean + life:visible + a re-search/filter-change no longer snaps.
- [ ] B2-OLD-NOTE (superseded): under v5, gate ONLY the SYNCHRONOUS v4 opacity writes,
      keep membership/admission/label-render/lifecycle. Sites: the v4 STEPPER
      (applyLivePinTransitionFeatureStates) is ALREADY v5-early-returned (8682) — so the
      LIVE v4 opacity authority is the synchronous bakes/writes in prepareScopedPinAndLabelOutput
      (source re-bake `nativeLodOpacity: pinSourceOpacity` @4361; fs write `livePinFeatureState(
      opacity: currentOpacity)` @4380, gated by `transientFeatureStateById[key].isEmpty`) +
      the publish bake (~3640) + dot equivalents. PREREQ INVESTIGATION: does applyV5OpacityWrites
      populate `transientFeatureStateById`? If yes, @4380 is already skipped under v5 (verify
      before gating). MEASURE on a DATA-CHANGE repro (re-search / viewport refresh), NOT the
      camera drive — pure pan/zoom emits no role frame so it can't exercise V5-1.
- [ ] B4 point obstacle reseed at engine truth (`engine.lastPromotedInOrder`) not the
      role-table mirror (prereq for deleting MarkerRoleTable). @ :8587, 4320, 4448

### NOTE on motion anomalies: the honest-harness baseline drive showed during-MOTION
### ghostN≤57 / inv≤30 / wrongPin≤10, settle=0. These are likely NORMAL per-frame re-decide +
### in-flight crossfade during aggressive zoom (engine recomputes promotion every frame as the
### on-screen set changes), NOT necessarily V5-1 (pure camera motion emits no role frame). Settle
### is always clean. Do NOT chase these as bugs without a data-change repro that isolates V5-1.

## ROOT CAUSE of the group-snap (2026-06-24, audit wf_d60076ba — THE answer):
**Engine-opacity ↔ Mapbox-feature-state DIVERGENCE on source re-tile, with NO same-frame eased re-assert.**
The LodEngine `opacity` map is truth, mirrored to Mapbox via fire-and-forget setFeatureState. Mapbox SILENTLY
DISCARDS a feature's feature-state when it's removed+re-added (re-tile) or full-replaced. Then nothing restores
it that frame: engine.step() only writes keys in `motion` and prunes settled ones (a settled promoted survivor
is never re-written); setRanking retains survivors at settled opacity (engine THINKS they're painted);
applyFeatureStates EXPLICITLY filters out the 4 stepper-owned opacity keys (@14961-14987); the reveal-seed only
re-asserts NEWLY-promoted keys. ⇒ a single source mutation drops the whole resident promoted group's fs in one
batch, the GROUP paints the baked ['get'] fallback simultaneously = the unison snap the per-anchor engine can't
produce. It's the two-authority failure v5 killed, REINCARNATED one layer down (engine map vs Mapbox fs).
DIRECTION/amplifiers: baked fallback signs (pin 0 → snap OUT; dot/label → snap IN at full; LABEL baked 1 +
on-screen-GATED → text snaps on, the "non-top-30 snap in"). The idle-reassert backstop is an UN-EASED BATCH
writer (the snap-back half). Harness was BLIND because its oracle reads the in-memory mirror (still holds the
engine value the frame Mapbox dropped it), never queryRenderedFeatures/getFeatureState read-back.

## IDEAL ARCHITECTURE (non-compromising; keeps top-N-on-screen; no damper):
Feature-state = a PURE SELF-HEALING PROJECTION of engine truth. Rule: after ANY source mutation that
added/re-added/replaced features, re-assert engine opacity for affected resident markers in the SAME map
transaction BEFORE the next paint — AND route it through engine `motion` so step() EASES it (re-added key
re-enters motion at baked-0, step fades 0→target). Then the ONLY way any opacity changes is the per-anchor
eased step → a unison group snap is PHYSICALLY IMPOSSIBLE. Keep bakes at v5 baseline (pin 0 / dot 1 / LABEL 0 —
fix the asymmetry) so a lost-fs marker degrades to invisible, never full. Make the label source RESIDENT (plan
KEEP#3, currently violated). decide() untouched → top-N-on-screen preserved, no global-top-N, no hysteresis.
Does the v5 plan get us there? PARTIALLY — principle right, but it's MISSING the "reconcile fs after a mutation"
rule (must ADD) and its label-resident KEEP item is violated (must COMPLY).

## ORDERED PLAN (each validated on-device before the next):
- [ ] G-A HARNESS first: fs-loss/true-paint oracle — after each applyParsedCollectionBatch, getFeatureState
      read-back for affected ids, diff vs the in-memory mirror → emit fsLost + groupSnapMagnitude (max
      resident-promoted keys losing fs in one batch) + a per-frame painted-Δ check (>dt/fadeSeconds = a snap)
      + a LABEL oracle (current reads pins only). MUST read RED on the current binary at a data-change repro
      (re-search/page-append/filter) — proves the diagnosis + is the gate for everything after.
- [ ] G-B CORE FIX: LodEngine.reseedForRepaint(keys:) (set opacity 0 + insert into motion when want) + call it
      in applyParsedCollectionBatch for affected∩resident after the mutation → step() eases them back. Closes
      the root cause. Re-measure: groupSnapMagnitude → 0, painted-Δ ≤ one eased step.
- [ ] G-C LABEL bake-0 (use-direct…:914) + make label source resident (drop on-screen gate …:898).
- [ ] G-D Retire the idle-reassert backstop's un-eased batch write (route through motion or delete).
- [ ] G-E Pair baselineReplace/recovery full-replace with the G-B re-assert.
NOTE: this is the FIX; the v4 dead-code deletion (Phase C/D) is separate cleanup, NOT required for the fix.

## STRATEGY DECISION (2026-06-24, audit wf_f27b34cc): EXCISE IN-PLACE, not clean-room.
Audit (24 agents, code-verified) verdict: excise-in-place = LOW risk; clean-room = HIGH risk. Why:
(1) v5 has NO parallel sources — applyV5OpacityWrites writes through the SAME resident pin/dot/label
sources v4 uses + READS markerRenderStateByMarkerKey.labelFeatures (produced by the shared pipeline).
Clean-room re-derives the whole membership/label-render/resident-bundle spine = re-introduces solved bugs.
(2) B1 already proved markerRoleFrame = admission/lifecycle infra (not pure LOD) — a fresh folder must
re-grow admission before it can render. (3) Dead v4 is cleanly stratified (leaves' only callers are each
other); the adversarial verify caught 5 items mislabeled deletable that are STILL LIVE (LivePinTransition/
LiveDotTransition structs, the transition maps, livePinTransitionOpacity, the flag plumbing) → they delete
only AFTER their live producers are split out (CHUNK 4). Deletion order is dependency-correct.

## STABILITY-GATE CORRECTION (the audit was WRONG on its #1 fix; I verified against the engine):
The audit said "port v4's stability gate (git a0ddaa66 buildMarkerRenderModel) to fix the zoom-out group-snap."
I read both: v4's gate = [retainedInView + freshInView].sort(rank).slice(budget) — MATHEMATICALLY IDENTICAL to
the engine's strict top-N among on-screen. The ONLY differing part is v4's OFF-SCREEN retention, which the
audit itself says to EXCLUDE (FM#5 stuck pins). So porting it is a NO-OP. The real cause of the zoom-out
group-snap = RANK CONTENTION: zooming out pulls in higher-ranked wider-area markers that legitimately displace
on-screen pins → a group demotes. The fix is MEMBERSHIP HYSTERESIS (sticky promotion), which v4 did NOT have
either. DONE: LodEngine.decide() now retains last-promoted on-screen anchors within top-(budget+pad) by rank,
fills leftover slots with fresh, demotes only when a pin falls beyond budget+pad OR leaves screen. pad=0 default
(28 tests stay strict+green); production sets membershipRetentionPad=10 at construction. v5lod now emits
strictDemOn (on-screen demotes a strict top-N WOULD make = the would-be snap) vs demOn (what hysteresis does) —
strictDemOn>>demOn on zoom-out proves contention + that the gate prevents it. VALIDATING on-device next.

## COLLISION-BOX AUDIT (user: "so many boxes around the pin — are they useful?"): 9 things touch a pin;
only the 2 side-pad obstacle boxes are redundant. KEEP (7, each load-bearing): shadow (decoration), visible
pin (allowOverlap, doesn't collide), tap-target circle, the dotbody obstacle (SEPARATE on purpose — only dots
yield, different z-anchor), per-restaurant mutex, 4 label candidates, dots. MERGE 3→1: the label-collision
obstacle is center + side-left + side-right where left/right are the center silhouette shoved ±3px to widen it
→ one box widened by the side-pad. (Phase E2.) Net boxes-around-a-pin 9→7.

## Phase C — delete v4 SCRAP (so "we never knew v4 existed")
### C0 DONE (2026-06-24) — cut the LIVE v4 opacity writers (the snap/stuck FIX, user-reported).
### Root cause of "groups snap out together" + "pins stuck at half opacity": under v5, 5 ungated v4 sites
### still setFeatureState the contested opacity keys, CLOBBERING the engine mid-fade on data-change/reveal:
###   - startAwaitingLivePinTransitions @8287/8294 (writes opacity:0 to awaiting markers) → EARLY-RETURN v5
###   - startAwaitingLiveDotTransitions @8383 (dot opacity:0) → EARLY-RETURN v5
###   - prepareDerivedPinAndLabelOutput @3668 (new-marker currentOpacity) → gate `!lodV5Enabled`
###   - prepareScopedPinAndLabelOutput @4398 (same) → gate `!lodV5Enabled`
### Now applyV5OpacityWrites (8538/8549/8561) is the SOLE opacity writer under v5; the v4 stepper
### (applyLivePinTransitionFeatureStates @8679) + finalize* were already dead (transitive). Safe (NOT B1):
### display link runs CONTINUOUSLY (updateLivePinTransitionAnimation @8072, started by camera/reconcile,
### persists) so gating startAwaiting can't stop fades; none of these touch membership/admission/lifecycle.
### ALSO: collisionDebugEnabled → false (the "lots of collision layers" the user saw = my debug overlay).
### HARNESS-PROCESS LESSON: I validated SETTLE (clean) and dismissed DURING-MOTION mid-fades as normal —
### but the user interacts continuously and SEES the motion state. My own data showed max pinMid/dotMid=79
### during motion; I must gauge DURING-MOTION (pinMid/dotMid/ghostN), not just last-5-at-idle, going forward.


- [ ] C1 delete `driveNativeLod` + both call sites (:6430, :12820). 
- [ ] C2 delete the v4 body of `applyLivePinTransitionFeatureStates` (8684-9285, ~600 ln)
      incl dead `step`/`live_lod_transition_contract`/`lod_snap_contract`/`lod` events.
- [ ] C3 delete updateLivePinTransitions/updateLiveDotTransitions + LivePinTransition/
      LiveDotTransition types + finalizeCompletedLive*Transitions + the
      `*_transition_complete` reconcile paths. PRESERVE the label-render-state sub-product
      applyV5OpacityWrites reads (markerRenderStateByMarkerKey.labelFeatures @ 8537).
- [ ] C4 migrate MarkerRoleTable's ~15 v5 read-sites to the engine, then delete the type
      (or reduce to a plain residency-membership struct).
- [ ] C5 remove `lodV5Enabled` const + `LOD_V5_ENABLED` JS const, inline the true branch
      (coordinated JS+native; keep getConstants:912 returning true until JS reads removed,
      else JS reads undefined→false and re-enables v4 baking).

## Phase D — engine-wiring fixes the red-team found
- [ ] D1 (V5-8) forced-key tap promotion never fires at tap: decide() runs only when the
      on-screen SET changes. Reset `lastVisibleMarkerSetSignature = nil` on a
      highlightedMarkerKeys change (mirror catalog path :1432). @ :2947-2959, 12140-12164
- [ ] D2 reveal path: after the reveal decide, call updateLivePinTransitionAnimation +
      applyV5ObstacleReseed so reveal == "first decide" (matches camera path). Fixes
      reveal twitch / initial-reveal-vs-mid-search. @ :6416-6436
- [ ] D3 obstacle reseed ~100ms throttle (plan's #1 risk). @ :8578-8646
- [ ] D4 obstacle fade-aware demotion: keep a demoting pin's obstacle until its fade
      completes (membership flips at decide but pin fades over fadeSeconds). @ :8587, 12174
- [ ] D5 obstacle reseed on setRanking (data refresh), not just membershipChanged. @ :1436

## Phase E — collision redesign (the user's main ask)
- [ ] E1 obstacle = presence-in-source (only promoted markers in the collision source),
      drop the baked `promotedPinCollisionObstacleFilter` (plan SCRAP; engine-authoritative,
      layout-readable). Dovetails with E2. @ search-map.tsx:255-259, 425/434/443/455
- [ ] E2 collapse 3 label boxes (center/left/right + side-pad) → 1 box sized to pin W×H
      (Mapbox collision boxes are AABBs — shape irrelevant, only box dims matter).
- [ ] E3 stacked-pin "neither label shows" fix. RESOLVED RESEARCH (2026-06-24): the clean
      `text-variable-anchor` shape CANNOT do our per-anchor distances. The example we linked
      uses `text-radial-offset` = ONE radial distance for all anchors (what we already tried,
      insufficient — we need top furthest, bottom closest, left/right same+up). The property
      that does per-anchor [x,y] offsets, `text-variable-anchor-offset`, is NOT in our Mapbox
      iOS SDK 11.16.6 (grepped all pods, 0 hits any spelling; it exists in Mapbox-GL-JS web /
      MapLibre but never landed in the mobile core — upgrading rnmapbox can't add it, it wraps
      the same mobile SDK). ⇒ KEEP the 4 manual candidate layers (they ARE the correct
      workaround for per-anchor distances on this SDK; not a mistake). The bug is the per-
      restaurant MUTEX shared collision point cross-suppressing STACKED restaurants. FIX via
      ATTRIBUTION with the debug visualizer (E4) — see the actual hitboxes when two pins stack
      — before any change. Candidate fixes: per-restaurant-unique mutex point; or right-size
      the label/pin collision boxes so stacked restaurants' labels take opposite sides.
- [ ] E4 scoped debug visualizer: hide basemap symbols when collisionDebugEnabled so we
      tune our boxes against the real native hitboxes without map-wide clutter.
### E3 ATTRIBUTION RESULT (2026-06-24, slabel over a dense-Midtown drive): the OBSTACLE is the culprit.
###   57% of stacked promoted pins lose their label (2262/3943). Split by `blanketLoss` (neither shows,
###   nothing placed nearby) vs `competeLoss` (a neighbour DID place):
###     - blanketLoss 27% of losses, DOMINANT at 6–15px (blanket 212 vs compete 153) = the user's exact
###       "two stacked pins, NEITHER label shows" → the full-pin-body obstacle ×2 overlapping covers all 4
###       candidate positions of both pins. CLEAR BUG.
###     - competeLoss 72% of losses, dominant at 16–60px (e.g. 16-30px: compete 397 vs blanket 30) = one
###       label wins, the loser is culled. Partly NECESSARY declutter (can't show 30 labels in a tight
###       cluster), partly avoidable (loser could take a free opposite side but the obstacle blocks its
###       alternate candidates). FIX TENSION: obstacle is scale 1.0 (full body) because #16 needs OTHER
###       labels to yield to the pin (0.6 left 18/30 foreign labels on pins). Can't just shrink it.
###   FIX DIRECTION: push the 4 candidate label OFFSETS further from the pin (per-position, which the 4-layer
###   workaround CAN do) so stacked labels clear the (necessarily large) obstacles, +/- reshape obstacle.
###   Mutex is a minor factor (<6px only). Tune in a loop gauged by slabel(stackedNoLabel↓) + lopreal(=0).
- [x] E5 DONE — `slabel` LOGGING probe (instrumentation, no behaviour change): per promoted pin emits
      [id, rank, minNbrPx, nNbr40, labelPlaced] for stacked pins (promoted neighbour <60px) + counts
      {stacked, stackedNoLabel}. labelPlaced via labelKeys (queryRenderedFeatures render-truth). ATTRIBUTION
      LOGIC: the neighbour-DISTANCE at which label-loss kicks in names the culprit — loss at ~30-50px (pin
      body) ⇒ oversized obstacle; loss only <~6px (near-coincident) ⇒ shared mutex point. (Logging beats
      the visual debug per user; E4 visualizer now optional.) Read on a dense-Midtown drive.
- NOTE: text-variable-anchor migration ruled out — `text-variable-anchor-offset` is NOT in Mapbox iOS
  11.16.6 (verified: grepped pods, 0 hits). It IS in MapLibre Native, but migrating = rewrite the 15.4k-line
  controller + swap RN wrapper + switch tile provider + bet the LOD engine on MapLibre's newer/weaker
  feature-state (#185/#3400) + incremental-GeoJSON (#1236) support. Not worth one label prop. Can't patch
  Mapbox either (MapboxCoreMaps is a closed precompiled .xcframework; Swift layer is a forwarder). ⇒ KEEP
  the 4 candidate layers; fix stacked labels via the mutex/obstacle (E3) attributed by `slabel` (E5).

## REFUTED by verify (do NOT act on): role-table-rebuild-from-baked, obstacle-reads-roletable-
## desync, label-render-state-empty, oracle-default-mismatch(narrow), setRanking-stale-want,
## reveal-seed-membershipChanged, forced-key-no-reseed. (7 findings — verifier killed them.)

## ATTRIBUTION COMPLETE (2026-06-26) — all 3 behaviors traced to real code via the file-sink harness

Method: file-sink attribution (`Library/Caches/lod-attr.jsonl`, read via `scripts/lod-attr.sh`) —
os_log drops under dense load, so cause-events write to a file. Probes: cull_census (render-truth
queryRenderedFeatures), paint_snap/mid_dwell (engine-enriched paint monitor), link_stall/stepper_cancel.

1. FLASH-OUT (the dramatic 100→0, "skips the fade", "only red pins") = **DOT COLLISION CULLING**.
   PROVEN: cull_census peak dotsCulled=451/531, ALL examples at dotOpacity=100 (d100). pinsGone=0.
   At dense/low zoom ~451 of 531 markers want a visible dot (opacity 100) but Mapbox collision-culls
   them; as the camera moves the surviving ~80 churn → binary flicker, no fade (opacity stays 100 →
   opacity≠visibility for dots → the opacity monitor was structurally blind). Red = lowest score =
   lowest collision priority (source order) → culled first → flickers most. CODE: dot layer
   iconAllowOverlap:false (search-map.tsx:2413) culled by DOT_PIN_COLLISION whole-silhouette obstacle
   (search-map.tsx:1320) + label obstacles. Pins are allowOverlap:true (2656) → never cull (pinsGone=0).
   REFUTED as causes: source removal (remove_promoted=0), fs clear (clearknown/reset=0), publish path
   (guarded), presentation snap (pres=100 always), engine step (clamped ≤55%/tick).

2. STUCK-AT-MID = **budget-threshold WANT-OSCILLATION** (NOT frozen, NOT dead link, NOT starvation).
   PROVEN: mid_dwell FROZEN=0, range typically 10→89 with engWant flipping 0↔1 (e.g. id=761373
   frames=66 range=10-87 flips=3). Boundary markers (rank~30) promote/demote flips frame-to-frame as
   micro camera-jitter reshuffles the on-screen ranking → opacity perpetually reverses, hovers mid.
   CODE: decide() recomputes strict top-N every frame from an unstable on-screen set (LodEngine.swift:124),
   no boundary stability (hysteresis removed per user). Refuted: stepper_cancelled_midmotion=0, link_stall rare.

3. PIN CROSSFADE SNAP (partial, secondary) = **dt-JANK coarse stepping**.
   PROVEN: paint_snap 100→44 / 0→55 / 100→57, all engine-driven, dtMs 41–75ms (link at 11–16fps).
   Eased dt-scaled step jumps 30–57% in one janky frame → coarse 2–3-step staircase. CODE:
   LodEngine.advance rate=dt/fadeSeconds (95) + dt clamp (SearchMapRenderController:8520) + main-thread jank.

DOMINANT issue = #1 (dot cull flicker, 451/531). #2/#3 secondary. #1 connects to the collision-box
redesign the user already wanted ("move away from 3 pins side by side", boxes too big).
NEXT: user dismissed the fix-target question — awaiting direction. NO fixes started.
All attribution instrumentation still in the binary (cull_census, paint_snap/mid_dwell, link_stall,
stepper_cancel, remove/clear nets) — harnessLog→attrLog file sink; lodHarnessEnabled gates it.

## CONSENSUS DIAGNOSIS of the GROUP-SNAP (2026-06-26, 9-agent workflow, UNANIMOUS on H1)

User reframed: NOT dots (dots fade fine). The bug = progressive degradation + GROUP snaps of ~budget(30)
pins: group snaps OUT, snaps IN at mixed non-faded opacities, some fades "complete after waiting". The
55% engine clamp means a TRUE 100→0 is a NON-engine writer (why the opacity monitor was blind).

H1 (PRIMARY, unanimous, code-CERTAIN, runtime-pending) — the V4 leak the user suspected:
  The JS `live_marker_role_frame` path is NOT gated off under v5 and clobbers the engine's pin-bundle
  membership. Chain (all verified in source):
  - JS bakes nativeLodOpacity=0 for all pins + slices promotedSeed to empty under v5
    (use-direct-search-map-source-controller.ts:1760,1846) → JS pinned set is EMPTY
    (use-search-map-native-render-owner.ts:1516-1517).
  - Role frame STILL flows under v5 (deliberate, lifecycle) on label/on-screen churn during pan
    (use-search-map-native-render-owner.ts:3574-3584).
  - Native: isLiveMarkerRoleOnlyFrame UNGATED by lodV5Enabled (SearchMapRenderController.swift:2382-2386)
    → reconcileAndApplyLiveMarkerRoleOutputs(reason='live_marker_role_frame') (2464-2470) →
    applyMarkerRoleTableFrame sets pinnedMarkerKeysInOrder=[] (2148), CLOBBERING engine.decide()'s set.
  - residentMode=(reason=='native_lod')=FALSE → memberKeys=[] (5265,5648). retainResidentDemotes only
    while moving (5317-5321) → on SETTLE (moving:false) the promoted pin bundles are REMOVED (5401,5440).
  - Re-add wipes feature-state; applyFeatureStates strips stepperOwnedRenderFeatureStateKeys incl
    nativeLodOpacity (15327-15329,85) → whole ~budget group paints baked-0 in UNISON = group snap-OUT.
  FIX (clean V4 excision, NO hysteresis): under v5, NO JS role-only frame may add/remove the pin bundle —
  bundle membership = engine residents. Gate reconcileAndApplyLiveMarkerRoleOutputs so the pin bundle is
  driven by engine.decide() promoted set (keep the frame's lifecycle effect), OR always retainResidentDemotes
  under v5 (never remove the bundle).

C2 (accomplice, majority) — un-eased 300ms idle-reassert (8635-8649) re-stamps the whole visible set at each
  pin's stored opacity in ONE batch → wiped group reappears at MIXED opacities, no fade = "snap in different
  opacities". FIX: reseedForRepaint (ease back) then retire the un-eased reassert.
C3 (structural, majority) — engine prunes settled keys; a wiped survivor is engine-settled at 1.0 so decide()
  never re-inserts it (LodEngine:167-172) → waits up to 300ms for the reassert = the PAUSE/RESUME ("complete
  after waiting"). reseedForRepaint is ABSENT. FIX: add reseedForRepaint(keys:) → force re-enter motion.
C4 (secondary, SPLIT/disputed) — decide() bulk-inserts ~budget into motion on a coarse zoom step → synchronized
  EASED fade capped at 55% (dt-jank). Likely the per-anchor ideal working, NOT the no-fade snap. Maybe no fix.

PROOF PROBES wired to the FILE sink (this build), settle in ONE zoom-in repro:
  PROBE 1 bundle_mut (mut event +roleTablePins +engVisible): H1 gun = reason=live_marker_role_frame,
    moving=false, bundleRem>0, roleTablePins≈0, engVisible≈30. bundleRem=0 throughout ⇒ H1 REFUTED.
  PROBE 2 fsdrop (file): groupSnapMagnitude≈budget = unison wipe.
  PROBE 3 idle_reassert + pendingMotion on v5step: C2 mixed re-stamp + C3 pendingMotion=0 pause.
  Read: scripts/lod-attr.sh read → "H1 VERDICT" section.
NOT fixing until the triad is runtime-confirmed (user: "you've been jumping to conclusions; be critical").

## H1 REFUTED AT RUNTIME (2026-06-26) — the unanimous "code-certain" consensus was WRONG

Ran the proof probes on the degradation repro. RESULT:
  bundle_mut samples: 0   bundle pin-REMOVES: 0   fsdrop events: 0   baked-fall snaps: 0
fsdrop=0 ⇒ ZERO pin/dot/label SOURCE MUTATIONS during the group snap. H1's whole chain (role-frame
clobbers table → bundle removed on settle → feature-state wiped → group falls to baked-0) DID NOT HAPPEN.
The 9-agent workflow reasoned a fully-cited chain the running app falsifies. Lesson re-confirmed (CLAUDE.md):
static reads give confident-but-WRONG runtime answers; PROVE before fixing. Glad we did not implement the
H1 bundle-membership fix.

WHAT RUNTIME ACTUALLY SHOWED — a different group-snap signature:
  paint_snap: 34 pins ALL 14→61 in ONE frame, engOp=65, engWant=1, dtMs=15, baked=0.
A 47% jump in a NORMAL 60fps frame (dtMs=15). The engine eased step at dt=15ms moves only ~8% — so this is
NOT the engine step and NOT dt-jank. The painted mirror was DESYNCED LOW (14) from the engine's value (65),
then a DIRECT (non-eased) BATCH WRITE stamped the engine's current value onto the whole group → catch-up snap.
NO source mutation (fsdrop=0). idle_reassert fired 76× (writes up to 30, pendingMotion=0) — a batch writer
that bypasses easing. The membership-change SEED (SearchMapRenderController.swift:12430-12433) writes
engine.pinOpacity directly for promoteKeys (newly-promoted set) on membershipChanged — the prime batch-writer
suspect for the group catch-up. The OPEN question: WHY does the painted mirror desync LOW from the engine
(engine at 65, paint at 14) so a batch write snaps it up?

NEXT PROBE (this build): group_write file event — applyV5OpacityWrites now tagged by `reason`
(step/reassert/seed); emits when ≥3 keys jump >0.4 in one write, naming the batch writer + from→to examples.
Confirms whether the group snap is the seed, the reassert, or the step, and that it's a direct value stamp.
Still NOT fixing until the writer + the desync source are runtime-named.

## GROUP-SNAP MECHANISM PROVEN (2026-06-26) = bulk-promote + dt-JANK coarse stepping

Drift census (engine.pinOpacity vs painted mirror, every tick) caught it:
  DRIFT: ahead=30  ex all 'p0e46'  dtMs=84  pendingMotion=30  (30 pins: engine=46%, paint=0%, together)
  GROUP-WRITE: reason=step  n=30/30  ex all '0>46'  (those 30 written 0→46 in ONE step)
  paint_snap: all dtMs 51-60, engine-driven.
MECHANISM: dtMs=84 ⇒ display link at ~12fps ⇒ eased step rate=dt/fadeSeconds=0.084/0.18=0.47 ⇒ one step
moves 46%. ~30 pins cross the budget boundary together (membership flip on zoom-into-new-area) → all enter
engine.motion at once → all step 0→46% in ONE janky frame → coarse 2-3-frame staircase = "30 snap in at
mixed opacities, not fading". 60fps recovery → 8%/frame → smooth ("fades nicely"). Snap-OUT = same demoting
(group_write 100→44). The "drift" is the ONE-frame monitor offset AMPLIFIED by the 46%/tick jank step — NOT a
multi-tick desync, NOT a mirror/GPU lag, NOT the seed/reassert.
REFUTED this run: H1 (bundle_mut=0), re-bake (bundleUpd=0), source removal (pinsGone=0), seed/reassert as the
writer (group_write ALWAYS reason=step), baked-fall (0). The earlier one-off 34-pin 14→61 dtMs=15 never
recurred across 3 runs; likely a measurement edge (lastMs reset), not a separate mechanism.
TWO ROOT INGREDIENTS: (1) bulk-insert: ~30 wants flip together on a wholesale membership change (LodEngine
decide) — arguably the correct per-anchor behavior. (2) dt-JANK: display link starves to ~12-18fps (dtMs
57-84) under dense-zoom main-thread load → each eased step is 32-55%/frame instead of 8%. (2) is the defect.
CAVEAT (must rule out before fixing): this is a HARNESS build; the oracle queryRenderedFeatures + per-tick
paint monitor + drift census run on the main thread every frame and MAY inflate the jank. Next: isolate
production vs harness jank (gate heavy probes off, measure dtMs) BEFORE committing to a per-frame-work fix.
FIX DIRECTION (once jank confirmed production): reduce per-camera-frame main-thread work (project ~530
markers + decide + reconcile + obstacle reseed competing with the CADisplayLink stepper) so the link holds
~60fps. NOT hysteresis. Time-based fade alone does NOT fix coarseness at 12fps (only ~3 frames per 180ms fade
regardless of interpolation) — the frame rate is the lever.

## FRAME PROFILE (2026-06-26) — OUR LOD CODE IS EXONERATED; jank is render/frame-rate bound

cwork profile (per camera frame, file sink), 1025 samples during a dense zoom:
  projectMs (project ~530 markers): med=2 p90=4 max=9
  driveMs   (reconcile):            med=3 p90=4 max=9
  oracleMs  (HARNESS queryRendered):med=0 p90=1 max=6   ← harness NEGLIGIBLE → caveat RULED OUT
  totalMs   (our camera path):      med=5 p90=8 max=17
Yet stepper gap (drift/paint_snap dtMs) = 54-70ms (12-18fps), one 1603ms outlier.
CONCLUSION: our LOD code (project+decide+reconcile) costs ~5ms/frame — NOT the bottleneck. The harness is
~0-6ms — NOT self-inflicted. Of each ~60ms frame, ~50-55ms is eaten ELSEWHERE: not our camera path, not the
harness ⇒ almost certainly Mapbox's own render/placement pass over the dense 530-marker + collision scene,
AMPLIFIED by the SIMULATOR (software rendering). The 1603ms outlier = a stepper STALL (multi-second main-thread
block, likely a data/search load) = "fades complete after waiting".
THEREFORE the group snap is a FRAME-RATE problem, not a LOD-logic problem: at 12-18fps the eased crossfade must
take coarse 46-55%/step. The LOD engine is sampling a starved clock. The fix is NOT in the engine.
INFERRED (not yet directly measured): that the ~50ms is Mapbox render. NEXT to confirm: measure the main
displayLink (handleDisplayLink) frame gap + handler time, OR test on a real DEVICE (rules out sim software-
render slowness — likely the dominant factor; the bug may be far milder on-device).
FIX CANDIDATES (once confirmed): (A) lighten render/collision load — 530 symbols w/ big collision boxes (the
451/531 dot-cull shows heavy placement) = the collision-box redesign already wanted; (B) frame-rate-independent
+ stall-robust time-based fade (resume at correct curve point, no catch-up snap / no freeze-jump); (C) device
test first. NOT hysteresis.

## CONSENSUS #2 (2026-06-26) — the >budget/stuck symptom: V4 remnant + measurement blind spot

User's symptom my frame-rate story MISSED: ~2x budget (~60) pins VISIBLE at once, ~30 STUCK high. That is a
LOGIC leak (stale promotions not demoting), not fade-coarseness. 9-agent consensus #2 (grounded in all runtime
truth, disciplined: probes before fix). Three CODE-CERTAIN structural defects:
1. V4 REMNANT UNGATED: reconcileAndApplyLiveMarkerRoleOutputs (SearchMapRenderController.swift:5218) and
   updateLivePinTransitions (7054) are NOT gated by lodV5Enabled and WRITE nativeLodOpacity on every JS
   data-change (live_update/search/filter/page). A SECOND opacity authority over the engine's keys. JS still
   emits markerRoleFrame under v5 (use-search-map-native-render-owner.ts:3568-3599) — comment says the cut was
   meant to be native-side, but only 8323/8434/12338 are gated, NOT the reconcile path. Can paint a >budget set
   + hold demoted survivors high WITHOUT a source mutation (consistent with fsdrop=0). = the leak.
2. COUNT-GAP (30 mirror vs 60 visual) = a REAL measurement blind spot: EVERY pin-count metric reads the
   in-memory MIRROR (pinSourceId.featureStateById = what was WRITTEN, not what Mapbox HOLDS). The only GPU
   read-back (fsdiverge, 13006) iterates ONLY the promoted set, heartbeat-only. NOTHING reads GPU opacity for
   the DEMOTED on-screen set (where stuck-high pins live). So pinsWanted=30 is mirror-honest and ~60 is real
   screen state the harness is structurally blind to.
3. NO SELF-HEAL for demoted pins: step prunes settled (never re-writes), seed touches only newly-promoted,
   idle_reassert re-asserts only visiblePinKeys(>0.5). Once a demoted pin's GPU value is stale-high, nothing
   drives it to 0. de-dup gate (14524) keyed on mirror suppresses a GPU repair when mirror already==target.
PROBES (this build, before any fix): forced_count (rule out highlighted overflow), v4_authority_fire (does the
ungated v4 path run under v5 with pinned>>v5pins?), gpu_demote_census (GPU read-back of demoted on-screen set:
gpuVisibleTotal≈60/demoHigh≈30 vs pinsWanted=30 ⇒ confirmed divergence). Drive BOTH camera-only AND search/
filter flows (v4 remnant fires on data-change). Read: scripts/lod-attr.sh → "BUDGET-VIOLATION VERDICT".
PATH FORWARD (once attributed): finish V4 excision — gate reconcileAndApplyLiveMarkerRoleOutputs /
updateLivePinTransitions opacity work behind !lodV5Enabled (keep admission/role-membership bookkeeping only);
make feature-state self-healing (re-assert demoted on-screen pins toward 0); key de-dup on GPU truth. NO
hysteresis. NOT fixing until probes name the active writer (last consensus H1 was unanimous + runtime-refuted).

## ~60-PINS SYMPTOM FULLY ATTRIBUTED (2026-06-26) — demoted pins stranded at mid-opacity

gpu_demote_census (GPU getFeatureState read-back, 3 opacity bands, dense view demotedChecked=501):
  gpuPerceptible(>0.1) = 53  =  28 promoted-full(>0.5)  +  23 DEMOTED at mid(0.1-0.5).  peak mid-band=30.
RESOLVES the count gap: user's "~60, half stuck" = ~30 fully-promoted + ~23-30 DEMOTED pins stranded at
PERCEPTIBLE mid-opacity (0.1-0.5). The prior pinsWanted=30 used a >0.5 threshold → counted the mid pins as 0
→ that is the entire 30-vs-60 discrepancy. The "stuck half" = demoted pins NOT reaching 0.
Probe verdicts: forced_count=0 (forced overflow REFUTED). v4_authority_fire=4 (updateLivePinTransitions DOES
run under v5, desiredPins=531/v5pins=0, on data-changes — V4 leak ACTIVE, a contributor). demoMid persists
across many samples beyond the 4 v4 fires.
MECHANISM (dominant): the DEMOTE PIPELINE — continuous dense zoom churns the on-screen top-30, so ~30 pins are
perpetually demoting; under the 12-18fps display-link jank each fade-out is slow/coarse, so ~30 demoting pins
are caught at mid-opacity at any instant = the visible "extra 30 / stuck half". Secondary: NO SELF-HEAL
(consensus #3 — step prunes settled, idle_reassert re-asserts only >0.5 visible, seed only newly-promoted) so
a stranded demote never recovers to 0; and the ungated V4 updateLivePinTransitions adds noise on data-change.
FIX PATH (clean V5, no hysteresis): (A) robust demote fades — frame-rate-independent (time-based) fade so a
demote reaches 0 on schedule regardless of fps, + SELF-HEAL: re-assert demoted on-screen pins toward 0 (not
just visible pins toward target). (B) finish V4 excision: gate updateLivePinTransitions / reconcile opacity
work behind !lodV5Enabled. (C) reduce render jank (secondary, the frame-rate root). Most impactful for the
symptom = (A)+(B). NOTHING fixed yet — full attribution complete, awaiting direction on the fix.
