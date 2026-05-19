import React from 'react';

import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { PreparedProfilePresentationCompletionEvent } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';

type UseProfileNativeCompletionRuntimeArgs = {
  preparedProfileCompletionHandlerRef: React.MutableRefObject<
    ((event: PreparedProfilePresentationCompletionEvent) => void) | null
  >;
  cameraIntentArbiter: CameraIntentArbiter;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
  pendingProfileCameraTargetRef: React.MutableRefObject<CameraSnapshot | null>;
};

export const useProfileNativeCompletionRuntime = ({
  preparedProfileCompletionHandlerRef,
  cameraIntentArbiter,
  lastCameraStateRef,
  pendingProfileCameraTargetRef,
}: UseProfileNativeCompletionRuntimeArgs): void => {
  const handlePreparedProfileCameraCompletion = React.useCallback(
    (payload: {
      animationCompletionId: string | null;
      status: 'finished' | 'cancelled';
      requestToken: number | null;
    }) => {
      const pendingCameraTarget = pendingProfileCameraTargetRef.current;
      pendingProfileCameraTargetRef.current = null;
      if (payload.status === 'finished' && pendingCameraTarget) {
        lastCameraStateRef.current = {
          center: pendingCameraTarget.center,
          zoom: pendingCameraTarget.zoom,
        };
      }
      preparedProfileCompletionHandlerRef.current?.({
        type: 'camera_settled',
        requestToken: payload.requestToken,
      });
    },
    [lastCameraStateRef, pendingProfileCameraTargetRef, preparedProfileCompletionHandlerRef]
  );

  React.useEffect(() => {
    cameraIntentArbiter.setProgrammaticCameraAnimationCompletionHandler(
      handlePreparedProfileCameraCompletion
    );
    return () => {
      cameraIntentArbiter.setProgrammaticCameraAnimationCompletionHandler(null);
    };
  }, [cameraIntentArbiter, handlePreparedProfileCameraCompletion]);
};
