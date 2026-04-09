import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import { useSearchRuntimeOwner } from '../../hooks/use-search-runtime-owner';
import type { SearchRootCameraViewportRuntime } from './use-search-root-session-runtime-contract';

type UseSearchRootCameraViewportRuntimeArgs = {
  runtimeOwner: ReturnType<typeof useSearchRuntimeOwner>;
};

export const useSearchRootCameraViewportRuntime = ({
  runtimeOwner,
}: UseSearchRootCameraViewportRuntimeArgs): SearchRootCameraViewportRuntime => {
  const lastSearchBoundsCaptureSeqRef = React.useRef(0);
  const lastVisibleSheetStateRef = React.useRef<Exclude<OverlaySheetSnap, 'hidden'>>('middle');
  const lastCameraStateRef = React.useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const lastPersistedCameraRef = React.useRef<string | null>(null);
  const commitCameraViewport = React.useCallback(
    (
      payload: { center: [number, number]; zoom: number },
      options?: {
        allowDuringGesture?: boolean;
        animationMode?: 'none' | 'easeTo';
        animationDurationMs?: number;
        requestToken?: number | null;
      }
    ) =>
      runtimeOwner.cameraIntentArbiter.commit({
        center: payload.center,
        zoom: payload.zoom,
        allowDuringGesture: options?.allowDuringGesture,
        animationMode: options?.animationMode,
        animationDurationMs: options?.animationDurationMs,
        requestToken: options?.requestToken,
      }),
    [runtimeOwner.cameraIntentArbiter]
  );

  return {
    lastSearchBoundsCaptureSeqRef,
    lastVisibleSheetStateRef,
    lastCameraStateRef,
    lastPersistedCameraRef,
    commitCameraViewport,
  };
};
