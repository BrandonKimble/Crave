# Map LOD — Master Plan

The all-encompassing plan for the search-map marker system (pins · dots · labels · collision · fade). §1 = the
LABEL stacking solution (Option A, locked in). §2 = the merged RENDER-SUBSTRATE decision (v6) — the pins/dots/
fade redesign merged with §1 and red-teamed (the ideal shape is ES2 Hybrid, gate-conditioned, with ES3 as the
guaranteed floor). The LodEngine promotion BRAIN (decide/step/budget) is byte-intact in every phase; this doc
covers the RENDER substrate + labels, not a promotion-rule change.

Supersedes `lod-label-viewannotations-plan.md`. Merges `lod-render-substrate-ideal-plan.md` (its pin-VA leg is
kept gated; its label-VA leg is rejected — see §2.1). The detailed v4→v5 change-log is
`lod-v5-canonicalization-worklog.md`.

---

# §1 — Labels: stacking via "per-rank mutex offset" (the decision)

## 1.1 The problem
Each promoted pin gets ONE name-label, placed on one of 4 sides (bottom/right/top/left), each side at its own
distance from the pin. Today a per-restaurant **mutex** dedups a restaurant's 4 candidate labels to one: all 4
candidates carry a shared invisible icon at `P(restaurant) = projected(pin) + a fixed offset`, with
`iconAllowOverlap:false`, so only one candidate can place → one label per restaurant.

The mutex is **keyed on screen position**. Two pins at the *same* world coordinate project to the same screen
point, so `P(A) = P(B)` **exactly** → their mutexes collide cross-restaurant → only ONE restaurant keeps a
label → **the rest of a stack go nameless.** Measured: 57% of stacked promoted pins lose their label. This is
the single defect — everything else about labels works.

Why it's not "just tune the geometry": any dedup region keyed on screen position coincides for same-position
pins. No padding/sort-key/shape change separates two pins at one pixel. (Verified exhaustively.)

## 1.2 The constraints any fix must meet (all 8)
- **C1 per-anchor distances** — top farthest (clear the tall pin), bottom nearest, left/right own distance +
  raised. (Rules out `text-variable-anchor`: single radial offset.)
- **C2 stacking** — N pins at one exact pixel → each label a DISTINCT slot, all show (the 4-exact-stacked test).
- **C3 basemap yield** — Mapbox's basemap street/POI labels must be suppressed by ours during search. Requires
  our labels to live in Mapbox's shared symbol collision pass (i.e. GL symbols).
- **C4 dismiss crossfade** — on press-up, release our labels' collision so basemap labels RETURN, synchronized
  with our labels fading out.
- **C5 pin avoidance** — labels yield to pins (the invisible pin-obstacle boxes).
- **C6 live pan reflow** — labels re-place live as you pan.
- **C7 fallback** — if a label's chosen side is blocked (by ANY neighbor, stacked or not), it tries another
  free side rather than hiding. (Mapbox's 4-candidate competition gives this; single-slot assignment loses it.)
- **C8 efficiency / no wiggle** — as cheap as Mapbox-native; NO source re-tile of the resident geometry during
  pan (the wiggle).

## 1.3 The fix — Option A: per-rank mutex OFFSET
Keep the entire current label system unchanged (4 candidate SymbolLayers, each its own `textOffset` = C1;
`symbolZOrder:'source'`; `textAllowOverlap:false` so Mapbox live-picks the free side = C6/C7; the per-restaurant
mutex doing intra-restaurant dedup). Make ONE change: separate stacked restaurants' mutex points by **identity,
not position** —

1. **Native source builder**: bucket EXACT-coincident pins by quantized **world** coordinate; assign a
   per-restaurant **`stackRank`** (0,1,2,3…) deterministically (stable order, e.g. by restaurant id), and bake
   `stackRank` onto all 4 of that restaurant's label features. Singletons get `stackRank = 0`. Write via the
   **incremental, diffKey-gated per-feature** `updateGeoJSONSourceFeatures` on the un-bundled label-render
   source, **only on stack form/break** (never per pan-frame).
2. **Style** (search-map.tsx, mutex base ~L2453): replace the mutex's `iconTranslate` (a **PAINT** shift — does
   NOT move the collision box; this is the bug that made the "above-pin" mutex position cosmetic) with a
   **data-driven `iconOffset`** (a **LAYOUT** shift — moves the box):
   `iconOffset = [0, base + stackRank * step]`, in icon-units (reuse the existing px→icon-unit conversion the
   pin obstacles already do at ~L213-216). Keep `iconAllowOverlap:false`, `iconOpacity:0.001`. Spread this base
   into all 4 candidate styles exactly as today.

