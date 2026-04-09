import React from 'react';

import type {
  OverlaySheetSnapCommandRuntime,
  OverlaySheetSnapCommandRuntimeArgs,
} from './overlaySheetShellRuntimeContract';
import type { OverlaySheetSnapRequest } from './types';

export const useOverlaySheetSnapRequestRuntime = ({
  runtime,
  handleSnapChangeBase,
  handleSnapStartBase,
}: OverlaySheetSnapCommandRuntimeArgs): OverlaySheetSnapCommandRuntime => {
  const requestedShellSnapRef = React.useRef<OverlaySheetSnapRequest | null>(null);
  const currentSnapRef = React.useRef<'expanded' | 'middle' | 'collapsed' | 'hidden'>('hidden');

  const requestShellSnap = React.useCallback(
    (request: OverlaySheetSnapRequest | null) => {
      requestedShellSnapRef.current = request;
      if (!request) {
        runtime.snapController.clearCommand();
        return;
      }
      runtime.snapController.requestSnap(request.snap, undefined, request.token ?? null);
    },
    [runtime.snapController]
  );

  const handleSnapChange = React.useCallback<OverlaySheetSnapCommandRuntime['handleSnapChange']>(
    (snap, meta) => {
      currentSnapRef.current = snap;
      handleSnapChangeBase(snap, meta);
      if (requestedShellSnapRef.current && snap === requestedShellSnapRef.current.snap) {
        requestShellSnap(null);
      }
    },
    [handleSnapChangeBase, requestShellSnap]
  );

  const handleSnapStart = React.useCallback<OverlaySheetSnapCommandRuntime['handleSnapStart']>(
    (snap, meta) => {
      handleSnapStartBase(snap, meta);
    },
    [handleSnapStartBase]
  );

  return React.useMemo(
    () => ({
      handleSnapChange,
      handleSnapStart,
      requestShellSnap,
      requestedShellSnapRef,
      currentSnapRef,
    }),
    [handleSnapChange, handleSnapStart, requestShellSnap]
  );
};
