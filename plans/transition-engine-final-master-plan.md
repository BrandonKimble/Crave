# Crave Sheet Transition Engine — FINAL Master Plan (from-scratch, uncompromising)

> Status: definitive redesign spec. Supersedes `sheet-transition-engine-design.md`,
> `page-transition-and-results-engine.md`, `transition-pillars-build-plan.md`,
> `transition-engine-increment-1.md`, `canonical-sheet-transition-master-plan.md`.
> Those are kept only for provenance (where the see-through crossfade idea came from).
> This plan is the result of: industry research (cited inline), a code-grounded audit
> of the live engine, three independent from-scratch designs, and an adversarial
> red-team that found and closed six cross-cutting gaps the designs shared.

> **PIVOT (2026-06-29) — the cross-dissolve is RETIRED; the engine ships as HARD-SWAP + SKELETON.**
> The shipped content reveal is a paint-ack-gated HARD SWAP, not a cross-dissolve. The incoming
> scene paints its own seeded shell / skeleton at frame 1 (RestaurantSkeleton, tile/comment/dish/
> history skeletons via `SceneLoadingSurface`), so the swap always lands on structure, never a blank
> list. Consequences for anyone reading the sections below:
> - **`held-dissolve` == `hard`** in the live code. `resolveContentLaneOpacities` ignores its `mode`
>   and gates purely on `paintAck` (one-frame swap). The three-mode `ContentMode` union is kept for
>   descriptor-shape stability only — DO NOT chase "midpoint ghosting" / a p=0.5 double-image; there
>   is no intermediate-opacity frame to ghost.
> - **Phase 6 (additive cross-dissolve for `held-dissolve`) is RETIRED, not "optional".** Do not
>   re-add the dissolve — skeleton-first hard-swap is the chosen design (industry: skeleton screens).
> - The `settleRamp` spring (was `progress`) drives ZERO visible pixels; it only times `onSettle`.
> - The Phase-2 descriptor scaffolding (`inverse()`, `descriptorEmitsNoMotion()`, the standalone
>   Transition* sub-type aliases, the unmounted lane helpers) was never wired and has been removed;
>   dismiss is the policy runtime's byte-identical idle commit, not a descriptor `inverse`.

---

## 1. North Star + the hard invariants

**North Star.** Every transition in this app — all permutations, forward *and* reverse —
is the **same object**: a slide of **one opaque sheet** between two detents while **four
orthogonal lanes** (sheet-Y, content, map, chrome) play from a **single press-up-started
progress**, against a **remembered origin**. The engine is "dumb" (it plays lanes on a
clock); all per-scene knowledge is **data** (one descriptor row per flow). Dismiss is the
forward descriptor **inverted**, played from the live state — never a second code path.

**The hard invariants (every one is a machine-checkable acceptance gate, §6):**

- **I1 — Slide, never snap.** The sheet maintains its current detent OR travels to a target
  detent via one continuous, velocity-matched glide. The detent is the *target*; the motion
  to it is always a glide. `from == to` ⇒ the sheet *stays put* (no motion at all). No
  `snapTo`-teleport, no fixed-duration jump, never `{kind:'hide'}` to nothing.
- **I2 — Never see-through, ever.** The sheet *surface* alpha is a constant `1.0`. Nothing
  the engine controls can lower it. The map is visible only where the sheet's *geometry*
  doesn't cover it — never *through* it. (Gate G1: min surface alpha == 1.0 across the whole
  ramp.)
- **I3 — Press-up is the sole trigger.** On the gesture's terminal event, all motion lanes
  (sheet, map, chrome) start *in the same UI-thread frame*. Nothing waits on async
  data/readiness/network to *begin*. Readiness governs only *when incoming content becomes
  visible inside the already-moving opaque sheet* — never when the sheet/map move.
- **I4 — Motion is independent of content.** Sliding the sheet is a `translateY` on an opaque
  surface; swapping content is paint *inside* that surface. Orthogonal channels that may run
  concurrently but **never share an opacity or a driver**.
- **I5 — 60fps, zero dropped frames.** Every lane runs on the UI thread (Reanimated worklets /
  native camera). React state is out of the animation loop entirely. Animate only
  `transform` + `opacity` (GPU-compositable). JS is crossed only at start (commit) and end
  (finalize). (Gate G2: zero drops under controlled programmatic A/B at torture zoom.)
- **I6 — Configurable any-direction.** A sheet slides in any direction from simple params
  `{from, to}`. A flow is a tuple of lane params; the engine is the minimum needed to play
  every tuple.
- **I7 — Trivially extendable.** Adding a flow (e.g. profile-page list → search) is **one new
  descriptor row**, zero engine edits. The descriptor table is the *sole* per-scene authority.
- **I8 — Interruptible & reversible from the live state.** Any in-flight transition can be
  grabbed at any frame; a new gesture seizes the *live* presented value + velocity of every
  lane and re-targets. Dismiss = `inverse` applied to the **current** state, not the nominal
  endpoints.

---

## 2. Industry basis — the named patterns we adopt and why

Every mechanism below traces to a battle-tested source. We are not inventing; we are porting.

