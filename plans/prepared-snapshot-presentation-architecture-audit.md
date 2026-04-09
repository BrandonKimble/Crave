# Prepared Snapshot Presentation Architecture Audit

Last updated: 2026-04-08
Status: active audit + cutover plan
Owner: Codex
Rough doneness: ~83%

## Objective

Define the ideal architecture for every choppy Search-screen presentation flow by moving from:

- JS/state-machine-driven visible transitions
- mixed JS + native ownership during hot presentation windows
- many local timing gates, refs, and timeout-based handoffs

to:

- JS-prepared immutable snapshots
- UI-thread/native-owned visible presentation execution
- one shared transaction model for reveal, dismiss, search-this-area rerun, and restaurant-profile transitions

This document is intentionally broader than the earlier map-only plans. The logs and code now show that the remaining stalls are not just a map problem. They are a cross-flow presentation architecture problem.

Current profile prepared-runtime note:

- `profile-transition-state-contract.ts` now owns the shared transition/shell type vocabulary, `profile-transition-state-mutations.ts` now owns the transition init/reset/snapshot-capture mutation helpers, and the deleted `profile-transition-state.ts` no longer mixes those layers into one umbrella host. `profile-runtime-state-record.ts` now stays on the internal profile controller-state record contract plus init helpers, while `profile-transition-state-record.ts`, `profile-close-state-record.ts`, and `profile-mutable-state-record.ts` now own the low-level transition, close, and mutable record operations respectively. The grouped runtime-state type surface now lives in `profile-runtime-state-contract.ts`, `profile-controller-shell-runtime-state-owner.ts` now owns controller-state creation plus shell selector/publication and transition-status writing, `profile-hydration-runtime-state-owner.ts` now owns the grouped hydration runtime lane, `profile-close-runtime-state-owner.ts` now owns the grouped close-state lane, `profile-owner-runtime-state-owner.ts` now owns the higher-level grouped runtime-state-owner assembly over those lower owners plus focus/auto-open/transition, and `profile-owner-runtime.ts` consumes that grouped owner directly instead of routing through the deleted `use-profile-runtime-state.ts` composer.
- `profile-camera-presentation-runtime.ts` now owns camera-padding resolution plus camera snapshot derivation, `profile-transition-snapshot-runtime.ts` now owns transition-snapshot capture math, and `profile-view-state-runtime.ts` now owns prepared snapshot-key derivation plus `profileViewState` assembly; `profile-presentation-model-runtime.ts` now just composes that lower presentation-model lane, so the mixed read-model cluster no longer sits behind another top-level controller wrapper and now terminates directly under `profile-owner-runtime.ts`.
- `profile-controller-shell-runtime-state-owner.ts` now owns the internal controller-state record plus shell selector/publication lane, `profile-hydration-runtime-state-owner.ts` now owns the grouped hydration runtime lane, `profile-close-runtime-state-owner.ts` now owns the grouped close-state lane, `profile-owner-presentation-view-runtime.ts` now owns the Search-derived presentation view surface with highlighted-route reads, prepared-snapshot reads, shell projection, presentation-model creation, and `currentMapZoom` derivation, and `profile-owner-native-view-runtime.ts` now owns `restaurantSheetRuntimeModel` extraction from the grouped native execution lane. The grouped native execution composition now lives under `profile-native-execution-model-runtime.ts`, and the grouped JS app execution composition now lives under `profile-app-execution-model-runtime.ts`; `profile-owner-execution-models-runtime.ts` now owns the higher-level grouped native/app/prepared execution composition, so the deleted `profile-owner-search-state-runtime.ts`, deleted `profile-owner-shell-state-runtime.ts`, deleted `profile-owner-state-runtime.ts`, deleted `profile-owner-execution-runtime.ts`, deleted `profile-owner-view-runtime.ts`, deleted `profile-owner-view-surface-runtime.ts`, deleted `profile-owner-presentation-runtime.ts`, deleted `profile-owner-publication-runtime.ts`, deleted `profile-owner-action-publication-runtime.ts`, and deleted `profile-owner-auto-open-effect.ts` no longer sit between those lower owner lanes and the live exported `useProfileOwner(...)` boundary. `profile-owner-runtime.ts` now stays on outward owner composition over those lower state, execution, view, and action owners, and the old `profile-presentation-controller.ts` layer remains deleted because the live app path no longer imports that wrapper at all.
- The deleted `profile-owner-query-action-state-runtime.ts`, deleted `profile-owner-selection-action-state-runtime.ts`, and deleted `profile-owner-runtime-action-state-runtime.ts` no longer sit between the lower action state lanes and the live grouped owner boundary. The deleted `profile-owner-presentation-action-port-runtime.ts`, deleted `profile-owner-refresh-selection-port-runtime.ts`, deleted `profile-owner-auto-open-action-port-runtime.ts` also remain gone, and the earlier deleted `profile-owner-action-port-runtime.ts`, deleted `profile-owner-action-link-runtime.ts`, deleted `profile-owner-action-resource-runtime.ts`, deleted `profile-owner-action-model-runtime.ts`, deleted `profile-owner-action-state.ts`, deleted `profile-owner-action-ports.ts`, and deleted `profile-owner-action-surface.ts` also remain gone. The deleted `profile-owner-action-state-runtime.ts`, deleted `profile-owner-action-execution-ports-runtime.ts`, deleted `profile-owner-action-context-runtime.ts`, deleted `profile-owner-action-execution-support-runtime.ts`, deleted `profile-owner-action-engine-runtime.ts`, deleted `profile-owner-linked-action-runtime.ts`, deleted `profile-owner-presentation-action-runtime.ts`, and deleted `profile-owner-refresh-close-action-runtime.ts` no longer sit between the lower owner-action lanes and the live owner boundary. `profile-owner-query-action-context-runtime.ts` now owns submitted-query/results reads plus query-key/label derivation, `profile-owner-selection-action-context-runtime.ts` now owns selection-state assembly, `profile-owner-runtime-state-runtime.ts` now owns runtime-state assembly, `profile-owner-action-state-ports-runtime.ts` now owns the lower state-mutation/action-state port lane, `profile-owner-action-external-ports-runtime.ts` now owns the lower app/native/prepared/analytics action-port lane, `profile-owner-refresh-selection-ports-runtime.ts` now owns refresh-selection ports, `profile-owner-auto-open-ports-runtime.ts` now owns auto-open ports, `profile-owner-presentation-actions-runtime.ts` now owns the lower preview/open/focus action lane, `profile-owner-runtime-actions-runtime.ts` now owns the lower refresh-selection/close runtime-action lane, `profile-owner-action-surface-runtime.ts` now stays on outward `profileActions` publication, and `profile-owner-auto-open-kickoff-runtime.ts` now owns auto-open execution plus the owner-level kickoff effect over that public action surface. The earlier deleted `profile-owner-action-runtime.ts` also remains gone, and the now-deleted `profile-owner-state-runtime.ts`, `profile-owner-execution-runtime.ts`, plus `profile-owner-view-runtime.ts` no longer sit between those lower lanes and the exported `profile-owner-runtime.ts` boundary, so the live owner path is down to the real lower owners plus the exported owner hook itself.
- `profile-action-models.ts` is now builder-only for the grouped profile action models, `profile-preview-camera-target-runtime.ts` now owns preview camera-target resolution, `profile-restaurant-focus-target-runtime.ts` now owns restaurant focus-target resolution, `profile-restaurant-camera-motion-runtime.ts` now owns restaurant camera-motion resolution, `profile-preview-presentation-plan-runtime.ts` now owns preview presentation-plan assembly, `profile-open-presentation-plan-runtime.ts` now owns open presentation-plan assembly, and `profile-focus-camera-plan-runtime.ts` now owns focus camera-plan assembly over those lower restaurant camera owners. `profile-preview-action-execution.ts` now owns preview presentation execution, `profile-open-action-execution.ts` now owns open presentation execution, `profile-focus-action-execution.ts` now owns focus presentation execution, `profile-preview-action-runtime.ts` now owns preview action runtime assembly, `profile-restaurant-action-model-runtime.ts` now owns the shared restaurant camera/open/focus action-model assembly, `profile-open-action-runtime.ts` now owns open action runtime assembly, `profile-focus-action-runtime.ts` now owns focus action runtime assembly, `profile-auto-open-action-runtime.ts` now owns auto-open model/resolution, and `profile-runtime-action-execution.ts` now owns close/refresh/auto-open runtime execution. The deleted `profile-presentation-action-runtime.ts`, deleted `profile-restaurant-camera-target-runtime.ts`, deleted `profile-action-runtime.ts`, deleted `profile-runtime-action-runtime.ts`, deleted `profile-owner-action-model-runtime.ts`, deleted `profile-owner-presentation-action-runtime.ts`, and deleted `profile-owner-refresh-close-action-runtime.ts` no longer sit between those lower presentation-action lanes, `profile-owner-query-action-context-runtime.ts` and `profile-owner-selection-action-context-runtime.ts` now own the grouped owner-action input lanes that still belong to the action lane, `profile-owner-runtime-state-runtime.ts` now owns the grouped runtime-state input lane, `profile-owner-action-state-ports-runtime.ts`, `profile-owner-refresh-selection-ports-runtime.ts`, and `profile-owner-auto-open-ports-runtime.ts` now own the grouped state/refresh/auto-open execution-port lanes, `profile-owner-action-external-ports-runtime.ts` now owns the grouped app/native/prepared/analytics execution-port lane, `profile-owner-presentation-actions-runtime.ts` now composes the lower preview/open/focus presentation-action surface directly over those dedicated preview/open/focus owners, `profile-owner-runtime-actions-runtime.ts` now composes the lower refresh-selection/close runtime-action surface directly over the shared runtime execution owners, `profile-owner-action-surface-runtime.ts` now stays on outward `profileActions` publication, and `profile-owner-auto-open-kickoff-runtime.ts` owns the remaining auto-open execution/kickoff lane over that public action surface.
- `profile-prepared-presentation-transaction-resolver.ts` now owns prepared snapshot-to-transaction resolution, `profile-prepared-open-presentation-builder.ts` now owns open transaction assembly, `profile-prepared-close-presentation-builder.ts` now owns close transaction assembly, `profile-prepared-focus-presentation-builder.ts` now owns focus transaction assembly, and `profile-prepared-presentation-transition-runtime.ts` now owns prepared open/close transition-record application against the transition state.
- `profile-prepared-presentation-transaction-contract.ts` now owns prepared transaction payload types plus execution-context/request-token helpers, `profile-prepared-presentation-dismiss-runtime.ts` now owns overlay-dismiss completion update resolution, `profile-prepared-presentation-settle-runtime.ts` now owns open-settle completion update resolution, and `profile-prepared-presentation-completion-executor.ts` now owns prepared completion-event execution over those lower completion owners.
- `profile-prepared-presentation-runtime-contract.ts` now owns the shared prepared runtime contract plus the grouped prepared transaction-executor type, `profile-prepared-presentation-transaction-contract.ts` now also owns the prepared command-execution payload vocabulary, `profile-prepared-presentation-command-executor.ts` now owns lower prepared command dispatch, `profile-prepared-presentation-state-executor.ts` now owns lower prepared state/phase transaction dispatch plus direct prepared transaction iteration, `profile-prepared-presentation-event-runtime.ts` now owns the prepared completion-event bridge, `profile-prepared-presentation-transaction-runtime.ts` now owns prepared runtime-arg assembly plus prepared transaction/completion execution, `profile-prepared-presentation-entry-runtime.ts` now owns prepared open/close/focus entrypoint assembly, and `profile-prepared-presentation-binding-runtime.ts` now owns completion-handler ref binding. The deleted `profile-prepared-presentation-action-runtime.ts`, deleted `profile-prepared-presentation-transaction-execution-runtime.ts`, and deleted `profile-prepared-presentation-executor.ts` no longer sit between those lower prepared lanes, and `profile-prepared-presentation-runtime.ts` now stays on thin composition over those lower owners.
- `profile-action-model-contract.ts` now owns the shared action/source/options/model vocabulary, `profile-action-runtime-port-contract.ts` now owns the action execution-port/runtime vocabulary, `profile-owner-runtime-contract.ts` now owns the outward owner/search-context contract surface, and the deleted `profile-presentation-runtime-contract.ts` no longer mixes those layers into one umbrella type host.
- `profile-owner-runtime.ts` is now the owner of the exported `useProfileOwner(...)` boundary and higher-level orchestration, including the direct native/runtime-state/app/prepared composition instead of leaving that lower execution lane behind another wrapper at the exported owner boundary. That runtime-state composition now happens directly there over the lower shell/transition/close/hydration/focus/auto-open owners, while `profile-runtime-state-contract.ts` owns the grouped runtime-state type surface.
- `profile-hydration-intent-runtime.ts` now owns profile hydration request sequencing plus active-intent policy, `profile-hydration-request-runtime.ts` now owns cache/in-flight request reuse plus profile-data loading, `profile-panel-seed-runtime.ts` now owns seeded panel hydration, and `profile-panel-hydration-runtime.ts` now owns async panel hydration flow over the lower panel snapshot mutation helpers in `profile-panel-hydration-snapshot-runtime.ts`. The deleted `profile-hydration-panel-runtime.ts`, deleted `profile-hydration-runtime.ts`, deleted `profile-mutable-runtime-state.ts`, and deleted `use-profile-runtime-state.ts` no longer sit between those lower hydration/focus/auto-open lanes; `profile-owner-runtime.ts` now composes first-class `hydrationRuntime`, `focusRuntime`, and `autoOpenRuntime` lanes directly, and `profile-runtime-state-contract.ts` owns their grouped type surface.
- `profile-app-execution-runtime-contract.ts` now owns the grouped JS app execution contract, `profile-app-foreground-runtime.ts` now owns foreground prep/restore, `profile-app-route-runtime.ts` now owns route intent, `profile-app-close-preparation-runtime.ts` now owns close hydration flush and pre-close cleanup, and `profile-app-close-finalization-runtime.ts` now owns close finalization policy. The deleted `profile-app-close-runtime.ts`, deleted `profile-app-execution-runtime.ts`, deleted `profile-app-shell-runtime.ts`, and deleted `profile-app-command-runtime.ts` no longer sit between those lower app owners and the live owner boundary because `profile-owner-runtime.ts` now composes the grouped `appExecutionRuntime` directly from the lower foreground/route/close owners plus the direct JS results-sheet/shared-snap/highlight command lane.
- `profile-native-completion-runtime.ts` now owns the native completion bridge, `profile-native-transition-runtime.ts` now owns native transition-state reads/writes, and `profile-native-command-runtime.ts` now owns native sheet/camera command transport; the deleted `use-profile-native-execution-model.ts` no longer sits between those lower native owners and the live owner boundary because `profile-owner-runtime.ts` now composes the grouped native execution boundary directly.
- `profile-shell-state-selector.ts` now owns the live `profileShellState` bus selector, `profile-shell-state-publisher.ts` now owns lower shell publication for camera padding and panel snapshot updates, and `profile-owner-runtime.ts` now owns the transition-status writer directly at the real composition point instead of routing through another shell wrapper. `profile-transition-runtime-state.ts` still owns transition-record access, `profile-runtime-state-contract.ts` owns the grouped runtime-state type surface, and the close runtime-state lane is split across `profile-close-policy-runtime-state.ts`, `profile-close-foreground-runtime-state.ts`, and `profile-close-finalization-runtime-state.ts`, so the deleted `profile-shell-runtime-state.ts` and deleted `use-profile-runtime-state.ts` no longer sit between shell publication and the live owner boundary.

## Locked Product Contract

This section is the UX contract we are preserving while changing architecture underneath it.

### Results reveal

Keep the current behavior:

- shortcut/manual submit reacts immediately
- sheet shell responds immediately
- buttons / chrome respond immediately
- results cards and map items do **not** need to appear instantly
- cards and map items reveal on their own time
- cards and map items must reveal **together and in sync**

Interpretation:

- shell response is immediate
- content reveal is deferred but synchronized
- the user should feel that the system reacted immediately, even if content reveal happens a moment later

### Results dismiss

Keep the current behavior:

- dismiss reacts immediately
- shell/chrome react immediately
- visible map/card content dismisses on its own time
- map/card dismiss remains synchronized

Interpretation:

- close starts instantly
- visible content hide remains a coordinated transition, not an immediate teardown

### Search This Area

Keep the current behavior:

- pressing Search This Area reacts immediately on press-up
- existing map items dismiss immediately on click/press-up
- the new reveal then happens on its own time, matching the normal reveal behavior
- the new cards and map items reveal in sync just like results reveal

Interpretation:

- this is not a bespoke flow
- it is a rerun of the same results presentation contract with different bounds

### Restaurant profile open

Desired behavior:

- on pin or label press, the active pin/label style change should happen immediately
- map move should kick off immediately
- profile page/sheet switch should kick off immediately
- these things should all start at once
- they still need to feel completely smooth

Known current issues to fix during implementation:

- nav cutoff area bug while a restaurant profile is visible
- pin/label active color/style changes are buggy, late, and non-ideal

Current likely bug surfaces:

- profile nav cutoff / safe-area geometry is likely tied to the profile-specific nav/snap path in:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/use-profile-camera-orchestration.ts`
- active pin/label styling currently routes through `selectedRestaurantId` and map presentation plumbing rather than through a dedicated prepared presentation input in:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`

Locked contract:

- visual activation of the selected restaurant happens immediately
- camera movement starts immediately
- profile shell open starts immediately
- the fact that many things start at once must not cause visible frame stalls

### Restaurant profile close

Desired behavior:

- close reacts immediately
- profile shell close starts immediately
- map restore / highlight restore / results restore feel like one coordinated transition
- no nav cutoff / overlay artifacting

Interpretation:

- close must feel immediate, but cleanup and restore logic should not block the visible close motion

## Scope

Primary files / modules:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-results-sheet.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-runtime-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/results-presentation-runtime-contract.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-observation.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-runtime-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/use-profile-camera-orchestration.ts`

Related earlier plans:

- `/Users/brandonkimble/crave-search/plans/search-map-label-snap-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/search-map-reveal-dismiss-smooth-cutover-plan.md`

## Executive Summary

The right architecture is:

- JS does planning and preparation.
- UI/native does visible execution.

That means:

- JS computes the next screen state, data snapshot, map snapshot, and layout inputs.
- Once the snapshot is ready, JS stops mutating the visible lane.
- UI-thread/native performs the visible transition from that snapshot.
- Cleanup, observation refresh, and hydration catch-up happen after settle.

This is the same fundamental shape that already made the map path better:

- semantic ownership on the JS side
- visible execution on the native side

The difference now is that we need to apply that shape to the whole Search screen, not just the map render path.

## 0.1 Current Repo Reality Check (2026-04-02)

This section supersedes older "current architecture" assumptions later in the doc when they conflict.

### What has already moved in the right direction

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx` is no longer the original ~10k LOC root monolith. It is now ~2.3k LOC and mostly composes dedicated hooks/controllers plus presentation trees.
- Results presentation now has an explicit prepared-snapshot staging/execute path:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/prepared-presentation-transaction.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-prepared-results-presentation-coordinator.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-prepared-presentation-transaction-publisher.ts`
- Profile open/close now also has prepared snapshot objects and a dedicated runtime/profile ownership stack:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-prepared-presentation-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-contract.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-mutations.ts`
- Results overlay/sheet/chrome/root screen state has been split into dedicated Search hooks and presentation components, including:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchScreenPresentationSurface.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useSearchRouteOverlayRuntime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-overlay-chrome-render-model.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-data-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-read-model-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-render-policy-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-covered-render-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-surface-state-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-interaction-frost-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-surface-background-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-surface-overlay-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-spec-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-route-visibility-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-overlay-store-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-docked-polls-visibility-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-nav-restore-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-overlay-render-visibility-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-overlay-chrome-snaps-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-overlay-sheet-reset-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-close-visual-handoff-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-chrome-transition-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-session-shadow-transition-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-runtime-instrumentation-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-root-ui-effects-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-stable-map-handlers-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-sheet-visual-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-runtime-publication-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-shortcut-harness-bridge-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-data-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/search-results-panel-data-runtime-contract.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-input-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-hydration-content-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-filters-content-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-card-content-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/search-results-panel-runtime-state-contract.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-results-runtime-state.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-filters-runtime-state.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-hydration-runtime-state.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-presentation-runtime-state.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-overlay-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/search-results-panel-hydration-runtime-contract.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-retained-results-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-hydration-key-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-on-demand-query-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/search-results-panel-card-runtime-contract.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-card-metrics-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-on-demand-notice-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-card-render-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-filters-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-chrome-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-list-selectors-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-list-layout-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-list-publication-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-read-model-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-render-policy-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-covered-render-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-surface-state-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-interaction-frost-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-surface-background-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-surface-overlay-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-spec-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-route-visibility-runtime.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/search-results-panel-runtime-contract.ts`
- Map scene preparation is now keyed by a prepared snapshot key and has an explicit scene-freeze / resume gate:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx`

### What is still transitional / not yet the final ideal shape

