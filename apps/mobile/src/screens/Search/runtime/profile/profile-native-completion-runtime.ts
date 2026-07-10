import React from 'react';

import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

type UseProfileNativeCompletionRuntimeArgs = {
  cameraIntentArbiter: CameraIntentArbiter;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
  pendingProfileCameraTargetRef: React.MutableRefObject<CameraSnapshot | null>;
};

export const useProfileNativeCompletionRuntime = ({
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
      // L3 slice 4: the machine's camera_settled completion emit is DELETED — this
      // handler's surviving job is the camera-state truth sync on animation completion.
    },
    [lastCameraStateRef, pendingProfileCameraTargetRef]
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