1. **Opaque container + content-only cross-dissolve.** Material Design 3 / `MaterialContainerTransform`:
   *"the container background color is always drawn as fully opaque, beneath all other content
   in the container"* — only the contents transition. gorhom RN bottom-sheet decouples the
   sheet *surface* from content (surface sized to cover the sheet independent of content
   height). This is the structural fix for "never see-through."
   - https://m3.material.io/styles/motion/transitions/applying-transitions
   - https://developer.android.com/reference/com/google/android/material/transition/MaterialContainerTransform
   - https://gorhom.dev/react-native-bottom-sheet/custom-background

2. **The 0.75-midpoint proof (why naive crossfades leak).** Jake Archibald: two source-over
   0.5-alpha layers composite to 0.75 alpha — 25% of whatever is behind shows through at the
   midpoint. Therefore a content crossfade must **never be the topmost thing over the map**;
   always interpose the opaque backing. Over an opaque backing the 25% reveals the *backing*,
   not the map — safe. For a mathematically dip-free dissolve against a *textured* frost, use
   additive compositing (web `mix-blend-mode: plus-lighter` + `isolation: isolate`; native:
   snapshot both legs into one isolated group à la UIKit `transitionCrossDissolve`).
   - https://jakearchibald.com/2021/dom-cross-fade/
   - https://dev.to/ayc0/proper-cross-fade-in-css-388m

3. **Interruptible, scrubbable, velocity-injected transition on one progress.** UIKit
   `UIViewPropertyAnimator` / `UIViewControllerInteractiveTransitioning` (`fractionComplete`,
   `continueAnimation(withTimingParameters:durationFactor:)`, `isReversed`); Apple "Designing
   Fluid Interfaces" (responsive, interruptible, redirectable; velocity projection
   `s = v₀·λ/(1−λ)`, λ=0.998). Reversal via additive targets to avoid a velocity kick.
   - https://developer.apple.com/videos/play/wwdc2016/216/
   - https://developer.apple.com/videos/play/wwdc2021/10063/
   - https://medium.com/@nathangitter/building-fluid-interfaces-ios-swift-9732bb934bf5
   - https://christianselig.com/2021/02/interruptible-view-controller-transitions/

4. **Padding-as-truth non-modal map sheet.** The sheet does NOT cover the map's center; its
   covered height is fed to the map as a **bottom padding/inset**, shifting where `center`
   renders into the uncovered band. Never resize the map (costly re-tile); never move the
   geographic center to dodge the sheet. Uber's driver-map: a **PaddingProvider** (chrome
   registers edge-inset sources) + a **CameraDirector** (single exclusive arbiter per
   transition). Drive padding from the *same* shared value as sheet-Y so they're frame-locked.
   - https://www.uber.com/blog/building-a-scalable-and-reliable-map-interface-for-drivers/
   - https://medium.com/turo-engineering/adjusting-compose-google-map-while-bottom-sheet-moves-4a7465305137
   - https://docs.mapbox.com/ios/maps/guides/camera-and-animation/camera/
   - https://developers.google.com/maps/documentation/ios-sdk/views

5. **Velocity-projected, interruptible detent model.** Detents + free drag, never teleport;
   landing detent chosen by velocity projection (not nearest current position); settle via a
   near-critically-damped spring with the gesture's exit velocity injected; rubber-band over-
   drag at the ends. gorhom + Reanimated are the RN reference impls (`useBottomSheetSpringConfigs`,
   `overshootClamping`, `withSpring({velocity})`, `withDecay({velocity, clamp, rubberBandEffect})`).
   - https://gorhom.dev/react-native-bottom-sheet/props
   - https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/
   - https://medium.com/ios-os-x-development/gestures-in-fluid-interfaces-on-intent-and-projection-36d158db7395

6. **Declarative descriptor wrapper.** React Navigation splits `transitionSpec` (the clock)
   from per-element `cardStyleInterpolator` / `headerStyleInterpolator` (independent lanes).
   Material's start/end-view + RETURN direction makes dismiss the same object inverted. A
   reusable iOS animator serves both directions via a single flag, always reading from/to from
   the live context. This is the "transition is data, four lanes on one clock, dismiss =
   inverse" model.
   - https://reactnavigation.org/docs/stack-navigator/
   - https://danielgauthier.me/2020/02/24/vctransitions1.html

7. **60fps RN doctrine.** One UI-thread shared value drives everything via worklets; no
   `setState` in the loop; transform+opacity only; pre-measure/pre-mount offscreen so first
   paint never lands mid-animation; `runOnJS` only at boundaries; read shared values only on
   the UI thread; `CADisableMinimumFrameDurationOnPhone=true` for 120Hz ProMotion.
   - https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/
   - https://www.callstack.com/blog/60fps-animations-in-react-native
   - https://swmansion.com/blog/you-may-not-need-reanimated-measure-5b9c11d27ba4/

---

## 3. The architecture

### 3.1 The one inversion we are undoing (root cause, code-confirmed)

The opaque sheet backing (`FrostedGlassBackground` + white plate) is painted **inside** the
per-scene leg frame (`BottomSheetSceneStackPageFrame.tsx:107-110`), and that leg frame's
opacity is ramped 1→0 / 0→1 (`BottomSheetSceneStackHost.tsx:408-417`, `animatedLegOpacityStyle`)
over a **transparent** sheet surface (`bottomSheetSceneStackHostStyles.ts:92`;
`overlaySheetStyles.ts:38,45` — all `transparent`). So "crossfade content" literally means
"fade the white card toward transparent," and with the map behind a transparent surface, the
map shows through at every mid-ramp frame (~0.75 backing alpha at p=0.5). The dismiss then
welds content teardown to a *collapse boundary* the sheet must physically reach first
(terminalDismiss → `{kind:'hide'}`), giving blank-map-then-snap-back. One tap is decomposed
into **three fighting springs** (collapse→middle→no-op). Every owner symptom descends from
this inversion + its corollary (content, sheet motion, map, chrome, completion all welded to
one `transitionToken` clock).

