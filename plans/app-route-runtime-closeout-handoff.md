# App Route Runtime Closeout Handoff

Last reconciled: 2026-04-30.

Source plans:

- `plans/best-in-class-app-foundation-cutover-master-plan.md`
- `plans/search-runtime-ideal-shape-master-plan.md`

Promoted runtime baseline:

- `/tmp/perf-nav-switch-loop-scene-authorities-direct-dispatch-target.log`
- Average: `282.95ms`, complete `5/5`
- Generic route-switch notify/fanout owners were at or near zero.

## Closed Foundation Invariants

- App-route runtime owns the route-switch state machine and direct dispatch targets.
- Scene motion, scene-stack transition, native-overlay transition-state, and scene-authorities generic listener paths are deleted from the hot route-switch path.
- Native overlay identity/root/display/sheetPolicy/navigation/chromeMode/polls visibility no longer expose React subscription APIs for normal route switching.
- Chrome mode is now `getSnapshot()` plus `registerSharedValues(...)` only.
- Sheet/nav parity fixes are promoted: owned fallback sheet `sheetY`, docked-polls restore snap, frame-host nav cutout shared-value sync, and static-tab expanded fallback.
- Route overlay/scene snapshot contracts for navigation, display, sheet policy, visibility, scene switch, scene transition, and scene frame now live under `apps/mobile/src/navigation/runtime/**` instead of `screens/Search/runtime/shared/**`.
- Restaurant route session ownership moved one step out of Search: the local restaurant route session controller plus local/global restaurant route snapshot contracts now live under `apps/mobile/src/navigation/runtime/**`.
- Restaurant route policy/interaction ownership is also app-route owned: local restaurant policy/interaction controllers, their snapshot contracts, and restaurant route input/publication contracts now live under `apps/mobile/src/navigation/runtime/**`. Search remains a producer/composer for these inputs.
- Restaurant route panel-content ownership is app-route owned: the restaurant/local restaurant route runtime composition, local restaurant panel-content controller, and snapshot contract now live under `apps/mobile/src/navigation/runtime/**`. Search/profile publish the `restaurantPanelSnapshot` and suggestion progress through the app-route restaurant panel-content publication lane instead of the route controller subscribing to `SearchRuntimeBus`.
- Profile app-route boundaries are app-route owned where they are pure contracts, normalizers, or state updates: profile transition state, prepared-presentation transaction contracts, prepared profile snapshot builders, the prepared-presentation transaction resolver, the focused-camera prepared-presentation builder, transition-state mutations, open/close transition update helpers, dismiss/settle update resolvers, completion-update logic, command payload normalization, route-intent normalization, app-execution normalization, and generic app-execution runtime interfaces now live under `apps/mobile/src/navigation/runtime/**`. Search profile code remains the producer/executor, but the route-overlay-visible profile data contract, pure transaction builder logic, command/route/app execution normalization, and plain state-update helpers no longer live under `screens/Search/runtime/profile/**` or mixed Search prepared-results code.
- Stale ignored generated artifacts that still advertised deleted `sceneMotionAuthority` / `motionListeners` / `sceneStackTransitionAuthority` surfaces were removed from `apps/mobile/src/navigation/runtime/**` during closeout so future audits do not rediscover dead generated APIs.
- `scripts/app-route-runtime-delete-gate.sh` enforces the promoted deleted APIs/labels/paths.

## Intentional Remaining Subscriptions

These are not currently treated as delete candidates:

- `routeOverlayVisibilityAuthority.subscribe`: used by the local restaurant render-visibility controller. It did not appear as a material nav-switch owner in the promoted logs.
- `routeSheetHostSurfaceAuthority.subscribe`: used by sheet-host rendering to decide whether the scene-stack sheet surface is mounted.
- `routeSheetSurfaceBodyAuthority.subscribe`: used by the mounted sheet body surface to render actual body/chrome entries.

Do not remove these unless fresh attribution proves they are hot route-switch fanout and a direct target replacement exists.

## Still Open Architecture Work

