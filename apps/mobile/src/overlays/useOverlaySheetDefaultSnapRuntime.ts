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
>;

export const useOverlaySheetDefaultSnapRuntime = ({
  visible,
  spec,
  persistedSnap,
  resolvedSnapPersistenceKey,
  ensurePersistedSnap,
  requestShellSnap,
  requestedShellSnapRef,
  currentSnapRef,
}: UseOverlaySheetDefaultSnapRuntimeArgs): void => {
  React.useEffect(() => {
    if (!visible || !spec || requestedShellSnapRef.current !== null) {
      return;
    }

    if (currentSnapRef.current !== 'hidden') {
      if (requestedShellSnapRef.current !== null) {
        requestShellSnap(null);
      }
      return;
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
    spec,
    visible,
  ]);
};
