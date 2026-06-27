# Map-LOD v5 — Single-Authority Per-Anchor FSM (the redesign)

Status: DESIGN APPROVED-IN-PRINCIPLE 2026-06-23. Not yet built. Build in parallel behind `lodV5Enabled`.
Produced by the lod-redesign workflow (3 independent designs → adversarial red-team → synthesis).

## TL;DR — the one idea
There is exactly **one mutable scalar per anchor: `opacity` (pin opacity)**. `dotOpacity ≡ 1 − opacity`
and `labelOpacity ≡ opacity` are **style expressions, never written**. The promotion decision (`want`) is
**recomputed from scratch every frame** from `(camera, ranking)` and never persisted. Two decoupled loops:
- **DECIDE** (camera frame, native, pure): `onScreen = ranking.filter(onScreenScreenSpace); promoted =
  onScreen.prefix(30); want[key] = promoted.contains(key)`. Writes `want` + obstacle membership only.
- **CONVERGE** (CADisplayLink, native): integrates each `opacity` toward `want ? 1 : 0` (eased, ε-snap to
  guarantee termination). The ONLY writer of feature-state.

Every v4 failure was two authorities (role table vs opacity transitions) disagreeing. Collapsing to one
scalar + recompute-from-scratch makes the failures structurally impossible. This DELETES the role table,
both snapshot builders, the transition objects, the **3 convergence passes**, the awaits, and the caches.

## RANK DECISION (Brandon, 2026-06-23) — ONE rank, Crave score, for BOTH promotion and badge
There must be exactly ONE rank: the restaurant's **Crave score within the viewport** (the same value the
results sheet sorts by, shown as the pin badge). It governs BOTH promotion (top-30-on-screen by Crave score)
AND the displayed badge. The v4 bug = promotion ranked by candidate-pool POSITION while the badge showed the
coverage/Crave rank, so they diverged (origin showed badge-44/54/99 pins). v5: `ranking` is the candidate
array sorted DESC by Crave score; `rank`/badge = position in it; promotion = top-30 on-screen of it. The
divergence cannot recur because there is only one rank. (This also fixes the harness blind spot below.)

## HARNESS BLIND SPOT FOUND 2026-06-23 (must fix in v5's oracle)
The v4 oracle defined "expected pins" as **the native's own promoted set**, then checked the render matched
it — i.e. it validated the native against itself and could NEVER catch a wrong promotion. The frame event
showed promotedRanks=1..30 (correct by pool-position) while the SCREENSHOT showed badge-44/99 pins. Only a
screenshot cross-check caught it. v5 acceptance oracle MUST compute the expected top-30 **independently** (the
true topK by Crave rank over the on-screen set) and assert the rendered pin-set == that topK over a whole pan,
and surface each promoted pin's {badge, rank, dotOpacity}. (Trust the screen; the harness must be independent.)

## The 5 failure modes — why v5 kills each
1. **>30 pins**: `promoted = onScreen.prefix(30)` hard-caps `want=true`, recomputed each frame (structural for
   targets; visible count may transiently read 31–35 mid-crossfade during motion — correct, bounded).
2. **dot+pin same marker**: `dot ≡ 1 − pin` off the SAME scalar → both-near-1 unreachable (structural/algebraic).
3. **labels overlap promoted pins**: obstacle membership = **presence in a separate invisible obstacle source**
   = the live promotedSet (layout-readable), NOT a baked `nativeLodOpacity` filter (v4's stale-filter root,
   search-map.tsx:255-259 / SearchMapRenderController.swift:12090-12092). OPERATIONAL — reseed re-tiles the
   (isolated, invisible) obstacle source only; throttle/membership-gate it + keep the placement-preroll. Verify
   `lopreal==0`.
4. **group snapping**: each `opacity[key]` integrated independently from its own value; no batch object, no
   shared clock, no source re-tile → 30 simultaneous budget crossings = 30 independent fades (structural, given
   the deleted O(N) snapshot that used to starve the stepper).
5. **stuck/stale on return**: `want` recomputed from scratch, zero history → a rank>30 anchor gets `want=false`
   instantly and CONVERGE (with ε-snap) drives it to 0, including off-screen. Origin re-runs identical DECIDE →
   identical top-30 (structural, modulo viewport-edge boundary ties).