Now each stacked restaurant's mutex sits a few px apart → **distinct collision slots → no cross-suppression →
all N stacked labels survive (C2 solved).** Non-coincident restaurants get `stackRank = 0` → **byte-identical
to today** (diffKey no-op, no source write).

**Why this is the ideal (meets all 8):** because every restaurant STILL emits all 4 candidates under its own
(rank-offset) mutex, **Mapbox's native "if your side is blocked, take a free one" fallback stays fully intact**
(C7 — the property every single-slot approach throws away), for stacked and non-stacked alike. We changed
nothing about C1 (the 4 textOffsets), C3/C4 (labels stay GL symbols in the shared pass; basemap-yield + the
crossfade are untouched), C5 (the obstacles), or C6 (Mapbox per-frame collision still live-picks). And C8 holds:
`stackRank` re-bakes only on the discrete stack form/break event, on the **un-bundled** label source (so it
re-runs only LABEL placement, never the resident pins — it cannot wiggle pins; same class as the obstacle
reseed that already runs every camera tick), via the incremental per-feature path, diffKey-gated.

## 1.4 Honest tradeoffs (tuning, NOT architecture)
1. **Distinct collision slot ≠ non-overlapping rendered text** — two stacked labels a few px apart could
   visually touch. Tune `step` against the pin/label obstacle sizes.
2. The `iconTranslate → iconOffset` switch is **mandatory and fails silently if missed** (the exact paint-vs-
   layout trap the codebase already hit once). Verify the offset lands above-pin identically and pans
   screen-stably (north-up map + viewport-resolved icon alignment, like the obstacles today).
3. Bucket on **world** coord (camera-stable), bake only on the form/break topology event (keeps the re-bake the
   cheap incremental kind).
