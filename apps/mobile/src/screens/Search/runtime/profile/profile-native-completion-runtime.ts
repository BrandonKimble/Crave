import React from 'react';

import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { PreparedProfilePresentationCompletionEvent } from './profile-prepared-presentation-transaction-contract';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type ProfileNativeCompletionRuntime = {
  handlePreparedProfileOverlayDismissed: (requestToken: number | null) => void;
  handlePreparedProfileSheetSettled: (
    snap: Exclude<OverlaySheetSnap, 'hidden'>,
    requestToken: number | null
  ) => void;
};

type UseProfileNativeCompletionRuntimeArgs = {
  preparedProfileCompletionHandlerRef: React.MutableRefObject<
    ((event: PreparedProfilePresentationCompletionEvent) => void) | null
  >;
  cameraIntentArbiter: CameraIntentArbiter;
};

export const useProfileNativeCompletionRuntime = ({
  preparedProfileCompletionHandlerRef,
  cameraIntentArbiter,
}: UseProfileNativeCompletionRuntimeArgs): ProfileNativeCompletionRuntime => {
  const handlePreparedProfileOverlayDismissed = React.useCallback(
    (requestToken: number | null) => {
      preparedProfileCompletionHandlerRef.current?.({
        type: 'overlay_dismissed',
        requestToken,
      });
    },
    [preparedProfileCompletionHandlerRef]
  );

  const handlePreparedProfileSheetSettled = React.useCallback(
    (snap: Exclude<OverlaySheetSnap, 'hidden'>, requestToken: number | null) => {
      preparedProfileCompletionHandlerRef.current?.({
        type: 'sheet_settled',
        snap,
        requestToken,
      });
    },
    [preparedProfileCompletionHandlerRef]
  );

  const handlePreparedProfileCameraCompletion = React.useCallback(
    (payload: {
      animationCompletionId: string | null;
      status: 'finished' | 'cancelled';
      requestToken: number | null;
    }) => {
      void payload.animationCompletionId;
      void payload.status;
      preparedProfileCompletionHandlerRef.current?.({
        type: 'camera_settled',
        requestToken: payload.requestToken,
      });
    },
    [preparedProfileCompletionHandlerRef]
  );

  React.useEffect(() => {
    cameraIntentArbiter.setProgrammaticCameraAnimationCompletionHandler(
      handlePreparedProfileCameraCompletion
    );
    return () => {
      cameraIntentArbiter.setProgrammaticCameraAnimationCompletionHandler(null);
    };
  }, [cameraIntentArbiter, handlePreparedProfileCameraCompletion]);

  return React.useMemo(
    () => ({
      handlePreparedProfileOverlayDismissed,
      handlePreparedProfileSheetSettled,
    }),
    [handlePreparedProfileOverlayDismissed, handlePreparedProfileSheetSettled]
  );
};