- Continue re-homing non-Search route scene modules out of `screens/Search/runtime/**` only when the owner is concrete and not Search-specific. Remaining Search profile files are intentionally Search-owned adapters or scene-local owners: foreground/close hooks, prepared command/state executors, native command/transition/completion ports, hydration/focus/auto-open state, action ports, and profile presentation/view composition still call Search UI, SearchRuntimeBus, route command, native camera/sheet, or results sheet execution ports.
- Bookmarks and polls still need explicit scene-standard module templates in a future module-polish track. They should not be pulled into this runtime/performance closeout unless fresh profiling shows a hot parent listener/writer or a concrete route-level owner with low-risk migration value.
- Search-specific restaurant sheet visual/render/geometry hosts intentionally remain under Search/overlays because they own Search-scene presentation, masking, geometry, and visual composition. Restaurant route session/policy/interaction/panel-content state ownership has already moved to app-route runtime.
- Reduce Search root to composition-only ownership. It still composes many lower owners, even though the hot route-switch authority has moved out.
- Classify and contain freeze/frozen paths. Current freeze paths appear scoped to close handoff, recovery, run-one, response-frame, or restaurant content containment, but they have not been fully normalized into a formal scene-standard contract.
- Create the canonical new-scene contract/template after module ownership is cleaned up.

## Final Verification Evidence

Delete gates remain preserved:

- `yarn app-route:delete-gate`
- Result: `[app-route-runtime-delete-gate] OK (39 content checks, 29 path checks).`

Final nav-switch harness:

- Command: `EXPO_PUBLIC_PERF_HARNESS_RUNS=3 PERF_NAV_SWITCH_LOOP_TIMEOUT_SECS=240 bash ./scripts/perf-nav-switch-loop.sh`
- Log: `/tmp/perf-nav-switch-loop-nav-switch-loop-20260430T070733Z-03be.log`
- Result: exit `0`, marker complete `3/3`, step complete `12/12`.
- Step timings: average `282.9ms`, max `288.3ms`, p95 `286.2ms`.
- JS stalls: `0`; UI stalls: `0`; task sampler stalls: `0`.
- Top runtime owners remained small and expected: `navSwitchHarness:selectOverlayDispatchBoundary` max `8.8ms`, `navSwitchHarness:selectOverlayDispatch` max `8.7ms`, `routeSceneSwitchController:batchedSwitchCommit` max `3.7ms`.

Final successful search submit/close harness:

- Report: `/tmp/perf-shortcut-submit-close-report-20260430T070422Z-1a17.json`
- Log: `/tmp/perf-shortcut-loop-shortcut-loop-20260430T070422Z-1a17.log`
- Result: marker complete `3/3`.
- UI stalls: `0`.
- JS `stallP95`: `177.885`.
- JS max mean: `186.07`.
- Compared with `/tmp/perf-shortcut-submit-close-report-20260430T070116Z-3a52.json`, JS p95 was slightly better, UI stayed stable, and remaining JS work was still attributed to visible results hydration/list ramp rather than route runtime fanout.

Production-safe search hydration cut:

- `BottomSheetSceneStackListBodySurface.tsx` defers inactive secondary FlashList content by one animation frame.
- Inactive secondary list hydration is reduced with `drawDistance: 0` and `initialDrawBatchSize: 1`.
- Active search results list policy reduces `drawDistance` from `260` to `160`.
- The cut preserves the visible primary results path, does not hide FlashList, and does not reintroduce deleted runtime listener/subscription paths.

Backend harness unblock:

- `apps/api/src/modules/search/search-query.builder.ts` fixed the dish query `WITH` clause to include the `geographic_restaurant_vote_totals` CTE before `contextual_restaurant_scores`.
- This unblocked successful `/search/run` results for the shortcut-shaped submit/close harness.

Residual risk:

- Successful-results submit/close still has visible JS work in the results hydration window.
- Current evidence points to visible list hydration variance, not map/query math, backend query cost, or route-runtime fanout.
- UI stalls are `0` in the final successful-flow harness, so this is not currently a UI-thread regression.

## UI Parity Visual QA Addendum

First-run search pin reveal and close choreography:

- Proven event flow log: `/tmp/perf-shortcut-loop-shortcut-loop-20260430T155211Z-7cb6.log`
- Evidence: all 3 runs have `markEnterStarted`, `markEnterBatchSettled`, `marker_enter_settled`, `markExitStarted`, and `markExitSettled`.
- Root cause fixed: first-run enter could commit while the prepared map scene had no pin/dot/label sources, so native had no hidden batch to fade in.
- Live QA screenshots: `/tmp/crave-visual-qa-20260430T155627Z/event-frames-155952Z/`
- Live QA harness log: `/tmp/perf-shortcut-loop-shortcut-loop-20260430T155952Z-657a.log`
- Live QA report: `/tmp/perf-shortcut-submit-close-report-20260430T155952Z-657a.json`
- Run 1 visual sequence:
  - `run1_enter_executing.png`: no visible result pins at enter execution start.
  - `run1_enter_plus_150ms.png`: ranked result pins and dot markers are visible while results are revealed.
  - `run1_marker_enter_settled.png`: full result map presentation is settled.
  - `run1_close_requested.png`: pins are still visible at close request.
  - `run1_close_plus_150ms.png`: pins are gone while the sheet/nav surfaces are still visible.
  - `run1_mark_exit_settled.png`: search returns to the non-results map state.
