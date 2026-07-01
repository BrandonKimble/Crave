# THE CANONICAL SHEET-TRANSITION MASTER PLAN

**Status:** IN EXECUTION. Supersedes `canonical-transition-finish-plan.md`,
`transition-pillars-build-plan.md`, and `transition-engine-increment-1.md` as the execution
spine. Those remain valid as historical attribution logs.

**EXECUTION STATUS (uncommitted working tree):**
- ✅ **Phase 0** — hygiene + per-scene readiness-contract rows. Sim-verified, inert.
- ✅ **Phase 1** — content plane gated on `seeded` (only `preserveOutgoingUntilSettle`/not-seeded opens arm it). Verified.
- ✅ **Phase 2** — readiness collector flipped to DRIVER (txn↔settleToken link via `transitionPlan.contentReadinessTransactionId` + `lastReveal` fallback + check-on-arm); ramp `onFinish` kept as token-guarded co-completer; `CONTENT_SETTLE_TIMEOUT_MS=320` → `SCENE_READINESS_LIVENESS_MS=600` never-hit watchdog. **Log-verified: 70 search opens, 0 watchdog fires, 28 collector-driven, cards/markers paint every open, seeded opens arm no plane.** The 320ms-as-completer fallback is dead.
- ✅ **Phase 3a** — childAnchor plumbed through LaunchIntent → captured origin (write-only).
- ✅ **Phase 4** — restaurant reveal routed through the COMMITTED lane (runRestaurantEntitySearch + pending-selection
  warm-profile auto-open); restaurant removed from SEEDED. Reveal-via-result-card verified (middle snap, committed pin,
  chrome-fade); the comment-span reveal itself awaits owner finger-test (deep-link/span un-automatable).
- ✅ **Phase 3b + 5** — back-stack verbs (revealRoute/dismissActiveRoute aliases; poll-open already PUSH); child-origin
  pop-to-restore re-pushes the exact pollDetail + commentAnchorId; deleted the restaurant 'polls' setRoot hardcode + the
  profile restore-arm-skip + the flush-skip. Regression sweep + `{polls,search}@collapsed` byte-identity CONFIRMED;
  watchdog never fires. KEPT the 2nd 'polls' hardcode as the byte-identical seam base (restore re-push layered after).
  Restaurant dismiss awaits owner finger-test; watch for double-dismiss.
