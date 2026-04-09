import React from 'react';

import type { OverlaySheetDesiredSnapRuntimeArgs } from './overlaySheetShellRuntimeContract';

type UseOverlaySheetRequestedSnapRuntimeArgs = Pick<
  OverlaySheetDesiredSnapRuntimeArgs,
  'visible' | 'spec' | 'resolvedOverlayKey' | 'requestShellSnap' | 'requestedShellSnapRef'
>;

export const useOverlaySheetRequestedSnapRuntime = ({
  visible,
  spec,
  resolvedOverlayKey,
  requestShellSnap,
  requestedShellSnapRef,
}: UseOverlaySheetRequestedSnapRuntimeArgs): boolean => {
  const lastSnapOverlayKeyRef = React.useRef<string | null>(null);
  const lastSnapPointsKeyRef = React.useRef<string | null>(null);
  const hasRequestedSnap = Boolean(visible && spec?.shellSnapRequest);

  React.useEffect(() => {
    if (!visible || !spec) {
      lastSnapOverlayKeyRef.current = null;
      lastSnapPointsKeyRef.current = null;
      requestShellSnap(null);
      return;
    }

    const snapPointsKey = `${spec.snapPoints.expanded}:${spec.snapPoints.middle}:${
      spec.snapPoints.collapsed
    }:${spec.snapPoints.hidden ?? ''}`;
    const overlayChanged = lastSnapOverlayKeyRef.current !== resolvedOverlayKey;
    const snapPointsChanged = lastSnapPointsKeyRef.current !== snapPointsKey;
    if (overlayChanged || snapPointsChanged) {
      lastSnapOverlayKeyRef.current = resolvedOverlayKey;
      lastSnapPointsKeyRef.current = snapPointsKey;
    }

    const shellSnapRequest = spec.shellSnapRequest ?? null;
    if (!shellSnapRequest) {
      return;
    }

    if (
      requestedShellSnapRef.current?.snap !== shellSnapRequest.snap ||
      (requestedShellSnapRef.current?.token ?? null) !== (shellSnapRequest.token ?? null)
    ) {
      requestShellSnap(shellSnapRequest);
    }
  }, [requestShellSnap, requestedShellSnapRef, resolvedOverlayKey, spec, visible]);

  return hasRequestedSnap;
};
