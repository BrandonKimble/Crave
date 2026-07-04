# Handoff: Profile-Selection Flow (restaurant tap → profile presentation transition)

## Framing

This covers the **tap → profile presentation** transition: a marker/pin/label tap OR a results-row tap that opens a restaurant profile, drives an 800ms camera `easeTo`, and snaps the results sheet to middle. The transition rides the JS prepared-presentation pipeline + a `CameraIntentArbiter` + a native `ProfilePresentationTransactionExecutor.swift`. Per project ethos, the transition's settle behavior is a **runtime/timing** question (does the native completion event fire? does the deferred state flush?) — it must be **answered by a real on-device log, not static reading**, then choose re-port-the-graft vs JS-fallback. **The user's specific observed issues are NOT yet enumerated. Step 1 of the fresh session is to reproduce on-device and build the real issue list before fixing.**

## Current architecture (as-is)

**Two entry lanes, both landing on `ProfileOwner.profileActions`:**

- **Map tap** (pin/label/dot): native VA hit-test `labelVAHitTest` (`search-map.tsx:250,998`) → JS `SearchMapProfileCommandPort.openProfileFromMarker` (`search-map-protocol-contract.ts:16`), implemented in `use-search-root-profile-map-command-runtime.ts:30`. Full `restaurant` object → `openRestaurantProfile(...,{source:'results_sheet'})`; name-only → `openRestaurantProfilePreview`. Promotes a collapsed sheet to middle (`shouldPromoteProfileOpenToMiddle`, :13).
- **List-row tap**: `openRestaurantProfileFromResults` (`use-search-results-panel-card-render-runtime.tsx:120,182` → `use-search-root-profile-control-lanes.ts:36`).

Both converge on the prepared-presentation transaction pipeline (`apps/mobile/src/screens/Search/runtime/profile/`, ~90 files). Orchestrator `profile-prepared-presentation-transaction-runtime.ts` builds a transaction that (a) commits a camera target and (b) drives sheet/state. The camera command (`profile-native-command-runtime.ts:38`) calls `commitCameraViewport` with `animationMode='easeTo'`, `animationDurationMs=PROFILE_CAMERA_ANIMATION_MS=800` (`profile-camera-motion-constants.ts:1`), `deferControlledCameraStateUntilCompletion=true`, a `requestToken` → routes into the `CameraIntentArbiter` (`camera-intent-arbiter.ts`).

**Camera execution (critical):** the arbiter's `commandCameraViewport` (`use-search-runtime-camera-intent-runtime.ts:88`) tries `cameraRef.setCamera(...)` **FIRST** (:66-82) and only falls back to the native `PresentationCommandExecutor` if the ref is unmounted. Per the in-file comment (:99-102) the native host-registry executor "silently no-ops for plain camera stops." **So the profile camera move currently rides `cameraRef.setCamera`, NOT the native executor.**

**Completion path:** the 800ms `easeTo` is meant to settle via the native Camera's `onCameraAnimationComplete` (`search-map.tsx:619` → `handleCameraAnimationComplete` in `search-root-map-presentation-controller-runtime.ts:42` → `cameraIntentArbiter.handleProgrammaticCameraAnimationCompletion`). With `deferControlledCameraStateUntilCompletion=true` the arbiter parks controlled center/zoom in `pendingControlledCameraStateSync` and only flushes it + notifies the profile completion handler (`profile-native-completion-runtime.ts:25` → `preparedProfileCompletionHandlerRef` → `'camera_settled'`) when that event arrives (or a gesture cancels it, :103-120).

**The sheet half is live; the camera half is inert.** `ProfilePresentationTransactionExecutor.swift` DOES still drive the results-sheet snap via `executeSheetCommands` → `BottomSheetHostRegistryBridge` (that bridge exists). Only the CAMERA bridge is dead.

## Where to start

Open FIRST:

1. `use-search-root-profile-map-command-runtime.ts` — map-tap entry (sheet-promote + `openRestaurantProfile`).
2. `profile-prepared-presentation-transaction-runtime.ts` — the orchestrator (camera command + sheet + completion-handler wiring).
3. `profile-native-command-runtime.ts` — the 800ms `easeTo` command (`deferControlledCameraStateUntilCompletion=true`).
4. `camera-intent-arbiter.ts` — the settle-timing heart (pending-completion tracking, deferred flush, gesture-cancel).
5. `use-search-runtime-camera-intent-runtime.ts:66-102` — `cameraRef.setCamera` first / native fallback + the no-op comment.
6. `search-map.tsx:605-620` — the `MapboxGL.Camera` with the two graft-dependent props (`nativeHostKey`, `onCameraAnimationComplete`).
7. `ProfilePresentationTransactionExecutor.swift` — native executor: camera bridge INERT (:8-21 `NSClassFromString ?? nil`), sheet bridge live.
8. `patches/@rnmapbox+maps+10.2.9.patch` — the STALE graft to re-port.

**Reproduce on sim** (force a FULL Metro bundle + confirm a `[BUILDCHECK]` marker per CLAUDE.md): run a search so pins/results exist, then tap a pin/label AND separately a results-row. Watch the 800ms `easeTo` + sheet snap to middle, and whether the transition **settles** (map stops at target, sheet lands, no snap-back, no frozen ~150ms stall).

**Instrument FIRST — the single load-bearing test:** _does the native `onCameraAnimationComplete` event fire at all?_ (JS logs → `/tmp/crave-metro.log`, NOT os_log):

1. `search-map.tsx` `handleCameraAnimationComplete` — log on entry. **If it never logs, the graft re-port is confirmed necessary.**
2. `camera-intent-arbiter.ts`: log in `commit()` the `completionId` + `deferControlledCameraStateUntilCompletion`; log in `handleProgrammaticCameraAnimationCompletion()` whether it EVER fires + status; log the `setGestureActive()` cancel path. **Key question: does `handleProgrammaticCameraAnimationCompletion` ever run for a profile open?** If the native prop is dropped, it won't — `pendingControlledCameraStateSync` never flushes → `'camera_settled'` never emits → the prepared transaction may dangle its completion arm.
3. `profile-native-completion-runtime.ts:25` — log `handlePreparedProfileCameraCompletion` firing + status.

If (1) never logs, the transition currently settles ONLY via a fallback (gesture-cancel, or non-deferred state committed elsewhere) or is silently relying on `cameraRef.setCamera` having already moved the map while the completion arm dangles. Attribute exactly which arm releases the sheet/highlight, THEN decide: **re-port the graft** (restores the native completion event) vs **add a JS timer fallback** calling `arbiter.resolvePendingProgrammaticCameraAnimation` after `animationDurationMs` (it exists at `camera-intent-arbiter.ts:259` but has NO caller for this lane — grep confirms). **Do NOT static-guess** — answer the native-event question with a real log first.

## Known-open + fragile (verified, not invented)

- **The Camera graft patch does not apply to installed rnmapbox 10.3.1.** `patches/@rnmapbox+maps+10.2.9.patch` targets 10.2.9; installed is 10.3.1 (Camera source moved). `git apply --check` **fails**. The graft (`ProfilePresentationCameraHostRegistry.swift`, `RNMBXCamera.swift` hostKey/`onCameraAnimationComplete`/`animationCompletionId`/`applyProfilePresentationCameraCommand`, `Camera.tsx` `nativeHostKey`) is **ABSENT from node_modules** (grep finds 0 occurrences). So the native host-registry class is missing → executor's `dispatchProfilePresentationCameraCommand` returns false (`ProfilePresentationTransactionExecutor.swift:8-21`).
- **Exactly 2 tsc errors, both from the missing graft — compile-visible but runtime-inert** (extra JSX props are dropped by the RN view manager, not thrown): `search-map.tsx(607,11)` TS2322 (Camera props incl `nativeHostKey`/`onCameraAnimationComplete` not assignable to `CameraProps`) and `use-search-runtime-camera-intent-runtime.ts(79,9)` TS2353 (`animationCompletionId` not in `CameraStop`).
- **`onCameraAnimationComplete` likely never fires without the graft** → the arbiter's deferred controlled-state flush + profile `'camera_settled'` may never resolve via the native path. This is the fragile seam.
- **No JS timer/RAF fallback wires `resolvePendingProgrammaticCameraAnimation` for the profile lane** — if the native event is gone, the only settle triggers are gesture-cancel or another code path (grep found only the definition at :259, no caller).
- **`cameraCommandExecutionAvailable` is a false-positive**: `ProfilePresentationTransactionExecutor.swift:71` returns `true` unconditionally even though the dispatch fails at runtime; `search-map-native-camera-executor.ts:94` trusts that constant. Don't trust "available" as proof the native path works.