- ✅ **§8 multi-location pins + sheet-aware camera** — gaps #1/#3/#4 already existed (catalog one-pin-per-location;
  closest-to-user anchor; backend market-scoping via ST_Covers). Gap #2 (band = MIDDLE snap) FIXED in the SHARED
  resolveProfileCameraPadding (paddingTop=searchBarBottom, paddingBottom=screenHeight−middleSnap). Verified via
  result-card path (Joe's Pizza, 2 in-market locations, band-centered).
- ⬜ **Owner finger-test** (the gold gate) → then **6** (delete dead fork — interacts with the restaurant held-leg),
  **7** (dismiss-seam generalization — RISKIEST, plan-gated LAST behind this verification).

**Provenance:** synthesized from three candidate designs (mechanism-first, permutation-first,
failure-first) + an adversarial red-team that instrument-verified the load-bearing code claims.
The red-team's central finding — *only the search-surface redraw path emits readiness gates today*
— reshapes the phase order: **gate-producer instrumentation is the critical path**, not scaffolding.

---

## 1. NORTH STAR

### The one-path principle

There is exactly **one reveal verb**, **one dismiss verb**, **one readiness contract**, **one
descriptor table**, and **one origin-carrying back-stack**. Every reveal (search-to-results,
entity-from-comment, restaurant-from-comment, favorite-list-open, poll-open, discussion-reveal)
and every dismiss differs **only in the params it fills into the descriptor** — never in the code
path it takes.

```
revealRoute(descriptor: RevealDescriptor): void   // PUSH onto OverlayRouteStack
dismissActiveRoute(): void                          // POP-to-restore from OverlayRouteStack
```

The architecture inverts the current one. **Today the presentation surface (results lifecycle vs
profile-preview lifecycle) implicitly decides chrome, snap, marker-seeding, and dismiss-arming, and
the launch-intent branch picks the surface.** That implicit-surface coupling is the single root
cause of all four Bug-1 failures: restaurant-from-comment inherited a *different surface's* defaults.
In the canonical engine the **descriptor declares those axes explicitly and orthogonally**, and the
surface is a renderer that consumes already-decided state. Remove the surface as a decision-maker and
the divergence cannot exist.

### Invariants every transition/dismiss MUST satisfy

1. **No call-site handoff value.** No `swapImmediately` / `preserveOutgoingUntilSettle` is ever passed
   at a call site. `resolveContentHandoff` / `resolveMotionPlanes` collapse to a pure table lookup.
   Opt-outs are structurally impossible.
2. **No bespoke lane.** There is no `openRestaurantProfilePreview` reveal path, no `'polls'` dismiss
   hardcode, no parallel prepared-profile dismiss transaction.
3. **Seeded ⟹ instant non-blank shell.** Any scene marked `seeded` MUST paint a coherent shell from
   route params in the first frame (seeded header + skeleton, zero awaited data). This is what makes
   `swapImmediately` safe — there is never a blank frame to hide.
4. **Completion is owned by real rendered evidence, with a guarded co-completer.** The `'content'`
   motion plane settles when its declared readiness gates close (real paint), **or** when the
   token-guarded crossfade ramp `onFinish` fires — whichever first; the other is a no-op. A timer is a
   never-hit liveness watchdog, never a primary completer.
5. **A content plane is armed ONLY when a crossfade will actually run.** Gate the `'content'` plane on
   `contentHandoff === 'preserveOutgoingUntilSettle'` (an outgoing leg is held and will cross-fade).
   Seeded `swapImmediately` opens arm **no** content plane — so they can never fall to the watchdog.
6. **Every reveal is a PUSH; the whole chain is push-based.** `[polls, pollDetail, restaurant]` must
   be a real stack so dismiss can pop to the exact origin. The push rule applies to the *poll-open
   that precedes the comment tap*, not only the restaurant reveal. No reveal uses `setRoot`
   (which unconditionally resets the stack).
7. **Open-snap and return-snap are distinct, explicit, and never sampled from a transient live-Y.**
   The forward-open snap comes from the descriptor (`promoteAtLeast:middle` for cross-surface). The
   return snap comes from the popped entry's `restoreState.snap`. Neither reads a live sheet Y that a
   prior `setRoot` may have disturbed.
8. **The deadlock seam is preserved byte-identically.** The `{polls,search}@collapsed` dismiss boundary
   must emit the byte-identical plan it emits today (`closeChild`/`preserveLiveY` → `motionPlanes=[]`
   → synchronous idle). Generalization is purely additive for non-collapsed origins. Proven by a
   serialized-payload diff, not by reasoning.
9. **One intent consume per reveal, synchronous, before the state write.** `revealRoute` consumes the
   launch intent synchronously before any `setRoot`/`submitSearch` state write, so the launch-intent
   effect (keyed on `activeMainIntent.type`) cannot re-fire and re-enter (the documented infinite
   push/dismiss loop).

---

## 2. CANONICAL ARCHITECTURE

Three composable layers. Each subsumes machinery already built this session.

### Layer 1 — The Readiness Contract (the spine that replaces the timer)

Every scene declares a contract (the type already exists at
`app-route-scene-descriptor-contract.ts:94`):

```ts
SceneReadinessContract = {
  requiredContentGates: SceneReadinessGate[]   // AND-join that settles the 'content' plane
  loadingGates?: SceneReadinessGate[]          // gates whose absence shows a skeleton
  requiredRestoreGates?: SceneReadinessGate[]  // gates for return-to-origin (Layer 3 dismiss)
}
```

`SCENE_READINESS_CONTRACT_BY_TARGET` (today hardcoded to search only) gains a row per scene:

| scene | requiredContentGates | content plane armed? |
|---|---|---|
| search / searchRoute / restaurant-as-search / favorites-as-search | `cards`, `nativeMarkerFrame`, `sheet` | YES (held crossfade) |
| pollDetail | — (seeded, swapImmediately) | NO |
| pollCreation / saveList | — (seeded) | NO |
| profile (tab) | — (seeded) | NO |

**The crucial subsumption:** the collector `markSceneContentGate` (built this session, observe-only)
is **promoted to driver**. When all `requiredContentGates` for the in-flight scene close, it calls
`completeRouteSceneSwitchMotionPlane(settleToken, 'content')` — completion on real paint, not a clock.

**The link the red-team proved is missing:** `markSceneContentGate` keys on the *redraw*
`transactionId` (`"search-surface-results-transaction:N"`); the motion plane keys on the *settleToken*.
They are **independent counters**. The driver flip requires:
1. At content-plane arm time (`commitRouteSceneSwitchTransition`, controller ~1268), record the link
   `{redraw transactionId → settleToken, contract}`, keyed also by `targetSceneKey`.
2. In `markSceneContentGate`, on all-gates-satisfied, resolve the linked `settleToken` and complete it.
3. **Check-on-arm**: search gates can close *before* the switch goes in-flight (data loads during
   `prepareSearchRequestForegroundUi`). At arm time, immediately test whether the contract is already
   satisfied for the redraw txn and settle synchronously if so. The collector must accumulate from
   submit-time (it already does, controller:599).

**The red-team's critical constraint (drives the whole phase order):** *only `search-surface-runtime.ts`
emits gates today* — exactly three producers (`:606/618/624` → `cards`, `nativeMarkerFrame`, `sheet`),
all inside the search redraw transaction. No `pollDetail`/profile/saveList/pollCreation scene emits any
gate. **Therefore: flipping the collector to driver is only safe for scenes that arm a content plane,
i.e. the search-family scenes whose producers already exist.** Seeded scenes (pollDetail etc.) arm no
content plane (Invariant 5) so they need no producers and no gates — their `requiredContentGates` row is
empty and their `requiredRestoreGates` row (poll readiness) is for dismiss only. This resolves the
red-team's "gate producers don't exist" finding: **we never give a non-search forward open a non-empty
content contract.** The only producer work needed is on the *committed restaurant search* (which reuses
the existing search-family `cards/nativeMarkerFrame/sheet` producers) and the *dismiss restore gates*
(poll readiness, which already has its producer at scene-stack-runtime:1273).

### Layer 2 — The Descriptor Table (one row per scene, no opt-outs)

```ts
TransitionDescriptor = {
  seeded:     boolean      // can paint own shell this frame → swapImmediately, no content plane
  snapPolicy: 'promoteAtLeast:middle' | 'snapTo:expanded' | 'snapTo:collapsed' | 'preserveLiveY'
  contract:   SceneReadinessContract
  chrome:     'results' | 'default' | 'preserve'   // drives shortcut fade
  mapSource:  'committed' | 'none'                 // committed = real result-set projection
  origin:     'capture' | 'preserve' | 'none'      // Layer-3 back-stack behavior
}
```

`resolveContentHandoff` and `resolveMotionPlanes` become table lookups. The `'content'` plane is pushed
**iff** `seeded === false` (⟺ `contentHandoff === 'preserveOutgoingUntilSettle'`, Invariant 5).

This subsumes `SEEDED_FORWARD_OPEN_SCENES` (built this session) but **corrects one membership:
`restaurant` is REMOVED from the seeded set.** A restaurant reveal is a *committed single-restaurant
search presented as a profile* — `seeded:false`, `chrome:'results'`, `mapSource:'committed'`. See §4 for
why this fixes three Bug-1 failures by construction.

### Layer 3 — The Origin-Carrying Back-Stack (the unified dismiss)

`OverlayRouteEntry.restoreState` (shape built this session at `app-overlay-route-types.ts:374`, currently
**write-only**) gains a **read side** and a real child anchor:

```ts
restoreState = {
  snap:         BottomSheetSnap                                    // the snap the origin sheet was at
  scrollOffset: number                                            // thread scroll position
  childAnchor:  { sceneKey: 'pollDetail', pollId, commentId } | null   // the EXACT comment
}
```

`dismissActiveRoute()` pops the reveal entry and restores the origin entry **as a child push back onto
the stack** (NOT a `topLevelSwitch` to a child key — that is undefined; the origin pollDetail must still
be on the stack beneath the reveal). It restores scene + snap + scroll-to-comment.

**The childAnchor plumbing is multi-layer, not one field** (red-team must-fix 6): `commentId` lives in
`PollDetailPanel`'s tap handler and must be threaded through `LaunchIntent` (`app-route-types.ts`) →
`dispatchLaunchIntent` → `activeMainIntent` → the launch-intent effect → `captureSearchSessionOrigin`
(which today reads only `rootOverlayKey`, controller:199). Budget ~5 sites.

### The PREPARE → ADMIT → SETTLE engine

`revealRoute(descriptor)` runs three deterministic phases — seeded-vs-loading is a *branch inside
ADMIT*, not a different lifecycle:

**PREPARE (synchronous, one frame):**
1. **Consume the launch intent synchronously** (Invariant 9), then capture origin
   (`captureOriginAnchor()`, including childAnchor).
2. **PUSH** the new `OverlayRouteEntry` (NOT `setRoot`); stamp `restoreState` on the leaving top entry
   (`resolveLeavingEntryRestoreState`, already wired).
3. Paint: seeded → `swapImmediately` (no held outgoing); non-seeded → hold outgoing under
   `preserveOutgoingUntilSettle`.
4. Apply `snapPolicy` deterministically from the descriptor (never sample live-Y for cross-surface).
5. Apply `chrome` → flip `backdropTarget`/`chromeMode` directly from the descriptor.
6. Apply `mapSource` → for committed reveals the markers flow through the normal committed projection.

**ADMIT (the readiness join):** content plane armed iff `seeded === false`. Collector drives completion
(Layer 1) with the token-guarded ramp `onFinish` as co-completer. Seeded scenes commit to idle
synchronously — no plane, no timer.

**SETTLE:** on content-plane completion (or watchdog), idle, `isInteractive = true`, restore-arm recorded.

---

## 3. PERMUTATION TABLE

Axes: **seeded?** (paint own shell this frame) × **snap** × **map/pin** × **chrome (shortcut fade)** ×
**return target on dismiss**. Rows 2/3/4/6 are *the same operation with different payloads*.

| # | Reveal | seeded? | Snap (open) | Map / pin | Chrome (fade?) | Return-to-origin |
|---|--------|---------|-------------|-----------|----------------|------------------|
| 1 | search-to-results | no (gated) | `preserveLiveY` (same sheet, user-dragged) | committed result markers, gated | **fade** (`backdrop='results'`) | n/a (stays in search) |
| 2 | entity-from-comment | no (gated) | `promoteAtLeast:middle` | entity-scoped result markers, gated | **fade** | pollDetail @ snap, scroll-to-comment |
| 3 | **restaurant-from-comment** | **no (committed single-restaurant)** | `promoteAtLeast:middle` | **committed length-1 projection** (the restaurant) | **fade** | pollDetail @ snap, scroll-to-comment |
| 4 | favorite-list-open | no (gated) | `promoteAtLeast:middle` | list markers, gated | **fade** | bookmarks @ snap |
| 5 | poll-open | **yes** (seeded header + comment skeleton) | `snapTo:expanded` | none (no map projection) | no fade (no search session) | polls feed @ snap, scroll-to-card |
| 6 | discussion-reveal | depends on target (→ row 2 or 3) | middle | per target | fade | pollDetail @ snap, scroll-to-comment |
| 7 | restaurant-from-result-card | no (committed) | `preserveLiveY` (same sheet, user-dragged) | committed (already on map) | already faded | results @ snap, scroll-to-card |

**The three structural columns:**

- **Snap.** Two legal values only: `preserveLiveY` *only* when origin and target share the same live
  sheet the user physically dragged (rows 1, 7); `promoteAtLeast:middle` for every cross-surface reveal
  (rows 2–6). **There is no conditional "preserve if not-programmatically-moved" predicate** — that
  predicate has no backing state and is a latent snap-drop generator (red-team 2.2). Cross-surface ⟹
  explicit middle, full stop.
- **Chrome.** "Fade" ⟺ the reveal commits a results page (`backdropTarget='results'`). Row 3 commits a
  single-restaurant results page → fade. Row 5 (poll) is not a search session → no fade (correct).
- **Map/pin.** All "committed" — including row 3. The restaurant is the *committed result*
  (`committedRestaurants.length === 1`), so the pin renders via the normal committed projection. This
  **deliberately abandons** the `isSeededRestaurantProjection` (`length === 0`) seeded-pin path for the
  restaurant reveal, eliminating the projection-live race entirely (red-team must-fix 2).

**Resolution of the seeded-vs-committed contradiction (red-team must-fix 2, cuts Designs 1 & 2):** a
restaurant profile cannot be both `seeded:true` (swapImmediately, no content plane, no readiness join,
instant shell) AND "runs the committed results join for chrome+pin." **We pick committed.** Row 3 is
`seeded:false`. The one-frame gap before the single result loads is covered by a `loadingGates` skeleton
(`SceneLoadingSurface` rowType=restaurant). The committed path gives chrome-fade + pin + readiness gates
for free and avoids the seeded-projection race.

---

## 4. THE FOUR BUG-1 FAILURES — ROOT CAUSE + FIX

All four share one root: **the restaurant-from-comment branch routes through the profile-PREVIEW
lifecycle (`openRestaurantProfilePreview`) instead of the committed search-results lifecycle.** Fix the
root and three failures vanish by construction; the fourth needs the back-stack.

### Failure 1 — SNAP drops to lowest
**Cause:** `openRestaurantProfilePreview(id, name)` with no options → `forceMiddleSnap=false` →
`preserveSheetMotionOnOpen=true` → normalizer emits `sheetMotion:{kind:'preserveLiveY'}`
(`app-route-profile-route-intent-normalizer.ts:100-102`). It samples a live-Y already collapsed by
`prepareSearchSessionEntry`'s `setRoot`. The natural restaurant openChild default
`{kind:'promoteAtLeast',snap:'middle'}` (policy-runtime:218) is overridden.
**Fix:** restaurant becomes `seeded:false`, `snapPolicy:'promoteAtLeast:middle'` from the descriptor
table — an explicit open-snap, immune to the prior collapse. `preserveLiveY` is illegal for a
cross-surface reveal (Invariant 7).

### Failure 2 — seeded PIN never renders
**Cause:** the preview path publishes a seeded marker from profile hydration, but it only paints when
`isSearchVisualProjectionLive` is true at that frame, which races the `setRoot` teardown; and
`isSeededRestaurantProjection` requires `committedRestaurants.length === 0`, which stale committed
results can violate (`use-direct-search-map-source-controller.ts:1219-1221, 1255-1275`).
**Fix:** the restaurant *is* the committed result (`length === 1`) → it renders via the normal committed
projection, no seeded-projection gate, no race. `nativeMarkerFrame` becomes a required content gate, so
the crossfade does not settle until the pin actually acks. **This must still be instrument-verified
on-device** (per CLAUDE.md — runtime attribution, not code-read): `[PINSEED]` Metro markers around the
projection + lodev `renderP` for the pin layer during a real comment-span tap (manual; inline spans
cannot be Maestro-driven).

### Failure 3 — shortcut buttons never fade
**Cause:** shortcuts are gated on `chromeMode==='results'` ⟺ `effectiveBackdropTarget==='results'`,
which only the committed-results lifecycle sets. The preview path never commits a results page, so
`backdropTarget` stays `'none'` → `chromeMode='default'` → shortcuts stay visible
(`results-presentation-shell-visual-runtime.ts:82`; `use-results-presentation-shell-model-runtime.ts:103-108`).
**Fix:** `chrome:'results'` in the descriptor flips `backdropTarget='results'` via the same lifecycle
favorites/entity use. A `PresentationArbiter` (`resolvePresentationTarget`: `entityType==='restaurant'`
+ single result → profile body) shows the **profile body over the results backdrop** — a tri-state
(results backdrop for chrome + profile body for content + single committed restaurant for pin) that must
be made expressible (red-team 2.4; the profile-preview and results paths are disjoint today). This is the
crux of fixing #2 and #3 simultaneously without showing a stray results list.

### Failure 4 — DISMISS axios crash + no return-to-comment + app unreactive
**Causes (compound):**
- Origin-restore is never armed for a profile dismiss: `terminalDismissSource==='profile'` skips
  `armSearchCloseRestore` (`use-results-presentation-close-transition-intent-runtime.ts:77-83`), so
  `capturedOriginContext` is stranded.
- Two un-unified dismiss systems (prepared-profile close vs route-switch origin-restore) both fire →
  double-dismiss.
- `restorePendingOrigin` is **root-only** and coerces `polls→search` (controller:274), and
  `createCurrentOriginContext` captures `rootOverlayKey` only (controller:199) — so dismiss lands on
  polls **HOME**, not the originating comment.
- Returning to polls HOME refetches the feed with panned bounds → the "fail to load polls" axios throw
  (`polls-feed-runtime-controller.ts:219`).
**Fix:** one `dismissActiveRoute()` pop-to-restore reading `restoreState.childAnchor`. There is one
profile (presented over results) → one dismiss. Return to the **exact pollDetail entry** (a specific
poll, no feed refetch → no axios) at the captured `middle` snap, scrolled to the comment. Delete both
`'polls'` hardcodes. Delete the `terminalDismissSource==='profile'` restore-skip branch.

**Critical red-team caveat (must-fix 4):** returning to a poll comment *is* returning to a poll, so the
dismiss still hits `completeDismissHandoff`'s poll-readiness weld (`pollHeaderReady && pollBodyReady &&
pollHostReady`, search-surface-runtime:201-203), whose only producer is the poll-page mount
(scene-stack-runtime:1273). The synthesis must **prove the poll-readiness gate is satisfiable from a
restaurant-origin dismiss** (poll page re-mounts, reports ready) AND that the re-mount triggers **no
polls-FEED refetch**. The `{polls,search}@collapsed` byte-diff (the home case) is necessary but
*insufficient* — the crashing transition is `{restaurant→pollDetail-comment}`, a different transition
that must be separately attributed instrument-first before claiming fixed.

---

## 5. FALLBACKS & DEFERRED-ITEM VERDICTS

### The 320ms content-settle timeout — DELETE as completer; KEEP renamed as a never-hit watchdog
Today `CONTENT_SETTLE_TIMEOUT_MS=320` (controller:621) is a live `setTimeout` completer that fires
on-device, because seeded `swapImmediately` opens arm a content plane (`resolveMotionPlanes` doesn't
check `contentHandoff`) with a null `contentTransitionToken`, so no ramp ever completes the plane → the
timer is the only completer. **Two changes:**
1. **Gate the content plane on `seeded===false`** (Invariant 5). Seeded opens never arm an
   uncompletable plane → the most common fallback fire is killed at the source.
2. **Promote the collector to driver** (Layer 1) with the `transactionId↔settleToken` link + check-on-arm.
Rename to `SCENE_READINESS_LIVENESS_MS`, raise to ~600ms, demote to a watchdog that guards the
non-delivery-guaranteed Reanimated `onFinish`. **DoD: instrument on-device; confirm it never fires across
all permutations** — a fire is an error condition, not a path.

**DO NOT delete the ramp `onFinish` completer (override of Design 3).** Keep it as a **token-guarded
co-completer** — whichever of {collector, ramp} fires first wins, the other is a no-op (already the
shape). Deleting it before gate producers are universal converts "320ms sometimes" into "600ms always"
for any forward open whose gates don't fire (red-team 3.1, must-fix 8). Co-completer until producers are
proven universal.

### The fork / relabel cluster — DELETE the (B) forward-open cluster; KEEP & rename (A)
- **(B) forward-open preserve/relabel/hold cluster** (`routeSwitchPreservedOutgoingSheetSceneKey`,
  `visibleOutgoingSceneKey 'search'→'polls'` relabel, `sheetShellPreservedFrameSceneKey`,
  `isForwardOpenHold`, `shouldHoldSearchDisplayForPollRestore`): **DELETE** — but **sequence it after
  pinning the held-outgoing-leg identity** (red-team must-fix 7). It is already dead for all seeded
  forward opens (all are `swapImmediately` → `resolvePreservedOutgoingSheetSceneKey === null`). The
  hazard: making restaurant `preserveOutgoingUntilSettle` while deleting (B) removes the mechanism that
  *names* the held leg (which must be `pollDetail` for restaurant-from-comment). Pin the held-leg
  identity explicitly → verify → then delete (B).
- **(A) `searchSurfaceOwnsVisibleSheet`**: **KEEP** — it stops being a "fork." It is the legitimate,
  single statement "the search surface owns the sheet during a results redraw/dismiss." Since all reveals
  now go through the search surface, it is the main line, not a branch. Rename to its real job
  (`holdOutgoingUntilIncomingPaints`) and fold into the readiness contract **as the final step**, after
  the collector drives completion — so frozen-results-during-redraw is reproduced by the contract.

### The {polls,search}@collapsed deadlock seam — GENERALIZE via NULL-DELTA, do it LAST
Earned the hard way (2026-06-22). The dismiss-readiness gate is poll-welded; `commitDismissBoundary` is
collapsed-only; `{polls,search}@collapsed` must stay byte-identical.
**Safe generalization:** make the dismiss gate a `requiredRestoreGates` contract (Layer 1) instead of a
weld. For the polls-collapsed case the contract resolves to the *exact same gate set*, so the emitted
bytes are unchanged. Other dismiss targets (restaurant→pollDetail-comment) declare *their* restore gates.
**Constraints:**
- The collapsed-poll restore MUST emit `closeChild`/`preserveLiveY` → `motionPlanes=[]` → synchronous
  idle. **A `snapTo` restore pushes the `'sheet'` plane and breaks byte-identity** (red-team must-fix 3,
  cuts Design 1 §4). The pop-to-restore for the collapsed case emits the identical empty-plane plan.
- **Verify by serialized-payload diff**, not reasoning: `[DISMISS-SEAM]` log of `commitDismissBoundary`,
  two recordings (old binary vs new), zero diff at collapsed — AND separately attribute the
  `{restaurant→pollDetail-comment}` transition (must-fix 4). Phase 7, LAST and RISKIEST.

### Stage 1-3 / Pillar 2 fold-up — STAYS DEAD (proven unnecessary)
The fold-up's only motivating case (a map-aware non-search scene gated on native readiness) does not
exist: every reveal rides the search surface, and the restaurant profile rides it as a *presentation of
a committed result*. Search-from-anywhere is the search bar's own gate; unified dismiss is a back-stack
problem (Layer 3), not a readiness-relocation problem. The surviving half — "one readiness contract for
all scenes" — IS Layer 1. Keep the diagnosis, bury the scene-fold.

### Deferred-by-decision items

| Item | Verdict | Why |
|---|---|---|
| Readiness collector → driver | **UN-DEFER (do early, after producers confirmed)** | Unblocks the 320ms kill + per-scene contracts + dismiss-gate generalization. Half-built. |
| `restoreState` read-side + childAnchor | **UN-DEFER** | Load-bearing for Bug-1 #4. Capture wired; only read/restore + childAnchor plumbing remain. |
| 320ms → readiness-driven + renamed watchdog | **UN-DEFER** | Direct consequence of the collector flip; "never fires" DoD now reachable. |
| Restaurant-from-comment → committed results lifecycle | **UN-DEFER (keystone)** | Fixes #1/#2/#3 by construction. The preview lane is the disease. |
| `(B)` forward-open relabel cluster deletion | **UN-DEFER (sequence after leg-identity pin)** | Dead for seeded opens; delete after the held-leg is named. |
| Both `'polls'` dismiss hardcodes | **UN-DEFER** | Direct cause of "polls home without the comment." |
| `(A)` fork fold into contract | **UN-DEFER (LAST cleanup, after collector drives)** | Reproduces frozen-results via the contract. |
| Realtime per-poll rooms (backend §8/Phase 8) | **STAYS DEFERRED** | Pure live-UX polish; global broadcast works; off the canonical-correctness path. |
| Autocomplete poll lane (backend §8/Phase 7) | **STAYS DEFERRED** | Standalone project with its own objective function; vocabulary now built but orthogonal. |
| Restaurant-profile poll/anecdote tabs (backend §11/Phase 9) | **STAYS DEFERRED** | Later-pass surfacing; no pipeline dependency. |
| §K child-scene draft-restore | **STAYS DEFERRED** | Lowest value; depends on the back-stack; revisit after Phase 6. |
| BE `buildEntityResults` extraction + endpoint | **STAYS DEFERRED** | Entity reveals already work via skip-LLM `selectedEntityId/Type`; refactor, not capability. |
| §6.2 per-comment exact-live LLM extraction | **STAYS DEFERRED** | Gazetteer-live is the plan-preferred path; adopt only if drift appears. |
| Soft-hold moderation for UGC | **STAYS DEFERRED (launch blocker, not dev blocker)** | Fail-open acceptable pre-launch; `pending` scaffolding exists to flip. |
| Backend: description-as-seed / Sunday-cron / gazetteer-attribute uncommitted diffs | **COMMIT (working-tree-only, could be lost)** | Built + verified; hold no design risk. **First confirm the §6.6 junk single-word attribute purge actually ran** before trusting attribute-axis live leaderboards. |

---

## 6. PHASED BUILD SEQUENCE

Dependency-ordered. Each phase has an on-device/harness-verifiable Definition of Done. The deadlock seam
is LAST behind a byte-identity gate. **Session work reuse is annotated per phase.**

> **Every on-device verify obeys CLAUDE.md:** force a fresh full bundle
> (`curl …AppEntry.bundle`, confirm `Bundled … (N modules)` with N in thousands) + a unique
> `[BUILDCHECK-vN]` marker; for native changes confirm installed binary mtime > the `.swift` edit;
> attribute via the lodev harness + Metro `[MARKER]` logs, never from screenshots alone.

### Phase 0 — Hygiene + contract scaffolding (no behavior change)
- Strip the live debug logs: `[BUG1]`, `[BUG1-HOST]`, `[CSETTLE]`, `[NP3]`, the `[stack]` log in
  `use-direct-search-map-source-controller.ts`. (Keep `[READYGATE]` intentionally for Phase 1–3 verify.)
- Add `SCENE_READINESS_CONTRACT_BY_TARGET` rows for every scene (search-family contentGates; seeded
  scenes empty contentGates + poll `requiredRestoreGates`). Additive, still observe-only.
- Commit the backend working-tree diffs (description-as-seed, Sunday-cron, gazetteer-attribute) **after**
  confirming the junk-attribute purge ran.
- **Reuse:** the collector + contract types + `SEEDED_FORWARD_OPEN_SCENES` (built this session).
- **DoD:** typecheck clean; `[READYGATE]` still logs only; no transition behavior changes (harness `mut`
  events identical before/after on a poll-open).

### Phase 1 — Gate the content plane on `seeded`; kill the seeded-open 320ms fire
- In `resolveMotionPlanes`, gate the `'content'` plane on
  `contentHandoff === 'preserveOutgoingUntilSettle'` (⟺ `seeded === false`). **Rework** of the
  session's `resolveMotionPlanes` (which currently arms it decoupled from handoff).
- **DoD (harness):** drive poll-open + pollCreation; confirm **no** `'content'` plane is armed for
  seeded opens (no `settleToken` minted, no 320ms timer scheduled) and the seeded shell paints in one
  frame. The 320ms stops firing for seeded opens.

### Phase 2 — Promote the collector to driver (search-family only)
- Record the `{redraw transactionId → settleToken, contract}` link at content-plane arm; add check-on-arm.
- `markSceneContentGate` completes the linked `settleToken` on all-gates-satisfied. **Keep the ramp
  `onFinish` as a token-guarded co-completer** (do NOT delete it).
- Rename `CONTENT_SETTLE_TIMEOUT_MS` → `SCENE_READINESS_LIVENESS_MS`, raise to ~600ms, watchdog only.
- **Reuse:** `markSceneContentGate` collector (built, observe-only) → flipped to driver.
- **DoD (harness):** search-to-results logs `[READYGATE] content-ready` *before* settle; `renderP` /
  `nativeMarkerFrame` confirm real paint; the watchdog NEVER fires across 20 search-to-results opens.

### Phase 3 — Descriptor table + verbs + childAnchor capture
- Collapse `resolveContentHandoff`/`resolveMotionPlanes` to pure table lookups; delete any call-site
  handoff value-passing. **Rework** the session's per-call-site deletions into a structural table.
- Introduce `revealRoute` (PUSH, synchronous intent-consume) and `dismissActiveRoute` (POP-to-restore)
  as the two verbs. **Convert poll-open to `revealRoute` (PUSH)** — Invariant 6: the whole chain must be
  push-based or the back-stack has nothing to pop to (red-team must-fix 5).
- Widen `LaunchIntent` + the dispatch chain to carry `childAnchor` (sceneKey + pollId + commentId);
  `captureSearchSessionOrigin` stores it (red-team must-fix 6).
- **DoD:** after poll-open then a comment-span reveal, the `OverlayRouteStack` is
  `[polls, pollDetail, restaurant]` (log stack depth); childAnchor carries the tapped `commentId`.

### Phase 4 — Restaurant-from-comment onto the committed results lifecycle (Bug-1 #1/#2/#3)
- **REVERT** the session's Bug-1 partial fix (the `openRestaurantProfilePreview` fire-and-forget branch
  in `use-search-foreground-launch-intent-runtime.ts:74-108`). **REMOVE `restaurant` from
  `SEEDED_FORWARD_OPEN_SCENES`.**
- Route the restaurant branch through `revealRoute` → a restaurant-only committed search
  (`entityType:'restaurant'`, skip-LLM via `selectedEntityId`), `chrome:'results'`,
  `snapPolicy:'promoteAtLeast:middle'`, `mapSource:'committed'`.
- Build the `PresentationArbiter` (`resolvePresentationTarget`: restaurant + single result → profile body
  over results backdrop) and make the **tri-state expressible** (results backdrop + profile body + single
  committed restaurant). Cover the one-frame gap with a `loadingGates` skeleton.
- **Multi-location pins + sheet-aware camera (see §8):** the committed single-restaurant result carries
  `.locations[]`; the catalog builder expands them to one pin per market-location; the **shared** camera
  primitive focuses the location closest to the user, centered in the band between the search-bar bottom
  and the MIDDLE-snap sheet top. Same primitive used by the regular result-card→profile tap.
- **Instrument the pin first** (`[PINSEED]` + lodev `renderP`) — runtime attribution before claiming
  fixed, per CLAUDE.md.
- **DoD (gold manual test — span taps cannot be automated):** tap a restaurant link in a poll comment →
  (#1) sheet lands at MIDDLE, (#2) **all** the restaurant's market locations render as pins with the
  closest-to-user one centered in the uncovered band (`renderP≥locationCount`, `roleGap=0`), (#3) shortcuts
  fade; tapping the same restaurant from a result card centers identically (shared primitive).

### Phase 5 — Dismiss pop-to-restore (Bug-1 #4, except the seam)
- Wire the `restoreState` read side; `dismissActiveRoute` pops to the origin entry, restores
  scene + snap + scroll-to-comment.
- Delete both `'polls'` hardcodes (`app-overlay-route-command-runtime.ts:77`,
  `app-search-route-command-runtime.ts:76`) and the `terminalDismissSource==='profile'` restore-skip.
- **Attribute the poll-readiness re-arm** (must-fix 4): prove the poll page re-mounts and reports ready
  from a restaurant-origin dismiss, and that the re-mount triggers **no** polls-feed refetch.
- **DoD (manual):** dismissing the restaurant returns to the EXACT pollDetail comment at the captured
  snap; **no axios "fail to load polls"; app stays reactive; search bar present.**

### Phase 6 — Delete the dead (B) cluster + fold (A)
- Pin the held-outgoing-leg identity for any `preserveOutgoingUntilSettle` reveal (name it explicitly) →
  verify → **then** delete the `(B)` forward-open relabel/hold cluster and the `'search'→'polls'` relabel.
- Fold `(A) searchSurfaceOwnsVisibleSheet` into the readiness contract as
  `holdOutgoingUntilIncomingPaints`.
- **DoD (harness):** search-to-results, results-redraw, results-dismiss, and poll-open all unregressed;
  no `'content'` plane orphaned; the watchdog still never fires.

### Phase 7 — Generalize the dismiss-readiness gate (RISKIEST, LAST, byte-identity-gated)
- Replace the poll-welded dismiss gate with a `requiredRestoreGates` contract. The collapsed-poll
  restore MUST emit `closeChild`/`preserveLiveY` → `motionPlanes=[]` (no `snapTo` plane).
- **Gate:** `[DISMISS-SEAM]` serialized `commitDismissBoundary` payload diff = **zero bytes** at
  `{polls,search}@collapsed` (old binary vs new), AND the `{restaurant→pollDetail-comment}` transition
  separately attributed non-deadlocking.
- **DoD:** collapse-dismiss polls↔search 20× with no unreactive freeze; zero-byte diff confirmed.
  **Then work ends.**

**Independence:** Phases 0–2 are shippable now (they harden every flow, no Bug-1 dependency).
Phases 3–5 are the Bug-1 fix and **must land together** (the descriptor table, the committed-reveal
restaurant, and the pop-to-restore dismiss are entangled). Phase 6 is cleanup gated on 3–5. Phase 7 is
behind the byte-identity gate. **No phase introduces a fallback; each removes one.**

### Session-work reuse map
| Built this session | Phase | Reused / Reworked / Reverted |
|---|---|---|
| `SEEDED_FORWARD_OPEN_SCENES` + `resolveContentHandoff` seeded axis | 1, 3, 4 | Reused; **restaurant removed** from the set |
| `resolveMotionPlanes` content-plane arm | 1 | **Reworked** — gate on `contentHandoff` |
| `markSceneContentGate` collector (observe-only) | 2 | **Reworked** — flipped to driver |
| `CONTENT_SETTLE_TIMEOUT_MS=320` | 2 | **Reworked** — renamed, raised, demoted to watchdog |
| `restoreState` shape + capture-on-leave (write-only) | 3, 5 | Reused capture; **read-side built**; childAnchor widened |
| Bug-1 restaurant launch-intent partial fix | 4 | **REVERTED** and rebuilt as committed reveal |
| `(B)` relabel/hold cluster | 6 | **DELETED** (after leg-identity pin) |
| `(A)` `searchSurfaceOwnsVisibleSheet` | 6 | **Reused**, renamed, folded into the contract |
| Two `'polls'` dismiss hardcodes | 5 | **DELETED** |
| Skeleton primitives (`SceneLoadingSurface`) | 4 | Reused (restaurant `loadingGates`) |

---

## 7. OPEN QUESTIONS THE OWNER MUST DECIDE

1. **Restaurant tri-state presentation.** Phase 4 needs "results backdrop (chrome) + profile body
   (content) + single committed restaurant (pin)" — a state that does not exist today (profile-preview
   and results paths are disjoint). Is the `PresentationArbiter` shaping this tri-state the intended
   unification, or do you prefer the restaurant reveal show a 1-row results list that taps into the
   profile (simpler, but a different UX)?
2. **Poll-readiness gate from a non-poll origin (Phase 5).** Returning to a poll comment re-arms the
   poll-readiness weld. Acceptable to require the poll page to fully re-mount + report ready on every
   restaurant dismiss (a visible re-render), or should the restored poll page be kept warm / cached so
   the return is instant?
3. **childAnchor scroll fidelity.** Return-to-the-exact-comment requires a measured scroll offset captured
   at reveal time. If the thread re-sorts or new comments arrive between reveal and dismiss, the offset is
   stale. Restore by `commentId` anchor (re-measure) or by raw offset (faster, can drift)?
4. **Watchdog value + DoD strictness.** Is `SCENE_READINESS_LIVENESS_MS=600` acceptable as a hard
   never-fire guard, and is "watchdog fires zero times across all permutations" the ship gate — or do you
   accept rare fires under cold-start/slow-network as non-blocking?
5. **Backend commit timing.** Commit the uncommitted polls diffs (description-as-seed, Sunday-cron,
   gazetteer-attribute) now in Phase 0, or hold until the §6.6 junk-attribute purge is confirmed run
   against the live DB (the attribute-axis false-endorsement risk)?
6. **`preserveLiveY` scope.** Confirm `preserveLiveY` is legal ONLY for same-sheet user-dragged opens
   (rows 1, 7). Any other open you want to preserve a dragged Y for would need an explicit carve-out —
   are there any?
7. **Market scoping of locations (§8).** Does `RestaurantResult.locations[]` already arrive scoped to the
   active market from the backend, or do we filter client-side? (Determines whether a chain in NYC+LA
   shows only NYC pins when viewing NYC. Verify in Phase 4.)

---

## 8. MULTI-LOCATION PINS + THE SHEET-AWARE CAMERA (shared primitive)

**Requirement (owner).** On *every* restaurant-profile reveal — the entity/comment reveal AND the regular
result-card→profile tap — the map shows **all of that restaurant's locations within the active market** as
pins, and the camera focuses the location **closest to the user**, centered in the **visible band between
the search-bar bottom edge and the sheet's top edge at the MIDDLE snap** (the area the sheet does not
cover). One shared primitive; no per-flow copies.

**Most of this already exists — reuse, do not rebuild:**
- **Data model:** a restaurant is one `Entity` with many `RestaurantLocation` rows; `RestaurantResult.locations[]`
  carries all of them (per-location lat/lng + googlePlaceId + isPrimary) [schema.prisma:96-127;
  packages/shared/src/types/search.ts:115-155].
- **Location resolution:** `resolveRestaurantMapLocations(restaurant)` returns all valid, deduped locations
  [restaurant-location-selection.ts:78-134]; `resolveRestaurantLocationSelectionAnchor` /
  `pickClosestLocationToCenter` already do closest-to-user/anchor selection (read `userLocation` +
  `viewportBoundsService`).
- **Camera padding IS supported + wired:** `<MapboxGL.Camera padding={{paddingTop,paddingBottom,…}}>`
  [search-map.tsx:671-686] — a coordinate can be centered in a sub-region.
- **Layout values are JS-side:** `searchBarTop`/`searchBarHeight` + `snapPoints.middle`/`.expanded`.
- **`userLocation`** is already a prop on the map controller.
- **Both flows already share** `resolveProfileCameraPadding` / `resolveProfileCameraSnapshot`
  [profile-camera-presentation-runtime.ts] — so fixing the shared function standardizes both at once.

**The four gaps to close:**
1. **Emit ALL market-locations as pins, not one.** Today `publishHydratedRestaurantMarkerSource` publishes a
   single restaurant (primary coord → one pin) [profile-panel-hydration-runtime.ts:40-65]; the committed
   projection likewise emits one pin per restaurant. FIX at the **catalog layer**
   (`buildMarkerCatalogReadModel`): expand a restaurant into one pin per market-location (shared restaurantId,
   keyed by locationId) — so BOTH the committed projection (Phase 4) and any seed get multi-location pins for
   free. (Per the master plan the restaurant rides the committed lane, so pins flow from the committed result's
   `.locations[]`, not a separate seed.)
2. **Band = MIDDLE snap, not expanded.** Today `resolveProfileCameraPadding` centers using `expandedSnapPoint`
   + a screen-height ratio [profile-camera-presentation-runtime.ts:48-61]. FIX: center the target in
   `[searchBarBottom, snapPoints.middle]` → `paddingTop = searchBarTop + searchBarHeight`,
   `paddingBottom = screenHeight - snapPoints.middle`. The focus pin lands at the center of the uncovered band.
   This is the **shared** fix → both flows inherit it.
3. **Focus the CLOSEST location to the user.** Thread `userLocation` into the camera-focus handler
   (`focusSeededMarkerCamera` gets only the `RestaurantResult` today), pick the focus coordinate via the
   existing closest-to-user logic, center THAT in the band.
4. **Market scoping (reconcile).** `resolveRestaurantMapLocations` returns ALL of a restaurant's locations with
   no market filter; the owner recalls "within-market" scoping (the anchor selection uses viewportBounds, but
   the location LIST is unfiltered). Verify whether the backend already market-scopes `locations[]`; if not,
   filter to the active market (marketKey / bounds) at one canonical point. (Open question §7.7.)

**The shared primitive:** `focusRestaurantLocationsInWindow({ restaurant, userLocation, searchBar, snapPoints,
screen })` → resolves market locations, picks closest-to-user, computes the middle-snap band padding, sets the
camera. The multi-pin emission lives in the catalog builder (gap 1) so it is shared automatically. Both the
reveal (Phase 4) and the result-card tap call it.

**Lands in Phase 4.** DoD (gold manual test): reveal a multi-location restaurant → all its market locations
show as pins; the closest-to-you pin is centered in the band between the search bar and the middle-snap sheet
top; identical when tapping that restaurant from a result card.
