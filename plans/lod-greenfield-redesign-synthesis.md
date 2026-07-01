# LOD Greenfield Redesign — Synthesis (2026-06-28)

> Produced by a 25-agent clean-slate workflow: 6 independent designs (NO V4/V5 reference) → red-teamed on the 3 hard invariants → synthesized. ~1.07M tokens.

## Recommended architecture: GRAFT: "prior-art-research" single-source/dual-layer GL design as the skeleton, hardened with (a) the pure-gl wall-clock single-scalar fade, (b) a CRITICAL fix that NO design got right — opacity authority must be unified by removing Mapbox's collision-fade and tile-reparse as competing opacity writers, and (c) the invariant must be bound to RENDERED pins (the prior-art Max-30 break), not an abstract allocator set. Reject all native-ViewAnnotation designs: they introduce a renderer-owned visibility authority (bounds-culling, async show/hide, SDK reverting isHidden) that no completion-gated state machine can fence off, and they cannot participate in the GL collision engine that the label-mutex requirement depends on.


## Recommendation

GRAFT: "prior-art-research" single-source/dual-layer GL design as the skeleton, hardened with (a) the pure-gl wall-clock single-scalar fade, (b) a CRITICAL fix that NO design got right — opacity authority must be unified by removing Mapbox's collision-fade and tile-reparse as competing opacity writers, and (c) the invariant must be bound to RENDERED pins (the prior-art Max-30 break), not an abstract allocator set. Reject all native-ViewAnnotation designs: they introduce a renderer-owned visibility authority (bounds-culling, async show/hide, SDK reverting isHidden) that no completion-gated state machine can fence off, and they cannot participate in the GL collision engine that the label-mutex requirement depends on.

Architecture name: "Unified-Authority Dual-Layer GL LOD." One immutable GeoJSON source (one feature per restaurant), two symbol layers (PIN: teardrop+badge+text; DOT: icon-only). Every pixel of marker opacity is the product of exactly TWO factors — paint-expression opacity (which we own via feature-state) and Mapbox collision-placement opacity (which Mapbox owns). The entire design is built to make the second factor a CONSTANT 1.0 on the opacity-bearing geometry, so our owned scalar is the SOLE opacity authority. That is the single insight every red-team exposed and no design fully executed.


## Substrate

GL symbol layers only. ONE shared GeoJSON source, one Feature per restaurant, stable feature-id = restaurant id, written ONCE per data version, NEVER during camera movement.

Two layers off that source:
- PIN layer: icon=teardrop+badge, text=name label. icon-opacity = text-opacity = ["coalesce",["feature-state","p"], 0]. CRITICAL: icon-allow-overlap=TRUE and icon-ignore-placement=TRUE on the PIN ICON, so Mapbox's collision engine NEVER hides or collision-fades the pin glyph — the icon's only opacity factor is our scalar p. icon-opacity-transition and text-opacity-transition = 0ms (kills the implicit ~300ms GL paint transition; feature-state value becomes the instantaneous rendered value — confirmed settable on SymbolLayer in 11.x).
- DOT layer: icon-only, icon-allow-overlap=TRUE, icon-ignore-placement=TRUE, icon-opacity = ["coalesce",["feature-state","d"], 1], transition 0ms.

The LABEL is the one place we KEEP Mapbox's collision engine: text-allow-overlap=FALSE, text-variable-anchor=[top,bottom,left,right], text-radial-offset, symbol-sort-key=rank — but with text-opacity ALSO = our p scalar AND text-opacity-transition=0. This is the deliberate, scoped concession (see labelCollisionPlan): label placement/mutex stays native; label opacity is ours.