### 3.2 KEEP vs REPLACE (explicit)

**KEEP — the foundation is sound and de-risked:**
- The single shared physical sheet + the spring snap runtime (`useBottomSheetSharedSnapExecutionRuntime`).
- Co-mounted absolute-fill scene siblings (`BottomSheetSceneStackHost` — "both scenes live during
  the window" is the big win; do not throw it away).
- The declarative policy resolver shape (`resolveAppRouteSceneTransitionPlan`) — repurposed as
  the descriptor resolver.
- The `OverlayRouteEntry[]` origin-carrying back-stack with `restoreState.snap/scroll/childAnchor`.
- The "motionless re-root" precedent (`sheetMotion:{kind:'none'}` + `swapImmediately`,
  `app-route-overlay-session-state-controller.ts:336-343`) — generalized.
- The child-origin `onMorphSettled` hook (`use-results-presentation-close-actions-runtime.ts:162`)
  — generalized into the single dismiss finalize.

**REPLACE — the content-plane-crossfade engine bolted on top:**
- The frame-opacity crossfade (`animatedLegOpacityStyle`, `BottomSheetSceneStackHost.tsx:408-417`
  + the 250ms `withTiming` clock at `:911-920`) and the transparent surface.
- The `swapImmediately` vs `preserveOutgoingUntilSettle` binary and the `SEEDED_FORWARD_OPEN_SCENES`
  lever (`app-route-scene-transition-policy-runtime.ts:132`).
- The `terminalDismiss` `{kind:'hide'}` slide-out + collapse-boundary-welded finalize, and the
  terminalDismiss-vs-Lane-B dismiss fork.
- The ~400-line txn↔settleToken readiness machinery (`app-route-scene-switch-controller.ts:613-1018`)
  **as the primary completer** — reduced to a single paint-ack that gates only the content lane.
- The six scattered curated authorities — collapsed into one descriptor table:
  `SEEDED_FORWARD_OPEN_SCENES`, `TOP_LEVEL_SHARED_SHEET_SCENES`, the openChild snap switch
  (`:222-234`), `isSharedOverlaySnapOwner`, `SCENE_READINESS_CONTRACT_BY_TARGET`, the three
  `displayedSceneKey` forcings.

> The content-plane-crossfade engine **is replaced.** The render substrate, the descriptor
> model, the dismiss lane, and the completion path are new. The sheet/scene-stack/route-stack
> *foundation* is kept.

### 3.3 The render substrate — three physical layers, fixed z-order, forever

```
┌─ SHEET SURFACE (one Animated.View, translateY ONLY, opacity LOCKED = 1) ──────┐
│  Layer 0  OPAQUE BACKING   ONE FrostedGlassBackground + ONE white plate,        │
│                            mounted once, hoisted to the surface host. opacity   │
│                            is a CONSTANT 1.0 — the engine has NO handle to it.   │
│                            Sized to cover the full sheet independent of content │
│                            (gorhom surface decoupling). Per-scene CUTOUTS stay  │
│                            in the content layer above; only the flat fill hoists.│
│  Layer 1   CONTENT-A       outgoing scene body+chrome, NO backing of its own.   │
│  Layer 1'  CONTENT-B       incoming scene body+chrome, NO backing of its own.   │
│            (only Layer 1/1' opacities ever animate, OVER the opaque backing —    │
│             even at α 0.5+0.5 the eye sees content-A dissolving into content-B   │
│             over solid frost/white, NEVER the map.)                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                    MAP (visible only where the surface GEOMETRY uncovers it)
```

**Concrete moves:** remove the backing from `BottomSheetSceneStackPageFrame.tsx:107-110`;
hoist exactly one frost+white plate to the `ActiveSceneStackSurfaceHost` `Animated.View`
(`BottomSheetSceneStackHost.tsx:929`) as a sibling *below* the content layers; set
`sceneStackSurface` / `overlaySheetStyles.surface` to the opaque sheet fill (or let the
hoisted plate own it). Per-scene white plates and **cutouts** (sheet-frost-architecture memo)
stay per-scene *above* the shared plate — only the flat opaque fill is hoisted.

**Engine invariant enforced forever:** the engine's drivers may write `translateY` and the two
content-layer opacities. They may **never** write the backing's opacity or the surface's
opacity. This makes "map shows through" *unrepresentable*.

### 3.4 The four orthogonal lanes (the engine's entire job)

A transition is **one shared `progress: 0→1`** (Reanimated `useSharedValue`, started on
press-up) plus four pure worklet interpolators reading it. Lanes never reference each other.

| Lane | Driver | Writes | Rule |
|---|---|---|---|
| **sheet-Y** | spring on `progress`, sharing ONE resolved target detent with the projection | surface `translateY` | SLIDE between detents; `from==to` ⇒ no-op. Velocity-injected, near-critical damping, `overshootClamping` so it never passes a detent. Never `hide`. |
| **content** | `progress` (gated by paint-ack for `held-dissolve`) | Layer-A/B opacity, or hard swap | three modes (below); ALWAYS over the opaque backing. |
| **map** | the SAME `progress` spring (not a sibling spring) → camera + bottom padding | camera target + `paddingBottom` | retarget continuously, never blank/unmount; padding only, never resize. |
| **chrome** | `progress` over `chromeThreshold` | search-bar + shortcut opacity/offset | content-layer only; never the backing. |

**One resolved target detent (red-team MUST-FIX C).** `progress` is *normalized travel toward
the resolved target detent*. The resolved target = `to` for programmatic taps (every matrix
permutation except a raw user sheet-drag), or the **velocity-projected** detent for a drag
release (`projected = releaseY + v·λ/(1−λ)`, λ=0.998 → `nearestDetent`). The sheet spring and
the `progress` driver share this one resolved endpoint, so the four lanes can never desync —
even on a flick-released or interrupted transition. The map lane reads the **same** `progress`
(not a sibling spring with merely the same config), guaranteeing camera + sheet settle on the
same frame.

**Content lane — THREE modes (red-team MUST-FIX A/B), not two:**
- **`hard`** (seedable scenes: pollDetail, restaurant profile via direct-seed). On press-up,
  replace Layer-1 content with the incoming scene in one frame — *but the visible commit is
  gated on a single paint-ack* (the incoming scene is pre-mounted offscreen and must emit its
  first real paint before the swap is shown). Motion lanes are NOT gated on the ack; the sheet
  slides on press-up while content appears a frame or two later inside the already-moving
  opaque sheet. This is the precise reconciliation of "press-up starts everything" with "no
  blank frame," and it is what makes `hard` drop-proof (kills the press-up-frame mount cost and
  the "no pin until refresh" class).