4. **If stacked labels CLUMP toward the same preferred side** (they compete freely, which is great for C7 but
   doesn't force a spread): escalate to **Option D** — add deterministic side-fanning (bottom→right→top→left)
   via source-order preference per stack. Cosmetic-quality lever, effort L. **Start with A; reach for D only if
   it clumps in practice.**

## 1.5 Validation gate — the 4-exact-stacked repro
Build, then drive the canonical repro (4 restaurants at one identical world coord — perf deep link
`crave://perf-scenario-command?action=set_map_camera` + `submit_shortcut_restaurants`, or the maestro jitter
flow, `lodHarnessEnabled=true`). PASS, read in order:
- **(a) C2** — all 4 stacked labels paint simultaneously, each on a distinct side (renderP for labels = 4, not
  1; the eye must see 4 names).
- **(b) C7** — pan so one stacked member's preferred side is blocked by a neighbor; confirm it FALLS to another
  free side rather than hiding (proves the 4-candidate competition still drives selection).
- **(c) C8** — during the pan that forms/breaks a stack, the label source takes only the incremental per-feature
  update and the PINS do NOT re-snap; the `stackRank` re-bake appears only on the discrete form/break tick,
  never per pan-frame.
- **(d) regression** — a non-stacked scene's label source diff is byte-identical to pre-change.

Build gotcha (CLAUDE.md): `BUILD SUCCEEDED` ≠ linked — stat the installed binary mtime vs source and confirm a
unique harness marker prints, or you measure a stale binary.

## 1.6 Why every alternative is ruled out (so they stay closed)
- **ViewAnnotations** (UIView labels with native per-anchor `variableAnchors` + collision) — solves C1/C2/C6/C7
  natively, BUT they live in a SEPARATE collision world above all GL layers, so basemap symbol labels **cannot**
  yield to them (the avoid-API is line-layers-only) → **fails C3 and C4** (the basemap requirement). Also: labels
  are a tap target (needs re-plumbing), +pin-proxy views for C5, +instant collision-pop. **DEAD for this map.**
- **Feature-state opacity selection** (keep 4 resident, show the chosen by opacity) — **PROVEN dead**:
  `opacity:0` does NOT de-collide a symbol. Collision is a LAYOUT decision (allow-overlap/ignore-placement/
  padding) made before opacity (a PAINT prop) is applied; an opacity-0 label still reserves its box and
  suppresses neighbors (the obstacle's `0.001` is cosmetic, not a collision lever). You'd get 3 invisible-but-
  colliding labels per restaurant — strictly worse than today.
- **`text-variable-anchor`** — single radial offset, fails C1. **`text-variable-anchor-offset`** (per-anchor) —
  does NOT exist in MapboxMaps at any version; **SDK bump impossible**.
- **MapLibre migration** — violates stay-on-Mapbox; re-opens wiggle/dismiss/lifecycle; only partial on C2.
  **Custom GL layer** (CustomLayerHost) — zero collision surface, geometrically identical to a ViewAnnotation
  re C3/C4. DEAD.
- **Single-slot custom placement** (1 data-driven layer, or a chosenCandidate filter) — solves C2 by assigning
  the side ourselves, but **loses C7** (a blocked label just hides) and risks C6/C8. Inferior to A, which keeps
  the native fallback. (This is the line A improves on: A nudges only the per-restaurant *mutex* and leaves all
  4 candidates competing, so fallback survives.)

## 1.7 Label rendering + collision context Option A touches (for the implementer)
- **4 candidate label layers** (bottom/right/top/left), `labelCandidateStyles` (~search-map.tsx:2509), each its
  own `textAnchor`+`textOffset` (the per-anchor distances), `textAllowOverlap:false`. Un-bundled source
  `RESTAURANT_LABEL_RENDER_SOURCE_ID` (separate from pins so label churn never re-tiles the resident pins).
- **The mutex** — `LABEL_MUTEX_IMAGE_ID` icon spread into all 4 candidate styles, shared point above the pin,
  `iconAllowOverlap:false`. **This is the only thing Option A changes** (iconTranslate→data-driven iconOffset
  keyed on the new `stackRank`).
- **Pin obstacles** (UNCHANGED by Option A): labels yield to pins via the 3 label-pin obstacle boxes (center +
  side-left + side-right; a 3→1 collapse to one wider box is a separate cosmetic cleanup); dots yield to pins via
  the dotbody obstacle (full body, separate). Both invisible, from `RESTAURANT_LABEL_COLLISION_SOURCE_ID` (which
  also feeds the dotbody — so keep that source + build + reseed regardless).
- **Basemap coordination / dismiss crossfade** (a label requirement Option A preserves): our labels are GL
  symbols in Mapbox's shared collision pass → basemap labels yield to ours during search. On dismiss, releasing
  our labels' collision returns the basemap labels. Today: `setLabelRenderLayersVisible(false)` →
  `visibility:none` (instant). **Desired upgrade (separate from Option A):** on press-up flip the label layers
  to `textIgnorePlacement:true` (keep rendering + fading via opacity, release collision so basemap fades back
  in) → a true crossfade; then `visibility:none` when fully faded.
- **Labels are a tap target** — a name tap opens the restaurant. Option A keeps the candidate layers, so this is
  untouched.

---

# §2 — Render substrate (pins · dots · fade): merged decision (v6)
Merged from the render-substrate plan (`lod-render-substrate-ideal-plan.md`) + §1, via a merge+red-team
(wf_2ab1237c, 2026-06-25). **Ideal long-term shape = ES2 HYBRID, gate-conditioned, with ES3 as a guaranteed
floor that is a strict prefix of ES2.** The LodEngine brain (decide/step/budget/CADisplayLink) is byte-intact
in every phase; only WRITE TARGETS / fade-source change, behind independent flags.

> **⚠️ OPERATIVE ORDER — the RED-TEAM CONSENSUS at the END of this doc OVERRIDES §2.2/§2.3 where they conflict; read it first.** Four binding corrections: (1) **GATE-PREMISE runs FIRST**, before any production code — one on-device frame-gap read collapses the whole ES2-vs-ES3 decision (~17ms → ES3 suffices, pin-VA unjustified; ~50ms → skip Phase 0, go straight to ES2). (2) Phase 0's wall-clock fade kills the dt-rate **jump-on-jank**, NOT the frame-rate staircase (only ES2/`view.alpha` or a fast on-device GL removes that), and MUST carry the commit-invariant. (3) The ES3 floor delivers ONLY wiggle + basemap suppression + stall-robustness — snapping / choppy / >30 / liveliness need ES2 or a fast on-device GL; whole-scene 60fps is structurally unreachable. (4) The label fix LEADS with the **OBSTACLE reshape + candidate-offset push** (the measured 57% cause), with Option A for the exact-stack mutex; validate by re-running the real `slabel` probe, not just the synthetic 4-stack.

> **✅ GATE-PREMISE — CLOSED (2026-06-27): ES3 LOCKED, ES2/pin-VA PARKED.** Brandon trusts the sim as the perf substrate ("the sim has never deviated from on-device"). Measured on the current *harness-free* build via a frame-gap probe on `onRenderFrameFinished` (Mapbox's real GL paint-complete signal — the staircase source): real-gesture PAN storm p50/p95 = 17/18ms (98% at 60fps, 1% <30fps); armed dense ZOOM churn p50/p90/p95/p99 = 17/22/29/65ms (4% <30fps, ~2% staircase frames). **60fps median under both — no dominant 12–18fps staircase.** The worklog's 12–18fps was a HARNESS-build artifact (oracle queryRendered + paint-monitor + drift-census, all main-thread every frame); harness-free renders far better. ⇒ At 60fps the **ES3 floor + wall-clock fade delivers EVERYTHING**: snapping (≈11 steps/180ms is smooth), choppy gone, >30 bounded by strict-budget + on-schedule fade-out, basemap suppression (GL labels), AND liveliness. **The pin-VA (ES2/Phase 4) leg is UNJUSTIFIED; GATE-A + GATE-OBSTACLE are MOOT.** Only remaining gate: GATE-STACKED — the obstacle-led label fix, validated by the real `slabel` probe.

## 2.1 The decision
- **Labels** → STAY GL symbols + §1 Option A. The lynchpin conflict (render-substrate sent labels→VA) is
  resolved here for THREE source-verified structural reasons (the render-substrate plan named 2, missed the 3rd):
  (1) name-footprint basemap leak — the GL label text's own collision box reserves the restaurant-NAME
  rectangle; VA labels leave the collision pass and ~500 sparse dot point-boxes cannot blanket a 34-220px name
  rectangle → basemap street names leak under every restaurant name; (2) dismiss handoff — a VA label has no GL
  collision box to release on press-up; (3) **reveal-start gate** — `isActiveFrameLabelPlacementReady`
  (controller:5704) gates the SHARED pins/dots/labels reveal-opacity animation via `queryRenderedFeatures` over
  labelLayerIds (controller:3261-3263) + a deadlock watchdog recent commits (467b14c5, 624d3937) just
  stabilized; VA labels evaporate that query target. ⇒ **ES1 FULL-VA is dead.**
- **Pins** → Mapbox ViewAnnotations (Core-Animation `view.alpha`), **gated** (see 2.3). The one structurally-
  clean VA win: `ViewAnnotation.place()` only writes `view.frame`/`isHidden`, NEVER `view.alpha`
  (ViewAnnotation.swift:313-335), so a CA alpha tween composites off the 12-18fps GL clock → kills SNAPPING;
  UIViews aren't source features → kills WIGGLE; controller-owned residency dict in lockstep with
  `engine.lastPromotedInOrder` → bounds OVER-30.
- **Dots** → STAY the ~500-feature colliding SymbolLayer (collision is load-bearing: suppresses basemap labels
  in their footprint; CircleLayer cannot). Only the ≤30 pin-occupied dots animate (1−p feature-state, kept).
- **BOTH invisible pin-obstacles RETAINED** — correction to the render-substrate plan's "delete
  LABEL_PIN_COLLISION_STYLE": the two obstacles are at DIFFERENT z-anchors / consumers — LABEL_PIN_COLLISION
  (below OVERLAY_Z, search-map.tsx:296/410 → labels yield to pins) and DOT_PIN_COLLISION/dotbody (below
  SEARCH_LABELS_Z, :422 → only dots yield). Deleting the label one severs label→pin avoidance.
- **Correction to BOTH plans:** the dismiss CROSSFADE is NOT already solved — today basemap returns at the END
  (obstacle-layer flip), not synchronized with the fade (controller:6506-6513; opacity-0 does NOT de-collide).
  The true synchronized `textIgnorePlacement:true` crossfade is an UNBUILT upgrade (§1.7), a follow-up in
  ES2 and ES3 alike — a preserved capability, not a current feature.

## 2.2 Merged sequence (flag-gated, individually revertible)
- **Phase 0 — wall-clock fade** inside LodEngine only: `step(dtSeconds)→step(nowMs)`, a `Fade` struct
  (from/target/startMs/fadeMs), pure projection `opacity(now)=from+(target−from)·clamp((now−start)/fadeMs,0,1)`,
  prune-at-clamp==1. `applyV5OpacityWrites` + targets (pin=p, dot=1−p, label=p) byte-identical; only the scalar
  SOURCE changes. Kills the dt-rate staircase on the EXISTING GL substrate for pins/dots/labels at once.
  Flag `wallClockFade`. (The time-based-fade idea from §1-era discussion lives here.)
- **Phase 1 — Option A label stacking** (§1.3). Flag `labelStackRankMutex`. **Phases 0+1 = ES3, the floor.**
- **Phase 2 — airtight residency**: make `retainResidentDemotes` (controller:5140-5144) UNCONDITIONAL → pin
  source is the full set (promoted@1/demoted@0); a gesture-time promote/demote is a pure opacity flip, never a
  `removeGeoJSONSourceFeatures` re-tile (controller:10917, the wiggle source). Hardens WIGGLE on GL, no VA.
  Flag `unconditionalResidency`.
- **Phase 3 — MEASURE on-device** (the gates, 2.3). Decision point: stop at ES3, or go to Phase 4.
- **Phase 4 — pin-VA leg** (gated): re-point ONLY the pin branch of `applyV5OpacityWrites`
  (setFeatureState → `pinVA.view.alpha = lodOpacity × presentationOpacity`, written from BOTH the V5 tick AND
  `stepPresentationOpacityAnimation`). Build `PinAnnotationView` (baked badge UIImageView + CALayer shadow +
  an RN→native highlight UIImage delivery path), residency dict, per-pin `UITapGestureRecognizer`→
  `handlePressTarget`. DELETE only: pin symbol+shadow layers, pin bundle source, the pin `queryRenderedFeatures`
  press branch, the pin-interaction CircleLayer, the pin `retainResidentDemotes`/gapBundle machinery. **KEEP
  both obstacles + the label render source/4 candidates/mutex + the label & dot opacity branches.** Flag
  `pinsAsViewAnnotations`. Result = ES2 HYBRID.

## 2.3 Ordered gates (cheapest make-or-break first — run in this order)
1. **GATE-PREMISE** (after Phase 0+1, ON-DEVICE, hours, zero new code): with the wall-clock fade, do pins read
   smooth (dtMs ~17ms, no staircase) under a hard pinch + the maestro jitter flow? The choppy premise is partly
   a SIM artifact (controller:4436 fingers a 30-53ms CPU-reconcile spike, not GPU fill; the render-substrate
   plan concedes choppy "may be sim-only"). **If pins are smooth on-device → STOP at ES3 permanently; the
   entire pin-VA leg is unjustified.** If they still jank → GATE-A.
2. **GATE-A** (only if needed; throwaway 30-pin-VA playground, ON-DEVICE, days): do **30** pin VAs hold fps with
   imperceptible lag under forced `presentsWithTransaction=.sync` (binary per-map, unavoidable with any VA; the
   only lever is COUNT — ES2 minimizes it to 30 vs ES1's cliff-edge 60)? PASS → build ES2 Phase 4. FAIL → ES3
   permanent.
3. **GATE-OBSTACLE** (an hour, on-sim, before Phase 4 commit): with pin VAs, confirm GL labels+dots still yield
   to the pin footprint via the RETAINED obstacles (reseeded by `applyV5ObstacleReseed`, independent of pin
   substrate), and basemap stays suppressed under the pin body.
4. **GATE-STACKED** (part of Phase 1): the §1.5 4-exact-stacked repro; explicitly confirm `iconTranslate→
   iconOffset` actually MOVED the collision box (the paint-vs-layout trap).

## 2.4 THE one product decision (Brandon) — everything else the gates resolve
**Is per-name-footprint basemap suppression a HARD requirement?** Code + stated requirement imply YES → labels
stay GL → ES2/ES3, full-VA dead. The ONLY path that rescues full-VA (labels→VA) is globally hiding basemap
road/POI label categories during search via `setStyleImportConfigProperty` — but that's an unrun probe with a
conceded-fatal failure mode, only coarse city-level granularity, and loses road-name orientation mid-search.
**Recommendation: keep it HARD.** Not worth forfeiting three preserved-by-construction invariants for a
marginally bigger choppy win + native stacking Option A already delivers.

---

## Mental model (the label fix)
The labels are fine; the pins are fine. The one broken thing is the invisible "only one of my four names may
win" point each restaurant uses to pick a single side. When two restaurants sit on the exact same pixel, those
points land on top of each other and fight, so one restaurant loses its name. We don't replace anything — we
give each pin in a stack a NUMBER and nudge its invisible point apart by that number. Each restaurant keeps its
own private picker (and its free-side fallback), the points stop colliding, and each stacked pin gets a name on
a different side. Everything else — names dodging pins, basemap street labels yielding then fading back on
dismiss, smooth panning — is untouched, because we didn't touch it. We went all the way to rewriting the label
engine (ViewAnnotations) and came back with a one-number nudge to the mutex.

> Note on the shared tree: the search-map files are edited by more than one session right now — confirm state
> before building Option A, and coordinate the search-map.tsx mutex edit with the v6 work.

---

## RED-TEAM CONSENSUS (2026-06-27 — 20-agent skeptical review + orchestrator source-verification)

**VERDICT: YES, chase this shape — no dismissed alternative beats it under the hard basemap constraint.** Verified: full-VA breaks the reveal gate + basemap-yield + dismiss; CustomLayer renders inside `metalView.draw()` (no fade decouple); no `now` operator exists so no GL fade beats wall-clock. Labels-stay-GL is the strongest, source-verified pillar. BUT the doc OVER-WORDS what the ES3 "floor" delivers, and two headline fixes target the wrong cause. Four corrections, all verified in source:

1. **Phase 0 wall-clock fade does NOT kill SNAPPING on GL.** `lod-v5-canonicalization-worklog.md:364-365` ("time-based fade alone does NOT fix coarseness at 12fps … the frame rate is the lever"); `LodEngine.advance` is dt-rate. It re-times the staircase, does not remove it. Snapping dies structurally ONLY at ES2 (CA `view.alpha`; `ViewAnnotation.place` never writes alpha, source-confirmed) — OR if on-device GL is already ~60fps. (This is the SAME time-based fade that made it "worse" once.)
2. **"choppy is sim-only" is MIS-EVIDENCED.** `controller:4436`'s 30-53ms is a `CHOPPY FIX (2026-06-22)` comment describing the PRE-fix state already fixed; the off-ramp leans on a stale citation. Real residual is ~50ms Mapbox placement (unmeasured on-device).
3. **Phase 0 OMITS the commit-invariant (ROOT-B)** its own ancestry calls mandatory → risks the mid-fade boundary oscillation already rejected. Fold it into Phase 0 (engine-internal, byte-contained).
4. **Option A targets the MINOR cause.** E3 `slabel` attribution (`worklog:206-219`): the 57%-nameless loss is the full-pin-body OBSTACLE ×2 covering all 4 candidate positions (blanketLoss + competeLoss); "Mutex is a minor factor (<6px only)." Lead the label fix with the OBSTACLE reshape + candidate-offset push (E3's own prescription), not the mutex nudge. Success metric = re-run the real `slabel` probe, not the synthetic 4-stack.

**WHAT THE ES3 FLOOR STRUCTURALLY DELIVERS:** only WIGGLE (unconditional residency), BASEMAP SUPPRESSION (labels/dots GL), and stall-robustness. SNAPPING, >30, CHOPPY, LIVELINESS all need ES2 or ride on the unverified on-device frame rate.

**#1 ACTION (reorder the plan): MEASURE on-device FIRST** — a raw frame-gap read on the CURRENT binary under a hard pinch + jitter flow (hours, zero new code). ~17ms/frame → ES3+wall-clock suffices, pin-VA unjustified. ~50ms → snapping is unfixable on GL, skip Phase 0, go straight to ES2 (Phase 4). One reading collapses the entire ES3-vs-ES2 decision.

**LIVELINESS CEILING (state it explicitly):** whole-scene 60fps is structurally UNREACHABLE under the hard basemap constraint (dots + labels stay GL feature-state forever to keep basemap suppression). Achievable ceiling = ≤30 pins at 60fps (CA) over dots/labels fading as smoothly as the on-device GL runs.