## Stale-context warnings (do NOT trust)

- Memory `map-1126-upgrade`'s "Camera patch re-port still pending (2 tsc errors, runtime-inert)" is **STILL ACCURATE** (verified: 2 tsc errors, patch does not apply, graft absent). Worth re-confirming the patch filename is `+10.2.9` while installed is `10.3.1`.
- Memory **implies the native `ProfilePresentationCameraHostRegistry`/`MapCameraAnimationCompleteEvent` are the active transition mechanism** — CLARIFICATION: they are **INERT for the camera**. The live camera path is `cameraRef.setCamera` (`use-search-runtime-camera-intent-runtime.ts:99-102` comment); the native executor is a documented no-op fallback. Do not assume the host-registry drives the camera today.
- **The SHEET half of the executor is live and unaffected** (`executeSheetCommands` → `BottomSheetHostRegistryBridge`). Memory does not distinguish the two halves — only the camera bridge is dead.
- **Do NOT use `timeout` in Bash here** — macOS lacks it (`command not found`), which produced a false "0 tsc errors" earlier. The correct count is 2. Run `npx tsc -p apps/mobile/tsconfig.json --noEmit` directly.
- `plans/profile-screen.md` is about profile **screen CONTENT** (poll activity/favorites/followers), **NOT** this presentation transition — do not conflate; it carries a stale superseded-note banner.

## Open plan items (verified)

- **Re-port the rnmapbox Camera graft to 10.3.1** (restores the native `onCameraAnimationComplete` event). VERIFIED still pending.
- **Decide the completion strategy** for the 800ms `easeTo`: re-port graft (native event) vs add a JS timer fallback (`arbiter.resolvePendingProgrammaticCameraAnimation`, currently uncalled for this lane) — choose **after** on-device attribution.
- `plans/presentation-transition-controller-spec.md`: the PTC cutover is a SPEC not yet fully landed — cleanup items to remove `isFilterTogglePending` writes (:281), remove `isInitialResultsLoadPending` as reveal authority (:290), remove `isVisualSyncPending`/candidate/ready/marker-commit fields (:304-305). These govern the results-sheet+map reveal coordination the profile presentation rides on.

## First-session checklist

1. Force a fresh FULL Metro bundle + `[BUILDCHECK]` marker; cold-launch. Do NOT measure HMR patches or a stale native binary (`stat` mtime vs source edit).
2. **Reproduce and enumerate the user's actual observed issues** — this list does not exist yet. Tap a pin AND a results-row; watch the 800ms camera + sheet snap for snap-back / stall / dangling highlight.
3. Run the single load-bearing log: does `handleCameraAnimationComplete` (`search-map.tsx`) fire for a profile open? Add the arbiter + completion-runtime logs alongside.
4. From the answer, choose **re-port graft** vs **JS timer fallback** — attribution first, no static guess.
5. Confirm `npx tsc -p apps/mobile/tsconfig.json --noEmit` = 2 errors (not `timeout`); expect them to clear only once the graft re-port lands.