- **`held-dissolve`** (NON-seedable scenes: all results / favorites-results — a results list
  cannot seed believable rows without the query response). Hold the *outgoing* content fully
  opaque until the incoming results emit their first real paint-ack, THEN content-only
  dissolve incoming over the still-opaque backing (~150–200ms). This is `preserveOutgoingUntilSettle`
  done *correctly* — content-only, over an opaque backing, paint-gated — the one good idea
  inside the current broken implementation, kept; only its see-through realization is discarded.
- **`instant-on-paint-ack`** is the degenerate `hard` (no outgoing to hold). Same gate.

Never a hard cut to a blank list. Never a dissolve as the topmost thing over the map.

**Map lane = Uber padding model.** The sheet registers a bottom-padding source = its current
covered height (a shared value derived from `translateY`). A single **CameraDirector** owns the
camera for the transition's duration via an exclusive handle. The focused pin renders in the
uncovered band above the sheet at every detent and every frame of a slide, because padding
shifts only *where* `center` renders. Drive `paddingBottom` off the same `progress`/`sheetY`.

### 3.5 The descriptor / params API — a transition is data

```ts
type Detent = 'collapsed' | 'middle' | 'expanded' | { fraction: number };

type SceneRef    = { sceneKey: OverlayKey; seedParams?: unknown };          // seedable ⇒ paintable shell
type CameraState = { center: LngLat; zoom: number } | { fitBBox: BBox } | { kind: 'preserve' };
type ChromeState = { searchBar: number; shortcuts: number; bottomNav: number }; // opacities 0..1

type ContentMode =
  | { mode: 'hard' }                                         // seedable; paint-ack-gated visible commit
  | { mode: 'held-dissolve'; threshold: [number, number] }   // non-seedable; hold outgoing, paint-gate, dissolve
  | { mode: 'instant-on-paint-ack' };                        // degenerate hard (no outgoing)

type OriginRef = {                          // EVERYTHING needed to reverse-mount, exactly
  sceneKey: OverlayKey;
  snap: Detent;
  scrollOffset?: number;
  childAnchor?: { pollId?: string; commentId?: string; resultCardId?: string; listRowId?: string };
  camera: CameraState;
  chrome: ChromeState;
};

type TransitionDescriptor = {
  trigger: 'press-up';                                       // the ONLY trigger
  clock:   { type: 'spring'; config: SpringConfig };         // ONE progress 0→1 for all lanes
  sheet:   { from: Detent; to: Detent };                     // SLIDE; from==to ⇒ stay
  content: { out: SceneRef | null; in: SceneRef; swap: ContentMode };
  map:     { from: CameraState; to: CameraState };           // retarget; never blank
  chrome:  { from: ChromeState; to: ChromeState; threshold: [number, number] };
  origin:  OriginRef;                                        // pushed onto the back-stack for the reverse
};

// Dismiss is NOT a second code path — it is the forward descriptor inverted, applied to the
// LIVE presented state (red-team MUST-FIX F), à la Material RETURN / iOS presenting:false.
const inverse = (d: TransitionDescriptor): TransitionDescriptor => ({
  ...d,
  sheet:   { from: d.sheet.to,   to: d.sheet.from },
  content: { ...d.content, out: d.content.in, in: d.content.out ?? d.origin /* never null on a real dismiss */ },
  map:     { from: d.map.to,     to: d.map.from },
  chrome:  { from: d.chrome.to,  to: d.chrome.from, threshold: d.chrome.threshold },
});

// The ONLY per-scene authority. New flow = new row. No engine edit.
function resolveTransition(from: SceneRef, to: SceneRef, intent: Intent): TransitionDescriptor;
```

