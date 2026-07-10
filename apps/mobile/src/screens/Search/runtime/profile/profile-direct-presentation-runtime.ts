import React from 'react';

import { applySearchRestaurantRouteCommand } from '../../../../overlays/searchRestaurantRouteController';
import type { AppOverlayRouteCommandRuntime } from '../../../../navigation/runtime/app-overlay-route-command-runtime';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';
import type { ProfilePreparedPresentationRuntime } from './profile-prepared-presentation-runtime-contract';
import type { ProfileTransitionStatus } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

// ─── L3 cutover slice 2+3 — the MACHINE-LESS profile presentation ────────────────────────────
// (plans/world-camera-l3-execution.md, dissolution trace). The prepared-presentation
// transaction machine's imperative surface re-implemented as its three concrete effects:
//
//   open  = camera commit (the arbiter-owned native command, null token — no settle
//           bookkeeping) + the STANDARD child push (searchRestaurantRouteController; the
//           openChild descriptor row already yields the promoteAtLeast-middle snap the
//           machine used to force) + the interim transitionStatus write ('open' — kept only
//           until the deletion slice re-feeds isTransitionAnimating from the PF signal).
//   close = the standard hide command → closeActiveRoute → the pop-teardown writer is the
//           SOLE owner of camera restore + teardown (S-C.5 machinery, trace §3).
//   focus = the same camera commit (the terminal-dismiss restore caller).
//
// The 3-phase transaction graph, settle ledger, and completion events add nothing to these
// effects (trace §1-2: zero external readers) and delete in the next slice.

type UseProfileDirectPresentationRuntimeArgs = {
  nativeExecutionModel: Pick<ProfileNativeExecutionModel, 'commandExecutionModel'>;
  routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime;
  setProfileTransitionStatus: (transitionStatus: ProfileTransitionStatus) => void;
};

export const useProfileDirectPresentationRuntime = ({
  nativeExecutionModel,
  routeOverlayRouteCommandRuntime,
  setProfileTransitionStatus,
}: UseProfileDirectPresentationRuntimeArgs): Pick<
  ProfilePreparedPresentationRuntime,
  | 'openPreparedProfilePresentation'
  | 'closePreparedProfilePresentation'
  | 'focusPreparedProfileCamera'
> => {
  const commitCamera = React.useCallback(
    (targetCamera: CameraSnapshot | null) => {
      if (targetCamera == null) {
        return;
      }
      nativeExecutionModel.commandExecutionModel.commitProfileCameraTargetCommand(targetCamera);
    },
    [nativeExecutionModel.commandExecutionModel]
  );

  return React.useMemo(
    () => ({
      openPreparedProfilePresentation: (restaurantId, targetCamera) => {
        commitCamera(targetCamera ?? null);
        applySearchRestaurantRouteCommand(
          { type: 'show_search_restaurant_route', restaurantId },
          routeOverlayRouteCommandRuntime
        );
        setProfileTransitionStatus('open');
      },
      closePreparedProfilePresentation: () => {
        applySearchRestaurantRouteCommand(
          { type: 'hide_search_restaurant_route' },
          routeOverlayRouteCommandRuntime
        );
      },
      focusPreparedProfileCamera: (targetCamera) => {
        commitCamera(targetCamera);
      },
    }),
    [commitCamera, routeOverlayRouteCommandRuntime, setProfileTransitionStatus]
  );
};
