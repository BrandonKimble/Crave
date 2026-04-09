import React from 'react';

import type { OverlaySheetDesiredSnapRuntimeArgs } from './overlaySheetShellRuntimeContract';

type UseOverlaySheetDefaultSnapRuntimeArgs = Pick<
  OverlaySheetDesiredSnapRuntimeArgs,
  | 'visible'
  | 'spec'
  | 'persistedSnap'
  | 'resolvedSnapPersistenceKey'
  | 'ensurePersistedSnap'
  | 'screenHeight'
  | 'sheetY'
  | 'requestShellSnap'
  | 'requestedShellSnapRef'
  | 'currentSnapRef'
> & {
  hasRequestedSnap: boolean;
};

export const useOverlaySheetDefaultSnapRuntime = ({
  visible,
  spec,
  persistedSnap,
  resolvedSnapPersistenceKey,
  ensurePersistedSnap,
  screenHeight,
  sheetY,
  requestShellSnap,
  requestedShellSnapRef,
  currentSnapRef,
  hasRequestedSnap,
}: UseOverlaySheetDefaultSnapRuntimeArgs): void => {
  React.useEffect(() => {
    if (!visible || !spec || hasRequestedSnap) {
      return;
    }

    const sheetYValue = sheetY.value;
    const isSheetOffscreen =
      Number.isFinite(screenHeight) &&
      screenHeight > 0 &&
      Number.isFinite(sheetYValue) &&
      sheetYValue >= screenHeight - 0.5;
    if (currentSnapRef.current !== 'hidden' && !isSheetOffscreen) {
      if (requestedShellSnapRef.current !== null) {
        requestShellSnap(null);
      }
      return;
    }

    if (isSheetOffscreen) {
      currentSnapRef.current = 'hidden';
    }

    const desiredSnap = persistedSnap ?? spec.initialSnapPoint ?? 'middle';
    if (resolvedSnapPersistenceKey && !persistedSnap) {
      ensurePersistedSnap(desiredSnap);
    }
    if (requestedShellSnapRef.current?.snap !== desiredSnap) {
      requestShellSnap({ snap: desiredSnap });
    }
  }, [
    currentSnapRef,
    ensurePersistedSnap,
    persistedSnap,
    requestShellSnap,
    requestedShellSnapRef,
    resolvedSnapPersistenceKey,
    screenHeight,
    sheetY,
    spec,
    visible,
    hasRequestedSnap,
  ]);
};