- Live QA result: marker integrity complete `3/3`; JS `stallP95` `288.33ms`; JS max mean `297.8ms`; UI `stallP95` `56.15ms`; UI catastrophic stalls `0`.

Sheet, nav, frosty surface, and initial snap visual evidence:

- Initial frame: `/tmp/crave-visual-qa-20260430T155627Z/current-state.png`
- Evidence shows the app reload/search route is not fullscreen, the map remains visible, the sheet sits at a low/peek snap, the nav remains visually above/independent of the sheet, and sheet/nav/cutout surfaces are frosty/translucent rather than solid gray.
- The event-frame close sequence also shows the sheet-under-nav/frosty surface relationship during close.

Sheet drag/move verification status:

- Live touch automation could not attach to Simulator through Computer Use; the app returned `cgWindowNotFound`.
- `xcrun simctl` in this environment exposes screenshot/video/UI appearance controls but no touch/drag injection API, so drag remains a short human-check residual.
- Code-level continuity:
  - Old `main` gesture runtime drove sheet settling from gesture springs in `BottomSheetWithFlashList.tsx` (`startSpring(..., 'gesture')`) and downstream snap state accepted `meta.source === 'gesture'` for user snap persistence.
  - Current `useBottomSheetSharedGestureRuntime.ts` still drives expand/collapse pan end through `startSpring(..., 'gesture')`.
  - Current `useBottomSheetSharedSnapPublicationRuntime.ts` dispatches gesture snap changes through `notifySnapChange(...)` without the old non-hidden gesture snap suppression, so moved non-hidden snaps can publish and persist.
  - Current `useOverlaySheetSnapStateRuntime.ts` records `meta.source === 'gesture'` snaps via `recordUserSnap(...)`.

Map LOD/full-pin versus dot verification status:

- Live QA screenshots show full ranked pins and smaller dot markers coexisting during successful results reveal.
- Manual pan/zoom LOD driving remains a human-check residual because touch automation could not attach.
- Code-level continuity:
  - `SearchMap` keeps the same global `PIN_FADE_CONFIG` timing: `durationMs: 300`, `rankDelayFraction: 0.5`.
  - Dot, pin, rank, and label layers still multiply Mapbox opacity by native presentation and LOD feature-state expressions (`nativePresentationOpacity`, `nativeLodOpacity`, `nativeLodRankOpacity`, `nativeDotOpacity`).
  - `map-diff-applier.ts` still computes LOD pinned markers from viewport bounds, motion state, stability windows, and visible candidate buffer, then updates pinned marker metadata only when the LOD pinned key changes.

Deterministic residual-validation audit:

- Existing sheet snap control is programmatic, not gesture-equivalent: `AppRouteResultsSheetRuntimeOwner.animateSheetTo(...)` requests local sheet motion through `routeSceneMotionRuntime.requestLocalSheetMotion(...)`, which is useful for route/runtime transitions but reaches `startSpring(..., 'programmatic')`.
- True sheet drag persistence is owned by the gesture path: `useBottomSheetSharedGestureRuntime.ts` calls `startSpring(..., 'gesture')` at pan end, `useBottomSheetSharedSnapPublicationRuntime.ts` now forwards non-hidden gesture snap changes through `notifySnapChange(...)`, and `useOverlaySheetSnapStateRuntime.ts` records `meta.source === 'gesture'` through `recordUserSnap(...)`.
- Because the existing harness observer does not expose a gesture-source snap driver, adding a programmatic snap loop would validate the wrong source and would not close the drag/move residual better than the code-level evidence above.
- Existing map camera control is also programmatic: `CameraIntentArbiter.commit(...)` and `useSearchMapNativeCameraExecutor(...)` can move the camera, but `map-interaction-controller.ts` intentionally treats non-gesture camera movement as non-user exploration and avoids the gesture-only map-moved/search-area path.
- The LOD planner itself is still deterministic from viewport bounds and motion state in `map-diff-applier.ts`, but the current safe harness ports do not expose a touch-backed pan/zoom session or a harness-owned native gesture event source. A synthetic camera loop would not prove the requested manual LOD pan/zoom behavior without adding a new diagnostic/debug surface.
- No new diagnostic surface was added in this closeout pass; the remaining drag and pan/zoom items stay as short human-check residuals unless the parent authorizes a separate harness-only debug port.