**How a sheet slides any direction:** the resolver emits `sheet:{from,to}`; `sheetY =
interpolate(progress, [0,1], [detentY(from), detentY(to)])`. `from > to` slides up,
`from < to` slides down, `from == to` stays. One mechanism, any direction.

**How content cross-dissolves over an opaque backing:** the two content layers'
opacities interpolate over `swap.threshold`, *inside* the surface, above the locked-opaque
Layer 0. The surface alpha is never touched.

**How map + chrome are driven:** map reads the same `progress` → CameraDirector `easeTo`(target,
padding); chrome reads `progress` over `chrome.threshold` → opacity on the chrome subtree.

The resolver replaces all six scattered curated sets. New flow = one row.

### 3.6 The press-up fan-out (one frame, UI thread)

```ts
function onPressUp(d: TransitionDescriptor, velocity: number) {
  'worklet';
  // resolved target shared by sheet spring + progress (MUST-FIX C)
  const target = velocity !== 0 ? projectDetent(liveSheetY, velocity) : d.sheet.to;
  progress.value = withSpring(1, { ...d.clock.config, velocity });    // ONE driver
  // sheet, chrome, map-padding all derive from progress in worklets (no JS round-trip)
  runOnJS(commitRoute)(d);                                            // route-state commit only — NO sheet motion of its own
  cameraDirector.acquire(d.id).animate(d.map.to, d.clock.config);     // map starts NOW, same curve
  // content lane: pre-mounted incoming is shown on paint-ack; motion is NOT gated on it
}
```

**Deadlock seam (red-team MUST-FIX E), direction-agnostic.** A transition that emits *no*
motion planes (already at target snap, no camera/chrome delta — e.g. the `{polls,search}@collapsed`
byte-identity seam) finalizes **synchronously** — and this escape hatch applies to BOTH a
forward motionless re-root AND a dismiss, not dismiss-only. This is the only special case; the
reverse-morph is the default.

---

## 4. The permutation table (forward + dismiss in the new model)

`sheet from==to` ⇒ the sheet *stays* (content/map/chrome still play). Dismiss = `inverse(row)`
applied to live state, finalized on the morph's open/settle (NOT a collapse boundary).

| # | Trigger | sheet from→to | content out→in / mode | map | chrome | origin (dismiss target) |
|---|---|---|---|---|---|---|
| 1 | Favorites **restaurant-list** tap | middle→middle (stay) | bookmarks→results / `held-dissolve` | fit list bbox | →results | bookmarks @middle, listRowId, scroll |
| 2 | Favorites **dish-list** tap | middle→middle (stay) | bookmarks→results / `held-dissolve` | fit list bbox | →results | bookmarks, listRowId, scroll |
| 3 | Comment **restaurant** entity | expanded→middle (slide down) | pollDetail→profile / `hard` (direct-seed) | retarget + fitPin | unchanged | pollDetail, {pollId,commentId}, camera |
| 4 | Comment **dish** entity | expanded→middle (slide down) | pollDetail→results / `held-dissolve` | fit results bbox | →results | pollDetail, {pollId,commentId} |
| 5 | Result-list **restaurant** entity | middle→middle (stay) | results→profile / `hard` (already seeded) | retarget + fitPin | unchanged | results, resultCardId, scroll |
| 6 | Result-list **dish** entity | middle→middle (stay) | results→profile* / `hard` | retarget + fitPin | unchanged | results, resultCardId, scroll |
| 7 | **Search** natural submit | collapsed→middle (slide up) | search→results / `held-dissolve` | fit results bbox | search-bar→results | search @collapsed, query |
| 8 | **Autocomplete** restaurant | collapsed→middle (slide up) | search→profile / `hard` (preview-seed) | retarget + fitPin | →results | search, query |
| 9 | **Autocomplete** query/entity | collapsed→middle (slide up) | search→results / `held-dissolve` | fit bbox | →results | search, query |
| 10 | **Autocomplete** poll | collapsed→expanded (slide up) | search→pollDetail / `hard` (seeded) | preserve | preserve | search, query |
| 11 | **Shortcut** button | collapsed/middle→middle | search→results / `held-dissolve` | fit bbox | →results | search, shortcut id |
| 12 | **Poll-open** feed→pollDetail | collapsed/middle→expanded (slide up) | polls→pollDetail / `hard` (skeleton frame-1) | preserve | preserve | polls @snap, pollCardId, scroll |
| 13 | **FUTURE** profile list→search | middle→middle (stay) | profileList→results / `held-dissolve` | fit list bbox | →results | profile, listRowId — **ONE new row, zero engine change** |

\* **Row 6 owner decision (do not guess).** Result-list *dish* tap today opens the dish's
*restaurant profile* (`dish-result-card.tsx:143`), contradicting the brief's "dish entity →
results." The descriptor encodes either (`in: profile` vs `in: results`) in one line — owner picks.

