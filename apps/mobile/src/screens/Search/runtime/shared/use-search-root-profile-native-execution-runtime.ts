import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootSessionCoreLane, SearchRootSessionPrimitivesLane } from './use-search-root-session-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ProfileOwnerNativeExecutionArgs } from '../profile/profile-owner-runtime-contract';
import { appRouteResultsSheetLastVisibleStateRef } from '../../../../navigation/runtime/app-route-results-sheet-visible-state-runtime';
import { PROFILE_CAMERA_ANIMATION_MS } from '../profile/profile-camera-motion-constants';

export const useSearchRootProfileNativeExecutionRuntime = ({
  sessionCoreLane,
  sessionPrimitivesLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  sessionPrimitivesLane: SearchRootSessionPrimitivesLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
}): ProfileOwnerNativeExecutionArgs => {
  const { rootPrimitivesRuntime } = stateFoundationLane;
  const { rootInstrumentationRuntime } = rootOverlayFoundationRuntime;

  return React.useMemo<ProfileOwnerNativeExecutionArgs>(
    () => ({
      emitRuntimeMechanismEvent: rootInstrumentationRuntime.emitRuntimeMechanismEvent,
      cameraIntentArbiter: sessionCoreLane.cameraIntentArbiter,
      profileCameraAnimationMs: PROFILE_CAMERA_ANIMATION_MS,
      lastVisibleSheetStateRef: appRouteResultsSheetLastVisibleStateRef,
      lastCameraStateRef: sessionPrimitivesLane.primitives.lastCameraStateRef,
      setIsFollowingUser: rootPrimitivesRuntime.mapState.setIsFollowingUser,
      suppressMapMoved: rootPrimitivesRuntime.mapState.suppressMapMoved,
      commitCameraViewport: sessionPrimitivesLane.primitives.commitCameraViewport,
    }),
    [
      rootInstrumentationRuntime.emitRuntimeMechanismEvent,
      rootPrimitivesRuntime.mapState.setIsFollowingUser,
      rootPrimitivesRuntime.mapState.suppressMapMoved,
      sessionCoreLane.cameraIntentArbiter,
      sessionPrimitivesLane.primitives.commitCameraViewport,
      sessionPrimitivesLane.primitives.lastCameraStateRef,
    ]
  );
};