- Recent profile-shell narrowing: local transition status plus local restaurant shell visibility/highlight now apply through one runtime/profile-owned `useProfileRuntimeState(...)` owner instead of root setter fan-out or a broad shell-state bag, transition status is now single-written by that runtime-state owner instead of being mutated on both ref and state separately, the remaining JS shell application now consumes the prepared shell payload type directly, same-restaurant autocomplete retarget now crosses one `refreshOpenRestaurantProfileSelection(...)` action instead of raw cache/setter refs, the old raw `restaurantFocusSessionRef` threading through Search root / clear controller / profile controller is gone, focus-session ownership now lives inside `useProfileRuntimeController(...)`, Search clear flow consumes only one imperative `resetRestaurantProfileFocusSession()` action, route intent no longer applies directly from the settle hook, and the shell lane is localized again as one runtime/profile-owned `applyPreparedProfileShellExecution(...)` action instead of a split local-shell-plus-route-intent path. That route-intent lane now runs through `searchRestaurantRouteController.ts` rather than the deleted `applySearchOwnedRestaurantRouteIntent(...)` helper. The old centered-on-location bookkeeping flag is now deleted entirely instead of being preserved as another write-only ref seam.
- Raw setter leakage is narrower too: the runtime/profile transition + shell hooks no longer expose raw transition/overlay/highlight setters as the public shell contract, and map interaction now consumes only the highlight-clear path it actually needs.
- Profile highlight ownership is narrower again too: highlighted restaurant identity is no longer duplicated in local React state inside `useProfileRuntimeState(...)`, and now derives directly from the search-owned restaurant route through `useActiveSearchRestaurantRouteRestaurantId()` while shell execution applies only transition status plus route intent.
- Profile settle ownership is narrower too: `useProfilePresentationSettleController(...)` no longer interprets sheet/camera completion as profile-open transaction meaning inline, and now consumes one shared settle-update helper from `profile-presentation-controller.ts`; idle/open settle-state initialization is also shared instead of repeated literal state bags.
- Profile dismiss ownership is narrower too: overlay dismiss no longer decides “is this transition meaningful, cancel hydration, finalize close” inline in `useProfilePresentationSettleController(...)`, and now consumes one shared dismiss-update helper from `profile-presentation-controller.ts`; the idle transition-state reset shape is also shared instead of being rebuilt ad hoc in multiple runtime owners.
- The profile settle-controller boundary is narrower again too: the settle hook no longer mutates `dismissHandled` or `profileOpenSettleState` itself after resolving dismiss/settle updates, and now delegates those transition-record mutations to controller-owned apply helpers in `profile-presentation-controller.ts`.
- The bottom-sheet programmatic settle bridge is narrower too: native host snap-change events already arrive on the JS thread, and the shared programmatic driver no longer bounces those events through `runOnUI(...)` and back through `runOnJS(...)` before profile/global sheet consumers can react.
- The shared programmatic sheet-driver surface is narrower too: hosts that only care about dismiss no longer have to thread a fake programmatic-settle callback through `useBottomSheetProgrammaticSnapController(...)`.
- The profile settle-driver boundary is narrower too: `useProfilePresentationSettleController(...)` now consumes `useBottomSheetProgrammaticSnapController(...)` directly, and the extra `useProfileRestaurantSheetDriver(...)` wrapper plus callback-ref forwarding layer are deleted.
- The restaurant host boundary is narrower too: `RestaurantOverlayHost` no longer takes split `sheetDriver` and `motionDriver` props for the same sheet surface, and the dedicated restaurant host boundary now consumes one grouped bottom-sheet runtime model instead of another split presentation/control pair.
- The Search restaurant-route contract is narrower too: Search no longer publishes restaurant overlay state as another exploded field bag (`panelSnapshot`, `shouldFreezeContent`, `onRequestClose`, `onToggleFavorite`, `interactionEnabled`, `containerStyle`) only for the overlay layer to reassemble it later, and now publishes one route-level `panel` contract plus the sheet driver directly.
- Search restaurant-route panel assembly is narrower too: the deleted `useSearchRouteOverlayPanels.ts` wrapper no longer carried restaurant-specific panel outputs, `AppOverlayRouteHost` no longer assembles Search restaurant props inline, and `RestaurantRouteLayerHost.tsx` now passes the route-level `panel` contract directly while visual-only nav/search-bar geometry stays separate.
- The overlay runtime naming is narrower too: the restaurant route host contract/store no longer advertise this lane as another Search-specific runtime channel (`SearchRestaurantRouteInputs` / `searchRestaurantRouteInputs`), and now use a generic `RestaurantRouteHostInputs` owner name instead.
- The Search-route overlay host boundary is narrower too: Search no longer publishes another bundled `SearchRouteOverlayHostInputs` host bag; the overlay runtime now stores separate lanes for `searchRouteResolutionInputs`, `searchRoutePollsPanelInputs`, `searchRoutePanelSpec`, and `restaurantRouteHostInputs`, and `BaseSearchRouteSheetHost` no longer owns a restaurant-specific render branch.
- The restaurant route render boundary is narrower too: `AppOverlayRouteHost` no longer assembles separate global-vs-Search restaurant overlay props inline, and a dedicated `RestaurantRouteLayerHost` now owns the route-level restaurant host resolution before delegating into `RestaurantOverlayHost`.
- The restaurant route owner boundary is narrower too: `RestaurantRouteLayerHost` no longer consumes another prop-driven compatibility surface from `AppOverlayRouteHost`; it now reads active route, global route content, Search visual state, and Search restaurant-route inputs from their overlay-owned stores directly, so the app host only decides whether the restaurant route should mount.
- The restaurant route host-model boundary is narrower too: `RestaurantRouteLayerHost` no longer wires raw bottom-sheet presentation/snap primitives directly into `RestaurantOverlayHost`, and now resolves one dedicated `RestaurantRouteHostModel` through `restaurantRouteHostContract.ts` plus `useResolvedRestaurantRouteHostModel.ts` before mounting the route host.
- The restaurant host/runtime split is narrower too: `RestaurantOverlayHost.tsx` no longer mixes restaurant content/payload handling with the shared native sheet/scroll/motion host runtime, and that shared host layer now lives under dedicated `RestaurantSheetHost.tsx` while `RestaurantOverlayHost.tsx` stays on restaurant route/content ownership.
- The restaurant native payload boundary is stronger too: the typed JS `snapshot` prop no longer re-expands into generic native container reads during render. `CraveRestaurantPanelSnapshotView.swift` now owns an embedded `RestaurantPanelSnapshotPayload` parser for the incoming `NSDictionary` on iOS, `RestaurantPanelSnapshotPayload.java` now parses the incoming `ReadableMap` once on Android, and `CraveRestaurantPanelSnapshotView.swift` plus `RestaurantPanelSnapshotView.java` now render and emit actions from explicit native payload models instead of inline `[String: Any]` / `JSONObject` access.
- The remaining restaurant compatibility seams inside the generic Search sheet path are gone too: `AppOverlayRouteHost` now mounts `RestaurantRouteLayerHost` directly whenever the active route is `restaurant`, `useAppOverlaySheetResolution(...)` no longer models restaurant as a generic overlay-sheet key/spec/visibility case, and Search no longer bundles restaurant-route inputs into `SearchRouteOverlayHostInputs`; restaurant-route inputs now publish on their own overlay-runtime lane.
- The Search overlay-runtime contract is narrower too: the old bundled Search-route host object is gone entirely, and the app host / Search-route panel resolver now read only the split overlay-owned lanes they actually need instead of another Search-shaped compatibility contract.
- The app-host dependency boundary is narrower too: `AppOverlayRouteHost` no longer reads Search-route runtime lanes just to pre-resolve whether the Search sheet path should mount, and now mounts the non-restaurant Search-route host path from visual-state ownership alone while `useResolvedSearchRouteHostModel.ts` stays on thin composition over the lower Search host owners underneath it.
- The generic overlay-resolution boundary is narrower too: `useAppOverlaySheetResolution(...)` no longer knows about Search editing/suggestion suppression policy or the Search-vs-docked-polls interpretation, and those Search-route semantics now live under the split host lane instead of another app-level/generic resolver: `useSearchRouteOverlayPublishedState.ts` owns the published route-state selectors, `useSearchRouteOverlayRouteState.ts` owns overlay-route selection, the deleted `useSearchRouteOverlayPanelSpecFamilies.ts` wrapper no longer sits above the direct search/polls/tab/save family owners, and `useResolvedSearchRouteHostModel.ts` now composes those lower family specs itself, `useSearchRouteOverlaySheetKeys.ts` owns route-sheet key derivation, the deleted `useSearchRouteOverlayPanelSpecsRuntime.ts` wrapper no longer sits above that route/spec lane, `useSearchRouteOverlayActiveSheetSpec.ts` now owns active sheet/spec plus final search-interaction resolution, `useSearchRouteOverlaySheetVisibilityState.ts` now owns spec suppression and final overlay visibility policy, `useSearchRouteFrozenOverlaySheetProps.ts` owns the close-handoff sheet-freeze latch, `useSearchRouteOverlayHeaderActionMode.ts` owns the header-action reset/freeze lane, `useSearchRouteFrozenOverlayRenderModel.ts` now stays on thin composition over those lower freeze owners, and `useResolvedSearchRouteHostModel.ts` now just composes those lower owners.
- The route-host boundary is narrower too: `AppOverlayRouteHost` no longer implements the non-restaurant Search sheet shell inline, and now acts as a route switch between dedicated `RestaurantRouteLayerHost` and `SearchRouteLayerHost` owners instead of carrying another embedded Search-route host.
- The Search-route overlay-spec boundary is narrower too: `SearchRouteLayerHost.tsx` no longer owns the full polls/bookmarks/profile/save-list/poll-creation spec assembly cluster inline, and that owner move now lives under `useSearchRouteOverlaySpecs(...)` while the route host only selects the already-owned non-search specs and adapts the Search route itself.
- The Search-route spec-family boundary is narrower too: `useSearchRouteOverlaySpecs(...)` no longer owns polls/poll-creation and tab/save-list overlay families together, and now delegates those distinct clusters to `useSearchRoutePollsOverlaySpec(...)` and `useSearchRouteTabOverlaySpecs(...)` so the composition hook is only wiring route-spec owners together.
- The Search-route save-list boundary is narrower too: save-list no longer rides the same owner as bookmarks/profile tab overlays, and now lives under a dedicated `useSearchRouteSaveListOverlaySpec(...)` owner so the remaining tab hook is only bookmarks/profile.
- The shared tab-overlay owner is gone too: bookmarks/profile no longer share `useSearchRouteTabOverlaySpecs(...)`, and now live under dedicated `useSearchRouteBookmarksOverlaySpec(...)` and `useSearchRouteProfileOverlaySpec(...)` owners so `useSearchRouteOverlaySpecs(...)` only composes distinct route families.
- The results presentation boundary is narrower again too: Search hooks now consume one dedicated bus-owned render lane (`resultsPresentation`) directly, transport/snapshot-key/telemetry consumers now read the dedicated transport lane (`resultsPresentationTransport`), and the richer `resultsPresentationExecution` object no longer leaks into runtime consumers beyond the transition publisher and bus storage.
- The profile transition-record boundary is narrower too: `profile-runtime-controller.ts` no longer mutates `preparedSnapshot` / `dismissHandled` / `profileOpenSettleState` directly for open commit, close commit, seed-time dismiss reset, or close-time reset, and now delegates that transition-record mutation batch to controller-owned apply/reset helpers in `profile-presentation-controller.ts`.
- The root transition-record seam is gone too: `index.tsx` no longer owns `profileTransitionRef` or a separate `useProfileRuntimeState(...)` hook, camera orchestration now returns a captured transition snapshot instead of mutating the transition record directly, and `useProfileRuntimeController(...)` now owns the live transition record itself.
- The profile camera-settle bridge is narrower too: low-level `CameraIntentArbiter` completion registration no longer lives in a mixed settle-controller wrapper, and that registration now lives directly under `useProfilePresentationCameraSettleBridge(...)` in the camera execution boundary.
- The shared programmatic sheet runtime is narrower too: `useBottomSheetProgrammaticSnapController(...)` no longer maintains a second ref/effect callback-forwarding layer for hidden/snap-settled events, and now lets the programmatic snap handler close over the live callbacks directly.
- The profile sheet-settle bridge is narrower too: the restaurant sheet driver no longer lives behind a settle-controller wrapper, and now comes directly from `useProfilePresentationRestaurantSheetDriver(...)` while the sheet executor consumes that driver through typed command ports.
- The profile transaction-execution boundary is narrower too: phase batching, phase-payload iteration, and shell-vs-motion dispatch now live directly under `useProfilePresentationTransactionExecutor(...)`, and the old settle-controller wrapper is deleted instead of remaining as another bridge owner.
- The JS shell-owner boundary is narrower too: the lower runtime-state owners composed directly in `profile-owner-runtime.ts` now own the live `profileShellState` bus lane plus prepared shell transition application and the close-state reset/nulling cluster, so the surviving profile owner no longer needs another local shell executor/finalizer callback just to update `transitionStatus`, clear the committed panel snapshot, or reset focus/close bookkeeping.
- The profile close-finalization boundary is narrower too: close-time sheet-restore resolution, foreground restore, transition reset, and clear-on-dismiss choreography no longer branch through a separate callback-owned finalizer, now ride the prepared profile transaction executor as explicit close finalization work, and the close snapshot policy (`shellTarget`, restore-sheet target, target snap, clear-on-close) is now interpreted through one shared `resolvePreparedProfileCloseSnapshotPlan(...)` helper instead of another inline runtime assembly block.
- The remaining profile completion bridge is narrower too: the old runtime-controller path no longer keeps mutable callback refs just to let dismiss/sheet-settle handlers reach the live close finalizer or transaction executor, and the native sheet/camera completion bridge now lives directly under [`profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts) through one owner-managed completion handler ref plus the native execution-owned `restaurantSheetRuntimeModel`, instead of another controller-local callback or driver seam. That execution boundary is honest now too: `useProfileOwner(...)` in [`profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts) now composes the live profile path directly, keeping the execution split explicit as `nativeExecutionModel` plus one grouped JS app runtime defined by [`profile-app-execution-runtime-contract.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-app-execution-runtime-contract.ts) and composed directly in the owner from the lower foreground, route, close, and direct command owners. The lower prepared runtime boundary is grouped more honestly now too: [`profile-prepared-presentation-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-prepared-presentation-runtime.ts) now consumes one grouped `appExecutionRuntime`, whose `shellExecutionModel` contains those lower foreground/route/close lanes, and close restore/reset/clear now run through one `finalizePreparedProfileClose(...)` operation instead of a separate read-restore-reset-clear callback cluster. The lower prepared open/close/focus/completion helpers now live under the dedicated prepared/runtime owners, and the lower transition contract plus init/reset/capture helpers now live across [`profile-transition-state-contract.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-contract.ts) and [`profile-transition-state-mutations.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-mutations.ts).
- The root/controller JS app seam is narrower too: `appExecutionArgs` no longer crosses as one flat Search-shaped bag, and now crosses as grouped `foregroundExecutionArgs`, `closeExecutionArgs`, and `resultsExecutionArgs`. That JS app policy lane now has a real grouped contract under [`profile-app-execution-runtime-contract.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-app-execution-runtime-contract.ts), while [`profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts) composes the live `appExecutionRuntime` directly from the lower foreground, route, close, and command owners instead of routing through the deleted `profile-app-execution-runtime.ts` or deleted `profile-app-shell-runtime.ts` wrappers.
- The grouped action lane is flatter too: the deleted [`profile-action-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-action-runtime.ts) and deleted [`profile-owner-action-model-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-model-runtime.ts) no longer sit above the preview/open/focus/runtime action owners, and [`profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts) now composes those lower action lanes directly instead of another top-level grouped action composer.
- The runtime-state contract is narrower too: the deleted `use-profile-runtime-state.ts` no longer exports another flat prepared-presentation function bag or the dead outward `resetPreparedProfileDismissTransitionHandling()` compatibility surface. The live runtime-state boundary now composes grouped shell/transition/close/hydration/focus/auto-open lanes directly in `profile-owner-runtime.ts`, while `profile-runtime-state-contract.ts` owns the shared grouped type surface, and the old generic close-state patch helper is deleted instead of lingering beside the explicit close-state operations that still matter.
- The surviving owner-runtime assembly seam is narrower too: `profile-presentation-controller.ts` no longer hosts the giant `React.useMemo(...)` that assembled the full controller/runtime arg bag for a second internal owner hook, and the deleted `createProfileOwnerRuntime(...)` builder no longer sits beside the live hook surface. `useProfileOwner(...)` now owns that runtime construction directly alongside the existing binding effects instead of leaving one more giant assembly/dependency surface in the controller file. That exported owner hook now consumes grouped `searchContext`, camera-layout inputs, selection policy, analytics, grouped execution lanes, and grouped runtime-state lanes directly, so the owner no longer assembles compatibility bags or rethreads runtime-state helpers one at a time just to reach another controller boundary.
- The surviving owner/runtime Search-derivation seam is narrower too: `profile-presentation-controller.ts` no longer reads `results`, `submittedQuery`, or overlay-root visibility just to feed another internal owner hook. `profile-presentation-controller.ts` now derives `currentQueryKey`, `currentQueryLabel`, `results`, and `isSearchOverlay` inside `useProfileOwner(...)` from grouped Search context plus runtime selectors, so the surviving owner no longer keeps that local Search-runtime/overlay-selector lane alive.
- The embedded profile presentation executor seam is narrower too: there is no longer a separate profile runtime-controller, transaction-executor wrapper, split presentation-owner pair, Search-side profile composition hook, or a second top-level `runtime/profile` owner file in the live path. The deleted `use-profile-owner.ts` and `use-profile-presentation-owner.ts` layers are gone, and [`profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts) now exports the full `useProfileOwner(...)` boundary that `index.tsx` consumes. That surviving runtime/profile owner now owns the outward owner boundary while lower owners handle snapshot capture, prepared snapshot-key derivation, read-model assembly, direct prepared-presentation callbacks for reset/capture/open/close/focus, prepared-transaction sequencing, completion routing, close finalization choreography, and the command/native transport lane. The lower runtime-state owners now handle mutable cache/hydration state, the live `profileShellState` bus projection, prepared shell transition application, and the close-state reset/nulling cluster under direct composition in [`profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts), [`profile-runtime-state-contract.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-runtime-state-contract.ts) owns the grouped runtime-state type surface, [`profile-transition-state-contract.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-contract.ts) plus [`profile-transition-state-mutations.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-transition-state-mutations.ts) own the lower transition contract and init/reset/capture machinery, and [`profile-prepared-presentation-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-prepared-presentation-runtime.ts) owns the prepared binding layer over the lower open/close/focus/completion transaction owners that used to linger in larger umbrella hosts.
- The profile read-model boundary is narrower too: `index.tsx` no longer derives profile overlay visibility, active-open restaurant id, presentation-active state, or the prepared profile snapshot key from raw transition status/ref state, and now consumes those read models directly from the grouped return of `useProfileOwner(...)` in `profile-presentation-controller.ts`; the prepared-presentation publisher also no longer reads `profileTransitionRef` / `profileTransitionStatus` / `showProfileOverlay` just to derive the profile snapshot key.
- The root-facing profile render bag is narrower too: `index.tsx` no longer reads `restaurantPanelSnapshot` and `mapCameraPadding` as separate profile-runtime fields, and now consumes one `profileViewState` model from `useProfileOwner(...)` in `profile-presentation-controller.ts` that groups presentation state, panel snapshot, and camera padding together.
- Highlighted restaurant identity now rides that same `profileViewState` model instead of escaping as another parallel root-facing field; the remaining separate profile export is only the clear-highlight action.
- That last separate clear-highlight export is gone too: `clearMapHighlightedRestaurantId()` now rides the `profileActions` bundle, so the outward profile controller surface is just `profileViewState`, `restaurantSheetRuntimeModel`, and `profileActions`.
- The foreground chrome model is narrower too: the deleted foreground wrappers, route-panel wrapper pair, Search-only docked-polls publication shim, and deleted `use-search-restaurant-route-owner.ts` no longer mix Search-route publication with chrome render-model assembly or keep a one-off restaurant publish seam beside the shared runtime lane. `runtime/shared/use-search-route-panel-publication-runtime.tsx` now owns the full Search-route publication lane over `use-search-results-panel-data-runtime.tsx`, `use-search-results-panel-read-model-runtime.tsx`, `use-search-results-panel-render-policy-runtime.tsx`, `use-search-results-panel-covered-render-runtime.tsx`, `use-search-results-panel-surface-state-runtime.tsx`, `use-search-results-panel-interaction-frost-runtime.tsx`, `use-search-results-panel-surface-background-runtime.tsx`, `use-search-results-panel-surface-overlay-runtime.tsx`, `use-search-results-panel-spec-runtime.tsx`, `use-search-results-panel-route-visibility-runtime.tsx`, and `useSearchRouteOverlayRuntime(...)`, where the overlay-owned route host lane is now split more honestly: `useSearchRouteOverlayPublishedState.ts` now owns the published visual/search-panel/render-policy selectors, `useSearchRouteOverlaySheetKeys.ts` now owns route-sheet key derivation, the deleted `useSearchRouteOverlayPanelSpecFamilies.ts` wrapper no longer sits above the direct family-spec lane, `useResolvedSearchRouteHostModel.ts` now composes the direct polls/poll-creation/bookmarks/profile/save-list specs itself, the deleted `useSearchRouteOverlayPanelSpecsRuntime.ts` wrapper no longer sits above that lane, `useSearchRouteOverlayActiveSheetSpec.ts` now owns active sheet/spec plus final search-interaction resolution, `useSearchRouteOverlaySheetVisibilityState.ts` now owns spec suppression and final overlay visibility policy, `useSearchRouteOverlayRuntimePublication.ts` now owns runtime-store publication of direct `searchPanelSpec` + direct `searchPanelInteractionRef` + direct `dockedPollsPanelInputs` + `renderPolicy`, and `useSearchRouteOverlayRuntime.ts` now stays on thin composition over those lower overlay owners. `index.tsx` now consumes that lower route-publication owner before composing the chrome render-model lane directly through `use-search-overlay-chrome-render-model.ts`. That Search-owned foreground input lane is flatter too: `use-search-results-panel-visual-runtime-model.ts`, `use-search-foreground-suggestion-inputs.ts`, `use-search-foreground-header-inputs.ts`, and `use-search-foreground-filters-warmup-inputs.ts` now own the final results-panel visual model plus the final suggestion/header/warmup input surfaces, so the root no longer builds those grouped bags inline before handing them to the lower route/render owners. The remaining Search-root foreground interaction/input and visual lane is flatter too: `use-search-suggestion-interaction-runtime.ts` now owns the suggestion interaction controller composition that the profile owner and suggestion/header surfaces consume, `use-search-foreground-interaction-runtime-contract.ts` now owns the shared foreground interaction vocabulary, `use-search-foreground-launch-intent-runtime.ts` now owns launch-intent routing, `use-search-foreground-submit-runtime.ts` now owns submit/search-this-area/suggestion/recent selection orchestration, `use-search-foreground-retry-runtime.ts` now owns reconnect retry policy, `use-search-foreground-editing-runtime.ts` now owns clear/focus/blur/back editing behavior, `use-search-foreground-overlay-runtime.ts` now owns route-intent replay plus view-more/overlay selection, and `use-search-foreground-interaction-runtime.ts` now stays on thin composition over those lower foreground interaction owners. `use-search-request-status-runtime.ts` now owns grouped search-request plus system-status reads, `use-search-history-runtime.ts` now owns the grouped recent-search / recently-viewed history lane, `use-search-filter-state-runtime.ts` now owns the grouped filter store selection lane, `use-search-filter-modal-runtime.ts` now owns the later filter-modal/control surface over the lower modal owner, `use-search-autocomplete-runtime.ts` now owns autocomplete cache/suppression/request lifecycle, `use-search-recent-activity-runtime.ts` now owns recent-search upsert plus recently-viewed buffering/flush policy, `use-search-foreground-input-runtime.ts` now owns query/focus/press-in/change handling plus shortcut query reseed behavior, `use-search-suggestion-transition-timing-runtime.ts` now owns keyboard-aware transition timing policy, `use-search-suggestion-transition-presence-runtime.ts` now owns transition-driver presence/overlay visibility, `use-search-suggestion-layout-warmth-runtime.ts` now owns layout warmth plus drive-layout policy, `use-search-suggestion-transition-runtime.ts` now stays on thin composition over those lower transition owners, `use-search-suggestion-display-runtime.ts` now owns live suggestion/recent/autocomplete display derivation, `use-search-suggestion-hold-state-runtime.ts` now owns hold snapshot state plus capture/reset primitives, `use-search-suggestion-hold-actions-runtime.ts` now owns submit/close hold command construction, `use-search-suggestion-hold-sync-runtime.ts` now owns hold registration plus query/layout cleanup effects, `use-search-suggestion-held-display-runtime.ts` now owns held suggestion surface outputs, `use-search-suggestion-hold-effects-runtime.ts` now stays on thin composition over those lower hold-lifecycle owners, `use-search-suggestion-hold-runtime.ts` now stays on thin composition over those lower hold owners, `use-search-suggestion-visibility-runtime.ts` now stays on thin composition over those lower visibility owners, `use-search-suggestion-layout-state-runtime.ts`, `use-search-suggestion-layout-visual-runtime.ts`, and `use-search-suggestion-header-holes-runtime.ts` now own the paired layout caches, cutout geometry, and header spacing lane under the thin `use-search-suggestion-layout-runtime.ts` surface, `use-search-suggestion-surface-runtime.ts` now stays on thin composition over the lower visibility/layout owners, `use-search-foreground-visual-runtime.ts` now owns the later chrome/search-shortcut/search-this-area/results-sheet visual lane, `use-search-root-visual-runtime.ts` now owns the grouped Search-root visual lane over the lower chrome-snap/reset, close-handoff, chrome-transition, foreground-visual, and shortcut-harness owners, and the final render surface now terminates under `search-root-render-runtime-contract.ts`, `use-search-root-foreground-render-runtime.ts`, `use-search-root-foreground-render-owner-runtime.ts`, `use-search-root-map-render-props-runtime.ts`, `use-search-root-modal-sheet-render-runtime.ts`, `use-search-root-modal-sheet-render-owner-runtime.ts`, and [`SearchRootRenderSurface.tsx`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/SearchRootRenderSurface.tsx) instead of another grouped render helper. That root-owned map/publication seam is flatter again now too: `runtime/shared/use-search-map-runtime.ts` now owns grouped map interaction plus stable handler composition, the deleted `runtime/shared/use-search-root-publication-runtime.ts`, deleted `runtime/shared/use-search-root-route-publication-runtime.ts`, deleted `runtime/shared/use-search-root-render-publication-runtime.ts`, deleted `runtime/shared/use-search-root-visual-publication-runtime.ts`, and deleted `runtime/shared/use-search-root-publication-runtime-contract.ts` no longer sit between the root and the live publication/render lanes. The remaining root publication vocabulary now terminates under `use-search-root-visual-publication-args-runtime-contract.ts`, `use-search-root-chrome-input-publication-args-runtime-contract.ts`, `use-search-root-runtime-contract.ts`, `search-root-map-render-publication-runtime-contract.ts`, and `search-root-render-runtime-contract.ts`, while the lower visual publication path now terminates directly through `use-search-root-visual-runtime.ts`, `use-search-results-sheet-visual-runtime.ts`, `use-search-results-panel-visual-runtime-model.ts`, `use-search-foreground-suggestion-inputs.ts`, `use-search-foreground-header-inputs.ts`, and `use-search-foreground-filters-warmup-inputs.ts`. `runtime/shared/use-search-restaurant-route-host-config-runtime.ts` now owns Search-origin restaurant host-config derivation, `runtime/shared/use-search-restaurant-route-host-model-runtime.ts` now owns generic restaurant host-model assembly over `restaurantRouteHostContract.ts`, `runtime/shared/use-search-restaurant-route-publication-runtime.ts` now stays on thin publish/clear composition over `restaurantRouteRuntimeStore.ts`, and `use-search-root-runtime.ts` now composes runtime publication, those lower visual owners, Search-route publication, restaurant-route publication, and final render assembly directly instead of routing through another grouped root-publication host.
- The foreground submit lane is narrower too: `use-search-foreground-submit-preparation-runtime.ts` now owns shared submit/recent preparation, `use-search-foreground-primary-submit-runtime.ts` now owns submit/search-this-area/shortcut submits, `use-search-foreground-suggestion-submit-runtime.ts` now owns suggestion selection submits, `use-search-foreground-recent-submit-runtime.ts` now owns recent/recently-viewed submits, and `use-search-foreground-submit-runtime.ts` now stays on thin composition over those lower submit owners instead of remaining the mixed submit family host.
- The Search-root overlay root/chrome lane is narrower too: `index.tsx` no longer routes through deleted mixed overlay-root or chrome wrapper hosts. That lane is now split more honestly between `runtime/shared/use-search-overlay-store-runtime.ts`, which owns overlay-store root interpretation plus search-root restore and `ensureSearchOverlay()`, direct `useSearchRouteSessionController(...)` composition for search-session origin capture/restore policy, `runtime/shared/use-search-bottom-nav-runtime.ts` for search-bar/bottom-nav geometry caching, `runtime/shared/use-search-docked-polls-visibility-runtime.ts` for docked-polls/polls-sheet visibility policy, `runtime/shared/use-search-nav-restore-runtime.ts` for nav-restore clearing, `runtime/shared/use-search-overlay-render-visibility-runtime.ts` for final overlay render visibility, `runtime/shared/use-search-overlay-chrome-snaps-runtime.ts` for `chromeTransitionConfig`, and `runtime/shared/use-search-overlay-sheet-reset-runtime.ts` for overlay sheet-snap cleanup. The Search root now consumes those direct lower overlay/nav/visibility/chrome owners instead of another mixed route/presentation block.
- The Search-root pre-suggestion session/runtime lane is narrower too: the deleted `runtime/shared/use-search-root-session-runtime.ts` no longer sits between the lower session owners and the construction lane. `runtime/shared/use-search-root-session-state-runtime.ts` now owns the bus-backed runtime owner/state/flags/primitives/hydration lane, `runtime/shared/use-search-root-session-search-services-runtime.ts` now owns freeze/history/filter/request-status services, `runtime/shared/use-search-root-session-overlay-map-runtime.ts` now owns overlay-command plus map-bootstrap composition, and `runtime/shared/use-search-root-construction-runtime.ts` now composes those lower session owners directly before the later suggestion/overlay/session/action lanes instead of routing through another grouped session constructor shell.
- The Search-root overlay/session lane is narrower again too: `runtime/shared/use-search-overlay-session-runtime.ts` now owns the full overlay-root/session/nav/visibility composition over `use-search-overlay-store-runtime.ts`, direct `useSearchRouteSessionController(...)` composition, `use-search-bottom-nav-runtime.ts`, `use-search-docked-polls-visibility-runtime.ts`, `use-search-nav-restore-runtime.ts`, and `use-search-overlay-render-visibility-runtime.ts`, so `index.tsx` no longer physically hosts that lower overlay/session cluster inline.
- The Search-root map-movement/results-sheet lane is narrower too: `runtime/shared/use-search-results-sheet-runtime-lane.ts` now owns the Search-owned motion-pressure instance, map-movement policy, initial docked-polls-to-sheet state derivation, and the full lower results-sheet runtime composition over `use-results-sheet-shared-values-runtime.ts`, `use-results-sheet-runtime-model-runtime.ts`, `use-results-sheet-animated-styles-runtime.ts`, `use-results-sheet-visibility-state-runtime.ts`, `use-results-sheet-visibility-actions-runtime.ts`, `use-results-sheet-visibility-sync-runtime.ts`, and `use-results-sheet-runtime-surface.ts`, so the root no longer keeps that lower movement/sheet-runtime cluster inline before the later presentation and interaction lanes.
- That post-suggestion Search-root flow is narrower again too: `runtime/shared/use-search-root-scaffold-runtime.ts` now owns grouped overlay-session + results-sheet-runtime + instrumentation composition over `use-search-overlay-session-runtime.ts`, `use-search-results-sheet-runtime-lane.ts`, and `use-search-runtime-instrumentation-runtime.ts`, `runtime/shared/use-search-request-presentation-flow-runtime.ts` now owns grouped session-shadow + request/clear/results-presentation + autocomplete/recent/input composition over `use-search-session-shadow-transition-runtime.ts`, `use-search-request-presentation-runtime.ts`, `use-search-autocomplete-runtime.ts`, `use-search-recent-activity-runtime.ts`, and `use-search-foreground-input-runtime.ts`, and `runtime/shared/use-search-root-action-runtime.ts` now owns grouped session-action + results-sheet-interaction + derived presentation-state composition over `use-search-session-action-runtime.ts` and `use-search-results-sheet-interaction-runtime.ts`. The remaining top-level Search-root constructor shell is narrower too: `runtime/shared/use-search-root-primitives-runtime.ts` now owns the local map/search refs, setter state, store selection, and root-local cache/selection/focus primitives, `runtime/shared/use-search-root-suggestion-runtime.ts` now owns the grouped suggestion-surface lane plus `isSuggestionScreenActive`, `runtime/shared/use-search-root-scaffold-lane-runtime.ts` now owns the grouped scaffold lane over `use-search-root-scaffold-runtime.ts`, the deleted mixed `runtime/shared/use-search-root-presentation-runtime.ts` host is replaced by `runtime/shared/use-search-root-request-lane-runtime.ts`, which now stays on grouped request-lane composition over the lower `use-search-root-request-presentation-args-runtime.ts`, `use-search-root-autocomplete-args-runtime.ts`, `use-search-root-recent-activity-args-runtime.ts`, `use-search-root-foreground-input-args-runtime.ts`, and `use-search-request-presentation-flow-runtime.ts` owners, the deleted mixed `runtime/shared/use-search-root-action-lane-runtime.ts` host is replaced by `runtime/shared/use-search-root-profile-action-runtime.ts`, which now owns the profile-specific selection/analytics/native-app execution lane, and `runtime/shared/use-search-root-session-action-runtime.ts`, which now stays on grouped session-action/results-sheet-interaction composition over the lower `use-search-root-session-action-args-runtime.ts`, `use-search-root-results-sheet-interaction-args-runtime.ts`, `use-search-root-presentation-state-args-runtime.ts`, and `use-search-root-action-runtime.ts` owners; the deleted `runtime/shared/use-search-root-display-runtime.ts` and deleted `runtime/shared/use-search-root-display-lane-runtime.ts` hosts are replaced by `runtime/shared/use-search-root-map-display-runtime.ts`, which now owns grouped map composition over `use-search-map-runtime.ts`, while the deleted `runtime/shared/use-search-root-flow-runtime.ts` and deleted `runtime/shared/use-search-root-flow-runtime-contract.ts` no longer sit between those lower suggestion/scaffold/request/action/map/publication phases and the top-level owner boundary. `runtime/shared/use-search-root-runtime-contract.ts` now owns the shared top-level root vocabulary, and `runtime/shared/use-search-root-runtime.ts` now composes primitives/session plus the lower suggestion/scaffold/request/action/map/publication owners directly, so `index.tsx` is now just the env/setup shell over that top-level root runtime plus `SearchRuntimeBusContext.Provider` and `SearchRootRenderSurface`.
- The foreground chrome presentation layer is narrower too: `SearchForegroundChrome.tsx` and `SearchOverlayChromeTree.tsx` are now deleted, and the Search root mounts `SearchSuggestionSurface`, `SearchOverlayHeaderChrome`, the hidden SearchFilters warmup lane, bottom-nav, and the remaining score/price sheets directly instead of crossing another chrome render wrapper.
- The foreground chrome runtime seam is narrower too: the deleted foreground wrappers, route-panel wrapper pair, and Search-only docked-polls publication shim no longer sit between the Search root and the overlay/runtime boundary. `index.tsx` now composes Search-route publication plus overlay-runtime publishing directly from the lower panel publication lanes and `useSearchRouteOverlayRuntime(...)`, and composes final chrome render-model assembly directly through `use-search-overlay-chrome-render-model.ts`; the single-use `useSearchRouteOverlayPublisher.ts` wrapper stays deleted instead of preserving another publish/clear adapter between Search and the overlay runtime store.
- The remaining profile settle/finalization event seam is narrower too: `useProfileRuntimeController(...)` no longer keeps `useEffectEvent` wrapper indirection around prepared-transaction execution or close finalization for sheet dismiss/snap-settled callbacks, now calls those controller-owned executors directly from the live settle handlers, and now consumes a preplanned completion transaction from `ProfileTransitionState` instead of resolving the open/close completion transaction on the settle/dismiss event path.
- The root-to-map profile action seam is narrower too: `index.tsx` no longer re-bundles `openRestaurantProfilePreview(...)` and `openRestaurantProfile(...)` into a separate `markerProfileActions` bag, and the map stage now consumes the existing `profileActions` owner surface directly.
- The outward results-controller contract is narrower too: `PresentationTransitionController` no longer publishes a generic execution-shaped payload for `use-search-presentation-transition-runtime.ts` to reinterpret, and now publishes the dedicated outward render/lifecycle/transport lanes directly while `search-runtime-bus.ts` simply re-exports that runtime contract instead of redefining it. Enter-settle intent completion and the fixed cover/cancel/enter/exit applied-log plus blocked-log semantics now also ride the shared transport-attempt outcome instead of another executor-local success/log inference branch, the dead parallel `blockedLogFields` and executor-only transition `appliedLogFields` payloads are gone, and the executor now consumes one shared transport-event plus named-attempt contract instead of wiring the individual transition resolvers or re-implementing the clone/apply path locally.
- The old generic results execution compatibility type is gone too: `ResultsPresentationExecutionState`, `IDLE_RESULTS_PRESENTATION_EXECUTION_STATE`, and `resolveResultsPresentationExecution(...)` are deleted from the live runtime tree, and the remaining projection state is now controller-private instead of another exported runtime derivation surface.
- The old object-level pending/settled helper vocabulary is gone from the public runtime surface too; only the stage-level settled helper still escapes because the map transport/runtime contract actually uses it.
- The remaining non-render profile state is narrower too: transition/close runtime state plus hydration intent, request sequencing, profile cache/in-flight requests, focus session, auto-open key, and presentation transaction sequencing now live under one controller-owned `profileControllerStateRef` instead of a split `profileRuntimeStateRef` + `profileMutableStateRef`.
- The profile action/orchestration boundary is narrower too: `profile-runtime-controller.ts` no longer keeps the full open/focus/refresh/close/auto-open interaction script inline, and that lane no longer needs a separate `use-profile-actions-owner.ts` wrapper either. The surviving owner runtime now groups the dedicated presentation-model runtime from `profile-presentation-model-runtime.ts`, the prepared presentation runtime, the grouped preview/open/focus/close/refresh-selection/auto-open action runtime, and the remaining cyclic action-port wiring under one owner hook, while the lower runtime-state owners composed in `profile-owner-runtime.ts` now own prepared profile transaction-id allocation plus the seed-and-reset shell prep. That means the surviving owner boundary no longer hosts that inline action/orchestration script, the lower presentation-model lane, another prepared command/state compatibility layer, or local transaction-id / seed-reset plumbing.
- The profile auto-open boundary is narrower too: `index.tsx` no longer composes `useProfileAutoOpenController(...)` from controller-owned profile actions/read models, and that auto-open lane now lives directly under `useProfileRuntimeController(...)` instead of remaining another root-owned profile orchestration seam.
- The root camera-lane seam is gone too: `index.tsx` no longer owns `mapCameraPadding`, `useProfileCameraOrchestration(...)`, or the profile camera command wrappers, and `useProfileRuntimeController(...)` now owns camera orchestration composition, camera padding state, and the camera execution ports directly.
- The dead legacy JS compatibility files are gone too: `runtime/profile/profile-runtime-controller.js`, `use-profile-auto-open-controller.js`, and `use-profile-camera-orchestration.js` are deleted now that the app tree consumes only the live TS runtime/profile ownership path.
- The last internal profile camera wrapper is gone too: `use-profile-camera-orchestration.ts` is deleted, its capture/padding/commit logic now lives directly inside `useProfileRuntimeController(...)`, and there is no longer another single-use hook boundary inside the controller-owned camera lane.
- The last internal close-finalization wrapper is gone too: `use-profile-presentation-close-finalizer.ts` is deleted, and close-time sheet-restore resolution, foreground restore, transition reset, and clear-on-dismiss choreography now live directly inside `useProfileRuntimeController(...)` instead of behind another single-use executor hook.
- The transaction-executor wrapper stack is gone too: `use-profile-presentation-transaction-executor.ts` and `use-profile-presentation-motion-phase-executor.ts` are deleted, and the prepared profile phase loop plus shell-vs-motion dispatch now live directly inside `useProfileRuntimeController(...)` instead of behind another pair of single-use executor wrappers.
- The camera/sheet executor wrappers are gone too: `use-profile-presentation-camera-executor.ts` and `use-profile-presentation-sheet-executor.ts` no longer own command execution callbacks, and camera/restaurant-sheet/results-sheet command dispatch now runs directly inside `useProfileRuntimeController(...)` while the remaining helper files only keep the real settle/native driver boundaries they still own.
- The native phase wrapper is gone too: `profile-presentation-native-executor.ts` is deleted, and native sheet-command forwarding plus native-command stripping now live under the explicit native execution boundary in [`profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts) plus [`profile-presentation-native-sheet-transport.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-presentation-native-sheet-transport.ts) instead of behind another single-use filter hook.
- The last settle/driver wrappers are gone too: `use-profile-presentation-camera-executor.ts` and `use-profile-presentation-sheet-executor.ts` are deleted, and the remaining native completion/driver registration no longer happens in `useProfileRuntimeController(...)`; it now lives on the grouped root execution transport plus `profile-presentation-native-sheet-transport.ts`, so `profile-presentation-controller.ts` no longer owns camera completion registration or `restaurantSheetRuntimeModel` setup itself.
- The custom shell-status store is gone too: `useProfileRuntimeController(...)` no longer keeps a one-off external-store wrapper for transition status, and now owns profile shell status directly in controller state while still mirroring that status onto the transition record it owns.
- The restaurant sheet host boundary is stronger too: `RestaurantRouteLayerHost.tsx` now mounts restaurant directly through the shared `OverlaySheetShell.tsx` over explicit route-owned `sheetConfig` and `surfaceModel` lanes instead of routing through `RestaurantOverlayHost.tsx`, `RestaurantSheetHost.tsx`, or `BottomSheetWithFlashList.tsx`.
- The lower native/shared sheet-host assembly is flatter now too: the live tree no longer uses `useBottomSheetNativeCommandOwner.ts`, `useBottomSheetNativeEventOwner.ts`, `useBottomSheetHostRuntimeOwner.ts`, `useBottomSheetHostScrollRuntime.ts`, or `useBottomSheetSurfaceRuntime.ts`. The deleted `useBottomSheetHostPropsRuntime.ts` no longer sits between the shared shell and the native host path; `useBottomSheetHostCommandRuntime.ts` now owns motion-command mirroring, `useBottomSheetNativeHostPropsRuntime.ts` now owns native host prop assembly over the thin `useBottomSheetNativeEventRuntime.ts` surface, `OverlaySheetShell.tsx` now composes those lower host owners directly beside the lower shell/surface owners, and `BottomSheetHostShell.tsx` now mounts `BottomSheetNativeHost.tsx` directly instead of keeping a second host-component override lane.
- The restaurant native action bridge is stronger too: `RestaurantPanelSnapshotNativeView` no longer returns bare action strings to JS, and now emits a typed action payload carrying restaurant id and concrete website/phone/share targets so the bridge is not just another generic string channel.
- The restaurant route contract is stronger too: Search-route runtime and global route producers no longer publish restaurant state as `panelOptions`, and now use a dedicated route-level `panel` contract that the route host passes straight into `RestaurantOverlayHost` while host-only geometry stays separate. That contract is stronger again now too: producer-facing drafts carry native-ready `snapshotPayload` directly, and `RestaurantOverlayHost.tsx` no longer reshapes raw restaurant business data into the native snapshot payload at host read time.
- Root shell composition is narrower too: the old `applyProfileShellExternalEffects(...)` combiner is deleted, and the profile runtime/settle path now consumes direct owner actions for transition status and local highlighted-restaurant state while restaurant-route intent now applies directly from the settle path through `searchRestaurantRouteController.ts` and overlay visibility is just a composition-root read-model.
- The remaining JS-owned profile shell lane is narrower too: `transitionStatus`, committed `restaurantPanelSnapshot`, and profile map camera padding no longer terminate in local React state inside the profile controller, and now flow through one dedicated runtime-bus `profileShellState` lane while the transition ref remains the mutable transaction record. Prepared shell execution now updates that transition record and the shell lane directly through the lower runtime-state owners composed in `profile-owner-runtime.ts`, the old broad `updateProfileShellState(...)` patch surface is gone, the close-state reset/nulling cluster lives under that same runtime-state lane too, and the controller/execution path now crosses explicit shell-state commands (`setProfileTransitionStatus(...)`, `setProfileCameraPadding(...)`, `setRestaurantPanelSnapshot(...)`) instead.
- The profile execution boundary is narrower too: `profile-runtime-controller.ts` no longer manufactures controller-local `commitProfileCameraTarget(...)` / `clearProfileCameraPadding(...)` adapters just to pass them back into the prepared transaction executor. Those camera command ports now live directly under `profile-presentation-controller.ts` alongside the results-sheet/shared-snap command ports, so the transaction executor now consumes one grouped execution boundary instead of another controller-owned command shim.
- Route-intent plumbing is narrower too: the old `applySearchOwnedRestaurantRouteIntent(...)` helper is gone, and the profile settle path now runs directly through `applySearchRestaurantRouteCommand(...)` from `searchRestaurantRouteController.ts` instead of crossing the Search root/profile runtime as another pass-through action or peeking at overlay state directly.
- Panel-snapshot ownership is narrower too: the committed `restaurantPanelSnapshot` now lives in the runtime bus projection lane owned by `useProfileRuntimeController(...)` instead of a separate restaurant-profile state hook, so the runtime owns both the write path and the committed snapshot state it reads for close/open decisions.
- Auto-open coupling is narrower too: `useProfileAutoOpenController(...)` no longer depends on the full committed panel snapshot shape and now only consumes `openRestaurantId` for same-restaurant refresh checks.

### Endgame execution order

1. Finish the remaining Search-to-overlay decoupling so Search-specific suppression/render policy no longer lives inside generic overlay resolution/host owners.
2. Finish the internal results-controller cleanup so the long-term results contract is just prepared transaction policy plus the outward `resultsPresentation` and `resultsPresentationTransport` lanes.
3. Then make the explicit profile end-state decision: keep the remaining shell/final-completion lane JS-owned as the intended boundary, or promote it under a stronger native/UI executor.
4. Then close the remaining convergence tracks: any remaining future producer adoption, motion-pressure unification, sticky-label fallback deletion, and residual instrumentation cleanup.

- `PresentationTransitionController` now commits prepared results snapshots into one internal active execution object and publishes two explicit outward lanes instead of separate mirror fields or a generic execution-shaped bus object: `resultsPresentation` for JS readers and `resultsPresentationTransport` for the map/native transport path. The separate bus-level `resultsPresentationUi` mirror has now been deleted, controller transition guards now use `executionStage` / `snapshotKind` directly instead of derived lane-status objects, submit settle / map polish-lane advancement / harness settle checks / profiler staging / diagnostics snapshots now key off canonical `executionStage` + `snapshotKind`, and the controller no longer publishes `executionLane`, `executionPhase`, or a dead outward `mutationKind` field that no live consumer needs. `use-search-presentation-transition-runtime.ts` now forwards toggle lifecycle events into one controller-owned `handleToggleInteractionLifecycle(...)` method instead of running its own pending-toggle pulse state machine, `use-search-submit-runtime-controller.ts` now forwards abort handling into one controller-owned `handlePresentationIntentAbort()` method instead of reading active intent state and choosing low-level transition mutations itself, and the old public exit-only cancel path is gone in favor of one generic `cancelPresentationIntent(...)` entrypoint. `use-search-map-presentation-adapter.ts`, `use-search-map-native-render-owner.ts`, and `search-map.tsx` also now carry canonical execution fields on the JS side, and the native iOS/Android parsers derive internal phase/request semantics from those canonical fields only. The results panel no longer derives `revealPhase` / `resultsSurfaceMode` / `resultsCardVisibility`; it now consumes a smaller render-policy model derived from the dedicated `resultsPresentation` lane, no longer reads raw `coverState` directly when the render policy already expresses that render decision, prepared results snapshots now carry one canonical enter `coverState` instead of making the controller translate `loadingMode` or storing duplicate staging/committed cover fields, and they now carry canonical `mutationKind` directly instead of the older `mapMutationKind` field so the controller no longer has to reinterpret snapshot kind into its own mutation semantics on commit. Prepared enter snapshots also no longer retain a separate `entryMode` once those derived cover/snap policy fields exist, so the prepared contract now stores only the execution policy the runtime still consumes, and it no longer stores `query`, `shellTarget`, `mapTarget`, `targetSnap`, `preserveSheetState`, `transitionFromDockedPolls`, or `requiresCoverage` when those policies are already derivable from enter-vs-exit, `mutationKind`, and the request edge. Prepared results exits also no longer carry fake enter-only `query`, `preserveSheetState`, `transitionFromDockedPolls`, or fake `close_search` mutation metadata, the prepared layer no longer owns Search submit-intent vocabulary through a separate `createPreparedResultsSnapshotForIntent(...)` helper, the prepared enter helper no longer derives cover policy from `preserveSheetState`, and execution-batch refs no longer redundantly carry the active request key alongside the already-owned transaction id. Snapshot-level enter kinds now collapse to canonical `results_enter`, with `mutationKind` carrying the search-this-area distinction. The controller’s active execution record is narrower too: it now keeps the prepared snapshot itself instead of mirroring snapshot metadata into a second controller-owned shape. Prepared-results planning types now live in the prepared-transaction module instead of the controller module, the public controller cover API is now expressed as generic cover-state application/clearing, the outward event methods now use canonical enter/exit naming instead of reveal/dismiss naming, the shared results-to-map transport now uses `executionBatch` / `executionBatchId` instead of `revealBatch` / `revealBatchId`, the native/JS transport event channel now uses canonical `presentation_enter_*` / `presentation_execution_batch_mounted_hidden` events instead of `presentation_reveal_*`, prepared result transaction naming is now just `results_enter` instead of a parallel `results_reveal` / `revealMode` vocabulary, prepared results exits no longer carry fake enter-only `mapMutationKind` fields, the controller now uses one generic active-request matcher instead of separate enter-vs-exit request helper branches or an unused execution-batch argument on that matcher, native map render controllers no longer fall back to `executionBatch.requestKey` when deriving enter request identity from presentation state, the dead JS/native marker enter first-visible-frame callback/event path is gone because it no longer carried any controller state transition, the internal controller publisher no longer uses the stale `publishProjection(...)` wording, the run-one handoff and marker presentation cluster now use canonical marker-enter/exit naming (`h2_marker_enter`, marker-enter/exit callbacks, `allowEmptyEnter`, and deferred map-moved enter admission), the controller-published pending toggle intent is now real runtime state instead of a hook-owned pulse, the prepared transaction publisher now publishes the snapshot key directly instead of round-tripping through a dedicated bus-patch wrapper, the prepared snapshot-key path no longer carries dead `transactionId/kind/stage/executionOwner` metadata, shared resolver helpers, or shared cover-state projection helpers now that only `preparedPresentationSnapshotKey` still drives a real consumer, and the controller no longer keeps live `loadingMode + resultsCoverVisible` state or any separate entry-mode field on the active execution object. The remaining results seam is therefore internal controller/native bookkeeping vocabulary, not a JS transport contract or parser compatibility fallback, in:
- The Search/root results boundary is narrower too: the lower toggle visual-sync coordination, selector-backed `pendingTogglePresentationIntentId`, results intent-complete binding, and marker-enter settled queue / run-one handoff flush / exit-settled map-close bridge no longer physically live in the outward owner file, and now live under the split `runtime/shared/results-presentation-runtime-owner-contract.ts`, direct owner-inline toggle interaction state/completion, direct owner-inline prepared staging, and direct owner-inline marker enter/exit handoff inside `runtime/shared/use-results-presentation-runtime-owner.ts` instead of making `index.tsx` wire those results/toggle/handoff lanes together by hand.
- The remaining Search-side results shell is narrower too: `index.tsx` no longer instantiates a shared results runtime owner and a separate Search presentation-controller shell as two halves of one results boundary. That Search-specific composition now lives under `runtime/shared/use-results-presentation-runtime-owner.ts` through `useResultsPresentationOwner(...)`, the mixed `runtime/shared/use-results-presentation-shell-runtime.ts` host is now deleted, the visible Search shell lane is now split directly between `runtime/shared/use-results-presentation-shell-local-state.ts` for local shell state/effects and `runtime/shared/use-results-presentation-shell-model-runtime.ts` for sheet-content plus header/default-chrome model derivation, `runtime/shared/results-presentation-shell-runtime-contract.ts` now owns the grouped shell action contracts, `runtime/shared/results-presentation-owner-contract.ts` now owns the outward `ResultsPresentationOwner` / `ResultsInteractionModel` / `ResultsSheetExecutionModel` contract surface, and the top-level owner now composes its direct lower runtime lanes with `runtime/shared/use-results-presentation-shell-local-state.ts`, `runtime/shared/use-results-presentation-shell-model-runtime.ts`, direct owner-inline tab and intent planning, direct owner-inline results-sheet execution, direct owner-inline close-transition policy/actions plus editing intent, direct owner-inline prepared enter/exit intent planning over `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts`, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts`, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts`, and direct owner-inline close cleanup plus begin/cancel close flow instead of keeping shell, close, and action composition behind another wrapper layer. The mixed close lane is now split more honestly too: the top-level owner now keeps close-intent bookkeeping, close-transition/finalization policy, close-transition event application, grouped `closeTransitionActions`, focus/exit editing intent policy, and direct prepared enter/exit intent planning over `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts`, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts`, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts`, the top-level owner now keeps deferred close-search cleanup plus begin/cancel close flow inline, and the deleted `runtime/shared/use-results-presentation-close-flow-runtime.ts` host is gone while the top-level owner now stays on grouped close-transition composition over the lower pure close-state helpers. The duplicate outward results-sheet runtime lane is gone too: `useResultsPresentationOwner(...)` no longer mirrors `resultsSheetRuntimeModel`, `shouldRenderResultsSheetRef`, and `resetResultsSheetToHidden` as separate sibling inputs once those already live under `resultsSheetRuntime`, `runtime/shared/use-results-sheet-runtime-surface.ts` now owns grouped `resultsSheetRuntime` publication over the lower Search-root sheet owners, and the top-level owner now keeps lower results-sheet execution publication inline instead of leaving that composition behind another one-consumer adapter. The pure Search results shell/close policy is narrower again too: the deleted `runtime/shared/results-presentation-shell-controller.ts` host is gone, `runtime/shared/results-presentation-shell-contract.ts` now owns shell vocabulary, `runtime/shared/results-presentation-shell-prepared-intent.ts` now owns prepared enter/exit shell policy, `runtime/shared/results-presentation-shell-close-transition-state.ts` now owns close-transition state mutation, and `runtime/shared/results-presentation-shell-visual-runtime.ts` now owns pure header/sheet visual derivation while the stateful shell runtime stays split honestly between those lower shell local/model owners and the close-runtime owners instead of another mixed host. The tab/toggle composition lane is narrower too: the top-level owner now keeps direct active-tab commit, pending-tab clearing/publication, and prepared tab-switch choreography inline instead of routing those behaviors through another interaction wrapper tier. That runtime-owned shell is grouped more honestly now too: the root, route-publication path, and foreground chrome no longer cross flat sibling results-shell props, and instead consume one `shellModel` boundary plus grouped `presentationActions` / `closeTransitionActions`. The route-overlay publication contract is narrower again too: the root no longer builds synthetic `resultsRoutePresentationModel`, `routePublicationModel`, final results-panel compatibility bags, grouped overlay-runtime bags, or grouped publication bags before entering the lower panel publication lane built from `runtime/shared/use-search-results-panel-data-runtime.tsx`, `runtime/shared/use-search-results-panel-read-model-runtime.tsx`, `runtime/shared/use-search-results-panel-render-policy-runtime.tsx`, `runtime/shared/use-search-results-panel-covered-render-runtime.tsx`, `runtime/shared/use-search-results-panel-surface-state-runtime.tsx`, `runtime/shared/use-search-results-panel-interaction-frost-runtime.tsx`, `runtime/shared/use-search-results-panel-surface-background-runtime.tsx`, `runtime/shared/use-search-results-panel-surface-overlay-runtime.tsx`, `runtime/shared/use-search-results-panel-spec-runtime.tsx`, `runtime/shared/use-search-results-panel-route-visibility-runtime.tsx`, and that shared path now consumes the real results owner surface plus direct panel-model runtime, overlay-runtime, and publication inputs instead of another flat compatibility bag. The old mixed panel data host is narrower too: `runtime/shared/search-results-panel-data-runtime-contract.ts` now owns the outward panel-data contract, `runtime/shared/use-search-results-panel-input-runtime.ts` now owns Search-owner shell/actions plus tab-toggle commands together with the split Search-bus selector and overlay-runtime inputs, `runtime/shared/search-results-panel-hydration-runtime-contract.ts` now owns the hydration contract surface, `runtime/shared/use-search-results-panel-retained-results-runtime.ts` now owns retained-results policy plus resolved dishes/restaurants, `runtime/shared/use-search-results-panel-hydration-key-runtime.ts` now owns hydrated-key state, runtime sync, render admission, and request-version derivation, `runtime/shared/use-search-results-panel-on-demand-query-runtime.ts` now owns on-demand query derivation, `runtime/shared/use-search-results-panel-hydration-content-runtime.ts` is now composition-only over those lower hydration owners, `runtime/shared/use-search-results-panel-filters-content-runtime.ts` now owns filter-header composition over the hydrated content lane, `runtime/shared/use-search-results-panel-card-content-runtime.tsx` now owns card metrics, on-demand notice, and renderer assembly over that hydrated content lane, and the thinner `runtime/shared/use-search-results-panel-data-runtime.tsx` is now composition-only over those lower owners. The read-model lane is narrower too: `use-search-results-panel-chrome-runtime.tsx` now owns header/layout/chrome-freeze publication, `use-search-results-panel-list-selectors-runtime.tsx` now owns selector construction, `use-search-results-panel-list-layout-runtime.tsx` now owns placeholder/key/item-layout assembly, `use-search-results-panel-list-publication-runtime.tsx` now owns hydration-bus publication, and `use-search-results-panel-read-model-runtime.tsx` is down to composition. The remaining panel publication boundary is flatter too: `index.tsx` now composes final Search-route publication directly from those lower panel publication owners plus docked-polls publication through `useSearchRouteOverlayRuntime(...)`, and composes the final chrome render-model lane directly through `use-search-overlay-chrome-render-model.ts` instead of routing those concerns through deleted foreground wrappers.
- The owner lane is flatter again too: the deleted `runtime/shared/use-results-presentation-owner-surface-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-close-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-intent-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-search-close-runtime.ts`, and deleted `runtime/shared/results-presentation-owner-close-runtime-contract.ts` no longer sit between the top-level owner and the real lower owners. `runtime/shared/use-results-presentation-runtime-owner.ts` now stays on direct composition over its direct runtime-machine, prepared-staging, toggle-lifecycle, and marker-handoff lanes, `runtime/shared/use-results-presentation-shell-local-state.ts`, `runtime/shared/use-results-presentation-shell-model-runtime.ts`, direct owner-inline tab and intent planning, and direct owner-inline results-sheet execution, direct owner-inline close-transition policy/actions plus editing intent, and direct owner-inline close cleanup plus begin/cancel close flow, with outward `presentationActions` assembled inline.
- The owner close lane is flatter too: the top-level owner now consumes the lower close-transition, editing/execution intent, close-search cleanup, begin/cancel close, and outward owner-actions lanes directly instead of another grouped close wrapper.
- The execution-intent lane is flatter too: `runtime/shared/results-presentation-execution-intent-runtime-contract.ts` now owns the shared execution-intent vocabulary, `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts` now owns shell application, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts` now owns staged enter execution, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts` now owns committed exit execution while the top-level owner now owns direct enter/close intent planning and dispatches over those lower owners.
- The prepared-snapshot execution lane is flatter again too: the deleted `runtime/shared/use-results-prepared-snapshot-execution-runtime.ts` wrapper no longer sits between the top-level owner and the real lower executors. `runtime/shared/results-prepared-snapshot-execution-runtime-contract.ts` now owns the lower prepared-execution vocabulary, `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts` now owns cancel/backdrop/input-mode shell application, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts` now owns staged enter execution, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts` now owns committed exit execution while the top-level owner dispatches directly over those lower owners.
- The Search-route overlay store contract is narrower too: it no longer carries `activeSearchSheetContent`, `panelPublication`, or `pollsPanelInputs` as Search-shaped payload vocabulary. The live overlay runtime now stores a host-ready route model with direct `searchPanelSpec`, direct `searchPanelInteractionRef`, direct docked-polls inputs, and explicit `shouldShowSearchPanel` / `shouldShowDockedPollsPanel` booleans, so `SearchRouteLayerHost.tsx` consumes final overlay-ready data instead of reinterpreting Search-specific content semantics out of the store.
- The Search-route host-input contract is narrower too: the overlay runtime no longer stores separate `routePublication` and `renderState` fragments that always travel together, it no longer collapses them back into one synthetic `hostModelInput` lane, it no longer preserves single-field `panelContent` / `auxiliaryInputs` wrappers, and it no longer preserves a `searchPanelModel` bag either. The deleted `useSearchRouteSearchPanelModel.ts` no longer sits between the lower search-panel lanes and publication, `useSearchRouteDockedPollsPanelInputs.ts` owns direct docked-polls inputs, the deleted `useSearchRouteHostModelInput.ts` no longer sits between those lower owners and publication, `useSearchRouteOverlayRenderPolicy.ts` now owns final host render-policy derivation, `useSearchRouteOverlayRuntimePublication.ts` now owns runtime-store publication of direct `searchPanelSpec` + direct `searchPanelInteractionRef` + direct `dockedPollsPanelInputs` + `renderPolicy`, and `useSearchRouteOverlayRuntime.ts` now stays on thin composition over those lower overlay owners instead of Search publishing another route-publication bag first.
- The Search-route host-render seam is narrower too: `SearchRouteLayerHost.tsx` is now a thin renderer, and the live host lane is split more honestly underneath it: `useSearchRouteOverlayPublishedState.ts` owns the published visual/search-panel/render-policy selectors, `useSearchRouteOverlayRouteState.ts` owns overlay-route selection, `useSearchRoutePollsPanelRuntimeModel.ts` now owns the polls panel runtime model, `useSearchRoutePollsPanelActions.ts` now owns the polls snap/restore/create action lane, `useSearchRoutePollsPanelSpec.ts` now stays on thin composition over those lower polls owners, and the lower polls panel itself is flatter too: `panels/runtime/polls-panel-runtime-contract.ts` now owns the explicit polls panel contract, `panels/runtime/polls-panel-state-runtime.ts` now owns polls feed/bootstrap/autocomplete/local derived state, `panels/runtime/polls-panel-interaction-runtime.ts` now owns submit payload assembly plus snap/header/create interactions, and `panels/PollsPanel.tsx` now stays on presentation/spec composition over those lower polls owners. The deleted `useSearchRouteTabOverlayPanelSpecs.ts` wrapper no longer sits above the tab family, `useSearchRouteTabPanelRuntime.ts` now owns shared bookmarks/profile visual inputs, `useSearchRouteBookmarksPanelSpec.ts` and `useSearchRouteProfilePanelSpec.ts` now own the direct bookmarks/profile spec families, `useSearchRoutePollCreationPanelSpec.ts` and `useSearchRouteSaveListPanelSpec.ts` still own their dedicated families, the deleted `useSearchRouteOverlayPanelSpecFamilies.ts` wrapper no longer sits above that family lane, `useResolvedSearchRouteHostModel.ts` now composes those direct polls/poll-creation/bookmarks/profile/save-list owners itself, `useSearchRouteOverlaySheetKeys.ts` now owns route-sheet key derivation, the deleted `useSearchRouteOverlayPanelSpecsRuntime.ts` wrapper no longer sits above that route/spec lane, the deleted `useSearchRouteOverlayResolvedSheetProps.ts` wrapper no longer sits above final host suppression either, `useSearchRouteOverlayActiveSheetSpec.ts` now owns active sheet/spec plus final search-interaction resolution directly over those lower family outputs, `useSearchRouteOverlaySheetVisibilityState.ts` now owns spec suppression and final overlay visibility policy, `useSearchRouteFrozenOverlaySheetProps.ts` owns the frozen overlay-sheet props latch, `useSearchRouteOverlayHeaderActionMode.ts` owns the header-action reset/freeze lane, `useSearchRouteFrozenOverlayRenderModel.ts` now stays on thin composition over those lower freeze owners, and `useResolvedSearchRouteHostModel.ts` now stays on composition only before the layer host renders.
- The Search-route render-state contract is narrower too: the overlay runtime no longer carries raw `isSuggestionPanelActive` / `isForegroundEditing` flags into the app host. It now carries host-ready suppression policy (`shouldSuppressSearchAndTabSheetsForForegroundEditing`, `shouldSuppressTabSheetsForSuggestions`), so the overlay side no longer interprets raw Search foreground state to decide host suppression.
- The Search-route runtime-store seam is narrower too: `searchRouteOverlayRuntimeStore.ts` no longer mixes the published route host snapshot with the imperative Search header-reset lane, it no longer keeps another `SearchRouteOverlayRuntimeSnapshot` wrapper, it no longer keeps single-field `panelContent` / `auxiliaryInputs` bags, and it no longer keeps a `searchPanelModel` bag either. The runtime store now owns the direct published `visualState`, direct `searchPanelSpec`, direct `searchPanelInteractionRef`, direct `dockedPollsPanelInputs`, and `renderPolicy` lanes, while the header follow-collapse reset token/command now lives under `searchRouteOverlayCommandStore.ts`.
- The Search-route command lane is narrower too: `index.tsx` and `useResolvedSearchRouteHostModel.ts` no longer select `searchRouteOverlayCommandStore.ts` field-by-field or build save-sheet, docked-polls restore, and close-results-ui-reset actions inline. `searchRouteOverlayCommandRuntimeContract.ts`, `useSearchRouteOverlayCommandState.ts`, `useSearchRouteOverlayCommandActions.ts`, `useSearchRouteOverlaySaveSheetRuntime.ts`, `useSearchRouteOverlayDockedPollsRestoreRuntime.ts`, and `useSearchRouteOverlayResultsUiResetRuntime.ts` still own the lower command-state/action/save/reset lanes, and `overlays/useSearchRouteOverlayCommandRuntime.ts` now owns the Search-facing composition over that lower overlay command stack so the Search root consumes one grouped overlay command owner instead of another root-local command cluster.
- The Search restaurant publication lane is narrower too: the Search path no longer builds a pseudo restaurant host model through `RestaurantRouteHostDraft` or `createRestaurantRouteHostModelFromDraft(...)`. `runtime/shared/use-search-restaurant-route-panel-runtime.ts` now owns direct route-level panel contract assembly, `runtime/shared/use-search-restaurant-route-host-state-runtime.ts` now owns direct restaurant host-state assembly, `runtime/shared/use-search-restaurant-route-host-model-runtime.ts` now stays on thin composition over those lower panel/state owners, and `overlays/restaurantRouteHostContract.ts` now exposes the real host-state/visual-state boundary without the old Search-only draft adapter.
- The JS map path is narrower too: phase derivation and active enter-request derivation now live in shared helpers under `search-map-render-controller.ts`, rather than being re-implemented separately in the adapter, render-owner, and marker-engine files.
- The map scene-policy boundary is narrower too: `SearchMapWithMarkerEngine.tsx` no longer derives presentation phase just to ask for snapshot presentation policy, and now passes shared render presentation state directly into `resolveMapSnapshotPresentationPolicy(...)`.
- `search-map.tsx` is narrower again too: it no longer derives a visual-ready request key from raw render state for label-reset and visible-label scene policy, and now consumes that key from `MapSnapshotPresentationPolicy`.
- The visible label-scene gate is narrower too: `search-map.tsx` no longer merges `preparedResultsSnapshotKey` with the visual-ready request key in component space, and now consumes one `visualSceneKey` from `MapSnapshotPresentationPolicy`.
- The child map boundary is narrower too: `SearchMap` no longer receives `preparedResultsSnapshotKey` as another prop once visible-scene gating and readiness churn consume `MapSnapshotPresentationPolicy.visualSceneKey` instead.
- The map policy equality contract is single-owned now too: `search-map.tsx` no longer owns a field-by-field comparator for `MapSnapshotPresentationPolicy`, and now consumes that equality helper from the map presentation controller.
- The native render-owner diagnostics seam is narrower too: dropped-frame presentation diagnostics no longer map snapshot kind into `laneKind` inline in the hook, and now consume a shared diagnostics projection from `search-map-render-controller.ts`.
- The map presentation adapter is narrower again too: it no longer hand-builds `SearchMapRenderPresentationState` from results execution fields, and now consumes that builder from `search-map-render-controller.ts`; the `.d.ts` surface now also matches the live adapter return shape.
- The native render-owner request-comparison seam is narrower too: current/previous presentation request identity and same-batch comparison no longer derive inline in the hook, and now consume one shared sync-state projection from `search-map-render-controller.ts`.
- The map presentation adapter is narrower too: it no longer exports a separate `labelResetRequestKey` field once that value derives directly from `nativePresentationState` through the shared presentation-request helper at the callsite.
- `search-map.tsx` is narrower too: it no longer takes `labelResetRequestKey` as another prop, and now derives that visual-ready key directly from `nativePresentationState`.
- The results panel is narrower too: it no longer consumes the full `resultsPresentationExecution` object just to derive render UI, and now subscribes to the smaller derived render-policy model directly.
- That render-policy path is narrower again too: the panel now selects only `snapshotKind`, `executionStage`, and `coverState` before deriving render policy, because the policy helper no longer requires the whole execution object.
- The prepared-results coordinator is narrower too: it no longer consumes the full `resultsPresentationExecution` object just to compute the committed prepared snapshot key, and now subscribes only to `transactionId`, `snapshotKind`, `executionStage`, and the live results snapshot key.
- Prepared snapshot-key ownership and map request-key derivation are also cleaner now: both use the shared stage-settled helper instead of hard-coding duplicate idle/settled checks.
- The prepared-results coordinator is cleaner internally too: staged commit promotion now follows the selected readiness/runtime inputs directly instead of carrying a second imperative bus watcher for the same keys.
- The prepared-results coordinator is narrower again too: it no longer calls `searchRuntimeBus.getState()` to capture the staging snapshot key during stage, and now uses the already-selected runtime `resultsSnapshotKey` input directly.
- The remaining Search-owned results shell is narrower too: `index.tsx` no longer owns results-executor creation, the staged prepared-snapshot ref, the stage/commit/clear policy inline, the later results-sheet interaction cluster, or another grouped `searchResultsRuntimeOwner` memo. The staged prepared-snapshot coordination now lives in `prepared-presentation-transaction.ts`, the stateful results runtime machine now lives under the dedicated lower `results-presentation-runtime-machine.ts` owner instead of escaping from `results-presentation-runtime-contract.ts`, public runtime ownership now lives in `runtime/shared/results-presentation-runtime-owner-contract.ts`, the lower toggle/prepared/handoff lane now terminates directly inside `runtime/shared/use-results-presentation-runtime-owner.ts`, and the lower close lane is now split across direct owner-inline close-transition policy/actions plus editing intent, direct owner-inline prepared enter/exit intent planning over `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts`, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts`, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts`, direct owner-inline close cleanup plus begin/cancel close flow. The deleted `runtime/shared/use-results-presentation-owner-close-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-surface-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-intent-runtime.ts`, deleted `runtime/shared/use-results-presentation-owner-search-close-runtime.ts`, and deleted `runtime/shared/results-presentation-owner-close-runtime-contract.ts` wrappers are now gone too. The outward composition now lives directly under `runtime/shared/use-results-presentation-runtime-owner.ts`, where the owner composes its direct runtime-machine/staging/toggle/handoff lanes with `runtime/shared/use-results-presentation-shell-local-state.ts`, `runtime/shared/use-results-presentation-shell-model-runtime.ts`, direct owner-inline tab and intent planning, and direct owner-inline results-sheet execution, direct owner-inline close-transition policy/actions plus editing intent, and direct owner-inline close cleanup plus begin/cancel close flow, with outward `presentationActions` assembled inline instead of physically hosting that full Search-facing shell/close/interaction/sheet publication surface inside another wrapper stack. The deleted `runtime/shared/use-results-presentation-shell-runtime.ts` host has been replaced by the split lower `runtime/shared/use-results-presentation-shell-local-state.ts` and `runtime/shared/use-results-presentation-shell-model-runtime.ts` owners for visible shell state/model work plus the lower close owners for prepared enter/exit and close-intent execution. The pure shell/close derivation is narrower too: the deleted `runtime/shared/results-presentation-shell-controller.ts` host is gone, `runtime/shared/results-presentation-shell-contract.ts` now owns shell vocabulary, `runtime/shared/results-presentation-shell-prepared-intent.ts` now owns prepared enter/exit shell policy, `runtime/shared/results-presentation-shell-close-transition-state.ts` now owns close-transition state mutation, and `runtime/shared/results-presentation-shell-visual-runtime.ts` now owns pure header/sheet visual derivation. The Search-side results compatibility surface is flatter too: the deleted `runtime/shared/use-search-results-presentation-runtime-owner.ts`, `runtime/shared/use-search-results-interaction-runtime-owner.ts`, `runtime/shared/use-search-results-runtime-owner.ts`, and `runtime/shared/search-results-runtime-owner-contract.ts` no longer sit between the root and the shared results path. `index.tsx` now composes the lower sheet-runtime owners (`use-results-sheet-shared-values-runtime.ts`, `use-results-sheet-runtime-model-runtime.ts`, `use-results-sheet-animated-styles-runtime.ts`, `use-results-sheet-visibility-state-runtime.ts`, `use-results-sheet-visibility-actions-runtime.ts`, `use-results-sheet-visibility-sync-runtime.ts`, and `use-results-sheet-runtime-surface.ts`) and the lower interaction owners (`use-results-sheet-load-more-runtime.ts`, `use-results-sheet-interaction-state-runtime.ts`, and `use-results-sheet-snap-runtime.ts`, with `use-results-sheet-interaction-surface.ts` still publishing the grouped `resultsSheetInteractionModel`) directly, then feeds the real `resultsSheetRuntime` into `useResultsPresentationOwner(...)`. The route publication plus foreground chrome path now consumes the real lower `resultsPresentationOwner`, `resultsSheetRuntime`, and `resultsSheetInteractionModel` lanes directly instead of another root-local compatibility memo.
- The map presentation adapter is narrower again too: it no longer subscribes to the whole `resultsPresentationExecution` object, and now reads only the exact execution fields needed to build `nativePresentationState`.
- That map transport edge is cleaner too: the adapter no longer re-wraps that payload behind a `SearchMapNativePresentationState` alias or a no-op builder, and now exposes the shared render-controller presentation type directly.
- `search-map.tsx` no longer owns its own copy of the presentation transport equality contract either; presentation-state equality now lives with the shared render-controller presentation type.
- The native render-owner path is cleaner too: it no longer hand-checks presentation deltas field-by-field, and now uses that same shared presentation-state equality contract.
- Native render-owner status no longer receives a parallel `presentationBatchPhase` prop either; it now derives phase from the same shared presentation state contract it already depends on.
- Native render-owner status is narrower again too: it no longer keeps a whole phase ref just to test `idle` vs non-`idle`, and now stores only the derived active-presentation gate it actually uses.
- That render-owner status seam is tighter again too: the hook no longer translates shared presentation state into `batchPhase + isPresentationActive` inline, and now consumes one shared status projection from `search-map-render-controller.ts`.
- The native render-owner frame-admission path is cleaner too: it now computes current/previous presentation request identity once and reuses that through force-replace and same-batch checks instead of re-deriving the same request key in multiple local branches.
- That same frame path is a bit tighter again too: the current execution request identity is now reused all the way through batch-id and churn logging instead of being reintroduced under a second local name later in the pass.
- The map-presentation to motion-pressure transaction mapping is single-owned now too: the render-controller contract derives that projection instead of leaving the native render-owner hook to map presentation phase into motion-pressure phase inline.
- The results-sheet visual model and runtime freeze diagnostics are narrower too: they no longer sample broad runtime state inside effects just to log screen/freeze snapshots, and now subscribe only to `runOneHandoffPhase`, `executionStage`, and `coverState`.
- The runtime diagnostics/profiler lane is narrower again too: `runtime/shared/use-search-runtime-instrumentation-runtime.ts` now owns the selector-backed profiler state, harness observer composition, stage-hint refs, commit-span pressure advancement, and stall-frame ticker, so `index.tsx` no longer hosts that mixed profiler/diagnostics shell inline.
- The runtime profiler is narrower too: it no longer keeps a ref to the whole `resultsPresentationExecution` object just to derive stage hints, and now tracks only the derived “presentation pending” bit alongside the hydration signal it already owned.
- The runtime profiler is narrower again too: it no longer uses imperative `getState()` + subscribe loops for `resultsPresentationExecution`, `shouldHydrateResultsForRender`, or `isLoadingMore`, and now consumes those through one narrow selector-backed runtime state slice under `use-search-runtime-instrumentation-runtime.ts`.
- Harness pending-state and runtime telemetry root-state logging are narrower too: they no longer depend on the whole execution object just to answer “is presentation still pending?”, and now use a stage-level pending helper plus narrow execution-stage selectors.
- The shortcut harness observer is narrower again too: it now composes through `runtime/shared/use-search-runtime-instrumentation-runtime.ts`, no longer uses `searchRuntimeBus.getState()` for active operation and hydration-settle inputs during trace-stage and settle-boundary evaluation, and now consumes those through the same selector-backed runtime slice as map-reveal pending.
- The shortcut harness observer results seam is narrower too: it no longer subscribes to the full `results` object, and now selects only dish count, restaurant count, and `hasResults`.
- The root UI effects seam is narrower too: `use-search-root-ui-effects.ts` no longer reaches into the runtime bus just to resolve the restaurant-only match, and now consumes selected restaurant results from the composition root instead.
- The submit-actions seam is narrower too: `use-search-submit-actions.ts` no longer consults the runtime bus for pagination/loading-more gates, and now consumes selected `isLoadingMore` state from the composition root.
- The runtime-flags seam is narrower too: `runtime/shared/use-search-runtime-flags-runtime.ts` now owns the selector-backed search-mode/session/loading lane directly, including `runOneHandoffOperationId` selection, request-loading publication, and `hydrationOperationId` derivation from that same runtime slice instead of leaving that shell inline at the root or behind the older `use-search-runtime-flags.ts` wrapper.
- The results-runtime-controller seam is narrower too: `use-search-results-runtime-controller.ts` no longer consults the runtime bus for root-owned tab/session/pagination state, and now consumes selected `activeTab`, `isSearchSessionActive`, `isLoadingMore`, `canLoadMore`, and `currentPage` inputs from the composition root.
- The runtime-bus-effects seam is narrower too: `use-search-runtime-bus-effects.ts` no longer imperatively reads the runtime bus to preserve filter-toggle draft fields, and now consumes that draft state through one selector-backed runtime slice.
- The clear-controller seam is narrower too: `use-search-clear-controller.ts` no longer consults the runtime bus for root-owned search-presence/loading-more checks, and now consumes selected `hasResults`, `submittedQuery`, and `isLoadingMore` inputs from the composition root.
- The submit-runtime-controller seam is narrower too: `use-search-submit-runtime-controller.ts` no longer consults the runtime bus for `pendingTogglePresentationIntentId`, and now consumes that transaction id through a dedicated root selector.
- The query-mutation seam is narrower too: `query-mutation-orchestrator.ts` no longer consults the runtime bus for current `openNow` / votes-filter toggle state, and now consumes those root-owned filter values directly from the composition root.
- The map polish-lane seam is narrower too: `use-search-map-lane-advancement.ts` no longer uses imperative bus reads/subscriptions for active operation state, and now follows selected `activeOperationId`, `activeOperationLane`, and `executionStage` directly.
- `runtime/shared/use-search-runtime-flags-runtime.ts` is cleaner too: it no longer reaches into the runtime bus outside that dedicated selector-backed owner and now resolves current `searchMode`, `isSearchSessionActive`, and request-loading state inside one lower runtime lane before publishing writes.
- The root freeze-gate seam is narrower too: `runtime/shared/use-search-freeze-gate-runtime.ts` now owns the response-frame freeze latch, freeze-gate selector surface, freeze diagnostic logging, operation-scoped commit/stall pressure cleanup, and the shortcut-mode stall-frame watcher directly instead of leaving that run-one/freeze shell inline at the root.
- The root runtime-primitives and map-bootstrap seams are narrower too: `runtime/shared/use-search-runtime-primitives-runtime.ts` now owns the sheet-dragging/search-request refs, perf-now helper, memory diagnostics stub, and marker-engine shortcut coverage bridge callbacks, while `runtime/shared/use-search-map-bootstrap-runtime.ts` now owns the access-token/style readiness lane, startup camera bootstrap, initial visible-bounds priming, and main-map-ready publication. `index.tsx` no longer keeps either mixed primitive/bootstrap shell inline.
- The outer submit seam is narrower too: `use-search-submit-owner.ts` no longer consults the runtime bus for top-level `submittedQuery` fallbacks or the initial append/loading-more guard, and now consumes selected `submittedQuery` / `isLoadingMore` inputs from the composition root.
- The submit pagination seam is narrower too: `use-search-submit-owner.ts` no longer consults the runtime bus for top-level load-more gating state, and now consumes selected `hasResults`, `canLoadMore`, `currentPage`, and `isPaginationExhausted` inputs from the composition root for `loadMoreResults(...)` and `loadMoreShortcutResults(...)`.
- Submit action ownership is narrower too: `use-search-submit-owner.ts` no longer keeps the final `loadMoreResults(...)` and `rerunActiveSearch(...)` wrappers inline, and now delegates those Search-facing action shells through `use-search-submit-action-owner.ts`.
- Submit owner diagnostics are narrower too: `use-search-submit-owner.ts` no longer owns `searchPerfDebug` policy, top-level `[SearchPerf]` submit logs, or the one-shot submit cutover probe; the Search-facing submit owner now just passes no-op logging callbacks into the lower boundaries instead of carrying another probe policy shell at the top.
- Submit owner composition is narrower too: `use-search-submit-owner.ts` no longer manufactures scheduling helpers, no-op diagnostics helpers, or the shared load-more rate-limit formatter just to thread them into lower owners. Entry scheduling now lives under `use-search-submit-entry-owner.ts`, lower submit owners default their own optional diagnostics lanes, and shared load-more error formatting now lives in `search-submit-runtime-utils.ts`.
- The Search-facing submit boundary is more explicit too: `use-search-submit-owner.ts` no longer accepts one flat catch-all construction bag from `index.tsx`, and now consumes one grouped contract of `readModel`, `uiPorts`, and `runtimePorts` instead.
- That outer submit seam is a bit tighter again too: the entity-search and shortcut-rerun entry paths no longer read the runtime bus just to clear `isLoadingMore`, and now use the same selected `isLoadingMore` read-model already threaded into `use-search-submit-owner.ts`.
- The append-response submit seam is narrower too: `use-search-submit-owner.ts` no longer consults the runtime bus for append-path current results / pending-tab-switch / pagination-exhaustion reads when merging response state and precomputing marker pipelines, and now consumes explicit `currentResults`, `pendingTabSwitchTab`, `activeTab`, and `isPaginationExhausted` inputs from the composition root.
- The deferred submit settle seam is narrower too: `use-search-submit-owner.ts` no longer imperatively reads the runtime bus during hydration-settle / runtime-settle polling or natural-response tab fallback, and no longer owns the selector-backed runtime gate slice or the healthy-frame / hydration-settle / runtime-settle polling helpers either; that settle scheduler shell now lives under `use-search-submit-response-owner.ts`, while `use-search-submit-owner.ts` only feeds the composition-root `activeTab` read-model into the response boundary.
- Response-meta ownership is narrower too: `use-search-submit-owner.ts` now resolves response active-tab and pagination publish state through centralized helper projection instead of mixing those semantics inline with nested bus-write branches inside `handleSearchResponse(...)`.
- The phase-A response commit seam is narrower too: `use-search-submit-owner.ts` now resolves merged-results + precomputed-marker publish state through one centralized response-commit projection helper instead of assembling that patch inline inside `handleSearchResponse(...)`.
- Committed response identity is narrower too: `handleSearchResponse(...)` now uses the phase-A committed response projection as its single request-id source for commit, page-one callbacks, deferred UI writes, and settle transitions instead of mixing `normalizedResponse.metadata` reads with the committed publish path.
- Deferred non-append UI application is narrower too: `use-search-submit-owner.ts` now resolves the post-commit submitted-query/reset-sheet projection through one helper instead of assembling another inline runtime patch plus single-restaurant hide branch inside `handleSearchResponse(...)`.
- History projection is narrower too: `use-search-submit-owner.ts` now resolves recent-search upsert eligibility/payload through one response-history helper instead of interpreting response filters plus submission context inline inside `handleSearchResponse(...)`.
- Submit finalization ownership is narrower too: natural/entity/shortcut/append paths no longer each assemble their own “finalized without response lifecycle” shadow-cancel + idle cleanup sequence, and now share one runtime finalization helper in `use-search-submit-owner.ts`.
- Response settle sequencing is narrower too: `use-search-submit-owner.ts` no longer owns the full nested `visual_released -> phase_b_materializing -> settled` lane/hydration/healthy-frame script inline, and now delegates that sequence through the dedicated `use-search-submit-response-owner.ts` boundary.
- Post-commit UI follow-up is narrower too: `use-search-submit-owner.ts` no longer owns lane-C/meta, deferred UI, history upsert, and keyboard/scroll follow-up inline, and now delegates that whole post-commit block through the dedicated `use-search-submit-response-owner.ts` boundary.
- Phase-A commit ownership is narrower too: `use-search-submit-owner.ts` no longer owns the `phase_a_committed` acceptance, lane-B publish, and page-one commit callback script inline, and now delegates that through the dedicated `use-search-submit-response-owner.ts` boundary.
- The response entry boundary is narrower too: `use-search-submit-owner.ts` no longer carries normalization + stale-guard setup + response dispatch inline, and now delegates that owned response-lifecycle entry through `use-search-submit-response-owner.ts`.
- The response-lifecycle executor boundary is narrower too: `use-search-submit-owner.ts` no longer prepares the merged response context and commit/post-commit/settle script inline, and now delegates that owned response lifecycle through `use-search-submit-response-owner.ts`.
- The response-lifecycle entry boundary is narrower too: the `response_received` gate, apply-token stale guard, and normalized-response handoff no longer live in `use-search-submit-owner.ts`, and now sit under `use-search-submit-response-owner.ts`.
- Submit failure ownership is narrower too: natural, entity, shortcut, and shortcut-append no longer each assemble their own runtime error transition + idle cleanup + UI error script, and now delegate that through one shared `failSearchRequestLifecycle(...)` helper.
- Submit final-attempt ownership is narrower too: natural, entity, shortcut, and shortcut-append no longer each assemble their own loading-more unwind or in-flight reset plus `finalized_without_response_lifecycle` fallback in `finally`, and now delegate that through one shared `finalizeSearchRequestAttempt(...)` helper.
- Submit request-attempt activation is narrower too: entity, shortcut, and shortcut-append no longer each assemble request-id allocation, active-request ownership, tuple creation, shadow activation, and reject-time tuple cleanup inline, and now delegate that through one shared `startSearchRequestAttempt(...)` helper while the natural path stays explicit for the cutover contract gate.
- Structured submit foreground prep is narrower too: entity and shortcut no longer each assemble their own pre-request `setSearchRequestInFlight(true)` + presentation-intent start + submit UI lanes + keyboard dismiss + optional replace-results script, and now delegate that through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Structured submit request execution is narrower too: entity, shortcut, and shortcut-append no longer each assemble their own timed `runSearch({ kind: 'structured' ... })` block inline in `use-search-submit-owner.ts`, and now delegate that through the dedicated `use-search-submit-execution-owner.ts` boundary, which owns the shared structured execution helpers.
- Structured response handoff is narrower too: entity, shortcut, and shortcut-append no longer each assemble their own response logging plus `handleSearchResponse(...)` option bag inline in `use-search-submit-owner.ts`, and now delegate that through the dedicated `use-search-submit-execution-owner.ts` boundary, which owns the shared response-start helpers plus optional pre-handoff shortcut coverage publication.
- Shortcut structured request-state ownership is narrower too: `use-search-submit-owner.ts` no longer owns shortcut coverage/search-request ref state directly, and now routes coverage priming, append payload carry-forward, and response coverage publication through the dedicated `use-search-submit-structured-helper-owner.ts` boundary.
- Shortcut structured response ownership is narrower too: shortcut rerun and shortcut append no longer each assemble their own shortcut-specific response-received payload and coverage-publication handoff inline, and now delegate that through one shared `startShortcutStructuredResponseLifecycle(...)` helper.
- Restaurant entity structured payload ownership is narrower too: `runRestaurantEntitySearch(...)` no longer mutates the structured payload field-by-field inline, and now delegates entity-specific payload shaping plus submission-context construction through the dedicated `use-search-submit-structured-helper-owner.ts` boundary.
- Initial structured request preparation is narrower too: entity search and shortcut rerun no longer each assemble their own “clear loading-more, log loading-state, build page-one structured payload, stale-check tuple” script inline, and now delegate that through the dedicated `use-search-request-preparation-owner.ts` boundary instead of another local submit helper cluster.
- Structured request execution handoff is narrower too: entity search, shortcut rerun, and shortcut append no longer each assemble their own “execute structured request, log response, guard active request, start response lifecycle” sequence inline in `use-search-submit-owner.ts`, and now delegate that through the dedicated `use-search-submit-execution-owner.ts` boundary instead of another local helper cluster.
- Structured initial request orchestration is narrower too: entity search and shortcut rerun no longer each assemble their own request-attempt shell (activation, map-reset, foreground-UI prep, shared failure path, shared finalization path) inline, and now delegate that through the dedicated `use-search-structured-submit-owner.ts` boundary instead of another local submit helper cluster.
- Structured append orchestration is narrower too: shortcut append no longer owns loading-more token setup, append attempt activation, shared append failure handling, and append finalization inline, and now delegates that through the dedicated `use-search-structured-submit-owner.ts` boundary instead of another local submit helper cluster.
- Natural request execution handoff is narrower too: `submitSearch(...)` no longer owns the inline `runSearch({ kind: 'natural' })` timing/logging, active-request guard, and response-lifecycle start block in `use-search-submit-owner.ts`, and now delegates that through the dedicated `use-search-submit-execution-owner.ts` boundary.
- Natural request payload preparation is narrower too: `submitSearch(...)` no longer assembles the natural payload, request-bounds capture, and user-location hydration inline after activation, and now delegates that through the dedicated `use-search-request-preparation-owner.ts` boundary instead of another local submit helper cluster.
- Natural foreground UI orchestration is narrower too: the non-append natural path no longer owns its pre-request UI shell inline after activation, and now delegates presentation-intent start, lane scheduling, loading-more reset, and replace-results fallback through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Natural request orchestration is narrower too: `submitSearch(...)` no longer owns the post-activation try/catch/finalize shell inline, and now delegates loading-more token setup, shared natural failure handling, and finalization through the dedicated `use-search-natural-submit-owner.ts` boundary instead of another local submit helper cluster.
- Natural request decision shaping is narrower too: `submitSearch(...)` no longer resolves submission source/context, tab, preserve-sheet policy, open-now/filter policy, and force-fresh-bounds policy inline, and now delegates that option-to-runtime config mapping through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Natural response handoff is narrower too: `submitSearch(...)` no longer assembles the natural `handleSearchResponse(...)` option bag inline in `use-search-submit-owner.ts`, and now delegates that through the dedicated `use-search-submit-execution-owner.ts` boundary.
- Natural entry-shell ownership is narrower too: `submitSearch(...)` no longer owns append gating, pre-activation map-reset, query normalization, and empty-query clear inline, and now delegates that through the dedicated `use-search-submit-entry-owner.ts` boundary instead of another local submit helper cluster.
- Natural response logging ownership is narrower too: response payload logging no longer happens from both the natural execution helper and the natural response-lifecycle helper, and now stays single-owned in `startNaturalResponseLifecycle(...)`.
- Natural post-activation ownership is narrower too: `submitSearch(...)` no longer owns the full post-activation foreground-UI, payload-prep, run-search, and response-start script inline, and now delegates that through the dedicated `use-search-natural-submit-owner.ts` boundary instead of another local submit helper cluster.
- Structured response handoff ownership is narrower too: entity and shortcut branches no longer thread fixed response-log labels and fixed response-received payload assembly inline, and now keep those mode-owned details under dedicated entity/shortcut response helpers.
- Structured execution label ownership is narrower too: entity and shortcut branches no longer thread fixed debug/timing/response-phase labels inline, and now keep those mode-owned execution labels under dedicated structured execution helpers.
- Structured entry-config ownership is narrower too: entity and shortcut rerun branches no longer assemble fixed submit-intent and foreground-UI config inline, and now keep those mode-owned entry shells under dedicated structured entry-config helpers.
- Shortcut append entry-config ownership is narrower too: the append branch no longer assembles its fallback label and fixed submit-intent config inline, and now keeps that shortcut-owned setup under one dedicated append entry-config helper.
- Shortcut response-start ownership is narrower too: rerun and append branches no longer thread fixed `append`/`targetPage`/fallback-request-id/initial-UI-state response fields inline, and now keep those shortcut-owned lifecycle details under dedicated initial-vs-append response helpers.
- Mode-owned structured execution scripts are narrower too: entity, shortcut rerun, and shortcut append branches no longer own their full inline “prepare payload, run search, start lifecycle” scripts, and now delegate those through dedicated mode-owned execution helpers.
- Prepared-results coordinator ownership is narrower too: it no longer stitches together `transactionId` / `snapshotKind` / `executionStage` just to derive the committed prepared snapshot key, and now consumes one shared committed-key derivation instead.
- Published prepared snapshot-key ownership is narrower too: the map layer no longer redefines the fallback from `preparedPresentationSnapshotKey` to hydration/request keys inline, and now consumes one shared prepared-snapshot-key derivation from the runtime contract.
- Shared map presentation-state ownership is narrower too: the map adapter no longer hand-selects execution fields and rebuilds `SearchMapRenderPresentationState` inline, and now consumes one shared runtime-to-presentation projection from the render controller.
- Shared map execution-batch-id ownership is narrower too: the native render owner no longer resolves execution-batch ids inline from presentation/request churn state, and now consumes one shared batch-id derivation from the render controller.
- Shared map transport-diagnostics ownership is narrower too: the native render owner no longer hand-assembles request-key/batch-phase logging fields for churn diagnostics, and now consumes one shared transport-diagnostics projection from the render controller.
- Shared map frame-delta ownership is narrower too: the native render owner no longer computes viewport/presentation/control change booleans inline, and now consumes one shared frame-change derivation from the render controller.
- Shared native render diagnostics ownership is narrower too: the native render owner no longer owns commit-burst message parsing, transition-diagnostic gating, or top-source summary sorting inline, and now consumes those diagnostics derivations from `search-map-render-controller.ts`.
- Shared native render-owner ready-state ownership is narrower too: attach/invalidation ready-state preservation no longer lives as two hook-local branches, and now consumes one shared preservation rule from `search-map-render-controller.ts`; the declaration mirror is also back in sync with the live render-controller contract.
- The root selector surface is a bit tighter too: `index.tsx` no longer carries a second submit-only runtime selector for `currentResults` / `pendingTabSwitchTab`, and now folds those fields into the existing results-arrival selector.
- The composition-root seam is narrower too: `index.tsx` no longer reaches into `searchRuntimeBus.getState()` for search-this-area visibility or close-time hydration flush checks, and now consumes selector-backed `isLoadingMore` plus hydration-key state directly.
- Submit settle gating is narrower too: it no longer reads the whole execution object just to decide whether visual work is settled, and now keys off a stage-level settled helper.
- Map polish-lane advancement and the runtime profiler now also use those stage-level helpers directly instead of routing pending/settled checks through the whole execution object.
- Map polish-lane advancement is narrower again too: it no longer re-reads `resultsPresentationExecution` from the runtime bus inside its subscribe loop once it already has selected `executionStage`, and now subscribes only to active operation changes during runtime advancement.
- The runtime telemetry hook is narrower too: `runtime/shared/use-search-runtime-instrumentation-runtime.ts` now owns run-one phase telemetry, root-state commit telemetry, and presentation-diff telemetry, so `index.tsx` no longer runs that mixed telemetry shell inline and no longer uses imperative bus-watch loops with raw `getState()` reads for those signals.
- The runtime telemetry hook is narrower again too: it no longer selects handoff-operation / execution-stage state twice across overlapping runtime slices, and now shares one selector-backed handoff-presentation state between root-state commit telemetry and presentation-diff telemetry under that lower instrumentation owner.
- The JS render-owner path is narrower too: it no longer compares a ghost `executionBatch.requestKey` field, and instead treats request identity as `transactionId` while batch identity remains `batchId/generationId`.
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-presentation-adapter.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-presentation-transition-runtime.ts`
- Profile presentation has prepared snapshots, prepared-profile execution is ordered directly, and the committed `restaurantPanelSnapshot` rides the runtime bus as a runtime-owned profile projection lane instead of living in Search-local root state. The remaining prepared profile path is much flatter now: `profile-owner-runtime.ts` now owns the full exported `useProfileOwner(...)` boundary and the final execution-port surface, while the lower `profile-owner-runtime-state-owner.ts` owns grouped runtime-state-owner assembly over the lower controller-shell, hydration, close, focus, auto-open, and transition owners, and the lower `profile-owner-execution-models-runtime.ts` owns grouped native/app/prepared execution composition. The lower prepared runtime is flatter too: `profile-prepared-presentation-transaction-runtime.ts` now owns prepared runtime-arg assembly plus prepared transaction/completion execution, `profile-prepared-presentation-entry-runtime.ts` now owns prepared open/close/focus entrypoint assembly, `profile-prepared-presentation-binding-runtime.ts` now owns completion-handler ref binding, and `profile-prepared-presentation-runtime.ts` is down to the thin `useProfilePreparedPresentationRuntime(...)` composition hook, so the live owner no longer keeps that lower prepared execution loop, runtime builder, or completion-binding effect mixed into the same file. The prepared transaction lane is flatter too: that dedicated prepared runtime now consumes grouped command execution runtime plus grouped state execution runtime directly from the explicit native/app execution owners instead of rebuilding controller-local prepared command-port or state-port compatibility surfaces before dispatch. The deleted `use-profile-owner.ts` wrapper no longer sits between the root and those runtime/profile owners. That surviving owner root is thinner too: `index.tsx` no longer fans the profile runtime out as one giant raw argument list and now publishes grouped search-context, camera-layout, selection-policy, analytics, plus explicit `nativeExecutionArgs` and `appExecutionArgs` into `useProfileOwner(...)`; that grouped search-context is narrower too, because the owner no longer receives raw pending-selection or restaurant-only-search refs and instead consumes semantic getters/clear commands for those Search-owned lanes, and that grouped execution transport is narrower too, because the owner no longer reconstructs profile camera motion, foreground prep/restore, route-intent delivery, close-time hydration/search-clear policy, raw results-sheet runtime internals, shared-snap transport, or native sheet-command routing from raw setters, refs, runtime models, mounted-host refs, or hydration refs, and instead composes those behaviors from explicit root-published `nativeExecutionArgs`, `appExecutionArgs`, runtime models, completion bindings, the grouped `resultsSheetExecutionModel` now published by `useResultsPresentationOwner(...)`, and the grouped lower results-sheet runtime now published from the direct Search-root sheet owners through `results-sheet-runtime-contract.ts`, `use-results-sheet-shared-values-runtime.ts`, `use-results-sheet-runtime-model-runtime.ts`, `use-results-sheet-animated-styles-runtime.ts`, `use-results-sheet-visibility-state-runtime.ts`, `use-results-sheet-visibility-actions-runtime.ts`, `use-results-sheet-visibility-sync-runtime.ts`, and `use-results-sheet-runtime-surface.ts` onto its prepared execution lanes. The results lane is flatter too: the shared results path now also owns the drag/settle/scroll/end-reached interaction cluster under the split lower `use-results-sheet-interaction-state-runtime.ts`, `use-results-sheet-snap-runtime.ts`, and `use-results-sheet-load-more-runtime.ts` lanes, with `results-sheet-interaction-contract.ts` owning the grouped interaction surface, `use-results-sheet-interaction-surface.ts` owning grouped `resultsSheetInteractionModel` publication over those lower interaction owners, and `index.tsx` now consuming that lower interaction surface while route publication plus the results panel consume one grouped `resultsSheetInteractionModel` instead of another root-local handler fanout, and `useResultsPresentationOwner(...)` now owns the pending-tab publish plus prepared tab-switch visual-sync choreography and publishes one grouped results interaction model instead of `index.tsx` scripting those toggle callbacks inline. The explicit execution boundary now lives directly under [`useProfileOwner(...)` in `profile-owner-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts), where explicit `nativeExecutionArgs` are first composed into `nativeExecutionModel` under [`profile-native-execution-model-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-native-execution-model-runtime.ts), explicit `appExecutionArgs` are first composed into grouped JS app execution under [`profile-app-execution-model-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-app-execution-model-runtime.ts), the controller/shell lane is now first composed under [`profile-controller-shell-runtime-state-owner.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-controller-shell-runtime-state-owner.ts), the grouped hydration lane is now first composed under [`profile-hydration-runtime-state-owner.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-hydration-runtime-state-owner.ts), the grouped close-state lane is now first composed under [`profile-close-runtime-state-owner.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-close-runtime-state-owner.ts), the Search-derived presentation view surface is now first composed under [`profile-owner-presentation-view-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-presentation-view-runtime.ts), and native view extraction now lives under [`profile-owner-native-view-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-native-view-runtime.ts). The split lower owners the deleted [`profile-owner-action-state-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-state-runtime.ts) and deleted [`profile-owner-action-execution-ports-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-execution-ports-runtime.ts) no longer sit between the lower owner-action lanes and the live owner boundary, while [`profile-owner-query-action-context-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-query-action-context-runtime.ts), [`profile-owner-selection-action-context-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-selection-action-context-runtime.ts), [`profile-owner-runtime-state-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime-state-runtime.ts), [`profile-owner-action-state-ports-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-state-ports-runtime.ts), [`profile-owner-action-external-ports-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-external-ports-runtime.ts), [`profile-owner-refresh-selection-ports-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-refresh-selection-ports-runtime.ts), [`profile-owner-auto-open-ports-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-auto-open-ports-runtime.ts), [`profile-owner-auto-open-kickoff-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-auto-open-kickoff-runtime.ts), and [`profile-owner-action-surface-runtime.ts`](/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-surface-runtime.ts) now split that full owner-action lane between lower query/selection/runtime action inputs, lower state/app/native/prepared execution ports, the outward preview/open/focus/refresh-selection/close action surface, and auto-open kickoff over that public action surface instead of keeping that full lane behind extra owner-action wrappers. `nativeExecutionModel` still owns grouped transition-completion/runtime binding plus native camera/sheet command transport under that owner boundary, while the app-side shell/command lanes now live under `profile-app-execution-model-runtime.ts`, where `shellExecutionModel` owns foreground prep/restore plus route-intent and close-time hydration/search-clear policy, and `commandExecutionModel` owns JS results-sheet/shared-snap/highlight command policy. Decision: this is the stable stop line. Do not move JS-owned app shell policy under native execution. Native remains the camera/sheet command executor plus completion owner; JS remains the owner of foreground app state, route intent, hydration-close policy, search-clear policy, and JS-level results/shared-snap/highlight commands. The results-sheet lane is flatter too: the shared results runtime owner now owns the mounted-host fallback and publishes one semantic `resultsSheetExecutionModel` with `requestResultsSheetSnap(...)` plus `hideResultsSheet(...)`, while `results-sheet-runtime-contract.ts` now owns the grouped sheet-runtime type surface, `use-results-sheet-shared-values-runtime.ts` now owns snap points plus shared animated values and `setSheetTranslateYTo(...)`, `use-results-sheet-runtime-model-runtime.ts` now owns bottom-sheet runtime-model construction, `use-results-sheet-animated-styles-runtime.ts` now owns header-divider plus results-container animated styles, `use-results-sheet-visibility-state-runtime.ts` now owns results-sheet visibility state plus snap-change application, `use-results-sheet-visibility-actions-runtime.ts` now owns animate/reset/docked-polls transition commands, and `use-results-sheet-visibility-sync-runtime.ts` now owns the hidden-translate/nav-top/last-visible synchronization effects, with Search composing those lower owners directly before the profile lane consumes the grouped runtime surface. That means the live owner no longer reconstructs results-sheet commands from `resultsSheetRuntimeModel`, `shouldRenderResultsSheetRef`, and `resetResultsSheetToHidden`, and `index.tsx` no longer owns that raw results-sheet shell/runtime cluster directly either. The action execution layer is flatter too: the owner no longer needs separate preview/open/focus/close execution-port vocabularies or a fresh low-level port bag for each branch. The action-input layer is flatter too: preview/open/focus/close/auto-open/refresh-selection no longer cross another repeated scalar bag, and now ride grouped `ProfilePreviewActionModel`, `ProfileOpenActionModel`, `ProfileFocusActionModel`, `ProfileRestaurantCameraActionModel`, `ProfileCloseActionModel`, `ProfileAutoOpenActionModel`, and `ProfileRefreshSelectionActionModel` contracts instead. The runtime-state boundary is flatter too: the deleted `use-profile-runtime-state.ts` no longer exports a flat kitchen-sink outward surface or a public `profileControllerStateRef`; the lower runtime-state lanes now live under `profile-controller-shell-runtime-state-owner.ts`, `profile-hydration-runtime-state-owner.ts`, `profile-close-runtime-state-owner.ts`, plus the lower focus/auto-open/transition owners, with `profile-runtime-state-contract.ts` owning the grouped type surface. The Search-derived view boundary is flatter too: `profile-owner-presentation-view-runtime.ts` now composes grouped highlighted-route reads, prepared-snapshot reads, shell projection, presentation-model creation, and `currentMapZoom` derivation directly over the lower presentation owners, while `profile-owner-native-view-runtime.ts` now owns `restaurantSheetRuntimeModel` extraction from the grouped native execution lane instead of leaving that whole projection inline at the owner boundary. Inside the live owner boundary there is no longer either a second private presentation-boundary hook, a separate execution-boundary hook/bag, or a controller-local presentation-machine wrapper inside the same file, so the prepared callbacks, foreground/close execution, and prepared-transaction dispatch all execute directly under `useProfileOwner(...)`, while prepared completion binding now lives under `profile-prepared-presentation-binding-runtime.ts` beside `useProfilePreparedPresentationRuntime(...)`. The owner now invokes direct prepared transition functions instead of constructing a local profile presentation machine first, the lower runtime-state owners now absorb the close-policy / request-seq / auto-open-key / restore-capture / saved-sheet-reset / transition-read record mutations that were still written inline from the presentation owner, the dead `hasRestoredProfileMap` field is deleted, hydration-cancel mechanism emission now lives directly under those lower runtime-state owners, dismiss clear policy, recent-view tracking, and highlighted-route clearing no longer need the deleted `use-profile-actions-owner.ts` wrapper, and owner-local action/runtime composition no longer needs to keep the lower prepared execution loop in the same file. The command path stays explicit too: route-intent transport, foreground prep/restore, close-time clear policy, results-sheet commands, shared-snap forcing, and camera command transport now execute through those explicit owner-supplied lanes, while the dedicated native execution owner now owns prepared profile completion binding, `restaurantSheetRuntimeModel`, and native sheet-command forwarding/stripping through `profile-presentation-native-sheet-transport.ts` instead of leaving that bridge setup under the owner or inline at the Search root. The still-relevant host files are:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-query-action-context-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-selection-action-context-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-runtime-state-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-state-ports-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-external-ports-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-refresh-selection-ports-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-auto-open-ports-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-auto-open-kickoff-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-owner-action-surface-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-native-execution-model-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/profile/profile-app-execution-model-runtime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/RestaurantPanelSnapshotNativeView.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/BottomSheetWithFlashList.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/BottomSheetNativeHost.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useBottomSheetRuntime.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/bottomSheetMotionTypes.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/OverlaySheetShell.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/RestaurantOverlayHost.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/android/app/src/main/java/com/crave/BottomSheetHostView.java`
  - `/Users/brandonkimble/crave-search/apps/mobile/android/app/src/main/java/com/crave/BottomSheetHostViewManager.java`
  - `/Users/brandonkimble/crave-search/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerPackage.java`
  - `/Users/brandonkimble/crave-search/apps/mobile/android/app/src/main/java/com/crave/RestaurantPanelSnapshotView.java`
  - `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/CraveRestaurantPanelSnapshotView.swift`
  - `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/CraveBottomSheetHostView.swift`
  - `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/SearchMapRenderController.swift`
  - `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/UIFrameSampler.swift`
- The Search composition root is narrower too: the deleted `use-search-profile-runtime-owner.ts` wrapper no longer sits between `index.tsx` and the live profile path, and the deleted `use-search-profile-owner.ts` hook no longer owns the final profile composition either; the deleted `use-profile-owner.ts` wrapper is gone too, and `useProfileOwner(...)` now publishes that full profile boundary directly from `profile-owner-runtime.ts`, while the remaining `clearSearchAfterProfileDismiss()` command is also no longer a root-local bridge and now lives under `use-search-clear-owner.ts`.
- That final profile-owner input is smaller too: the deleted `use-search-profile-owner.ts` no longer requires prop-threading `submittedQuery`, and the extra duplicate `profileMapZoom` prop is gone as well; `useProfileOwner(...)` in `profile-owner-runtime.ts` now reads submitted-query state directly from `searchRuntimeBus` and reuses the existing execution-lane `mapZoom`.
- That final profile-owner input is smaller again too: `isSearchOverlay` no longer rides through another Search-only wrapper; the deleted `use-search-profile-runtime-context-owner.ts` pass-through hook is gone, and `useProfileOwner(...)` in `profile-owner-runtime.ts` now derives overlay-root visibility directly from the overlay store instead of another Search-root prop thread.
- That final profile-owner shell seam is narrower too: the surviving profile owner file no longer needs another composition shell just to read or publish `profileShellState`; that runtime-bus selector/publish lane now lives across the lower shell/runtime-state owners composed directly in `profile-owner-runtime.ts`, and prepared shell transition application plus the close-state reset/nulling cluster now live there too, while the deleted `use-profile-owner.ts` wrapper no longer sits above it as another composition shim.
- That Search foreground UI leak is smaller too: the profile path no longer sees raw `isSuggestionPanelActive` plus `isSearchFocused`; `index.tsx` now publishes one `isProfileAutoOpenSuppressed` policy bit instead, and the profile runtime consumes that narrower Search-owned suppression contract.
- That Search foreground-policy input is smaller too: the grouped execution surface inside `profile-presentation-controller.ts` no longer requires `ensureSearchOverlay`, `dismissTransientOverlays`, `saveSheetState`, or `setSaveSheetState` from `index.tsx`; it now ensures the search root overlay directly and reads/writes save-sheet state through the overlay stores itself.
- That Search profile-owner input is narrower too: the profile owner path no longer receives raw `clearSearchState`, `isClearingSearchRef`, `isInitialCameraReady`, or `setIsInitialCameraReady`; `index.tsx` now publishes semantic `clearSearchAfterProfileDismiss()` and `ensureInitialCameraReady()` commands instead, and the grouped Search execution boundary consumes those narrower Search-owned ports directly.
- That Search interaction ownership is narrower too: the profile path no longer depends on a profile-specific inline `dismissSearchInteractionUiForProfile()` callback in `index.tsx`; generic Search-owned interaction-dismiss behavior is now consumed through the grouped Search profile execution boundary instead.
- That Search clear ownership is narrower too: the inline `clearTypedQuery()` and `clearSearchState()` cluster no longer lives directly in `index.tsx`; `use-search-clear-owner.ts` now owns those Search clear semantics alongside `clearSearchAfterProfileDismiss()` under one grouped clear-owner surface, the extra `useSearchClearStateOwner(...)` export is deleted, and the grouped results presentation owner now consumes that unified clear-owner surface directly for close orchestration instead of making the root stitch clear + presentation + close together by hand. The Search-side request/action seam is flatter too: `runtime/shared/use-search-request-presentation-runtime.ts` now owns grouped request + clear + results-presentation composition, `runtime/shared/use-search-session-action-runtime.ts` now owns grouped suggestion/profile/submit/filter/foreground interaction plus root UI effects, and `runtime/shared/use-search-results-sheet-interaction-runtime.ts` now owns grouped results-sheet load-more/drag/snap interaction composition. `index.tsx` no longer directly calls the old lower request/clear/profile/submit/filter/foreground or results-sheet interaction owners.
- That Search request/close ownership is narrower too: the root no longer keeps the `pendingCloseIntentIdRef` / `pendingCloseCleanupFrameRef` state machine, the inline `beginCloseSearch()` / `cancelCloseSearch()` / `finalizeCloseSearch()` controller body, a request-cancel bridge hook, or the `bindFinalizeCloseSearch(...)` effect that used to reconnect close completion back into the presentation shell. The extra `use-search-close-intent-owner.ts` wrapper is now deleted too, and the old `use-search-presentation-controller.ts` shell is deleted as well: the mixed `runtime/shared/use-results-presentation-shell-runtime.ts` host is now deleted, the visible Search-side presentation shell state is now split between `runtime/shared/use-results-presentation-shell-local-state.ts` and `runtime/shared/use-results-presentation-shell-model-runtime.ts`, direct owner-inline close-transition policy/actions plus editing intent, direct owner-inline prepared enter/exit intent planning over `runtime/shared/use-results-prepared-snapshot-shell-application-runtime.ts`, `runtime/shared/use-results-prepared-enter-snapshot-execution-runtime.ts`, and `runtime/shared/use-results-prepared-exit-snapshot-execution-runtime.ts`, direct owner-inline close cleanup plus begin/cancel close flow now own the lower close-intent/cleanup and prepared enter/exit dispatch lanes directly, `runtime/shared/results-presentation-shell-runtime-contract.ts` now owns the grouped action vocabulary, and `runtime/shared/use-results-presentation-runtime-owner.ts` now composes those lower owners directly with the shared results runtime owner. `use-search-request-runtime-owner.ts` still owns the request lifecycle refs plus `cancelActiveSearchRequest()`, request failure/finalization policy, and the generic managed-attempt wrapper, and `index.tsx` now consumes one grouped results presentation boundary instead of wiring close orchestration back into it manually. That grouped boundary is narrower again now too: the deleted route/publication wrappers and deleted Search-only docked-polls publication shim no longer sit on the live path; the lower panel publication lane now lives directly under `runtime/shared/use-search-results-panel-data-runtime.tsx`, `runtime/shared/use-search-results-panel-chrome-runtime.tsx`, `runtime/shared/use-search-results-panel-list-selectors-runtime.tsx`, `runtime/shared/use-search-results-panel-list-layout-runtime.tsx`, `runtime/shared/use-search-results-panel-list-publication-runtime.tsx`, `runtime/shared/use-search-results-panel-read-model-runtime.tsx`, `runtime/shared/use-search-results-panel-render-policy-runtime.tsx`, `runtime/shared/use-search-results-panel-covered-render-runtime.tsx`, `runtime/shared/use-search-results-panel-surface-state-runtime.tsx`, `runtime/shared/use-search-results-panel-interaction-frost-runtime.tsx`, `runtime/shared/use-search-results-panel-surface-background-runtime.tsx`, `runtime/shared/use-search-results-panel-surface-overlay-runtime.tsx`, `runtime/shared/use-search-results-panel-spec-runtime.tsx`, and `runtime/shared/use-search-results-panel-route-visibility-runtime.tsx`, while the overlay-owned route host lane is now split more honestly between `useSearchRouteOverlayPublishedState.ts`, `useSearchRouteOverlaySheetKeys.ts`, the deleted `useSearchRouteOverlayPanelSpecFamilies.ts` wrapper, the deleted `useSearchRouteOverlayPanelSpecsRuntime.ts` wrapper, `useSearchRouteOverlayActiveSheetSpec.ts`, `useSearchRouteOverlaySheetVisibilityState.ts`, the deleted `useSearchRouteHostModelInput.ts`, `useSearchRouteOverlayRenderPolicy.ts`, `useSearchRouteOverlayRuntimePublication.ts`, and the thinner `useSearchRouteOverlayRuntime.ts` composition hook over the root-composed panel spec and the remaining overlay-host policy inputs. The Search root now crosses one `shellModel` plus grouped presentation/close-transition actions instead of another flat bag of results-shell props.
- Label source ownership is cleaner than the old component-local hook path, native map labels receive a static candidate source payload, and JS label candidate source revisions no longer encode sticky preference state. The remaining non-ideal fallback path is JS observation state, not JS source-schema churn, in:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
    The old dead JS sticky-state mirror that fed fallback source projection has been removed from `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-observation.ts`, so the remaining fallback path is observation-only in non-native environments. The target ideal remains static JS candidate source + native-owned live preferred-side state. The hot native path now matches that source contract.
- The last hot sticky seam inside the native path is now deleted: iOS and Android seed live preferred-side admission through retained `nativeLabelPreference` feature-state instead of applying `labelPreference` / `labelMutexMode` back into label feature properties before source publication. That keeps the mounted preference-group layers render-local and removes native source payload mutation from ordinary preferred-side changes.
- Native label observation cadence/state moved into iOS/Android render controllers, and JS fallback observation refresh no longer uses local timeout cadence or resume-grace timers. Native now also publishes baseline snapshots directly on configure/reset, so JS no longer needs a deferred snapshot queue. Native observation configuration now executes under `use-search-map-native-render-owner.ts` instead of in the observation hook. JS still holds observation snapshot state and applies it into source projection through:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-observation.ts`
    That snapshot state now drives visible-label count / diagnostics only; source projection remains candidate-static and does not consume JS sticky preference state. Sticky timing policy is now passed through that hook boundary as one config object rather than a long list of scalar props. That is acceptable as a fallback-only planner/executor boundary, while the native path already matches the target "native owns live side preference, JS owns only marker existence/candidate universe" shape.
- Motion-pressure policy now has one shared `MotionPressureState`, transaction-aware publish admission, shared candidate/LOD planner admission, centralized candidate/LOD materiality predicates, and centralized planner admission policy in:
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-motion-pressure.ts`
    Candidate/LOD planner hooks now keep only their last-input snapshots/output fingerprints and delegate materiality plus admission-policy checks to shared helpers in that module, so MP1 is materially promoted. Deferred map-moved reveal and poll-bounds flush state is now single-owned by `use-search-map-movement-state.ts` instead of shared with the sheet orchestration hook. The remaining motion seam is mostly the native transport admission surface. These should remain second in sequence behind prepared-snapshot cleanup, per `/Users/brandonkimble/crave-search/plans/map-motion-pressure-cutover-plan.md`.
- Diagnostics and compatibility-era code have been reduced in the Search runtime: ad hoc presentation/map diagnostics now log at debug level, heavy map label perf logs are disabled by default, and the remaining `console.log` usage is perf-harness contract output. Dead-code cleanup remains a real delete-gate slice for any compatibility seam still touched during this cutover, but the bulk of always-on diagnostic noise is no longer a production-facing behavior.

### Reassessment after recent overlay/native sheet refactors

This audit is still directionally correct, but the current repo is no longer in the broad mixed-owner state that motivated the original larger warnings.

What is materially better now:

- the mounted overlay surface is app-level, not Search-local
- the sheet primitive is native-host-first on shipping iOS/Android paths
- restaurant visible content is native-hosted and globally routable
- profile transaction ordering and shell projection are runtime-owned
- Search-route snap orchestration for polls/bookmarks/profile is overlay-layer-owned

What still justifies keeping this audit active:

- results controller internals are still not at the fully prepared-policy-only shape, but the public results contract is narrower now: the outward results projection semantics, idle defaults, and results-panel loading/surface interpretation stay in `results-presentation-runtime-contract.ts`, while the committed/idle transport assembly, cover-state apply/clear policy, toggle lifecycle event resolution, cancel/abort reset policy, the cover/commit/cancel/abort applied-log semantics, the enter-batch mounted-hidden transition gate, the enter-batch start attempt/blocked diagnostics, the enter/exit start-and-settle guarded attempt logging, and the enter/exit success-path log payload derivation now live directly inside the thicker `results-presentation-runtime-machine.ts` owner instead of escaping as part of the public contract surface. That deleted machine-shard family is gone. The remaining controller-local work is now mostly diagnostics polish plus the fact that `PresentationTransitionController` still exists as a separate execution owner.
- profile now has a real native transaction executor insertion point, a native sheet-command lane routed to registered bottom-sheet hosts, and a native camera-command lane routed through `CameraIntentArbiter` to a host-keyed `RNMBXCamera`; the generic native bridge is now honestly named `PresentationCommandExecutor` because both profile sheet commands and search-map camera commands use it. This stop line is now accepted and should be treated as locked: shell-state, route intent, hydration, and close-time app policy stay JS-owned, while native remains the command executor for frame-critical camera/sheet work. Even that JS shell lane is narrower now: stored restaurant-overlay visibility is gone as a separate shell-owned write path, the profile runtime/settle path no longer consumes `isRestaurantOverlayVisible` or `restaurantPanelSnapshot` as separate read-model inputs for transition/dismiss decisions, the old overlay-dismiss-handled ref/reset seam is gone too, overlay visibility is now just a composition-root derived read-model from transition status, auto-open now keys off one `activeOpenRestaurantId` read-model instead of boolean-plus-id plumbing, the remaining focus/clear/map/overlay-switch controller consumers now key off one `isProfilePresentationActive` read-model instead of reusing that visibility boolean for control flow, and the remaining JS presentation lane is now localized across `profile-owner-runtime.ts` plus the lower runtime-state owners instead of being split across another top-level runtime-owner callback boundary. Close finalization also no longer escapes the phase loop: the prepared transaction now stores ordered `phasePayloads`, those payloads carry only `commandSet` plus `stateExecution`, the restore-sheet target for close finalization is now frozen into the prepared close snapshot instead of being recomputed from live root state when overlay dismiss comes back through JS, profile-open sheet/camera settle callbacks now must match the prepared execution request token instead of being treated as generic current-transaction completion signals, overlay-dismiss finalization now also matches the prepared close shell token instead of advancing off an unscoped dismiss callback, camera-settle token ownership now rides through `CameraIntentArbiter` itself instead of a profile-runtime side ref, and the transition record now keeps that prepared completion bookkeeping under one `completionState` owner instead of parallel prepared-transaction / dismiss / open-settle fields. External consumers no longer receive a raw highlighted-restaurant setter either; they now consume only a clear-only owner action.
- Search still originates some Search-route-specific render/runtime inputs
- restaurant still depends on the shared sheet primitive for motion/chrome

### Current architecture target is still unchanged

The target ideal remains:

- JS prepares immutable transaction snapshots and source/candidate universe state
- UI/native executes visible transitions and render-local side selection/animation
- one shared prepared-presentation transaction model covers results reveal/dismiss, search-this-area, profile open, and profile close
- motion pressure is semantic/transaction-aware, not scattered timer throttles
- no long-lived dual-owner path survives after each cluster is promoted

So the direction in this doc is still correct. What changed is that part of the prepared-snapshot structure now exists in code, and the remaining work is a cutover/deletion problem rather than a greenfield design problem.

## Is This A Standard Shape?

Yes.

This is the standard high-performance shape for complex mobile flows:

- prepare data and layout before the visible transition
- hand a stable snapshot to the animation system
- keep the UI thread / native driver in control during the actual transition
- do not let React rerenders, layout work, async hydration, or ref mutation participate in the hot visible lane

In React Native specifically, the smooth versions of complex flows usually rely on:

- Reanimated shared values or native-driven animation state
- pre-mounted or hidden-mounted content
- immutable transition inputs
- post-settle side effects

The anti-pattern is what we still have in places today:

- visible transition starts
- React and layout are still resolving what should exist
- map/sheet/profile subsystems are still negotiating ownership
- UI thread and JS thread are both doing meaningful work in the same visible window

That does not scale.

## Root Problem

We have multiple flows that _look_ different, but they all share the same structural problem:

- the visible transition starts before all transition inputs are fully prepared
- ownership is split across too many modules during the hot path
- visible presentation is still coupled to JS rerenders, layout changes, and worklet warnings

The recent logs prove this.

### What the reveal logs proved

Recent evidence:

- we successfully suppressed the old reveal-time label observation/query bottleneck
- reveal-frame churn inside a batch was reduced
- the remaining stall moved earlier, into `enter_requested`
- the biggest reveal spike now comes from JS-side activation/layout/worklet churn, not from live map label observation

Important signals:

- `map_js_profiler_SearchMapLabels` spiked to `51.3ms` before real label content was present
- repeated `[Worklets] Tried to modify key current ... passed to a worklet`
- sheet movement and layout work still occurred in the same pre-reveal window

Interpretation:

- the old map bottleneck was real, and we reduced it
- but the visible flow is still not architecturally isolated from JS churn

## Why The New Architecture Matches The Locked Behavior

Your required behavior is:

- many things start immediately
- visible content reveal may occur slightly later
- the later reveal must stay synchronized
- all of this must still be smooth

That behavior is exactly what a prepared snapshot plus UI/native execution model is good at.

Why:

- immediate shell response can happen right away on the UI thread
- immediate selected-pin/profile activation can happen right away on the UI thread / native map lane
- synchronized delayed content reveal can be driven from one shared prepared transition snapshot
- JS does not have to be in the middle of the visible lane while that happens

This is different from the old phase attempts.

The old attempts still let JS do meaningful visible-lane work after the flow had already started.

This plan is stricter:

- immediate feedback can start now
- but revealable content and coordinated transitions are executed from a prepared plan, not negotiated live

## Current Architecture Audit

### 1. Search results reveal / dismiss

Current owner split:

- `index.tsx`
  orchestrates overlay state, map presentation requests, sheet snaps, results visibility, and many refs
- `results-presentation-runtime-contract.ts`
  owns reveal/dismiss phase machine and readiness gates
- `runtime/shared/use-results-presentation-runtime-owner.ts`
  owns search sheet shell/content lane behavior
- `search-map.tsx` + `use-search-map-native-render-owner.ts`
  own map visible-state execution

Current good parts:

- native map reveal/dismiss ownership is much better than before
- label observation is now mostly kept out of the hot reveal window
- results sheet shell still responds immediately
- pin/card sync behavior was preserved

Current bad parts:

- the reveal path still depends on too many readiness gates:
  - `coverageReady`
  - `dataReady`
  - `listFirstPaintReady`
  - `pending_mount`
  - native hidden mount events
  - reveal start / first visible / settled events
- the visible lane still sees React/worklet/layout churn around `enter_requested`
- sheet shell, map presentation, and content activation still overlap more than they should

Specific mismatch against locked behavior:

- the shell does react immediately, which is good
- but the content reveal still enters a noisy JS/worklet window before visible reveal starts
- that is why the user still sees frame stalls even though the timing semantics are mostly correct

Assessment:

- better than before
- still not the ideal final shape

### 2. Search This Area

Relevant code:

- `index.tsx` uses `viewportBoundsService`, `rerunActiveSearch`, and `searchThisAreaAnimatedStyle`
- `runtime/shared/use-results-presentation-runtime-owner.ts` includes `search_this_area` intent
- `use-search-submit-owner.ts` routes reruns back into submit behavior

Current shape:

- the button visibility is already UI-thread animated
- but the action still routes back through the same JS-heavy rerun machinery
- map bounds capture, rerun state, results state, and presentation state are still coupled

Problem:

- the button is cheap
- the rerun transaction is not
- “search this area” is not currently modeled as a prepared rerun snapshot with a stable presentation token

Specific mismatch against locked behavior:

- it should behave like an immediate dismiss of old map items followed by the same synchronized reveal contract as normal results
- today it shares some logic with results rerun, but not under one clean prepared-transaction architecture

Assessment:

- this flow should not be its own architecture
- it should reuse the same “prepared results transaction” shape as shortcut/manual submit

### 3. Restaurant pin -> restaurant profile flow

Relevant code:

- `SearchMapWithMarkerEngine.tsx`
- `profile-runtime-controller.ts`
- `use-profile-camera-orchestration.ts`
- `index.tsx`

Current shape:

- pin press enters a profile runtime controller
- profile open depends on many mutable refs, timeouts, camera snapshot storage, sheet state storage, and overlay state
- camera orchestration is partly imperative and timeout-based
- profile sheet and map camera transition are coordinated, but not from one unified prepared snapshot and execution driver

Good parts:

- there is already a concept of saving previous camera/sheet state
- the app already distinguishes profile opening/open/closing
- camera orchestration is abstracted into its own helper

Bad parts:

- the profile path is still “live orchestration” instead of “prepared transaction”
- too many mutable refs participate
- timeout-based settling is doing work that should instead come from one execution driver
- profile open/close likely has the same symptom as reveal:
  visible transition begins while the system is still deciding state

Specific mismatch against locked behavior:

- active pin/label visual change is not guaranteed to happen immediately and cleanly
- profile shell open and camera movement are not driven from one unified executor
- the nav cutoff artifact suggests the profile shell / safe-area / sheet geometry path is not being prepared and executed cleanly as one transaction

Concrete suspicion:

- profile shell geometry and nav-bar-aware snap calculations are still being resolved in live orchestration instead of being frozen into a prepared profile-open snapshot
- selected marker active state is still treated as app state that eventually propagates, instead of an immediate executor-owned visual activation input

Assessment:

- this flow should also become a prepared snapshot + UI/native execution transaction

### 4. Overlay shell / sheet system

Relevant code:

- `index.tsx`
- `runtime/shared/use-results-presentation-runtime-owner.ts`
- overlay snap orchestration and panel resolution hooks

Current shape:

- shell behavior is distributed across the Search composition root, the Search-side results presentation owner, overlay-owned command/runtime stores, and profile runtime
- different overlays use different transition idioms
- some sheet operations are immediate, some staged, some ref-driven

Assessment:

- this should be unified under one presentation executor abstraction

Specific mismatch against locked behavior:

- shell immediacy is mostly preserved today
- but because execution is not unified, shell/layout/worklet churn can still pollute the hot path

## What The Ideal Architecture Actually Is

The ideal architecture is **Prepared Snapshot + Presentation Executor**.

### Core rule

JS may decide what the next visible state should be.

JS may not continue negotiating that state during the visible transition.

### Shared model

Every major Search-screen transition should become:

1. `intent`
2. `prepare`
3. `commit prepared snapshot`
4. `execute visible transition on UI/native`
5. `post-settle effects`

### Prepared Snapshot

A prepared snapshot is a frozen description of everything the visible transition needs.

It should contain:

- map presentation target
- map source snapshot identity / generation
- card visibility mode and content snapshot
- sheet shell target
- overlay chrome mode
- selected restaurant / profile target if applicable
- camera target snapshot if applicable
- selected marker highlight / active visual target if applicable
- safe-area / nav-cutoff-sensitive geometry inputs if applicable
- measurements needed by the visible lane
- transition metadata and transaction id

Once committed, this snapshot should be treated as immutable for the duration of the visible transition.

### Presentation Executor

The presentation executor is the thing that _runs_ the transition.

It should be UI/native-owned.

It should be responsible for:

- starting the visible transition
- driving sheet position / chrome transition shared values
- coordinating map presentation token handoff
- revealing cards/pins at the same visible boundary
- settling
- emitting a small set of lifecycle callbacks

It should not be responsible for:

- fetching data
- measuring content late
- building source stores
- deciding which content exists
- mutating JS refs passed into worklets

## Ideal Shared Architecture By Concern

### A. One shared transaction taxonomy

Today we have several related but not unified concepts:

- presentation intent ids
- reveal batch ids
- frame generations
- profile transition status
- overlay snap state

Target:

- one shared presentation transaction model with kinds:
  - `results_enter`
  - `results_exit`
  - `profile_open`
  - `profile_close`

Search-this-area stays a `mutationKind`, not a separate top-level transaction kind.

Each transaction has:

- `transactionId`
- `kind`
- `preparedSnapshot`
- `executorState`
- `settleReason`

### B. One shared prepared state boundary

Current problem:

- multiple readiness booleans directly affect visible behavior

Target:

- all internal readiness gates collapse into one derived boolean / state:
  - `preparedSnapshotReady`

Internals can still use:

- coverage readiness
- data readiness
- list first paint
- hidden mount
- profile hydrate readiness
- sheet measurement readiness

But those should no longer directly churn visible rendering.

They should only affect whether the next prepared snapshot can be committed.

### C. UI-thread-owned visible lane

Visible lane owns:

- sheet shell movement
- results card reveal/hide
- map presentation opacity trigger
- profile overlay shell movement
- selected pin/label active-state visual execution
- profile camera move execution
- chrome fades/transforms

JS is allowed to:

- start the transaction
- hand over the prepared snapshot
- receive settle callbacks

JS is not allowed to:

- keep mutating the visible lane while it is executing

### D. Post-settle side-effect queue

All expensive or deferred work goes here:

- label observation resume
- sticky refresh resume
- late hydration
- cache writes
- analytics
- source cleanup after dismiss
- restore logic after profile close

This is important because “smoothness” is mostly achieved by refusing to do side effects in the visible lane.

## Ideal Shape Per Flow

### 1. Results reveal

Target:

- tap shortcut/manual submit
- sheet shell responds immediately
- JS prepares the results snapshot under cover
- map gets hidden-mounted snapshot under cover
- cards are pre-mounted/frozen
- one executor starts visible reveal
- map pins and cards reveal on one shared visible boundary
- label observation resumes only after settle/idle

What changes:

- `enter_requested` should no longer be a long live-churn phase
- the controller should collapse many readiness gates into one prepared boundary
- visible reveal should be almost pure UI/native execution

### 2. Results dismiss

Target:

- close intent begins
- shell state and map close state are prepared
- one executor runs visible dismiss
- after settle, cleanup and restore happen

What changes:

- no heavy structural cleanup during visible dismiss
- restore/cleanup logic is queued post-settle instead of interleaving

### 3. Search This Area

Target:

- map move makes CTA visible
- CTA tap does not create a bespoke flow
- it prepares a new results transaction using current viewport bounds
- shell stays consistent
- under cover / frozen state prepares the new results snapshot
- one executor performs the rerun reveal/update

What changes:

- “search this area” becomes a first-class presentation transaction, not a button that happens to call rerun code
- viewport capture and results reveal are unified under the same prepared snapshot model

### 4. Restaurant pin -> profile open

Target:

- pin tap creates a `profile_open` intent
- JS prepares:
  - target restaurant snapshot
  - overlay content snapshot
  - camera target snapshot
  - sheet target snapshot
  - active selected-marker visual snapshot
  - profile safe-area / nav geometry snapshot
- one executor runs:
  - immediate selected pin/label visual activation
  - profile sheet open
  - camera move / framing
  - map highlight / focus visual state
- no timeout-based live negotiation during visible open

What changes:

- profile runtime controller becomes more like a snapshot builder than a live traffic cop
- the root now reads one controller-owned `profilePresentation` model instead of unpacking loose profile presentation booleans/keys field-by-field
- the remaining JS-owned profile shell state inside that controller is now consolidated as one shell owner, not parallel status/panel/padding state cells
- root clear-flow no longer mutates profile dismiss policy out-of-band through imperative refs; that close policy now enters through the controller-owned `closeRestaurantProfile(...)` contract
- root clear/overlay-switch flow no longer keeps imperative close/reset profile refs alive just to bridge into later hooks; those consumers now take direct controller actions
- root intent/recent/submit flow no longer keeps a preview-action ref alive either; those consumers now take direct `openRestaurantProfilePreview(...)` actions from the controller
- root no longer keeps a `clearSearchStateRef` bridge for profile-dismiss cleanup; that path now closes over the live clear action directly
- the remaining JS-owned close bookkeeping inside the controller is now consolidated under one close-state owner instead of separate dismiss/restore/baseline refs
- the controller’s non-render-critical profile execution state is now one runtime ref owner instead of parallel transition-ref and close-state-ref owners
- camera orchestration becomes execution of a prepared plan, not imperative best-effort coordination
- selected-marker active visuals become part of the executor contract, not a late side effect
- nav cutoff / geometry correctness becomes part of preparation, not something discovered after open

### 5. Restaurant profile close

Target:

- close intent captures restore target
- one executor runs visible close
- restore map/camera/results state after settle

What changes:

- no live mixing of overlay close, camera restore, and other cleanup in the same window

## What Can Be Shared / Consolidated

### 1. One presentation transaction coordinator

Should replace the current fragmented ownership across:

- search presentation controller
- map presentation controller
- profile runtime transition logic
- overlay close/open local state

Not by deleting all those modules immediately, but by putting them under one model.

### 2. One prepared snapshot builder pattern

Separate builders per transaction kind, shared contract:

- `buildResultsRevealSnapshot`
- `buildResultsDismissSnapshot`
- `buildSearchThisAreaSnapshot`
- `buildProfileOpenSnapshot`
- `buildProfileCloseSnapshot`

### 3. One UI-thread execution layer

Shared execution primitives:

- sheet shell motion
- card visibility shared values
- chrome progress values
- map presentation trigger tokens
- profile camera/sheet execution state
- selected marker active-style execution state
- profile safe-area / nav geometry execution state

### 4. One post-settle queue

Shared place for:

- deferred hydration
- observation restart
- analytics
- source cleanup
- restore operations

### 5. One rule for worklets

No mutable JS objects/refs that are later mutated after crossing into a worklet boundary.

The warning seen in logs is a direct architectural smell:

- mutable `ref.current` data is participating in presentation-time work
- that is exactly the kind of thing that prevents a clean UI-thread execution lane

This should be replaced with:

- shared values
- immutable snapshots
- explicit executor inputs

## Current Misalignments To Fix

### Covered-phase preparation lane

The current logs show a separate hot-path problem before visible reveal starts:

- `enterTransitionMode` moves the screen into `covered`
- while the cover is still up, JS is still allowing results-panel render inputs to mutate:
  - row counts jump from empty to populated
  - header/filter heights resolve live
  - map/runtime readiness can still bounce
- the biggest stalls now frequently happen in `covered`, not in the visible reveal itself

That means `covered` is currently acting like a live negotiation lane instead of a true preparation lane.

Target:

- once `covered` starts, render-facing inputs for the covered lane stay stable
- JS may continue preparing the next snapshot, but it must not keep mutating the visible covered subtree
- hidden/prepared content may update off the hot lane, but the cover-facing subtree must not churn

Delete gate:

- no render-facing row-count/header-height churn during `covered` for the results panel
- no mutable ref/worklet crossings that still mutate covered-lane execution inputs after cover entry
- no legacy “covered but still live-negotiating” branches remain for promoted clusters

### Results reveal/dismiss

- multi-gate controller churn is still too exposed
- visible lane still sees JS/layout/worklet activity

### Search This Area

- action still re-enters the general rerun path instead of producing a prepared rerun transaction snapshot

### Profile open/close

- timeout/ref-heavy orchestration instead of prepared snapshot + executor
- selected pin/label active visuals are not first-class transaction state
- profile safe-area / nav-cutoff geometry is not guaranteed in the prepared snapshot

### Overlay shell

- not one unified executor contract yet

### Worklet boundary

- mutable ref usage likely crosses into worklets and causes warnings/churn

## Cutover Strategy

This should be done as one architecture program, but implemented in 4 large continuous slices.

### Slice 1. Shared transaction foundation

Goal:

- define the shared prepared-snapshot and presentation-executor contracts
- identify and replace mutable worklet-bound state that violates the model
- make selected-marker activation a first-class transaction concern

Deliverables:

- shared transaction kinds
- prepared snapshot contract
- executor contract
- post-settle queue contract
- audit and initial replacement plan for mutable worklet-bound refs
- explicit active-marker visual contract

Exit gate:

- no ambiguity about what JS prepares vs what UI/native executes
- warning root causes are identified and the path to removing them is concrete
- covered-phase hot-lane ownership is explicit: what may continue preparing vs what must freeze under cover is documented and testable

### Slice 2. Results reveal/dismiss + Search This Area unification

Goal:

- move results reveal/dismiss and search-this-area onto the same prepared results transaction model

Deliverables:

- collapse reveal readiness into one prepared boundary
- collapse dismiss readiness into one prepared boundary
- current viewport rerun produces the same kind of prepared results snapshot
- shell remains immediate
- content reveal/dismiss remains synchronized

Exit gate:

- reveal/dismiss/search-this-area all use the same transaction executor shape
- reveal/dismiss logs show no meaningful pre-visible JS churn
- covered-phase results-panel and shell inputs no longer churn while the cover is visible

### Slice 3. Profile open/close transaction cutover

Goal:

- convert restaurant profile open/close to the same architecture

Deliverables:

- profile open snapshot builder
- profile close snapshot builder
- executor path for:
  - immediate selected pin/label activation
  - immediate profile shell start
  - immediate camera move start
  - smooth profile close / restore
- nav cutoff bug fixed as part of profile prepared geometry

Implementation note:

- do not treat active pin/label style as a late effect of general selected-restaurant state propagation
- treat it as a first-class prepared/executed transition input
- do not treat nav cutoff as a styling follow-up
- treat it as a failure of prepared profile geometry/safe-area execution

Exit gate:

- profile flow no longer relies on timeout-heavy live orchestration in the visible lane
- active pin/label visuals change immediately and correctly
- nav cutoff artifact is gone

### Slice 4. Consolidation and delete gates

Goal:

- remove dual-path ownership and make the new architecture the only architecture

Deliverables:

- delete obsolete reveal/dismiss glue
- delete obsolete rerun-specific presentation glue
- delete obsolete profile transition glue
- remove mutable worklet boundary patterns that are no longer needed

Exit gate:

- one owner per concern
- no legacy visible-lane orchestration remains in the hot paths

## Detailed Implementation Principles

### Principle 1: prepared means prepared

Do not start a visible transaction if any of the following are still unresolved for that transaction:

- source snapshot identity
- content snapshot
- required measurements
- camera target
- shell target

### Principle 2: visible means execution-only

During visible execution:

- no source rebuilds
- no hydration-triggered remounts
- no layout-driven React subtree activation
- no mutable ref mutation inside worklet-owned state
- no late-selected-marker visual negotiation
- no late profile/nav geometry negotiation

### Principle 3: settle means side effects

Anything expensive that does not affect first visible presentation belongs after settle.

### Principle 4: one flow, one executor

A single visible transition should not be jointly driven by:

- JS state machine updates
- React rerenders
- Reanimated worklet state
- native map lane

There can be multiple subsystems, but there should be one execution authority for the visible lane.

## Risks

### Risk: larger refactor touches many systems

True.

Mitigation:

- keep transaction contract explicit
- promote one flow cluster at a time
- delete legacy path as each flow is promoted

### Risk: preserving exact pin/card sync semantics

True.

Mitigation:

- codify cards/pins shared visible boundary as an executor rule
- do not re-invent product semantics while refactoring ownership

### Risk: profile flow complexity

High.

Mitigation:

- treat profile as the same architecture, not a special exception
- prepared snapshot for profile camera/sheet/content is mandatory

## Validation Strategy

Always run:

- relevant lint/tests for touched files
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

Run when relevant:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`

Device validation focus:

- results reveal
- results dismiss
- search-this-area rerun
- pin -> profile open
- profile close / restore

Measure:

- JS stall windows
- UI stall windows
- pre-visible prep duration
- visible execution duration
- settle duration

Desired end state:

- almost all visible-phase cost is UI/native execution cost
- JS cost is concentrated in pre-prepare and post-settle, not in visible execution

## Plain-English Target

The app should work like stage crew and actors.

- JS is the stage crew.
  It gets the set ready behind the curtain.
- UI/native is the actor on stage.
  When the curtain opens, it just performs.

What we have now in the choppy flows is closer to this:

- the curtain opens
- stage crew is still moving props
- lights are still being set
- actors are already trying to perform

That is why the app stutters.

The ideal architecture is:

- prepare everything first
- freeze the plan
- let the UI/native side perform it smoothly
- clean up after the scene is over

That is the architecture we should cut over to.

## Implementation Readiness

This plan is ready for implementation once we agree on the locked product contract above.

The intended implementation rhythm is:

- Slice 1: foundation
- Slice 2: results reveal/dismiss/search-this-area
- Slice 3: profile open/close
- Slice 4: consolidation and deletion

Current profile status is narrower than the original Slice 3 target: prepared phase planning, phase sequencing, motion composition, and settle wiring are now separated; camera and sheet lanes already have native command paths; and the JS/native stop line is now locked, with shell-state staying as the lone JS-owned app-policy lane while native remains the command/completion executor for camera and sheet work.

That is large, but it is still a realistic way to promote the architecture without losing control of the codebase.

Live shape note: the deleted `use-search-root-surface-publication-args-runtime-contract.ts` and deleted `use-search-root-publication-args-runtime-contract.ts` no longer own another shared publication vocabulary tier. The deleted grouped `use-search-root-runtime-publication-args-runtime.ts`, deleted `use-search-root-chrome-input-publication-args-runtime.ts`, deleted `use-search-root-route-panel-publication-args-runtime.ts`, and deleted `use-search-root-restaurant-route-publication-args-runtime.ts` no longer sit between the root and the lower publication owners, the lower suggestion/header/filter input arg owners still terminate through `use-search-root-suggestion-input-publication-args-runtime.ts`, `use-search-root-header-input-publication-args-runtime.ts`, and `use-search-root-filters-warmup-publication-args-runtime.ts`, the map-render publication split now terminates through `search-root-map-render-publication-runtime-contract.ts`, `use-search-root-presentation-owner-runtime.ts` now owns the visual/route/restaurant/render publication lane, and `use-search-root-runtime.ts` now stays on root runtime publication plus lower map/presentation owner composition instead of keeping that whole publication lane inline.

Live shape note: `use-search-root-map-display-runtime-contract.ts` now owns the shared root map-display vocabulary, `use-search-root-map-runtime-interaction-args-runtime.ts` now owns runtime-backed map interaction arg assembly, `use-search-root-map-scaffold-interaction-args-runtime.ts` now owns scaffold-backed map interaction arg assembly, `use-search-root-map-request-interaction-args-runtime.ts` now owns request-backed map interaction arg assembly, `use-search-root-map-primitives-interaction-args-runtime.ts` now owns primitives/suggestion interaction arg assembly, `use-search-root-map-action-interaction-args-runtime.ts` now owns profile/presentation interaction arg assembly, the deleted `use-search-root-map-interaction-args-runtime.ts` and deleted `use-search-root-map-display-runtime.ts` no longer sit between those lower interaction owners and the map runtime, `use-search-root-map-stable-handlers-args-runtime.ts` now owns stable map-handler arg assembly, `use-search-root-map-display-owner-runtime.ts` now owns grouped map-display composition over those lower interaction/stable-handler owners, `use-search-root-map-render-publication-owner-runtime.ts` now owns the map-render publication split, `use-search-root-map-runtime.ts` now stays on thin composition over those lower map owners, and `use-search-root-runtime.ts` no longer wires that full map lane inline.

Live shape note: `use-search-foreground-visual-runtime-contract.ts` now owns the shared foreground-visual vocabulary, `use-search-foreground-bottom-nav-visual-runtime.ts` now owns the bottom-nav/results-wash/handoff lane, `use-search-foreground-shortcuts-visual-runtime.ts` now owns shortcut presence plus shortcut chip/chrome animation, `use-search-foreground-chrome-surface-visual-runtime.ts` now owns search surface and bar container animation, `use-search-foreground-search-this-area-visual-runtime.ts` now owns search-this-area reveal plus status-bar fade geometry, and `use-search-foreground-visual-runtime.ts` now stays on thin composition over those lower visual owners instead of remaining the mixed later visual lane.

Live shape note: `search-root-action-runtime-contract.ts` now owns the shared root action vocabulary, the old grouped `SearchRootActionRuntime` bag is gone from the live root-side contract path, and the root-side action surface still terminates on the separate `sessionActionRuntime`, `resultsSheetInteractionModel`, and `presentationState` lanes instead of another nested action bundle. The deleted `use-search-root-session-action-args-runtime-contract.ts`, deleted `use-search-root-suggestion-interaction-args-runtime.ts`, deleted `use-search-root-submit-owner-args-runtime.ts`, deleted `use-search-root-filter-modal-args-runtime.ts`, deleted `use-search-root-foreground-interaction-args-runtime.ts`, deleted `use-search-root-ui-effects-args-runtime.ts`, deleted `use-search-root-results-sheet-interaction-args-runtime.ts`, deleted `use-search-root-session-action-args-runtime.ts`, deleted `use-search-root-presentation-state-args-runtime.ts`, deleted `use-search-root-action-runtime.ts`, deleted `use-search-root-session-action-runtime-contract.ts`, deleted `use-search-session-action-runtime.ts`, deleted `use-search-session-dependent-runtime.ts`, deleted `use-search-root-session-dependent-runtime.ts`, deleted `use-search-root-session-interaction-runtime.ts`, deleted `use-search-root-submit-filter-runtime.ts`, deleted `use-search-root-foreground-effects-runtime.ts`, deleted `use-search-root-filter-modal-owner-runtime.ts`, deleted `use-search-root-ui-effects-owner-runtime.ts`, deleted `use-search-root-session-action-owner-runtime.ts`, deleted `use-search-root-submit-runtime.ts`, deleted `use-search-root-action-owner-runtime.ts`, deleted `use-search-root-session-action-lane-runtime.ts`, deleted `use-search-root-results-sheet-runtime.ts`, deleted `use-search-root-results-presentation-state-runtime.ts`, deleted `use-search-root-action-runtime-publication-runtime.ts`, deleted `use-search-root-session-profile-owner-runtime.ts`, deleted `use-search-root-filter-modal-runtime.ts`, deleted `use-search-root-foreground-runtime.ts`, deleted `use-search-root-session-ui-effects-runtime.ts`, deleted `use-search-root-submit-read-model-runtime.ts`, deleted `use-search-root-submit-ui-ports-runtime.ts`, deleted `use-search-root-submit-runtime-ports-runtime.ts`, deleted `use-search-root-foreground-interaction-runtime.ts`, deleted `use-search-root-submit-filter-model-runtime.ts`, deleted `use-search-root-foreground-effects-model-runtime.ts`, deleted `use-search-root-session-dependent-model-runtime.ts`, deleted `use-search-root-session-action-model-runtime.ts`, deleted `use-search-root-action-publication-runtime.ts`, deleted `use-search-root-submit-model-runtime.ts`, deleted `use-search-root-foreground-model-runtime.ts`, deleted `use-search-root-filter-modal-model-runtime.ts`, deleted `use-search-root-ui-effects-model-runtime.ts`, deleted `use-search-root-results-sheet-interaction-runtime.ts`, deleted `use-search-root-results-presentation-state-runtime.ts`, deleted `use-search-root-runtime-publication-state-runtime.ts`, deleted `use-search-root-session-foreground-runtime.ts`, deleted `use-search-root-session-submit-filter-runtime.ts`, deleted `use-search-root-action-presentation-runtime.ts`, deleted `use-search-root-action-phase-runtime.ts`, deleted `use-search-root-submit-filter-owner-runtime.ts`, deleted `use-search-root-action-surface-runtime.ts`, deleted `use-search-root-action-model-runtime.ts`, now-deleted `use-search-root-submit-owner-runtime.ts`, now-deleted `use-search-root-dependent-action-runtime.ts`, now-deleted `use-search-root-profile-owner-runtime.ts`, now-deleted `use-search-root-results-sheet-interaction-owner-runtime.ts`, now-deleted `use-search-root-results-surface-state-runtime.ts`, now-deleted `use-search-root-action-publication-effects-runtime.ts`, now-deleted `use-search-session-action-boundary-runtime.ts`, now-deleted `use-search-session-submit-runtime.ts`, now-deleted `use-search-root-session-action-lanes-runtime.ts`, now-deleted `use-search-root-session-dependent-lane-runtime.ts`, now-deleted `use-search-root-session-submit-lane-runtime.ts`, now-deleted `use-search-root-session-action-runtime.ts`, now-deleted `use-search-root-results-surface-runtime.ts`, now-deleted `use-search-root-dependent-session-runtime.ts`, now-deleted `use-search-root-submit-filter-session-runtime.ts`, now-deleted `use-search-root-foreground-session-runtime.ts`, now-deleted `use-search-root-results-interaction-runtime.ts`, now-deleted `use-search-root-results-presentation-runtime.ts`, now-deleted `use-search-root-profile-session-runtime.ts`, now-deleted `use-search-root-submit-surface-runtime.ts`, now-deleted `use-search-root-submit-filter-surface-runtime.ts`, now-deleted `use-search-root-session-dependent-surface-runtime.ts`, now-deleted `use-search-root-session-action-surface-runtime.ts`, now-deleted `use-search-root-results-surface-publication-runtime.ts`, now-deleted `use-search-root-foreground-surface-runtime.ts`, now-deleted `use-search-root-foreground-command-runtime.ts`, and now-deleted `use-search-root-foreground-state-runtime.ts` remain gone. `use-search-root-session-profile-surface-runtime.ts` now owns the root-side profile/session lane, `use-search-root-submit-presentation-runtime.ts` now owns the root-side submit presentation/toggle lane, `use-search-root-submit-owner-surface-runtime.ts` now owns the direct submit-owner composition lane, `use-search-root-filter-surface-runtime.ts` now owns the root-side filter lane, `use-search-root-session-action-owner-runtime.ts` now terminates foreground interaction composition directly at the real session-action owner boundary over request/session/primitives/scaffold/suggestion lower lanes while still owning the full root-side profile/session/submit/filter/foreground session-action composition, `use-search-root-results-publication-owner-runtime.ts` now owns the root-side results-sheet interaction, presentation-state, and runtime-publication lane, and `use-search-root-action-lanes-runtime.ts` now stays on thin composition over those two real lower owners while map/presentation still consume `sessionActionRuntime`, `resultsSheetInteractionModel`, and `presentationState` directly.

Live shape note: `use-search-root-profile-action-runtime-contract.ts` now owns the shared root profile-action vocabulary, `use-search-root-profile-selection-model-runtime.ts` now owns restaurant selection-model assembly, `use-search-root-profile-analytics-model-runtime.ts` now owns profile analytics-model assembly, `use-search-root-profile-native-execution-args-runtime.ts` now owns camera-transition, selection, and native execution args, `use-search-root-profile-app-execution-args-runtime.ts` now owns app execution args plus pending marker-frame cleanup, and `use-search-root-profile-action-runtime.ts` now stays on thin composition over those lower profile-action owners instead of remaining the mixed profile-action host.

Live shape note: `use-search-root-session-runtime-contract.ts` now owns the shared root-session vocabulary, `use-search-root-shared-snap-state-runtime.ts` now owns shared-snap reads, `use-search-root-results-arrival-state-runtime.ts` now owns results-arrival selection, `use-search-root-hydration-runtime-state.ts` now owns hydration-state selection, `use-search-root-camera-viewport-runtime.ts` now owns the root camera viewport refs plus `commitCameraViewport(...)`, `use-search-root-session-state-runtime.ts` now owns the bus-backed runtime owner/state/flags/primitives/hydration lane, `use-search-root-session-search-services-runtime.ts` now owns freeze/history/filter/request-status services, `use-search-root-session-overlay-map-runtime.ts` now owns overlay-command plus map-bootstrap composition, the deleted `use-search-root-session-runtime.ts` no longer sits between those lower session owners and the construction lane, and `use-search-root-construction-runtime.ts` now composes those lower session owners directly instead of routing through another grouped root-session constructor lane.

Live shape note: `use-search-root-runtime-contract.ts` now owns the shared top-level root vocabulary, the deleted `use-search-root-suggestion-scaffold-flow-runtime.ts`, deleted `use-search-root-request-action-flow-runtime.ts`, deleted `use-search-root-flow-runtime.ts`, deleted `use-search-root-flow-runtime-contract.ts`, deleted `use-search-root-core-construction-runtime.ts`, deleted `use-search-root-scaffold-request-construction-runtime.ts`, deleted `use-search-root-pre-presentation-action-owner-runtime.ts`, deleted `use-search-root-runtime-publication-owner-runtime.ts`, deleted `use-search-root-pre-presentation-interaction-runtime.ts`, now-deleted `use-search-root-pre-presentation-runtime.ts`, now-deleted `use-search-root-session-dependent-runtime.ts`, now-deleted `use-search-root-session-interaction-runtime.ts`, deleted `use-search-root-submit-owner-runtime.ts`, deleted `use-search-root-dependent-action-runtime.ts`, now-deleted `use-search-root-profile-owner-runtime.ts`, now-deleted `use-search-root-results-sheet-interaction-owner-runtime.ts`, now-deleted `use-search-root-results-surface-state-runtime.ts`, now-deleted `use-search-root-action-publication-effects-runtime.ts`, now-deleted `use-search-root-submit-filter-action-runtime.ts`, now-deleted `use-search-root-foreground-interaction-owner-runtime.ts`, now-deleted `use-search-root-foreground-submit-retry-runtime.ts`, now-deleted `use-search-root-foreground-editing-runtime.ts`, now-deleted `use-search-root-foreground-overlay-owner-runtime.ts`, now-deleted `use-search-root-ui-effects-runtime.ts`, now-deleted `use-search-session-action-boundary-runtime.ts`, now-deleted `use-search-session-submit-runtime.ts`, now-deleted `use-search-root-session-action-lanes-runtime.ts`, now-deleted `use-search-root-session-dependent-lane-runtime.ts`, now-deleted `use-search-root-session-submit-lane-runtime.ts`, now-deleted `use-search-root-session-action-runtime.ts`, now-deleted `use-search-root-results-surface-runtime.ts`, now-deleted `use-search-root-dependent-session-runtime.ts`, now-deleted `use-search-root-submit-filter-session-runtime.ts`, now-deleted `use-search-root-foreground-session-runtime.ts`, now-deleted `use-search-root-results-interaction-runtime.ts`, now-deleted `use-search-root-results-presentation-runtime.ts`, and now-deleted `use-search-root-profile-session-runtime.ts` remain gone. `use-search-root-construction-runtime.ts` now owns primitives/session/suggestion/scaffold/request construction, `use-search-root-action-lanes-runtime.ts` now stays on thin composition over `use-search-root-session-action-owner-runtime.ts` and `use-search-root-results-publication-owner-runtime.ts`, `use-search-root-map-runtime.ts` now owns the grouped map lane, and `use-search-root-presentation-owner-runtime.ts` now owns the grouped presentation lane. The top-level root now stays on orchestration over those real lower owners and threads `sessionActionRuntime`, `resultsSheetInteractionModel`, and `presentationState` from `use-search-root-action-lanes-runtime.ts` directly into `use-search-root-map-runtime.ts` and `use-search-root-presentation-owner-runtime.ts` instead of preserving another grouped root-action bag.

Live shape note: the shared results boundary is narrower again too. `results-toggle-interaction-contract.ts` now owns toggle kind/lifecycle/scheduling/state vocabulary, `results-presentation-panel-state-contract.ts` now owns panel-only surface/render policy, and `results-presentation-runtime-contract.ts` now stays on the shared read/transport lane plus the settled-stage/read-model equality helpers instead of also carrying those lower toggle/panel families. The live consumers were repointed directly: `use-results-presentation-runtime-owner.ts`, `results-presentation-runtime-machine.ts`, `results-presentation-runtime-owner-contract.ts`, `query-mutation-orchestrator.ts`, and `search-runtime-bus.ts` now terminate on `results-toggle-interaction-contract.ts`, while `use-search-results-panel-render-policy-runtime.tsx` and `use-search-results-panel-surface-state-runtime.tsx` now terminate on `results-presentation-panel-state-contract.ts` instead of the broader shared runtime contract.

Live shape note: the shared results owner is flatter again too. The deleted `use-results-presentation-action-surface-runtime.ts`, deleted `use-results-presentation-close-runtime.ts`, deleted `use-results-presentation-request-runtime.ts`, deleted `use-results-presentation-shell-actions-runtime.ts`, deleted `use-results-presentation-shell-close-runtime.ts`, deleted `use-results-presentation-shell-request-runtime.ts`, deleted `use-results-presentation-close-search-runtime.ts`, deleted `use-results-presentation-close-transition-state-runtime.ts`, deleted `use-results-presentation-close-intent-runtime.ts`, deleted `use-results-presentation-close-transition-lifecycle-runtime.ts`, deleted `use-results-presentation-close-transition-actions-runtime.ts`, deleted `results-presentation-shell-actions-runtime-contract.ts`, deleted `use-results-presentation-owner-close-runtime.ts`, deleted `use-results-presentation-owner-request-runtime.ts`, deleted `use-results-presentation-owner-close-transition-runtime.ts`, deleted `use-results-presentation-owner-close-search-runtime.ts`, deleted `use-results-presentation-owner-close-transition-state-runtime.ts`, deleted `use-results-presentation-runtime-core-owner.ts`, deleted `use-results-presentation-owner-sheet-execution-runtime.ts`, deleted `use-results-presentation-owner-close-exit-runtime.ts`, deleted `use-results-presentation-owner-enter-request-runtime.ts`, and deleted `use-results-presentation-owner-toggle-runtime.ts` remain gone. `results-presentation-owner-action-runtime-contract.ts` now owns the shared owner-action arg vocabulary, `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now owns the owner-side close-transition lifecycle lane, `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns grouped `closeTransitionActions`, `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns the lower deferred close-search cleanup lane, and `use-results-presentation-runtime-owner.ts` now terminates directly on `use-results-presentation-runtime-machine-owner.ts` and `use-results-presentation-toggle-runtime.ts`, keeps grouped `resultsSheetExecutionModel`, owner-side prepared exit dispatch, enter/editing/close request intent dispatch, and grouped `interactionModel` inline at the real owner boundary, and stays on shell-local state, shell model, and thin orchestration over those real lower owner-side lanes, with outward `presentationActions` assembly and close commands staying at the real owner boundary instead of routing through another local action wrapper tier.

Live shape note: the shared results machine is flatter again too. `results-presentation-runtime-machine.ts` no longer physically hosts the whole lower transport transition family inline. `results-presentation-runtime-machine-transport.ts` now owns committed/idle transport assembly, cover-state apply/clear policy, cancel/abort reset policy, toggle lifecycle transport resolution, enter mounted-hidden/start/settle transition policy, exit start/settle transition policy, and the grouped applied-log plus blocked-log semantics, while `results-presentation-runtime-machine.ts` now stays on machine-host apply/publish orchestration over that lower transport owner.

Live shape note: the deleted `use-search-root-publication-runtime-contract.ts` no longer owns a grouped root-publication vocabulary. The remaining root/publication types now terminate under the real lower owners: `use-search-root-runtime-contract.ts` owns the outward top-level root runtime surface, `use-search-root-visual-publication-args-runtime-contract.ts` owns the shared visual-publication arg vocabulary, `use-search-root-chrome-input-publication-args-runtime-contract.ts` owns the shared chrome-input publication vocabulary, `search-root-map-render-publication-runtime-contract.ts` owns the map-render publication vocabulary, `search-root-render-runtime-contract.ts` now owns the shared render vocabulary, and direct `use-search-runtime-publication-runtime.ts` now terminates that runtime publication lane inside `use-search-root-runtime.ts`. `use-search-root-presentation-visual-runtime.ts` now owns grouped visual/input publication preparation, `use-search-root-search-route-publication-runtime.ts` now owns Search-route publication, `use-search-root-restaurant-route-publication-owner-runtime.ts` now owns restaurant-route publication, `use-search-root-presentation-route-publication-runtime.ts` now stays on thin composition over those lower route-publication owners, `use-search-root-foreground-render-owner-runtime.ts` now owns the foreground render publication side of that lane, `use-search-root-modal-sheet-render-owner-runtime.ts` now owns the modal-sheet render publication side of that lane, `use-search-root-presentation-render-runtime.ts` now stays on thin composition over those lower render owners, and `use-search-root-presentation-owner-runtime.ts` now stays on thin composition over those lower publication/render owners.

Live shape note: the shared results owner/runtime seam is flatter again too. The deleted `use-results-presentation-runtime-core-owner.ts`, deleted `use-results-presentation-owner-close-exit-runtime.ts`, deleted `use-results-presentation-owner-enter-request-runtime.ts`, and deleted `use-results-presentation-owner-toggle-runtime.ts` now also remain gone. `use-results-presentation-runtime-machine-owner.ts` now owns the runtime-machine publication, prepared snapshot staging/commit policy, and marker enter/exit handoff coordination directly under the real owner, while `use-results-presentation-toggle-runtime.ts` now owns toggle lifecycle plus frost-ready completion over that lower machine owner. `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now owns pending/active close intent refs plus restore/finalization lifecycle policy. `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns close-transition event application plus grouped `closeTransitionActions` over that lower lifecycle lane. `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns deferred close-search cleanup scheduling over those lower close-transition lanes, while `use-results-presentation-runtime-owner.ts` now keeps outward `beginCloseSearch()` / `handleCloseResults()` / `cancelCloseSearch()` inline at the real owner boundary, assembles grouped `resultsSheetExecutionModel`, prepared exit execution, prepared snapshot shell application plus prepared enter/editing/close request intent dispatch, and tab-toggle commit plus grouped `interactionModel` inline, and stays on shell-local state, shell model, and thin outward owner composition over those lower runtime and owner-action lanes instead of physically hosting that whole mixed owner lane inline.

Live shape note: the shared results runtime-core lane is flatter again too. The deleted `use-results-presentation-runtime-core-owner.ts` no longer sits between the real owner and the lower runtime lanes. `use-results-presentation-runtime-machine-owner.ts` now owns the runtime-machine publication, prepared snapshot staging/commit policy, and marker enter/exit handoff coordination, `use-results-presentation-toggle-runtime.ts` now owns toggle lifecycle, frost-ready commit, and intent completion over that lower machine owner, and `use-results-presentation-runtime-owner.ts` now terminates directly on those two lower runtime owners instead of routing through the deleted runtime-core host.

Live shape note: the shared results runtime-machine lane is flatter again too. `use-results-presentation-staging-runtime.ts` now owns committed snapshot-key selection, staging admission/commit policy, page-one staging completion, and abort-time staged cleanup over the lower machine callbacks, while `use-results-presentation-marker-handoff-runtime.ts` now owns execution-batch enter/exit markers plus the run-one handoff settle bridge. `use-results-presentation-runtime-machine-owner.ts` now stays on thin composition over the live machine callbacks plus those two lower owners instead of remaining the mixed staging/handoff host.

Live shape note: the shared results marker-handoff lane is flatter again too. `use-results-presentation-marker-enter-runtime.ts` now owns mounted-hidden/start/settled enter markers plus the run-one handoff settle bridge, while `use-results-presentation-marker-exit-runtime.ts` now owns exit start/settle handling plus close-map-exit completion. `use-results-presentation-marker-handoff-runtime.ts` now stays on thin composition over those two lower enter/exit owners instead of remaining the mixed marker handoff host.

Live shape note: the shared results marker-enter lane is flatter again too. `use-results-presentation-marker-enter-batch-runtime.ts` now owns mounted-hidden/start/settled enter-batch admission over the lower machine callbacks, while `use-results-presentation-marker-enter-settle-bridge-runtime.ts` now owns the pending-enter settle queue plus run-one handoff advancement. `use-results-presentation-marker-enter-runtime.ts` now stays on thin composition over those two lower owners instead of remaining the mixed enter batch/settle host.

Live shape note: the shared results transport lane is flatter again too. `results-presentation-runtime-machine-enter-transport.ts` now owns the enter-mounted-hidden, start-enter-execution, enter-started, and enter-settled attempt family, while `results-presentation-runtime-machine-exit-transport.ts` now owns the exit-started and exit-settled attempt family. `results-presentation-runtime-machine-transport.ts` now stays on shared transport attempt primitives plus cover-state, cancel/abort, commit, and toggle lifecycle transport policy instead of physically hosting the whole enter/exit transition family inline.

Live shape note: the shared results owner-side action lane is flatter again too. The deleted `use-results-presentation-shell-close-runtime.ts`, deleted `use-results-presentation-shell-request-runtime.ts`, deleted `use-results-presentation-shell-actions-runtime.ts`, deleted `use-results-presentation-close-search-runtime.ts`, deleted `use-results-presentation-close-transition-state-runtime.ts`, deleted `use-results-presentation-close-intent-runtime.ts`, deleted `use-results-presentation-close-transition-lifecycle-runtime.ts`, deleted `use-results-presentation-close-transition-actions-runtime.ts`, deleted `results-presentation-shell-actions-runtime-contract.ts`, deleted `use-results-presentation-owner-close-runtime.ts`, deleted `use-results-presentation-owner-request-runtime.ts`, deleted `use-results-presentation-owner-close-transition-runtime.ts`, deleted `use-results-presentation-owner-close-search-runtime.ts`, deleted `use-results-presentation-owner-close-transition-state-runtime.ts`, deleted `use-results-presentation-owner-sheet-execution-runtime.ts`, deleted `use-results-presentation-owner-close-exit-runtime.ts`, deleted `use-results-presentation-owner-enter-request-runtime.ts`, and deleted `use-results-presentation-owner-toggle-runtime.ts` remain gone. `results-presentation-owner-action-runtime-contract.ts` now owns the shared owner-action arg vocabulary, `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now owns direct close-transition refs plus restore/finalization policy, `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns grouped `closeTransitionActions`, `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns deferred close-search cleanup scheduling, and `use-results-presentation-runtime-owner.ts` now stays on thin orchestration over those real owner-side lanes plus shell-local state, shell model, direct runtime-machine/toggle composition, owner-inline grouped `resultsSheetExecutionModel`, owner-inline prepared exit execution, owner-inline prepared snapshot shell application plus `requestSearchPresentationIntent(...)`, owner-inline grouped `interactionModel`, and owner-inline close commands.

Live shape note: the shared results close-transition lane is flatter again too. The deleted `use-results-presentation-close-transition-runtime.ts`, deleted `use-results-presentation-close-transition-state-runtime.ts`, deleted `use-results-presentation-close-intent-runtime.ts`, deleted `use-results-presentation-close-transition-lifecycle-runtime.ts`, deleted `use-results-presentation-close-transition-actions-runtime.ts`, deleted `use-results-presentation-owner-close-runtime.ts`, deleted `use-results-presentation-owner-close-transition-runtime.ts`, deleted `use-results-presentation-owner-close-search-runtime.ts`, deleted `use-results-presentation-owner-close-transition-state-runtime.ts`, and deleted `use-results-presentation-owner-close-exit-runtime.ts` remain gone. `use-results-presentation-owner-close-transition-lifecycle-runtime.ts` now terminates the lower transition lifecycle lane directly on the pure transition-state helpers in `results-presentation-shell-close-transition-state.ts`, `use-results-presentation-owner-close-transition-actions-runtime.ts` now owns close-transition event application plus grouped `closeTransitionActions` over that lower lifecycle lane, `use-results-presentation-owner-close-search-cleanup-runtime.ts` now owns deferred cleanup scheduling over those lower close-transition lanes, and `use-results-presentation-runtime-owner.ts` now keeps prepared exit dispatch and outward close commands at the real owner boundary.

Live shape note: the shared results enter transport lane is flatter again too. The deleted `results-presentation-runtime-machine-enter-transport.ts` no longer sits between the runtime machine and the lower enter attempt families. `results-presentation-runtime-machine-enter-batch-transport.ts` now owns enter-mounted-hidden plus start-enter-execution, `results-presentation-runtime-machine-enter-completion-transport.ts` now owns enter-started plus enter-settled, and `results-presentation-runtime-machine.ts` now terminates directly on those two lower enter transport owners together with `results-presentation-runtime-machine-exit-transport.ts`.

Live shape note: the shared results transport host is flatter again too. The deleted `results-presentation-runtime-machine-transport.ts` no longer sits between the runtime machine and the lower transport policy/primitives families. `results-presentation-runtime-machine-transport-primitives.ts` now owns the named/applied attempt types, active execution resolution, and attempt application plumbing, `results-presentation-runtime-machine-cover-state-transport.ts` now owns cover-state apply/clear policy, `results-presentation-runtime-machine-intent-lifecycle-transport.ts` now owns cancel/abort/commit policy plus toggle lifecycle transport resolution over that lower cover-state owner, and `results-presentation-runtime-machine.ts` plus the lower enter/exit transport owners now terminate directly on those lower transport owners instead of another mixed shared host.
