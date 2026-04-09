import React from 'react';

import { TAB_OVERLAY_SNAP_KEY, useOverlaySheetPositionStore } from './useOverlaySheetPositionStore';
import type {
  OverlaySheetResolvedSnapRuntime,
  OverlaySheetResolvedSnapRuntimeArgs,
} from './overlaySheetShellRuntimeContract';
import type { OverlaySheetSnap } from './types';

export const useOverlaySheetResolvedSnapRuntime = ({
  spec,
  resolvedOverlayKey,
  rootOverlay,
  overlayRouteStackLength,
}: OverlaySheetResolvedSnapRuntimeArgs): OverlaySheetResolvedSnapRuntime => {
  const recordUserSnap = useOverlaySheetPositionStore((state) => state.recordUserSnap);
  const recordPersistentSnap = useOverlaySheetPositionStore((state) => state.recordPersistentSnap);
  const resolvedSnapPersistenceKey = React.useMemo(() => {
    if (!spec) {
      return null;
    }

    if (spec.snapPersistenceKey === null) {
      return null;
    }

    if (typeof spec.snapPersistenceKey === 'string') {
      return spec.snapPersistenceKey;
    }

    const isTabOverlay =
      resolvedOverlayKey === 'polls' ||
      resolvedOverlayKey === 'pollCreation' ||
      resolvedOverlayKey === 'bookmarks' ||
      resolvedOverlayKey === 'profile';
    if (isTabOverlay) {
      return TAB_OVERLAY_SNAP_KEY;
    }

    if (overlayRouteStackLength > 1) {
      return `overlay-stack:${rootOverlay}`;
    }

    return `overlay:${resolvedOverlayKey}`;
  }, [overlayRouteStackLength, resolvedOverlayKey, rootOverlay, spec?.snapPersistenceKey]);

  const persistedSnap = useOverlaySheetPositionStore((state) =>
    resolvedSnapPersistenceKey ? state.persistentSnaps[resolvedSnapPersistenceKey] ?? null : null
  );

  const ensurePersistedSnap = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (!resolvedSnapPersistenceKey) {
        return;
      }
      recordPersistentSnap({ key: resolvedSnapPersistenceKey, snap });
    },
    [recordPersistentSnap, resolvedSnapPersistenceKey]
  );

  const recordGestureSnap = React.useCallback(
    (snap: OverlaySheetSnap) => {
      recordUserSnap({
        rootOverlay,
        activeOverlayKey: resolvedOverlayKey,
        snap,
      });
    },
    [recordUserSnap, resolvedOverlayKey, rootOverlay]
  );

  const handleSnapChangeBase = React.useCallback<
    OverlaySheetResolvedSnapRuntime['handleSnapChange']
  >(
    (snap, meta) => {
      spec?.onSnapChange?.(snap, meta);
      ensurePersistedSnap(snap);
      if (meta?.source === 'gesture') {
        recordGestureSnap(snap);
      }
    },
    [ensurePersistedSnap, recordGestureSnap, spec]
  );

  const handleSnapStartBase = React.useCallback<OverlaySheetResolvedSnapRuntime['handleSnapStart']>(
    (snap, meta) => {
      spec?.onSnapStart?.(snap, meta);
      ensurePersistedSnap(snap);
      if (meta?.source === 'gesture') {
        recordGestureSnap(snap);
      }
    },
    [ensurePersistedSnap, recordGestureSnap, spec]
  );

  return React.useMemo(
    () => ({
      persistedSnap,
      resolvedSnapPersistenceKey,
      ensurePersistedSnap,
      handleSnapChange: handleSnapChangeBase,
      handleSnapStart: handleSnapStartBase,
    }),
    [
      ensurePersistedSnap,
      handleSnapChangeBase,
      handleSnapStartBase,
      persistedSnap,
      resolvedSnapPersistenceKey,
    ]
  );
};