**Three restaurant-profile lanes collapse into ONE.** The audit found three divergent reveal
lanes for the same destination (committed-search crossfade; result-list direct-seed;
autocomplete preview). They become one `reveal→profile` descriptor that opaquely slides to
middle and **seeds the pin synchronously** via the result-list direct seed
(`seedRestaurantProfile` / `setMapHighlightedRestaurantId`), NOT the committed-search async
pin (this is the issue #2 fix). Dismiss for every row is `inverse(row)`.

---

## 5. The three current bugs — exact fix in the new model

### Bug #1a — REVEAL goes see-through (map shows through ~1 frame / multi-frame).
**Cause:** the frame-opacity ramp fades the per-scene backing over a transparent surface
(`BottomSheetSceneStackPageFrame.tsx:107-110` under `animatedLegOpacityStyle`
`BottomSheetSceneStackHost.tsx:408-417` over `bottomSheetSceneStackHostStyles.ts:92`).
**Fix (§3.3 + §3.4):** hoist one opaque backing to the surface (opacity locked 1.0, no engine
handle); content lanes dissolve *over* it (`held-dissolve`) or hard-swap. Surface alpha is a
constant 1.0 ⇒ map is unrepresentable inside the sheet. **Gate G1.** Lands in Phase 0 — fixes
see-through on the *existing* engine immediately, before the rest of the rewrite.

### Bug #1b — REVEAL drops below middle then springs back up (snap-overshoot).
**Cause:** one tap is decomposed into three independent springs —
`prepareSearchSessionEntry` → `returnAppSearchRouteToDockedSearch({snap:'collapsed'})`
(`app-search-route-command-runtime.ts:233-235`) springs DOWN to collapsed merely to re-root
the route; then the committed entity-search springs UP to middle; then the openChild
`promoteAtLeast:middle` is a no-op. The collapse is gratuitous and gated behind an async
restaurant fetch, so the round-trip is fully visible.
**Fix (§3.4 + Phase 1):** make the session-entry re-root **motionless**
(`sheetMotion:{kind:'none'}` — the pattern the child-origin dismiss already uses,
`app-route-overlay-session-state-controller.ts:336-343`). Emit exactly ONE sheet motion: the
descriptor's `expanded→middle` slide, on press-up, decoupled from the async fetch. From
expanded that is one downward glide; from collapsed one upward glide; from middle a no-op.
`overshootClamping` so it never passes a detent. **Gate G3** (one monotonic slide, zero
collapse dwell).

### Bug #3 — DISMISS tears down (content vanishes → sheet slides fully out → search bar fades → BLANK map → pollDetail snaps back).
**Cause:** terminalDismiss forces `{kind:'hide'}` (`app-route-scene-transition-policy-runtime.ts:216-217`);
finalize (`clearSearchState`, `completeDismissHandoff`, origin re-push) is welded to the sheet
physically reaching the *collapsed boundary* (`finalizeCloseTransition` ←
`markSearchSheetCloseCollapsedReached`), so teardown is causally forced to PRECEDE the
destination paint; nav/search-bar is raised prematurely; the saved camera is refocused
synchronously (map jump). Two divergent dismiss lanes (terminalDismiss vs child-origin Lane-B).
**Fix (§3.5 + Phase 3):** ONE origin-parameterized reverse-morph = `inverse(descriptor)` on the
LIVE state. On press-up: sheet slides from current Y to the origin detent (or stays) — never
`hide`; content swaps back to the *exact* origin (comment/card/list/feed via `childAnchor`)
over the opaque backing; map pans back to `origin.camera` concurrently; chrome restores. The
surface stays opaque throughout. **Finalize gates on the morph's open/settle** (generalize
Lane-B's `onMorphSettled`, `use-results-presentation-close-actions-runtime.ts:162`), NOT on a
collapse boundary. Delete terminalDismiss `{kind:'hide'}`, the premature nav-show, the
synchronous camera jump, and the collapse-boundary weld. **Gate G4** (dismiss reaches exact
origin, no blank-map frame).

### Tracked separately — NO PIN on comment-span reveal (issue #2).
The committed-search lane paints the pin only after the search lands ("only after a refresh").
**Fix:** the unified `reveal→profile` lane seeds the pin **synchronously** on press-up (the
result-list direct seed), and the engine asserts the entity feature is in the source *before*
`fitPin`. Lands with the Phase 2 lane unification. Verified via the LOD harness (`roleP`/`renderP`).

---

## 6. 60fps + on-device verification strategy (how we PROVE it)

**Verification doctrine (from this repo's hard-won memory — `CLAUDE.md`):** attribute via the
running app's telemetry, never eyeball or trust green metrics; force a fresh FULL bundle +
a unique `[BUILDCHECK-vN]` marker before every measurement (cold launch serves the last full
bundle, not HMR patches); confirm the installed binary is newer than the source edit; do NOT
delegate the runtime "why" to subagents — instrument the running app yourself.

**Four machine-checked acceptance gates, every permutation FORWARD and REVERSE:**

- **G1 — Never see-through.** Scrub `progress` 0→1 via a perf deep-link
  (`crave://perf-scenario-command?action=set_map_camera…` + a progress-scrub action),
  screenshot at each step, sample the sheet-region pixels; **min sheet-surface alpha == 1.0**,
  zero map pixels inside the sheet bounds at every `progress`. A metric that's always green is
  lying only if nothing writes it — here it's a real pixel assertion.
- **G2 — Zero dropped frames.** Controlled **programmatic camera A/B** at torture zoom
  (the LOD gold standard — programmatic, NOT human pinch, which the LOD memory proved is a
  variance confound). 6 runs both sims, with/without the transition; p50 frame ≤ ~17ms (≤ ~8ms
  at 120Hz), zero drops. Read the LOD JSONL harness (`[lodev]` events: `step`, `frame`,
  `cwork`) — it is the screen, quantified.
- **G3 — Slide, not snap.** Rows 3/4: the harness shows a single monotonic `translateY` from
  the start detent to the target, **zero collapse dwell**, one settle event. No `snapTo:collapsed`
  then `snapTo:middle`.
- **G4 — Dismiss reaches exact origin.** profile→exact comment / results→result card /
  results→bookmarks row / search→docked home / pollDetail→feed scroll: the restored
  `childAnchor` + scroll matches the captured origin, with no blank-map frame at any `progress`.

**60fps construction rules (enforced, not aspirational):** one UI-thread `progress` shared
value; every visual via `useAnimatedStyle`/`useDerivedValue` worklets; **no `setState` mid-flight**
(the current `transitionToken` layout-effect re-render is exactly this anti-pattern — delete it);
transform+opacity only; pre-mount/pre-warm the incoming scene offscreen and gate the content
visible-commit on a first-paint-ack; `runOnJS` only at commit/revert/cleanup; read shared values
only on the UI thread; `useMemo` gestures / `useCallback` frame callbacks; `CADisableMinimumFrameDurationOnPhone=true`.

**Interruptibility proof:** drive a flow, interrupt at p≈0.5 with a new gesture; assert no jump —
all four lanes re-seed from their live presented values + velocity, and `inverse` is applied to
the current state, not the nominal endpoints (I8 / MUST-FIX F).

**Repro tooling (no user needed):** Maestro jitter/pan flow `maestro/perf/flows/search-map-jitter-swipe.yaml`
(`export JAVA_HOME=/opt/homebrew/opt/openjdk@17`); perf deep-links
`submit_shortcut_restaurants` / `set_map_camera`; RN JS logs via
`grep "[MARKER]" /tmp/crave-metro.log` (dev `console.log` does NOT surface to os_log).

---

## 7. Phased build sequence (dependency-ordered; each phase has an on-device DoD)

This is a large rebuild. That is accepted. Each phase is independently shippable and is
verified on-device before the next. **Phasing is deliberately ordered so the owner's #1 repro
is never shipped half-broken** (the flaw the red-team found in two of the candidate designs:
they routed scenes through the descriptor table while the sheet still rode the 3-spring path).

### Phase 0 — Opaque backing hoist (keystone; fixes see-through alone)
- Move `FrostedGlassBackground` + white plate out of `BottomSheetSceneStackPageFrame.tsx:107-110`
  to the surface host `BottomSheetSceneStackHost.tsx:929`, opacity locked 1.0, sized to full sheet.
  Make `sceneStackSurface` / `overlaySheetStyles.surface` opaque. Leave the existing crossfade
  ramp in place.
- **Reuse from current session:** the sheet-frost-architecture (shared frosty foundation +
  per-scene white plates/cutouts) — cutouts stay per-scene above the shared plate.
- **DoD:** record rows 3 / 7 / 1 reveals; scrub frame-by-frame; **G1 passes** — map never
  appears inside the sheet at any `progress`, even on the *legacy* ramp. Independently shippable.

### Phase 1 — Single sheet-motion slide + motionless re-root + direction-agnostic sync-finalize
(Do this BEFORE the descriptor table — the inverse of the rejected designs' ordering.)
- Make `prepareSearchSessionEntry` / `ensureAppSearchRouteSearchEntry` re-root with
  `sheetMotion:{kind:'none'}` (reuse `app-route-overlay-session-state-controller.ts:336-343`).
- Emit exactly one `snapTo(target)` / `promoteAtLeast` per reveal, on press-up, decoupled from
  the async restaurant fetch. `overshootClamping` true.
- Make the no-motion-planes synchronous-finalize escape hatch **direction-agnostic** (forward
  motionless re-root AND dismiss), disarming the `{polls,search}@collapsed` byte-identity
  deadlock seam for both directions (MUST-FIX E).
- **DoD:** **G3 passes** on rows 3/4 — LOD harness shows one monotonic slide expanded→middle,
  zero collapse dwell; no deadlock/strand on the forward re-root.

### Phase 2 — Descriptor table + four-lane player + paint-ack-gated content lane
- Introduce `TransitionDescriptor`, `resolveTransition` table, `inverse()`, and the four-lane
  worklet player driven by one `progress`. Implement the three content modes (`hard`,
  `held-dissolve`, `instant-on-paint-ack`); reduce the ~400-line readiness machinery
  (`app-route-scene-switch-controller.ts:613-1018`) to a **single paint-ack** that gates only
  the content visible-commit (motion lanes never gated).
- Route all 13 permutations through the table. Collapse the three restaurant-profile lanes into
  one direct-seed `reveal→profile`; seed the pin synchronously (**issue #2 fix**).
- Pre-mount/pre-warm incoming scenes offscreen.
- **DoD:** all 13 reveals on-device; **issue #2** pin present *before* `fitPin` (`roleP`/`renderP`
  harness); no `setState` in the transition window (profiler: zero JS-thread frames).

### Phase 3 — One reverse-morph dismiss = `inverse(live state)`
- Replace terminalDismiss `{kind:'hide'}` + collapse-boundary finalize + the terminalDismiss-vs-
  Lane-B fork with one origin-parameterized reverse-morph. Finalize on the morph's open/settle
  (generalize `onMorphSettled`, `use-results-presentation-close-actions-runtime.ts:162`).
  Generalize `childAnchor` → any `OriginRef` (comment / card / list row / feed scroll / future).
  Apply `inverse` to the live presented values (interruptibility, MUST-FIX F).
- **Revert from current session:** the bolt-on child-origin Lane-B as a *special case* is
  retired — its mechanism (`onMorphSettled`, motionless re-root) is generalized into the single
  lane.
- **DoD:** **G4 passes** — profile→exact comment, results→result card, results→bookmarks,
  search→home, pollDetail→feed scroll all one reverse-morph, no blank-map frame (**issue #3 fixed**).

### Phase 4 — CameraDirector + PaddingProvider + velocity projection (GATED on a harness proof)
- Wire the sheet as a bottom-padding source; one CameraDirector exclusive handle per transition;
  drive `paddingBottom` off the same `progress`/`sheetY`. Add projection-based detent selection
  + exit-velocity injection + mid-flight interruption for raw sheet drags.
- **GATE (red-team MUST-FIX D — prove, don't assert):** the repo is mid-migration to a
  self-owned `PinOverlayView` that computes screen position via `point(for:)` on a display link,
  i.e. coupled to the camera every frame. Animating `paddingBottom` off `sheetY` mutates the
  camera projection every frame. Before shipping, **attribute by intervention** (per CLAUDE.md):
  use the LOD JSONL harness to prove the pin overlay re-projects cleanly under per-frame padding
  animation (it already tolerates pan/zoom camera moves, so padding-as-camera-move is *likely*
  fine — but prove it). Do NOT ship the CameraDirector until the harness shows no pin wiggle.
- **DoD:** pin stays framed in the uncovered band at every detent during a slide; LOD harness
  `bundle:[*,*,0]` (zero removes) during the padding animation — no wiggle.

### Phase 5 — Delete dead machinery
- Remove the 250ms fixed clock, the txn↔settleToken readiness driver (keep the single paint-ack),
  the six curated sets (`SEEDED_FORWARD_OPEN_SCENES`, `TOP_LEVEL_SHARED_SHEET_SCENES`, the
  openChild snap switch, `isSharedOverlaySnapOwner`, `SCENE_READINESS_CONTRACT_BY_TARGET`, the
  three `displayedSceneKey` forcings), the never-hit watchdog. Add the future profile-list→search
  flow as one descriptor row to prove extensibility (I7).
- **DoD:** all four gates (G1–G4) green for every permutation forward and reverse; the future row
  added with zero engine edits.

### Phase 6 (optional) — Additive cross-dissolve for `held-dissolve`
- Only if dual-opacity double-imaging is visible on the textured frost: composite both content
  legs into one isolated offscreen group + additive blend (`plus-lighter` equivalent /
  `transitionCrossDissolve` semantics). Likely unnecessary since the backing is opaque.
- **DoD:** no ghosted double-image at p=0.5 on any `held-dissolve` row.

**Current-session work reuse map:**
- **Reuse:** sheet-frost-architecture (shared foundation + per-scene cutouts); the motionless
  re-root precedent; the `onMorphSettled` hook; the co-mounted scene-stack; the LOD harness +
  perf deep-links + Maestro flows for verification; the `OverlayRouteEntry[]` back-stack.
- **Revert / retire:** the `preserveOutgoingUntilSettle` content-plane crossfade and the
  `'content'` motion plane; `SEEDED_FORWARD_OPEN_SCENES` as a lever; the terminalDismiss
  `{kind:'hide'}` lane; the child-origin dismiss as a *special-case fork* (generalized instead);
  the 250ms `withTiming` clock + readiness driver as the primary completer; the `transitionToken`
  layout-effect re-render.
- **Keep orthogonal (do not entangle):** the in-flight pin-overlay / no-tile-wiggle map-substrate
  work — the CameraDirector owns camera+padding only, NOT the marker layer, and Phase 4 is gated
  on proving coexistence.

---

## 8. Open questions for the owner

1. **Row 6 — result-list DISH tap.** Today it opens the dish's *restaurant profile*
   (`dish-result-card.tsx:143`), contradicting the brief's "dish entity → results reveal."
   Which is correct? (Descriptor encodes either in one line.)
2. **Results-scene content mode.** Confirm `held-dissolve` (hold outgoing fully opaque until
   incoming results paint, then content-only dissolve over the opaque backing) is the accepted
   behavior for the non-seedable results / favorites-results rows (1, 2, 4, 7, 9, 11) — since a
   pure `hard` swap there would be a blank-frame cut. (This is `preserveOutgoingUntilSettle`'s
   one good idea, done see-through-free.)
3. **Detent set per scene.** Confirm the canonical detents — `collapsed` / `middle` / `expanded`
   — and the exact heights/fractions, and whether any scene needs a fourth detent.
4. **Dissolve durations.** Acceptable `held-dissolve` window (proposed ~150–200ms) and the
   spring `config` (proposed near-critical, dampingRatio ~0.9, `overshootClamping: true`) — to
   tune against the iPhone 17 Pro feel.
5. **Favorites dismiss fidelity.** Should favorites dismiss restore the *exact scrolled list
   position* (full `OriginRef` with `scrollOffset`), or is returning to the bookmarks root @snap
   acceptable? (The new model supports exact restore; confirm it's wanted.)
6. **Autocomplete-poll dismiss target (row 10).** Dismiss back to the *search* surface, or
   straight to the *polls feed* (poll-dismiss semantics)? Affects the `origin` for that row.
7. **Phase 4 camera gating.** Accept that the CameraDirector ships only after the LOD-harness
   proof of pin-overlay coexistence (it may land a phase later than the rest if the intervention
   surfaces wiggle).