## Commit Readiness Manifest

Validation rerun on 2026-04-30:

- `yarn app-route:delete-gate`: OK, 39 content checks and 29 path checks.
- `yarn workspace @crave-search/mobile tsc --noEmit`: OK.
- `yarn workspace api tsc --noEmit`: OK for the backend CTE touch.
- Mobile targeted lint, non-fixing: `yarn workspace @crave-search/mobile eslint App.tsx App.js src/navigation src/overlays src/perf src/screens/Search --ext .ts,.tsx,.js`; result 0 errors, 58 warnings.
- API targeted lint, non-fixing: `yarn workspace api eslint src/modules/search/search-query.builder.ts`; blocked before linting by repo ESLint resolver mismatch (`@typescript-eslint/no-unused-expressions` expecting `allowShortCircuit`). Treat API typecheck plus prior direct `/search/run` validation as the current backend validation unless the lint dependency graph is fixed separately.

Recommended staging groups:

- Runtime/performance closeout: app-route runtime ownership and delete-gate promotion files under `apps/mobile/src/navigation/runtime/**`, related Search route publication/control adapters under `apps/mobile/src/screens/Search/runtime/shared/**`, overlay runtime ownership files under `apps/mobile/src/overlays/**`, and the promoted deletions of old app-shell, scene authority, route overlay snapshot, polls sheet-control, and Search-local restaurant/profile contract paths.
- UI parity: frosty/composite search scene surface files, sheet snap publication/persistence files, search overlay route z-plane/sheet host files, bottom sheet list hydration policy files, Search map presentation/native owner files, and visible chrome components touched for nav/sheet/cutout/pin timing parity.
- Harness/scripts/docs: `scripts/app-route-runtime-delete-gate.sh`, `scripts/perf-nav-switch-loop.sh`, `scripts/perf-shortcut-loop.sh`, `scripts/perf-shortcut-loop-report.sh`, `package.json`, `apps/mobile/src/perf/**`, the shortcut/nav harness observers, and this handoff doc.
- Backend harness unblock: `apps/api/src/modules/search/search-query.builder.ts`.
- Intentional native/runtime cutover files: Android/iOS SearchChrome scalar/hit-target native modules, `UIFrameSamplerBridge.m`, `SearchMapRenderController.swift`, Xcode project registration, and the source `.ts`/`.tsx` files under `apps/mobile/src/screens/Search/runtime/native/`.

Artifact resolution before staging:

- `apps/mobile/App.js` has been restored to the tracked one-line `export { default } from './App.tsx';` shim and no longer appears dirty.
- Generated `apps/mobile/src/screens/Search/runtime/native/*.js` and `*.d.ts` neighbors are excluded by `.gitignore` (`apps/*/src/**/*.js` and `*.d.ts`); do not delete them and do not force-add them.
- `git status --short --untracked-files=all -- apps/mobile/src/screens/Search/runtime/native` should list only the intended `.ts`/`.tsx` source files.

Recommended next prompt:

`Stage and commit the validated Crave runtime/performance closeout changes, preserving the final handoff evidence and harness logs. If a new wave is needed instead, start a separate UI parity pass; do not reopen runtime cuts unless fresh attribution shows a concrete hot parent listener, subscription fanout, or writer.`

## Final Closeout Position

The runtime/performance foundation can be treated as closed at this checkpoint:

- the hot route-switch path is no longer organized around broad React listener fanout;
- deleted listener and compatibility paths are enforced by `yarn app-route:delete-gate`;
- route-owned native/scene/motion targets are the promoted switch architecture;
- restaurant route ownership and pure profile app-route contracts/normalizers have been moved out of Search-local ownership;
- remaining Search-local profile, restaurant visual, results, bookmarks, and polls work is scene/product/module-polish work unless new attribution proves a hot parent listener or writer.

## Closeout Standard

Runtime performance work should stop here unless a new profiler run shows a concrete parent listener/writer on the route-switch path. Future waves should focus on module boundaries and scene-standard contracts, not micro-optimizing direct native/Reanimated route-switch work.