Why GL not ViewAnnotations: ViewAnnotations (1) are a second renderer-owned visibility authority (bounds-cull hide, async show/hide, SDK reverts manual isHidden — Mapbox issues #1748/#2057/#2149) that fences off our state machine and breaks no-flash/no-stuck at the viewport edge during pan; (2) cannot participate in GL collision, so the 4-anchor mutex would have to be reimplemented; (3) lag the GL camera mid-pan (trail). All three native designs broke on exactly these.


## Full architecture

DATA FLOW:
1. JS pushes result set {id,lat,lng,rank,score,color,name}. Native builds ONE FeatureCollection, also bakes a SOURCE PROPERTY "pinDefault" (0) and "dotDefault" (1) per feature so the coalesce fallback after a reparse renders fail-safe-to-DOT, never fail-to-PIN. Paint expr becomes ["coalesce",["feature-state","p"],["get","pinDefault"]]. Source set ONCE.
2. SELECTOR runs on a CADisplayLink-gated dirty flag, throttled to ~12Hz while moving + once on onMapIdle. It (a) reads viewport bounds from cameraState, (b) filters the in-memory restaurant array (built once, with a grid/R-tree index) to in-viewport, (c) nth_element top-30 by rank. Output = desiredPins (≤30 ids). O(M) at 12Hz, off the render frame.

PROMOTE/DEMOTE — the SLOT model is bound to RENDERED pins, not an abstract set (fixes prior-art's fatal Max-30 break):
- A "slot" is occupied by any feature whose p>0 (i.e. visibly a pin OR mid-fade). The allocator counts features-with-active-or-settled-pin, NOT just "intended" pins.
- Each tick, do a PAIRED crossfade swap: for each id leaving desiredPins, start demote (p→0); for each id entering, start promote (p→1) ONLY when count(p>0) < 30. A demoting feature still counts toward the 30 until its p actually reaches 0. This means a promote can be deferred one tick when the field is saturated mid-fade (acceptable: momentarily ≤30, never >30, never wrong). Short FADE_MS (~180ms) frees slots fast.
- d is always written as 1−p from the single scalar, so a feature is never both fully-pin and fully-dot, and the pair always sums to ~1 (always-visible, no blank seam).

FADE — single owned scalar, wall-clock, single writer:
- Per id transition struct {startT=CACurrentMediaTime, fromP, targetP∈{0,1}, dur}. p(now)=lerp(fromP,targetP,clamp((now−startT)/dur,0,1)).
- ONE CADisplayLink walks only the ACTIVE set (transitions not at endpoint), computes p, writes setFeatureState{p, d=1−p}. On reaching t≥1 it writes the EXACT endpoint once. Settled markers cost zero/frame; link self-pauses when active set empties.
- RETARGET: from=current p, startT=now, target=new. (See howNoWiggle/openQuestions for the V-dip hysteresis that makes this monotonic-as-perceived.)

DATA-VERSION / REPARSE PROTOCOL (the self-heal that no design fully had):
- Subscribe to onSourceDataLoaded (fires on GeoJSON reparse, incl. zoom-bucket re-tile) AND onStyleDataLoaded. On either, AND for several ticks after any source set, re-assert feature-state {p,d} for every in-viewport id at its current owned value — not diff-only. Combined with the fail-safe-to-dot paint default, a reparsed tile shows at-worst a dot (never a phantom pin), and the next event/tick re-asserts the true value.
- The reconciler is FULLY reconciling, not incremental: each selector tick asserts the owned target for every in-viewport id, so a dropped async write self-heals on the next tick (≤~80ms), not only on idle.


## Invariant: ≤30 (structural)

TWO independent structural caps, both on RENDERED pins (the prior-art design's fatal flaw was capping an abstract allocator set while >30 fading-out pins rendered):
1. INPUT cap: desiredPins is the output of nth_element take(30) — emitting a 31st id is unrepresentable by the bounded selection.
2. RENDER cap: a feature's PIN icon renders iff p>0, and p is written >0 ONLY by a promote, and a promote fires ONLY when count(features-with-p>0) < 30. A demoting feature keeps counting toward 30 until its p reaches exactly 0 (endpoint write). So the number of features with p>0 — i.e. the number of pins that can paint a single pixel — provably never exceeds 30 at any instant, including mid-crossfade. The cap is on the rendered quantity, enforced by the promote-gate reading the live p>0 count, not a memory-set count.
Because we also set icon-allow-overlap=TRUE / icon-ignore-placement=TRUE on the pin icon, Mapbox never adds a hidden-but-placed phantom and never collision-fades a 31st in — the GL placement budget can't introduce an extra pin either. There is no code path that paints a pin icon for a feature with p=0.


## Invariant: no flash (structural)

Flash = a non-monotonic on-screen opacity trajectory. We make on-screen opacity EQUAL the owned scalar p (no hidden second factor), then make p monotonic:
1. UNIFIED AUTHORITY: rendered pin-icon opacity = p × collision_opacity. We force collision_opacity≡1 for the icon (icon-allow-overlap=TRUE, icon-ignore-placement=TRUE) and set icon-opacity-transition=0 (no implicit GL ramp). So rendered opacity ≡ p, with no competing animator. This is the exact seam (the collision-fade multiplier + implicit transition) that broke pure-gl, hybrid, declarative-reconcile and prior-art; we close it by removing both.
2. p has ONE writer (the display link) and moves linearly toward ONE target; d≡1−p so the marker is never both-high (double render) nor both-low (blank). A brand-new/reparsed feature renders the fail-safe-to-dot default — never a flash-of-pin.
3. SOURCE is immutable during movement, so no feature is ever added/removed mid-flight → no "appear then vanish" from a source edit.
4. The label opacity ALSO ≡ p with transition 0, so label and pin are algebraically lockstep. (The label's PLACEMENT can still change via the native mutex — that is anchor movement, addressed under wiggle/labels, not an opacity flash.)
The only residual non-monotonicity is the boundary V-dip (demote then re-promote of the same id), handled structurally by membership hysteresis (howNoWiggle / labelCollisionPlan) — without it, p bends but reverses; with it, the id doesn't re-toggle.


## Invariant: no stuck (structural)

Three layers, defense-in-depth, the last of which is a true structural backstop:
1. WALL-CLOCK TERMINATION: every transition's progress = (now−startT)/dur reaches ≥1 in bounded real time regardless of retargets (each retarget resets startT but keeps finite dur), and the link writes the EXACT endpoint (0 or 1) on completion. No per-transition object to orphan; the only writer of partials is the always-firing link, which by definition holds an active transition for any partial it produces.
2. FAIL-SAFE PAINT DEFAULT: coalesce falls back to a source property (pinDefault=0), so even if a feature-state write is dropped or a tile reparses without state (#7122), the feature renders at a clean DOT, never a stuck partial and never a phantom pin.
3. REPARSE-AWARE FULL RECONCILER: the selector asserts the owned target for EVERY in-viewport id every tick (idempotent, not diff-only), AND we re-assert all in-viewport feature-state on onSourceDataLoaded/onStyleDataLoaded. This converges any silently-dropped or reparse-cleared value back to {0,1} within ≤~80ms even during a sustained zoom storm (when onMapIdle never fires — the gap that made the prior-art and declarative designs' no-stuck claims non-structural). A partial with no active transition cannot persist: either the link is converging it, or the next reconcile tick re-issues its endpoint.


## No wiggle

1. GEOMETRY: source is byte-identical across every camera frame; promote/demote writes only feature-state (a GPU uniform), never the source → Mapbox never re-tiles/reorders the symbol layer during movement. symbol-sort-key=rank is constant → placement order is stable frame-to-frame. This matches Mapbox's own "don't update sources per frame" guidance and the team's measured wiggle signature (removes-during-moving must be 0; here it is structurally 0).
2. ICON RE-SNAP: with icon-allow-overlap=TRUE/icon-ignore-placement=TRUE the pin/dot ICONS never participate in collision, so they never re-snap or anchor-hop during a pan.
3. LABEL ANCHOR-HOP (the subtle wiggle the red-teams flagged): labels DO use the native mutex, and a promote/demote changes the collision field, which can re-anchor a neighbor's label mid-pan. Mitigations: (a) DOT layer carries text=none and icon-ignore-placement=TRUE so dots never perturb label placement (kills the two-layer double-reserve); (b) FREEZE text-variable-anchor re-selection during camera movement — only re-solve label anchors on onMapIdle and on settled promote/demote, so labels hold their chosen anchor through a pan and re-solve when motion stops (the same hold-on-idle technique the native-design fix recommended, applied to GL). Anchor selection during motion is held; opacity still crossfades live.
4. BOUNDARY V-DIP (a self-induced flicker, not classic wiggle): membership hysteresis (rank dead-band: promote on entering top-30, demote only on falling below ~rank 36) plus a commit-the-fade latch (a fade past X% toward an endpoint completes before it may reverse) so a fling grazing the boundary doesn't toggle a marker in/out. Hysteresis lives in the SELECTOR, never in the opacity path, so it cannot reintroduce stuck/flash.


## Labels + collision

PRESERVE the existing 4-candidate mutex + space reservation natively, but DECOUPLE label OPACITY from label PLACEMENT:
- PLACEMENT (kept native): PIN layer text-variable-anchor=[top,bottom,left,right] → Mapbox picks exactly one of 4 (the per-restaurant mutex, for free). text-allow-overlap=FALSE so labels reserve space and basemap labels + neighbors yield. symbol-sort-key=rank → lower rank wins placement (top-30 win their space). This is the ONE place Mapbox's collision engine stays authoritative — and it governs label PLACEMENT/visibility-by-collision, which is acceptable and desired (a label that genuinely can't fit should yield), NOT marker opacity.
- OPACITY (made ours): text-opacity = same ["coalesce",["feature-state","p"],pinDefault], text-opacity-transition=0. So the label fades in lockstep with the pin via the single scalar, with no implicit GL transition. Label-present-iff-pin-present is algebraic.
- ANCHOR STABILITY: re-solve variable-anchor only on idle / settled transitions (freeze during motion) to prevent neighbor anchor-hop wiggle.
- TENSION ACKNOWLEDGED: text-allow-overlap=false means Mapbox MAY collision-hide a label (set its collision_opacity→0) independent of p. We accept this for LABELS only (a label dropping when it truly cannot fit is correct behavior and is what the existing system already does), but we keep it OFF the ICONS (allow-overlap=true) so the marker glyph itself — the thing the Max-30/no-flash invariants are defined on — is never collision-hidden. The pin icon is the invariant-bearing object; the label is allowed to yield. If product requires the label to never collision-flicker mid-pan, the fallback is self-computed label placement over the ≤30 known pins in Swift (bounded, trivial) writing the chosen anchor via feature-state — listed as an open question.


## Complexity

Moderate. Substantially SIMPLER than any native-view design (no view pool, no CA, no completion bookkeeping, no second-authority reconciliation against the SDK). Core is: one source builder, one 12Hz selector (viewport filter + nth_element + hysteresis), one CADisplayLink fade loop over an active set, one paint-expression pair, and a reparse/reconcile re-assert hook. The genuinely new work vs. a naive GL design is small but essential: (1) setting transitions to 0 and allow-overlap=true on icons, (2) baking fail-safe-to-dot source defaults, (3) the onSourceDataLoaded re-assert, (4) binding the 30-cap to count(p>0) with paired swap + deferral, (5) freezing variable-anchor during motion. Estimate ~1-1.5k lines of Swift plus harness validation passes. Highest-risk items are all empirical (the open questions) — verify each on the existing LOD harness before locking, per the project's attribute-before-ideate rule.


## Borrowed from

- prior-art-research: skeleton — single immutable source, dual PIN/DOT GL symbol layers, feature-state opacity, bounded top-30 selector, symbol-sort-key=rank collision priority, native textVariableAnchor mutex, source-immutable-during-movement wiggle firewall
- pure-gl: single owned scalar per feature with d≡1−p, wall-clock (dt-clocked not frame-clocked) monotonic lerp, retarget-from-current, GPU-evaluated opacity, hysteresis-in-selector-not-opacity-path
- declarative-reconcile: fully-reconciling (not diff-only) selector as a structural self-heal, and the explicit insight that the invariant must be located on the RENDERED variable not the decision-layer scalar
- invariant-state-machine + hybrid + native-views red-teams: the decisive negative lesson — ViewAnnotations and Mapbox collision both introduce a SECOND opacity/visibility authority; the fix is to UNIFY authority (icon-allow-overlap=true + icon-opacity-transition=0 so our scalar is the sole factor), plus fail-safe-to-dot paint default and reparse/onSourceDataLoaded re-assert

## Rejected

- **Native ViewAnnotation pin pool (native-views, hybrid, invariant-state-machine)** — ViewAnnotations are a renderer-OWNED second visibility authority: Mapbox bounds-culls them, async show/hides them, and reverts manual isHidden (issues #1748/#2057/#2149). No completion-gated CA state machine can fence this off — a pin can be CA-settled at alpha 1 while the SDK paints it 0 (stuck ghost) or pop on re-show (flash), exactly at the viewport edge during the pan storms the invariants must survive. They also cannot participate in GL collision, so the label mutex would have to be reimplemented, and they lag the GL camera mid-pan. All three native red-teams broke fatally here.
- **Core Animation alpha as the pin fade clock** — CA completion semantics (finished=false on interrupt, no fire when the layer is detached by an SDK hide) make 'completion handler is the only exit' false; under sustained retarget storms the settle write is never reached. A wall-clock lerp we own on a CADisplayLink terminates structurally regardless of interrupts and needs no completion callback.
- **GL feature-state opacity WITH the default implicit paint transition left on (pure-gl/declarative as originally specified)** — icon-opacity-transition defaults to ~300ms, so feature-state writes kick off a SECOND GL-clocked animator that beats against our wall-clock lerp and can settle at a partial when writes stop (declarative Attack 2). Fixed by setting the transition to 0ms so feature-state is the instantaneous rendered value.
- **allow-overlap=false on the pin/dot ICON to reserve collision space (every design that wanted native reservation on the icon)** — allow-overlap=false hands Mapbox an independent collision-FADE multiplier and hide/show authority over the icon — the second opacity factor that breaks no-flash and no-stuck (pure-gl Attack C, hybrid/state-machine seams, prior-art break). We set allow-overlap=true + ignore-placement=true on icons so our scalar is the sole opacity authority, and keep collision only on the LABEL where yielding is acceptable.
- **Capping the abstract allocator/pinSet at 30 while freeing slots at demote-COMMIT (prior-art)** — Frees the slot before the fade finishes, so under churn dozens of demoting pins render at p∈(0,1) on top of 30 promoted ones → 35-45 visible pins. The cap must be on count(features-with-p>0), with the demoting feature counting until p reaches 0.
- **Diff-only feature-state writes + reconcile only on onMapIdle (prior-art/declarative)** — A tile reparse (#7122, on every zoom-bucket crossing) resets settled features to the coalesce fallback; diff-only writers never re-assert them and onMapIdle never fires during a sustained zoom, so settled pins render at fallback for the whole gesture. Fixed by a fully-reconciling selector + re-assert on onSourceDataLoaded + fail-safe-to-dot default.

## Open questions (validate on the harness)

- Confirm on the exact pinned MapboxMaps iOS version that icon-opacity-transition / text-opacity-transition can be set to 0ms AND that doing so makes a feature-state opacity change apply on the very next render with no implicit interpolation (verify via the LOD harness, not docs).
- Confirm that icon-ignore-placement=true + icon-allow-overlap=true fully removes the icon from the collision engine such that its rendered opacity ≡ our feature-state value (no residual collision_opacity factor on the icon). If a residual factor remains, the unified-authority claim weakens and we must self-compute placement.
- Does text-allow-overlap=false ever collision-hide a top-30 label DURING a pan badly enough to read as flicker? If yes, decide whether to self-compute label placement over the ≤30 known pins in Swift (writing the chosen anchor via feature-state) vs. accepting native label yield. This is the one remaining authority we don't fully own.
- Tune FADE_MS (~180ms) vs selector cadence (~12Hz) and the hysteresis dead-band (rank 30 promote / ~36 demote) so a fling cannot oscillate a marker faster than the commit-the-fade latch resolves — validate with the jitter-swipe + zoom storm on the harness watching renderP/roleGap.
- Verify setFeatureState batching: writing {p,d} for the active set (tens of ids) every display-link tick during a storm must not batch behind a frame; if it does, drop the fade write cadence to ~30Hz (opacity tolerates it) while keeping the selector at 12Hz.
- Decide the data-version update path when JS pushes a re-rank MID-PAN: the protocol is re-assert-after-source-set + fail-safe-to-dot, but confirm there is no visible frame where the whole field pops to dot before re-assert lands; if there is, consider a feature-state-preserving superset source so geometry need not be re-set on a pure re-rank.

## The 6 candidate designs (one-liners)

- **native-views** (Bounded Pin-View Pool with Self-Completing CA Crossfades over a Static Dot Symbol Layer ("Pool-and-Veil")) — HYBRID, split by role [red-team: 3/3 invariants broke]
- **pure-gl** (Dual-layer wall-clock ramp LOD ("two layers, one source, opacity = pure function of time")) — Pure Mapbox GL symbol layers + feature-state + data-driven paint expressions [red-team: 3/3 invariants broke]
- **hybrid** (Fixed Pin Pool over GL Dot Field (FPP/GDF) — split substrate) — SPLIT [red-team: 3/3 invariants broke]
- **invariant-state-machine** (Bounded Slot FSM over View-Annotation Pins on a static GL Dot substrate ("Slot-Bound Marker FSM")) — HYBRID, split by role and clocked independently [red-team: 3/3 invariants broke]
- **declarative-reconcile** (Pure-function LOD with a clocked monotonic feature-state reconciler ("desiredState = f(viewport, data, clock)") over a single GL symbol-layer pair) — GL symbol layers only, two layers backed by ONE shared GeoJSON source (one feature per restaurant): a PIN symbol layer ( [red-team: 3/3 invariants broke]
- **prior-art-research** (Single-Source / Dual-Layer "Role-State Crossfade" — one immutable feature per restaurant, two GL symbol layers (pin + dot) reading per-feature opacity from a wall-clock-clocked feature-state, with a bounded top-30 selector driving promote/demote. (Pattern adapted from Mapbox's own cluster/symbol fade model + symbol-sort-key collision priority.)) — GL SYMBOL LAYERS only (no ViewAnnotations for markers) [red-team: 3/3 invariants broke]

---

# RE-DIAGNOSIS (2026-06-28) — corrected symptom: PINS flash/snap/stuck + >30 stuck (NOT dots)

> 7-agent panel, allowed to read the real code. Verdict: the corrected symptom CHANGES the diagnosis. The LodEngine itself is CORRECT; the bugs are TWO engine↔Mapbox BOUNDARY integration bugs.

## Did it change?

Yes. The corrected symptom (PINS flash/snap/stuck + >30 stuck; dots fine) invalidates the dot-collision framing the prior synthesis leaned on and re-centers the diagnosis on the PIN feature-state lifecycle: tile-reparse clearing LOD feature-state with no re-assert (against an asymmetric baked-0 fallback), plus decide() being gated on the on-screen SET signature (not rank/zoom). The two-scalar product and the abstract-30 cap are real smells but NOT the steady-state pin driver.
## Revised root cause (code-verified)

Verified in code, the pin flash/snap/stuck during normal pan/zoom is driven by TWO compounding boundary bugs between the (correct) LodEngine and the Mapbox render substrate — neither is inside the engine:

(1) TILE-REPARSE FEATURE-STATE LOSS WITH NO RE-ASSERT, against an asymmetric baked-0 fallback. Pin iconOpacity = ['*', nativePresentationOpacity, nativeLodOpacity]; nativeLodOpacity coalesces feature-state -> baked ['get','nativeLodOpacity'] -> 0, and under v5 the bake is HARDCODED 0 for ALL pins (controller L855, JS builder L1887). Crossing a zoom bucket re-tiles the GeoJSON; Mapbox clears feature-state for re-parsed features; the pin instantly coalesces to baked 0 = flash-to-dot. The engine cannot self-heal: step() (LodEngine L166-186) only writes keys in `motion`, and a SETTLED fade is DRAINED from motion (L184) while its Fade stays in `fades` projecting target=1 forever. decide() reads fades[].opacity = 1 (L152), sees current==target, and NEVER re-admits the key to motion; step() never re-writes it. handleSourceDataLoaded (controller L10005-10062) does ONLY commit-fence ack + label-observation refresh — there is provably NO LOD feature-state re-assert. Net: engine believes 1, GPU shows 0, no path back. Presentation survives reparse (baked 1) so the loss is pin-selective, never dots — exactly the corrected symptom.

(2) decide() GATED ON THE ON-SCREEN SET SIGNATURE (controller L10353: `guard visibleSignature != state.lastVisibleMarkerSetSignature`). The signature is the sorted on-screen marker-KEY set — not rank order, not zoom. On a pure zoom (or a post-movement idle settle whose signature was already seen mid-move), the on-screen set can be stable while the correct top-30 by rank shifts; decide() early-returns, `want` is stale, a pin that should demote stays at lod=1 and a replacement never gets a target. This is the >30-stuck path and a second class of stuck-at-1 pins, independent of reparse.

The >30-stuck is the two together: stale want (gating) leaves the old top-30 at lod=1 while new promotes paint, and reparse strands settled survivors the engine no longer drives. The engine's step()/settle/retarget-from-current logic itself is CORRECT (every motion exit is via isSettled at an exact endpoint; the continuous display link L7526-7530 converges any in-MOTION key); it is starved of fresh `want` (gating) or has its output erased underneath it (reparse).
## Original fixes verdict

Prior #1 (cap on count(p>0) RENDERED pins instead of the abstract prefix(30) set): AMENDED -> demoted to a low-priority guard. Verified the engine already converges demotions to 0 via the continuous display link (L7526-7530) and drains motion only at the exact endpoint, so a demoting pin renders only ~180ms transiently; it does NOT leave pins stuck >30. The real >30-stuck is decide-gating + reparse, not the cap. Keep the rendered-count invariant as a regression assertion only.

Prior #2 (take the DOT render out of collision): DROPPED for the pin case. Targeted a dot symptom the corrected report retracts; irrelevant to pins (the pin icon is already out of collision via allow-overlap + ignore-placement).

Prior #3 (dot opacity = 1 - pin): DROPPED / already implemented. Verified applyV5OpacityWrites writes liveDotFeatureState(opacity: 1 - p) at controller L7727. No-op to re-apply; does not touch the pin bug.
## Prioritized fix plan


### 1. FIX A (HIGHEST LEVERAGE): Re-assert LOD feature-state on tile reparse. In handleSourceDataLoaded (SearchMapRenderController.swift ~L10050), when the acked sourceId is the pin/dot/label physical source (state.pinBundleSourceId / dotSourceId / labelRenderSourceId), re-emit applyV5OpacityWrites for every engine-tracked key at its CURRENT engine-projected opacity — engine.lastPromotedInOrder -> ~1 plus any mid-fade straggler with engine.pinOpacity(key) in (0,1). Add a small engine read accessor to enumerate non-zero fades, or iterate lastPromotedInOrder (pin=1) + demoted-on-screen (0). MUST be feature-state-only (no source republish / no removeGeoJSONSourceFeatures), preserving Phase 2 residency.

- **Mechanism:** Restores feature-state Mapbox cleared on re-tile straight from the engine's own truth, converting the asymmetric fail-to-invisible (baked 0) into self-healing within one reparse event. Directly closes the flash-to-dot and the permanently-stuck-invisible pin.
- **Harness:** Drive a slow zoom across a bucket boundary via perf set_map_camera at two straddling zooms (or maestro/perf/flows/search-map-jitter-swipe.yaml across a bucket). Read back rendered nativeLodOpacity via featureStateById and compare to engine.pinOpacity(key) for every key in engine.lastPromotedInOrder: assert NO promoted key reads nativeLodOpacity==0 while engine says >0.5, recovery within <=2 frames after each source_commit_ack, and ZERO `mut` bundle-removes (bundle:[*,*,0]) proving re-assert not republish. NOTE: the [lodev] roleP/renderP/roleGap emitter was DELETED on this branch; current telemetry is the [LODDBG] NSLog probes (proj/decide ~L10335/10352/10379) + engine accessors (visiblePinKeys, pinOpacity, isIdle). Re-add a minimal step probe emitting renderP=count(effective nativeLodOpacity>0.5) and roleP=lastPromotedInOrder.count, then assert roleGap==0 sustained through the crossing.

### 2. FIX B (HIGH): Un-gate / widen decide(). Either fold a zoom-bucket id AND a rank-prefix hash of the top-budget set INTO the on-screen signature at L10351-10353, OR loosen the L10353 guard so decide() also fires on zoom change, AND force one final decide()+step() at onMapIdle regardless of signature. Pair with FIX C so a reparse can re-admit affected keys to motion.

- **Mechanism:** Stops stale `want`: when the on-screen SET is stable but the correct top-30 shifts under pure zoom or at idle settle, decide() currently never re-runs, so demote-should pins stick at lod=1 and replacements never get a target. This is the >30-stuck and stuck-bright path that FIX A (which only restores reparse-cleared state to engine truth) does not cover.
- **Harness:** After a pure zoom that stops settled: on the first idle frame (currentViewportIsMoving==false, engine.isIdle==true) assert renderP == roleP (no promoted-but-invisible AND no demoted-but-still-painted), renderP - forced <= 30, every rendered pin's nativeLodOpacity in {~0,~1} (pinMidFade==0). Pre-fix shows roleGap>0 or renderP>30 stuck at idle after a zoom with a stable on-screen set.

### 3. FIX C (MEDIUM, defense-in-depth): Make the engine reparse-aware. Add engine.reassert(keys:) that inserts the given want=true keys into `motion` (and/or a step variant that re-emits settled fades on demand), so after a reparse the CONTINUOUS display link — not a one-shot write — owns recovery and finishes any in-flight fade. Called from FIX A's handler.

- **Mechanism:** Today step() can't help a reparsed settled key because it was drained from motion and decide() won't re-admit it (current==target from the in-memory fade). reassert() restores the converge loop as the durable owner instead of relying on a single feature-state poke.
- **Harness:** Same zoom-bucket flow: assert engine.isIdle goes false for >=1 tick after the reparse ack and then re-settles with renderP==roleP, confirming the link drove recovery (not just the one-shot write).

### 4. FIX D (LOW): Cap on count(rendered nativeLodOpacity>0) as a correctness ASSERTION/guard, not a behavioral change. Keep budget+|forcedKeys| as the legitimate ceiling.

- **Mechanism:** The engine already converges demotions to 0; this only catches regressions where a future change strands a fading pin. Demoted to a guard because it is not the cause of the corrected >30-stuck symptom.
- **Harness:** Assert renderP <= 30 + |forcedKeys| at idle across pan/zoom — a passive invariant that should already hold once A/B/C land.

### 5. FIX E (LOW): Reveal/dismiss-while-moving overlap hardening. Either collapse presentation x lod into the engine's single scalar, OR (a) make the presentation sweep cover keys that pan on-screen mid-reveal and (b) verify the runnable gate (L7530, cancels the link when lastPresentationBatchPhase leaves live/entering) never cancels while engine motion is non-empty — gate on engine.isIdle, not phase alone.

- **Mechanism:** presentation x lod is the only live SECOND opacity authority, but verified constant 1 during steady pan/zoom (animator only runs on reveal/dismiss; completion hard-sets to target at L8128). It can only flash/stick a pin in the reveal/dismiss-while-camera-moving overlap, plus the runnable-gate freeze. Secondary, lower-frequency — do after A/B/C.
- **Harness:** Trigger a results-sheet open/close WHILE panning the marker field; assert no pin lands at an intermediate presentation value at settle and the link is not cancelled while engine.isIdle==false.

## Biggest risk

FIX A/C touch the reparse hot path and the engine motion set; the risk is RE-INTRODUCING THE WIGGLE the branch just fixed (Phase 2 unconditional residency, commit 6be121f9) if the re-assert accidentally triggers a source republish / removeGeoJSONSourceFeatures instead of a pure setFeatureState. The re-assert MUST be feature-state-only — the existing applyV5OpacityWrites already is (it calls setFeatureState, no source mutation). Validate with the `mut` axis: bundle:[*,*,0] (zero removes) must hold during reparse recovery. Secondary risk: FIX B un-gating decide() could spike CPU if it runs every camera frame on a dense catalog — mitigate by folding zoom-bucket+rank-hash into the signature (still cheap) rather than removing the guard outright, plus the onMapIdle force-decide as the safety net.

## Recommendation

Proceed, but ATTRIBUTE before implementing — per the project's own rule, do not implement until the harness proves the mechanism on the running app. The six panels converge 5-to-1 on reparse-feature-state-loss as the primary pin cause, strongly corroborated by code (baked-0 at L855, drained-on-settle at LodEngine L184, no re-assert in handleSourceDataLoaded L10005-10062). Re-diagnosis #4 adds the verified-real decide() gating (L10353) as the independent second cause of the >30/stuck-bright pins. FIRST STEP: re-add a minimal step probe (renderP vs roleP=engine.lastPromotedInOrder.count) since the [lodev] emitter is deleted on this branch, then drive a zoom-bucket crossing and confirm BOTH signatures empirically: (a) roleGap goes positive at the reparse ack and stays (proves cause 1), and (b) at idle after a pure zoom with a stable on-screen set, renderP != min(roleP,30) (proves cause 2). Then implement A -> B -> C, verifying each via the harness before the next (one change at a time). Drop prior fixes 2 and 3 entirely; demote prior fix 1 to a guard (D); defer E. Key files: apps/mobile/ios/cravesearch/SearchMapRenderController.swift (handleSourceDataLoaded L10005, decide gate L10353, applyV5OpacityWrites L7684, baked-0 note L855), apps/mobile/ios/MapLodKit/Sources/MapLodKit/LodEngine.swift (decide L131, step L166, settle-drain L184), apps/mobile/src/screens/Search/components/search-map.tsx (iconOpacity coalesce ~L2348), apps/mobile/src/screens/Search/hooks/use-direct-search-map-source-controller.ts (bake ~L1887).

---

# SUBSTRATE RE-CONSENSUS (2026-06-28) — given the proven tile-reparse + the owner no-bucketing model

> 7-agent panel, SDK-verified (MapboxMaps 11.16.6). Verdict: keep GL, CAP the source maxzoom (the unused lever). VAs re-rejected on verified-missing APIs.


## Consensus ideal substrate

GL symbol layers over ONE immutable, MAXZOOM-CAPPED GeoJSON source — NOT ViewAnnotations, NOT annotation managers, NOT a custom Metal/CALayer overlay. This is the decisive new consensus, and it is the same family we already use, re-tuned. Verified against the pinned SDK (MapboxMaps 11.16.6, Podfile.lock) and the live app code:

(1) The three LOD ShapeSources in apps/mobile/src/screens/Search/components/search-map.tsx (DOT_SOURCE_ID L343, RESTAURANT_PIN_BUNDLE_SOURCE_ID L356, RESTAURANT_LABEL_RENDER_SOURCE_ID L399) set NO maxZoom/buffer/tolerance props — so they inherit the gl-native default maxzoom=18. GeoJSONSource.swift (Pods/.../Generated/Sources/GeoJSONSource.swift L15) documents maxzoom as 'Maximum zoom level at which to create vector tiles. Default value: 18.' THAT default is the proven cause of the ~27 z14->z17 reparses: every integer zoom up to 18 re-slices/re-parses tiles and clears feature-state. Capping maxzoom at/below the operating floor makes Mapbox OVERZOOM (reuse+scale) the existing maxzoom tile for all higher zooms — no new parse, no feature-state clear, for point data.

(2) ViewAnnotations are decisively REJECTED for the marker field on a now-VERIFIED basis, not the prior outdated one. The two panels that 'vindicated' VAs rest on APIs that DO NOT EXIST in the pinned SDK: enableSymbolLayerCollision, mbxCollisionBox, and the auto-symbol-hiding Marker return ZERO matches in Pods/MapboxMaps/Sources. viewAnnotationAvoidLayers DOES exist (ViewAnnotationManager.swift L89) but is @_spi(Experimental) and its own doc says it 'currently only supports line layers' — it CANNOT suppress basemap POI/label SYMBOL layers, which is the single load-bearing label requirement. ViewAnnotationOptions.visible (L41-48) auto-syncs to the UIView's own visibility (a confirmed second visibility authority). So VAs lose the basemap-suppression invariant outright AND re-introduce a second authority. variableAnchors (L59) is real, but a 4-anchor mutex with no basemap suppression is a non-starter.

(3) Annotation managers are internally GeoJSONSource+SymbolLayer (same re-tile, fewer levers). CustomGeometrySource is MORE tiled. There is no non-tiled point substrate in this SDK.

## Is tiling avoidable?

DEFINITIVE ANSWER: GL re-tiling is NOT eliminable in the absolute sense the owner's words demand ('never re-parsed, never re-tiled'), BUT it IS suppressible to effectively ZERO across the actual operating zoom band — and that is the real, achievable target. The split panel was a false dichotomy; both halves are correct about different things.

PROVEN unavoidable (architectural): GeoJSONSource is inherently tiled (geojson-vt on-device); maxzoom/buffer/tolerance/autoMaxZoom/tileCacheBudget are all TILING parameters (read directly from GeoJSONSource.swift in the pinned Pods) — there is NO non-tiled flag. When a re-parse DOES occur, feature-state is cleared (gl-native: initial tile parse runs without feature-state). No 11.x release changes this.

PROVEN suppressible (the lever currently unused): maxzoom is a CEILING. Per Mapbox's own large-GeoJSON guidance and the overzoom mechanic, zooming PAST source maxzoom reuses+scales the existing maxzoom tile with NO new parse. For POINT data (tolerance is a line/polygon simplifier, irrelevant to points) the points survive overzoom intact. The app's sources are at default 18, so the entire z14->z17 band sits BELOW maxzoom and re-parses ~27x. Cap maxzoom at ~12-13 (at/below the band floor) + raise buffer, and the band re-parses should collapse toward 0 because z14-z17 all ride one overzoomed tile.

HOW: This is the experiment that decides everything and has NOT yet been run on this app (attribute-before-ideate). It is the highest-leverage, lowest-risk change. Residual re-parses that survive maxzoom-capping (low-zoom multi-tile crossings, style reloads, data-version sets) are RARE and are handled by Fix A as a self-heal backstop. So: re-parse storm during normal pinch/pan = eliminable; rare residual re-parse = caught by Fix A. Net effect to the owner: never observed.

## ViewAnnotations decision

REJECT — and the prior rejection is now CONFIRMED by reading the pinned SDK, not weakened by the runtime finding. The runtime bucketing finding made VAs LOOK attractive (they are literally always-resident individual views), and two panels argued 11.16.6 APIs vindicate them. I verified those APIs in Pods/MapboxMaps/Sources and they DO NOT support the claim:
- enableSymbolLayerCollision / mbxCollisionBox / auto-symbol-hiding Marker: ZERO matches — do not exist in 11.16.6. The 'VAs can now suppress basemap labels' argument is FALSE for our SDK.
- viewAnnotationAvoidLayers: exists but @_spi(Experimental) and 'currently only supports line layers' — cannot suppress the basemap POI/label SYMBOL layers, which is the load-bearing requirement (the app's label collision suppresses basemap name-rectangles via allowOverlap:false on GL; VAs cannot replicate this).
- ViewAnnotationOptions.visible auto-syncs to UIView visibility = the second-authority objection is real and present.
- variableAnchors (4-anchor) IS real, but useless without basemap suppression.
So VAs would forfeit the basemap-suppression invariant AND re-introduce a second visibility authority, while only solving the re-parse axis that maxzoom-capping already solves on GL. GL-with-maxzoom dominates VAs on the UNION of the owner's own requirements. VAs remain a possible future only for a tiny selected pinned-detail overlay (line-layer avoidance is fine there), never the LOD marker field.

## Fix A verdict

KEEP as a BRIDGE now, then DEMOTE to a permanent defense-in-depth BACKSTOP under the maxzoom fix — do NOT ship it as the headline answer. Fix A alone (re-assert feature-state on dataId==nil reparse in handleSourceDataLoaded) is a band-aid against the owner model: the substrate still buckets and group-snaps on every one of the ~27 reparses; Fix A merely races a repaint after each snap, leaving a >=1-frame window of mixed baked-fallback opacities — which IS the 'different group pops at each zoom level' the owner reported. Shipping Fix A without maxzoom-capping leaves the band-aid racing 27 reparses per pinch, which is exactly the compromise the owner rejects. The correct framing: maxzoom-capping ATTACKS THE CAUSE (reparse frequency -> ~0 in band); Fix A SELF-HEALS THE RESIDUAL (rare low-zoom/style-reload reparses). Fix A as headline = band-aid. Fix A as backstop behind maxzoom = legitimate and worth keeping permanently. Constraint: the re-assert MUST be feature-state-only (via the existing applyV5OpacityWrites), never a source republish/removeGeoJSONSourceFeatures, to preserve the Phase-2 wiggle fix (6be121f9, bundle:[*,*,0]).

## Ideal mental model

There is ONE set of restaurant markers, loaded once into a single GeoJSON point source and held resident for the whole session — never added or removed while the camera moves. The source's max tile zoom is pinned LOW (at/below the bottom of the zoom band you actually pinch through), so as you zoom in Mapbox keeps reusing the SAME already-parsed tile (overzoomed and scaled) instead of re-slicing it — which means it never wipes the per-marker opacity you wrote. With re-parse suppressed, the ONLY thing that ever changes a marker is your own per-marker wall-clock LOD scalar, written via feature-state (a GPU uniform, not a source edit): each marker individually crossfades dot<->pin the instant it personally crosses the top-30-by-rank line — one at a time, smoothly, never a per-zoom-level batch, never a snap. Labels stay on GL symbol layers because only GL's collision engine can do the 4-candidate anchor placement AND suppress the basemap POI/name labels under your markers (allowOverlap:false reserves their footprint) — a requirement the SDK's ViewAnnotations provably cannot meet. The honest caveat the owner must hold: the substrate IS tiled underneath; you don't make it non-tiled, you FREEZE the tile (maxzoom-cap + immutable source + big buffer) so re-parse never fires in the band that matters, and an instant feature-state re-assert catches the rare residual. The owner experiences one resident field of individually-crossfading markers; the bucketing is suppressed at the cause, not papered over.

## Non-compromising architecture

END-STATE (all on GL, LodEngine brain byte-intact):

1. SUBSTRATE — One immutable GeoJSON source per marker family, maxzoom CAPPED low (~12-13, tune on harness) + buffer raised toward 512, tolerance irrelevant for points. Above maxzoom Mapbox overzooms the existing tile -> no reparse -> feature-state never cleared across the operating band. Keep Phase-2 unconditional residency (SearchMapRenderController.swift L5142, retainResidentDemotesFlag=true): source bytes never change during movement (bundle:[*,*,0]).

2. OPACITY AUTHORITY — Single authority is the per-marker wall-clock LOD scalar, written via setFeatureState only. Pin/dot ICONS sit OUTSIDE collision (icon-allow-overlap:true + icon-ignore-placement:true + icon/text-opacity-transition:0) so nothing but the scalar touches their opacity. Continuous CADisplayLink converges every in-flight key to an exact {0,1} endpoint.

3. RENDER CAP — <=30 enforced at the selector (top-30 by rank, nth_element) and at render (count of feature-state p>0); a demoting pin counts toward 30 until its alpha hits 0 (paired swap).

4. LABELS — Stay on GL symbol layers: text-variable-anchor=[top,bottom,left,right] (4-candidate mutex), symbol-sort-key=rank, text-allow-overlap=FALSE so labels reserve footprint and SUPPRESS basemap POI/name labels (the one invariant only GL provides; VAs cannot). Freeze anchor re-selection during motion. text-opacity bound to the scalar, transition 0. Plus the per-restaurant stacked-label mutex already validated (Option A, 3c9946a7).

5. SELF-HEAL BACKSTOP — Fix A (feature-state-only re-assert on dataId==nil reparse, via applyV5OpacityWrites for engine.lastPromotedInOrder + mid-fade stragglers) for the RARE residual reparse; Fix C (engine.reassert -> re-admit keys to the display-link so the continuous loop, not a one-shot poke, owns recovery). Make the baked fallback HONEST: change use-direct-search-map-source-controller.ts L1887 so a cleared feature coalesces to the engine's intended role / last-known opacity, not hardcoded 0, so any residual reparse fails safe to the correct opacity, not invisible.

6. ORTHOGONAL — Fix B (un-gate/force decide on zoom + onMapIdle) for the engine-starvation >30-stuck cause; independent of substrate, ship regardless.

No ViewAnnotations. No annotation managers. No custom Metal layer. The owner's literal 'never tiled' is unattainable on Mapbox iOS (SDK-proven); 'tiled but never re-parsed in the band + instant self-heal of the residual' is attainable on GL and is the true non-compromising end-state.

## Migration path

From the current branch (fix/map-lod-wiggle-dismiss), in strict attribute-before-ideate order, one change at a time, validated on the LOD harness:

STEP 0 (re-instrument): Re-add the minimal renderP/roleP/roleGap step probe and a srcDataLoaded(dataId=nil) reparse counter (the [lodev] emitter was deleted on this branch). This is the measurement instrument for every step below.

STEP 1 (HIGHEST LEVERAGE — the experiment no prior panel ran): Set maxZoom low (start 12-13) + buffer high (toward 512) on the three LOD ShapeSources in apps/mobile/src/screens/Search/components/search-map.tsx (DOT_SOURCE_ID L343, RESTAURANT_PIN_BUNDLE_SOURCE_ID L356, RESTAURANT_LABEL_RENDER_SOURCE_ID L399; props are settable on the rnmapbox ShapeSource). Drive a z14->z17 pinch via crave://perf-scenario-command set_map_camera (and maestro/perf/flows/search-map-jitter-swipe.yaml). ASSERT: reparse count drops from ~27 toward 0; roleGap==0 sustained through the crossing; bundle:[*,*,0] holds. THIS is the make-or-break measurement.

STEP 2 (honest fallback): In use-direct-search-map-source-controller.ts L1887, change the nativeLodOpacity coalesce default from hardcoded 0 to the engine's intended role / last-known value, so a cleared feature fails safe to correct opacity.

STEP 3 (backstop): Wire Fix A in SearchMapRenderController.swift handleSourceDataLoaded — remove the dataId==nil early-return for the LOD sources and re-assert via applyV5OpacityWrites (feature-state ONLY, never removeGeoJSONSourceFeatures). Add Fix C (engine.reassert -> re-admit to display-link). Validate the rare residual reparse heals within <=2 frames.

STEP 4 (orthogonal): Ship Fix B (force decide on zoom + onMapIdle).

STEP 5: If, after maxzoom-capping + big buffer, the harness STILL shows in-band reparses, escalate: split into a per-search single FeatureCollection sized to fit one tile. Still GL, still the same model. Do NOT pivot to ViewAnnotations.

Keep all prior validated work intact: Phase-2 residency (6be121f9), wall-clock fade (Phase 0), stacked-label mutex Option A (3c9946a7).

## What changed

THREE things changed from the prior 'ES3 LOCKED, GL-only' consensus, and one thing did NOT change.

CHANGED 1 — The deciding axis moved from FRAME RATE to RE-PARSE/BUCKETING. The prior lock was premised on GATE-PREMISE measuring 60fps -> 'GL is fine.' The runtime finding falsifies that reasoning: 60fps does not stop the substrate from bucketing+group-snapping markers on the ~27 per-pinch reparses. The owner's model was being violated even AT 60fps. So the lock's premise was incomplete, not wrong about frame rate.

CHANGED 2 — The ROOT CAUSE is now identified as the unused maxzoom lever. The prior panel diagnosed 'reparse clears feature-state -> Fix A' but never asked WHY the reparse storm happens. Verified now: the three ShapeSources are at default maxzoom=18 (no maxZoom prop set), so the whole z14->z17 band is below maxzoom and re-tiles every step. This reframes Fix A from 'the fix' to 'the backstop' and elevates maxzoom-capping to 'the fix.' No prior panel proposed measuring maxzoom-capping; it is the new headline.

CHANGED 3 — ViewAnnotations were RE-OPENED and DECISIVELY RE-CLOSED on verified grounds. The prior rejection cited reasons that two re-examination panels claimed were outdated for 11.16.6. I verified the pinned SDK directly: the APIs they relied on (enableSymbolLayerCollision, auto-symbol-hiding Marker) DO NOT EXIST in 11.16.6, and viewAnnotationAvoidLayers is experimental + line-layers-only (cannot do basemap label suppression). So the rejection is now CONFIRMED on stronger evidence than before, not merely re-asserted.

DID NOT CHANGE — The substrate is still GL symbol layers over one immutable source. We are NOT migrating off GL. The prior 'GL-only' direction was correct; it was just under-configured (maxzoom) and mis-attributed (Fix A as headline).

## Open questions
- EMPIRICAL, make-or-break (must run before locking, per attribute-before-ideate): Does capping maxZoom at ~12-13 + buffer~512 actually drop the z14->z17 reparse count from ~27 to ~0 in THIS app with @rnmapbox + MapboxMaps 11.16.6? The overzoom mechanism strongly predicts yes for point data, but it has NOT been measured here. This single experiment validates or breaks the entire consensus.
- What is the lowest interactive zoom the user actually reaches? maxZoom must be set at/below that floor; if users pan out to city/region scale below the cap, multi-tile reparses recur there (caught by Fix A, but worth knowing the frequency).
- Below maxzoom, can a single horizontal PAN still cross a tile x/y boundary and reparse a fresh edge tile? Buffer mitigates (carry-over skirt), but the residual pan-boundary reparse rate at the chosen maxzoom/buffer must be measured.
- Does maxzoom-capping degrade label collision quality at high zoom (overzoomed tile = labels placed from a coarser tile)? For points this should be fine, but the 4-candidate label mutex + basemap suppression must be visually re-verified at z17 on the overzoomed tile.
- Does Fix A's feature-state re-assert truly stay setFeatureState-only under all residual-reparse paths (style reload, data-version set), preserving bundle:[*,*,0]? Verify on the mut axis that no path triggers removeGeoJSONSourceFeatures.
- Is the asymmetric baked-0 fallback (use-direct-search-map-source-controller.ts L1887) the right place to make the fallback honest, and does changing it interact with any other reader of nativeLodOpacity?

---

# HISTORY ARCHAEOLOGY (2026-06-28) — how we got from 'map working well' (dc202882) to the coupled state

> 7-agent git archaeology, code-verified. KEY: the anchor used the SAME tiled-GeoJSON+feature-state substrate (same maxzoom=18, re-parsed just as much) but was reparse-IMMUNE because at-rest truth lived in membership + baked-fallback=1, NOT volatile feature-state. Residency (wiggle fix) + V5 bake-to-0 moved truth onto feature-state and dropped the baked fallback to 0, losing the free immunity.


## Historical narrative

Six independent archaeology traces + my own direct code reads at dc202882 and HEAD converge tightly. The narrative, code-verified:

ERA 0 — ANCHOR dc202882 "map working well" (2026-03-30, 244 commits ago). The substrate was ALREADY one shared ShapeSource per family (STYLE_PINS_SOURCE_ID, DOT_SOURCE_ID, RESTAURANT_LABEL_SOURCE_ID, each shape=EMPTY_POINT_FEATURES), feature-state-on-a-tiled-GeoJSON, default maxzoom=18 (no maxZoom prop — VERIFIED, identical to HEAD). The native side was a thin bridge (noop-file.swift); MapLodKit/LodEngine did NOT exist. The "slots" the owner remembers were NOT per-slot SOURCES — they were 30 Z-ORDER LAYERS (STYLE_PIN_STACK_SLOTS=30, ~120 SymbolLayers + 30 interaction layers) each filtered ['==',['get','nativeLodZ'],slotIndex] over the single source, for deterministic stacking. pinSlotSourceIds was vestigial transport scaffolding, purged later (7ce14a9c) as already-dead. CRUCIAL: LOD was MEMBERSHIP-driven (pinSourceStore built ONLY from the promoted top-N set, use-map-marker-engine.ts L593/L514) with every pin feature baked nativeLodOpacity:1 (L618) and every dot baked nativeDotOpacity:1 (L663), separate sources. map-diff-applier.ts did NOT exist at the anchor (VERIFIED) and search-map.tsx referenced setFeatureState only once — feature-state was a transient crossfade overlay, NOT the at-rest authority. Paint coalesce: ['feature-state','nativeLodOpacity'],['get','nativeLodOpacity'],1 — fallback default = 1 (VERIFIED). Plus 300ms icon/text opacity transitions so Mapbox GPU did the fade.

ERA 1 — SLOT-LAYER ELIMINATION (early June, perf). d5e9b405 "8-bucket pins + single-symbol slot-elimination (labels 480->16, interaction 30->1)" collapsed the ~120 z-order slot LAYERS into single symbol layers via symbolZOrder + viewport-y. faac216e "delete native moveLayer pass (218 lines)" removed the per-frame native layer-reorder pass the slot stack required. This is the real "what killed slots" — a layer-count/placement perf win. The single-source substrate was untouched.

ERA 2 — NATIVE ENGINE INVERSION + STEPPER (mid June). e11f6202 (anchor+1) introduced the native render controller. a6aa3e49 (2026-06-12) "v4 LOD foundations — stepper-sole opacity writer" made a CADisplayLink the SOLE Mapbox opacity writer via per-frame setFeatureState (to kill a publish-batch flash: 930 feature-state removals + 928 stale instant jumps). 93571263 cut the LOD DECISION over to native per-frame; JS stopped camera-tick republish. This is where feature-state began becoming the de-facto opacity authority.

ERA 3 — RESIDENCY / WIGGLE KILL (2026-06-19). c756f9c6 "resident pin+dot LOD — opacity-driven role, no source churn on flip" pivoted FROM membership-driven (add/remove on promote) TO residency (union of candidates in BOTH sources, role carried purely by feature-state opacity). 5bc0d6c9 + 1713040c "full pin residency — JS publishes ALL candidates (demoted at opacity 0)" completed it; 6f1c547f un-bundled labels into their own render source. 8eedc51a's harness had PROVEN the wiggle = source removes-during-moving re-tiling the scene (pinBundle add=74/remove=54 per flip, 37fps). Residency made the source immutable during movement (bundle:[*,*,0], 59fps) — a real, correct win.

ERA 4 — V5 ENGINE + BAKE-TO-0 (2026-06-27). 364e17be cut over to the standalone MapLodKit.LodEngine as single feature-state authority; ab8d11a9 wall-clock fade; 6be121f9 unconditional residency (60fps measured). The V5 bake hardcoded nativeLodOpacity=0 for ALL pins (use-direct-search-map-source-controller.ts L1887 `isPromoted && !LOD_V5_ENABLED ? 1 : 0`; controller L856) and flipped the coalesce default to 0 (search-map.tsx L2348, VERIFIED). This is the coupling-completing change. 3c9946a7 added the stacked-label mutex.

## Why the old arch was decoupled (reparse-immune)

The anchor was NOT decoupled by using a non-tiled substrate — it used the SAME tiled-GeoJSON + feature-state substrate as HEAD, at the same default maxzoom=18, so it re-parsed across z14→z17 just as much (VERIFIED: no maxZoom prop in either era). It was decoupled IN EFFECT because the at-rest LOD truth lived in TWO reparse-IMMUNE channels, never in volatile feature-state:

1. MEMBERSHIP-AS-TRUTH: the pin source contained ONLY genuine pins (built from the promoted top-N set, use-map-marker-engine.ts L593); dots lived in a separate source. "Am I a pin?" = "which source am I a member of?" — a fact baked into the tile geometry that SURVIVES a reparse. A reparse re-emits the feature into the same source it already belonged to.

2. HONEST BAKED FALLBACK = 1: every pin feature baked nativeLodOpacity:1 (L618) and the coalesce fell back to ['get','nativeLodOpacity'] then to literal 1 (search-map.tsx L1447, VERIFIED). When Mapbox cleared feature-state on a reparse, the expression fell back to the CORRECT value (1 for every member of the pin source) — fail-safe-TO-VISIBLE, and every member genuinely IS a pin, so the fallback was ALWAYS right.

3. (Supporting) a 300ms GPU paint transition RAMPED any perturbation rather than snapping, masking even the rare discontinuity.

Net: feature-state was a transient crossfade overlay used only DURING a transition; the steady-state render came entirely from membership + baked-1. A basemap/data reparse had nothing load-bearing to wipe. The decoupling was structural and free — and accidental: it was a property of building the source from the promoted set with a baked-1 fallback, not a deliberate anti-coupling design.

## When/why the coupling was introduced

The coupling was introduced gradually across THREE commits, not one — the traces split on which is "the" origin, and the honest answer is it's a chain where each step solved its target problem and seeded the next:

1. a6aa3e49 (2026-06-12, "stepper-sole opacity writer") — the SEED. Made a CADisplayLink the SOLE Mapbox opacity writer via per-frame setFeatureState, to kill a real flash (930 stale feature-state removals + 928 instant jumps causing fade-out→flash-in-at-full). This began moving opacity authority onto feature-state — the exact channel Mapbox clears on reparse. Unnoticed side effect, not a regression to "undo" (the flash fix was correct).

2. c756f9c6 (2026-06-08→completed 1713040c, 2026-06-19) — THE PIVOT that broke membership-as-truth. Residency moved BOTH pin and dot to hold the FULL candidate union (demoted pins now baked into the pin source at opacity 0), with role carried PURELY by feature-state opacity. This was done to kill the wiggle (source-membership churn during movement, proven by 8eedc51a) — a legitimate, must-keep win. But it destroyed the anchor's first decoupling channel: the pin source no longer contained only pins, so membership stopped being truth, and the baked fallback for a demoted-but-now-resident pin became 0. a5bd03f3 explicitly reasoned the baked-0 fallback was "not a loaded gun" — but that proof only covered role-FLIP desync, never tile-reparse feature-state loss with no role flip. That blind spot is exactly the hole.

3. 364e17be (V5 cutover, 2026-06-27) — COMPLETED the coupling. Hardcoded the baked fallback to 0 for ALL pins (L1887/L856) and flipped the coalesce default to 0 (L2348), making the engine's feature-state the SOLE authority with a fail-to-INVISIBLE fallback. ab8d11a9 also set opacity-transitions to 0 (correct, to stop a second animator beating the wall-clock lerp) — but this removed the 300ms ramp that used to MASK reparse snaps, making them instant and visible.

WHY (the through-line): every step was a correct fix to a real bug (flash → wiggle → second-animator beat / reveal-flash). The coupling is the emergent cost of moving the at-rest truth from reparse-immune channels (membership + baked-1 + GPU ramp) onto reparse-volatile feature-state, WITHOUT adding the compensating reparse re-assert that the resident model needs and the anchor never did. Confirmed at runtime: handleSourceDataLoaded (controller L10013) does `guard let dataId = event.dataId else { return }` — it IGNORES the dataId=nil internal-reparse events that clear feature-state, so nothing re-asserts; the engine drains a settled fade from `motion` (LodEngine L184) and decide() reads the in-memory fade as already-at-target, so it never re-admits the key — engine believes 1, GPU shows 0, no path back. The owner's own [lodprobe] TEMP probe (cceab1ae, controller L10024-10031) is wired precisely to confirm this Cause-1 signature.

## What killed slots

Disentangle "slots" — three distinct things the owner's memory conflates, only one of which was a real perf killer:

1. SLOT-SOURCES (per-slot ShapeSources, pinSlotSourceIds) — a short-lived transitional idea, already vestigial scaffolding by 7ce14a9c which purged them. They were NEVER the anchor's live model; not a perf problem, just dead code.

2. SLOT-LAYERS (30 z-order layers × 4 glyph kinds ≈120 SymbolLayers + 30 interaction CircleLayers + ~480 label layers at 16×30) — THE REAL PERF KILLER. d5e9b405 reports labels 480→16, interaction 30→1; faac216e deleted a 218-line native per-frame moveLayer reorder pass the slot stack required to keep z-order correct as the promoted set churned. Cost = layer-count × GL placement/collision work every frame + the imperative moveLayer churn. NOT a correctness bug — exactly the perf issue the owner half-remembers. Replaced by ONE pin SymbolLayer with symbolZOrder/viewport-y (free, declarative, GPU). This is STRICTLY BETTER and must not be revived.

3. The anchor's MEMBERSHIP-driven LOD (add/remove a feature from the pin source on promote/demote) — the WIGGLE killer. A demote mid-pan removed a feature → removeGeoJSONSourceFeatures → re-tile of the whole pin layer → every pin re-snaps (the bundle:[*,*,removes>0]-while-moving signature, proven by 8eedc51a: 37→59fps after the fix). Killed correctly by residency (c756f9c6→1713040c→6be121f9).

So the things that "killed slots" — layer-count/placement cost and membership-churn wiggle — are BOTH real and BOTH must-not-regress. The ideal must NOT revive per-slot layers/sources or membership-churn. The ONLY casualty worth mourning is the honest baked-1 fallback, which is orthogonal to slots and trivially restorable. Validated wins to preserve: unconditional residency / bundle:[*,*,0] (6be121f9), wall-clock fade (ab8d11a9), single symbol layer + viewport-y (d5e9b405/faac216e), stacked-label mutex Option A (3c9946a7), labels on GL (only GL collision suppresses basemap POI/name labels + does the 4-anchor mutex), 60fps measured.

## Ideal decoupled architecture

"Tiled-but-FROZEN GL, single unified opacity authority" — the project's own 25+-agent synthesis end-state (plans/lod-greenfield-redesign-synthesis.md §"Non-compromising architecture"), which I verified converges with all six traces. It delivers the owner's literal model — ONE resident marker field, each marker individually crossfading dot↔pin the instant IT crosses the top-30-by-rank line, one at a time, never grouped/snapped/coupled to tiling or basemap detail — without capping camera zoom or touching the basemap. Four non-negotiable pillars:

1. SUBSTRATE (freeze the tile, attack the cause): ONE immutable GeoJSON source per family, maxZoom capped LOW (~12-13, at/below the pinch floor) + buffer raised toward 512 on DOT_SOURCE_ID, RESTAURANT_PIN_BUNDLE_SOURCE_ID, RESTAURANT_LABEL_RENDER_SOURCE_ID (all currently inherit default 18 — VERIFIED). Above maxzoom Mapbox OVERZOOMS (reuses+scales) the existing parsed tile for POINT data → no new parse → feature-state never cleared in the operating band → the ~27 z14→z17 reparses collapse toward 0. This does NOT cap camera zoom and does NOT touch the basemap — it only freezes OUR data tile (exactly the decoupling the owner wants, and the honest framing: you can't make a Mapbox point source non-tiled — geojson-vt is on-device, no flag, SDK-proven — but you CAN freeze it so reparse never fires in-band). Keep Phase-2 unconditional residency so source bytes never change during movement (bundle:[*,*,0]).

2. OPACITY AUTHORITY (unify on the icon): single authority = the per-marker wall-clock LOD scalar written ONLY via setFeatureState by the CADisplayLink. Pin/dot ICONS sit OUTSIDE collision (icon-allow-overlap:true + icon-ignore-placement:true) and icon/text-opacity-transition:0, so rendered icon opacity ≡ our scalar with NO competing animator (kills both Mapbox's collision-fade multiplier and its implicit ~300ms paint ramp — the exact seam that broke every prior design). Keep collision ONLY on the LABEL, where yielding is acceptable.

3. HONEST FAIL-SAFE-TO-DOT FALLBACK (restore the anchor's free self-heal): bake a per-feature source default (pinDefault=0 / dotDefault=1, with d≡1−p) so the coalesce fallback after a reparse renders fail-safe-to-DOT — never a phantom pin, never a vanished pin. This generalizes the anchor's baked-1 to the resident model: at worst a reparsed marker shows a dot for ≤1 frame, never a stuck/snapped state.

4. REPARSE-AWARE FULL RECONCILER (the self-heal the anchor never needed but residency does): in handleSourceDataLoaded STOP early-returning on dataId==nil — those ARE the reparse events that clear feature-state. On every source-data event AND for several ticks after any source set, re-assert {p,d} for EVERY in-viewport marker at the engine's current owned value (idempotent/fully-reconciling, NOT diff-only), and add engine.reassert(keys:) to re-admit keys to the display link so the CONTINUOUS loop owns recovery. Plus un-gate decide() (fold zoom-bucket + rank-prefix hash into the on-screen signature + force one decide()+step() at onMapIdle) so a pure zoom re-ranks/demotes correctly (the independent >30-stuck cause). The re-assert MUST be feature-state-only (via existing applyV5OpacityWrites — never removeGeoJSONSourceFeatures) to preserve the 6be121f9 wiggle fix.

This is the anchor's decoupling PROPERTY (truth survives reparse + always-correct fallback) re-established on top of the modern residency+engine substrate, plus the reconciler residency requires — NOT a return to slots, NOT ViewAnnotations.

## Is the current substrate right

KEEP the current substrate (one immutable GeoJSON source per family + native LodEngine brain + feature-state per-marker opacity + unconditional residency). Do NOT revive slots, do NOT adopt ViewAnnotations, do NOT build a new substrate. This is the unanimous verdict across all six traces and the synthesis doc, and it is correct for three reasons:

1. The current substrate is STRICTLY BETTER than the slot era on the things that killed slots: single symbol layer + viewport-y (no 480/120 layers, no 218-line moveLayer pass) and residency (no membership-churn wiggle, 60fps measured). Reviving slots re-imports both perf killers.

2. The substrate is NOT the cause of the coupling. The coupling is a FALLBACK-SEMANTICS + NO-RECONCILER bug, not a "wrong substrate" bug — the anchor used the SAME tiled-feature-state substrate (VERIFIED, both at default maxzoom=18) and was decoupled-in-effect purely via membership-as-truth + baked-1. We are one narrow protocol away from the ideal, not one rewrite away.

3. ViewAnnotations is decisively rejected (synthesis SDK-verified against MapboxMaps 11.16.6): enableSymbolLayerCollision / auto-hiding Marker do NOT exist; viewAnnotationAvoidLayers is experimental + line-layers-only so VAs CANNOT suppress basemap POI/name labels — the one load-bearing label invariant only GL collision provides; and VAs add a second renderer-owned visibility authority that re-creates exactly the desync class we're trying to eliminate.

So: keep the substrate, FREEZE it (maxzoom cap), restore the honest fallback, and add the reconciler. The owner's "make it never tiled" is unattainable on Mapbox iOS; "tiled but never RE-parsed in the operating band + instant honest self-heal of the rare residual" is the true non-compromising end-state and IS the anchor's decoupling re-expressed.

## Migration path

Strict attribute-before-ideate order, ONE change at a time, harness-verified each. PREREQUISITE: the [lodev] roleP/renderP/roleGap step-probe emitter was DELETED on this branch — re-add a minimal step probe (renderP = count(effective nativeLodOpacity>0.5), roleP = engine.lastPromotedInOrder.count, roleGap = roleP−renderP) PLUS a dataId==nil reparse counter BEFORE measuring. Current telemetry is the [LODDBG]/[lodprobe] NSLog probes + engine accessors (visiblePinKeys, pinOpacity, isIdle).

STEP 0 — RE-INSTRUMENT + PROVE THE TWO CAUSES on the running app (do not implement before this). Drive a slow z14→z17 zoom across a bucket boundary (perf set_map_camera at two straddling zooms, or maestro/perf/flows/search-map-jitter-swipe.yaml; export JAVA_HOME=/opt/homebrew/opt/openjdk@17). Confirm (a) roleGap goes positive at the reparse ack and stays (Cause-1: reparse feature-state loss, no re-assert), and (b) at idle after a pure zoom with a stable on-screen set, renderP != min(roleP,30) (Cause-2: decide() gated on the set signature). Build-verify the binary is newer than the .swift edit (a new probe field missing from events = stale binary; rebuild and check for error: lines).

STEP 1 — FREEZE THE TILE (highest leverage, the make-or-break experiment NO panel has run). Set maxZoom ~12-13 + buffer ~512 on the three LOD ShapeSources (search-map.tsx DOT_SOURCE_ID L344, RESTAURANT_PIN_BUNDLE_SOURCE_ID L357, RESTAURANT_LABEL_RENDER_SOURCE_ID L399). ASSERT on harness: reparse count ~27→~0 through the crossing, roleGap==0 sustained, bundle:[*,*,0] holds. If overzoom keeps points intact (expected for point data; tolerance is line/polygon-only), this attacks the cause and the rest is backstop.

STEP 2 — RESTORE THE HONEST FAIL-SAFE-TO-DOT FALLBACK. Change the V5 bake away from hardcoded 0 (use-direct-search-map-source-controller.ts L1887/L856) to a per-feature pinDefault baking the SETTLED role (promoted→paints a pin, demoted→0), and change the coalesce default from 0 to that baked default (search-map.tsx L2348, L257). Re-bake on every settled markerRoleFrame. ASSERT: a forced reparse now degrades a promoted pin to its DOT, never to invisible/stuck.

STEP 3 — REPARSE RE-ASSERT (backstop, demote-to-defense-in-depth under Step 1). In handleSourceDataLoaded REMOVE the `guard let dataId = event.dataId else { return }` early-out for our LOD sources (controller L10013); on dataId==nil reparse re-assert feature-state via applyV5OpacityWrites for every in-viewport key at engine-owned opacity (feature-state ONLY, never removeGeoJSONSourceFeatures — preserves 6be121f9). Add engine.reassert(keys:) (LodEngine, near step L166/settle-drain L184) to re-admit keys to the display link so the continuous loop owns recovery. ASSERT: no promoted key reads nativeLodOpacity==0 while engine says >0.5; recovery ≤2 frames after each source_commit_ack; bundle:[*,*,0] (proves re-assert not republish).

STEP 4 — UN-GATE decide() (orthogonal, ship regardless, fixes Cause-2/>30-stuck). Fold zoom-bucket id + rank-prefix hash into the on-screen signature at the decide guard (controller ~L10353) + force one decide()+step() at onMapIdle. Keep it a signature fold (not removing the guard) to avoid per-frame CPU spikes on a dense catalog.

STEP 5 — UNIFY ICON AUTHORITY (if Step 0 shows any residual collision-fade/ramp on icons). Set icon-allow-overlap:true + icon-ignore-placement:true + icon/text-opacity-transition:0 on pin/dot ICONS; keep collision on LABEL only; freeze text-variable-anchor re-selection during motion (re-solve on idle/settled) to kill neighbor anchor-hop.

CLEANUP: remove the cceab1ae/[lodprobe] TEMP attribution once Steps 1-4 are validated. Keep the brain (MapLodKit.LodEngine) byte-intact throughout.

## Open questions
- EMPIRICAL HINGE (make-or-break, unrun on this app): does maxZoom-capping at ~12-13 actually collapse the z14->z17 reparse storm to ~0 for POINT data via overzoom? No panel has run this. It is Step 1 and everything downstream assumes it; if overzoom does NOT preserve point feature-state in-band, the headline fix degrades to the Fix-A backstop racing 27 reparses (the compromise the owner rejects). Measure FIRST.
- Does icon-ignore-placement:true + icon-allow-overlap:true FULLY remove the icon from the collision engine so rendered opacity == our feature-state scalar with no residual collision_opacity multiplier (on the pinned MapboxMaps 11.16.6)? If a residual factor remains, the unified-authority claim weakens and label placement may need self-computing in Swift.
- Can icon/text-opacity-transition be set to 0ms on a SymbolLayer in 11.x and does that truly zero the implicit ~300ms paint ramp? Synthesis says 'confirmed settable' but flags it for harness confirmation on this exact SDK.
- Does text-allow-overlap:false ever collision-hide a top-30 LABEL during a pan badly enough to read as flicker? If yes, decide self-computed label placement over the <=30 known pins (write chosen anchor via feature-state) vs accepting native label yield. This is the one visibility authority we don't fully own.
- Mid-pan re-rank: when JS pushes a new top-30 during a gesture, is there a visible frame where the whole field pops to dot before the re-assert lands (fail-safe-to-dot default + re-assert-after-source-set)? If so, consider a feature-state-preserving superset source so geometry need not be re-set on a pure re-rank.
- Does Step 3's re-assert risk re-introducing the wiggle if it ever triggers a source republish instead of pure setFeatureState? Must validate bundle:[*,*,0] holds during reparse recovery; applyV5OpacityWrites is already feature-state-only but the engine.reassert path is new.
- Step 4 CPU: does folding zoom-bucket+rank-hash into the decide signature run decide() too often on a dense catalog? Mitigate via the signature fold + onMapIdle force-decide rather than removing the guard; measure CPU on a dense scene.