## KEEP (extract as shared helpers; do NOT mutate v4)
Resident pin/dot/label sources + `TRANSIENT_VISUAL_PROPERTY_KEYS` (opacity excluded from diffKey); the
CADisplayLink stepper primitive (simplified to `step()`); feature-state `nativeLodOpacity` + style `1−p`/`p`
(default coalesce **0** for pin, **1** for dot — the v4 `?? 1` bug faked pins visible); collision obstacle
layers (pin allowOverlap; dot/label collide); the **separate INVISIBLE obstacle source** (re-tile isolation —
non-negotiable per all 3 red-teams); the **placement-preroll** (masks the one-frame mid-zoom label flash); the
**screen-space on-screen test + exit-ring** (pitch-accurate; the AABB was proven insufficient — do NOT replace
with AABB); the `[lodev]` harness (the acceptance test).

## SCRAP
Role table / `promotedMarkerKeys` as stored authority; `DesiredPinSnapshotState` + both snapshot builders;
`LivePinTransition`/`LiveDotTransition` + `updateLive*`/`finalizeCompleted*`; the **3 convergence passes**
(L8552-8652); await/commit coupling; `retainResidentDemotesFlag` coupling; the two role-frame apply paths;
scoped builders + dual snapshot caches + prepared-frame cache; the `*_transition_complete` source-re-mutation
paths; the baked-`nativeLodOpacity` obstacle FILTER (→ presence-in-source).

## PARALLEL-BUILD PLAN
- New `SearchMapLodV5.swift`: `ranking` mirror, `opacity`/`want` double-buffer (atomic swap so CONVERGE never
  reads a torn `want`), `decide()`, `step()`, `reseedObstaclesIfMembershipChanged()`.
- Flag `lodV5Enabled` (default false). Separate resident sources `pinSourceV5/dotSourceV5/labelSourceV5/
  obstacleSourceV5` + parallel layers, so v5 and v4 never share state. JS publishes `ranking` (Crave-sorted)
  to v5 only when on. v4 untouched.
- Cutover: stand up v5 sources behind the flag → wire decide/step (reveal = first decide; no special reveal
  path) → run the acceptance drive until all gates green → flip default ON, soak → delete SCRAP in a follow-up.
- Acceptance drive: `scripts/lod-drive.sh` (centered Midtown, zoom-in→pan→zoom-out→**return to origin**) on a
  confirmed-fresh bundle.

## HARNESS GATES (all green every frame of the drive)
budget exact (`pinGap==0`, want-count ≤30); **pin-set identity == independent topK over the whole pan**; no
ghost (`ghostN==0`); no dot+pin (`promDotOpaque==0`); no stuck mid-opacity (`pinMid==0 && dotMid==0` once
settled); labels yield (`lopreal==0` incl. mid-zoom); no group snap (`lod` batch small; `mut bundle removes==0`
on the VISIBLE pin source while moving); obstacle reseed isolated (any motion `mut` on `obstacleSourceV5` ONLY,
throttled); visible-count transient bounded, settles within FADE_SECONDS; **origin restore** (final pin-set ==
initial modulo boundary); no jank (`driveMs`/`buildMs`/`camentry.dt`); over-NYC + heartbeat advancing.

## RISKS (validate IN ORDER before building the rest)
1. **Obstacle reseed re-tile cost + same-frame placement** (the only thing that can sink the design — validate
   FIRST): reseeding the separate invisible obstacle source during motion re-runs label collision only and does
   NOT wiggle visible pins (`mut bundle removes==0` on `pinSourceV5`); `lopreal` stays 0 mid-zoom with throttle
   + preroll. Throttle cadence (~100ms) is the knob; preroll the backstop.
2. Default coalesce signs (pin `?? 0`, dot `?? 1`) at every read site.
3. Labels are a SEPARATE source → CONVERGE double-writes `nativeLodOpacity` to pin AND label sources; label
   source must be resident for ALL candidates (v4 emitted labels only for promoted).
4. Emit obstacle/dot/label sources in STABLE RANK ORDER (collision is placement-order-dependent → deterministic
   rendered restore).
5. Atomic `ranking`/`opacity`/`want` full rebuild on data refresh (the one place history could reintroduce FM#5).
6. CADisplayLink runs continuously (not camera-gated) so reveal/settle promotions don't stall.
7. Reveal label-placement timing (keep the placement-gate concern; "reveal = first decide" handles promotion
   not label placement).
