import React from 'react';

import { ROUTE_SHARED_SNAP_PERSISTENCE_KEY } from '../navigation/runtime/app-route-sheet-snap-session-runtime';
import type {
  OverlaySheetSnapStateRuntime,
  OverlaySheetSnapStateRuntimeArgs,
} from './overlaySheetShellRuntimeContract';
import type { OverlaySheetSnap } from './types';

export const useOverlaySheetSnapStateRuntime = ({
  spec,
  resolvedShellIdentityKey,
  activeOverlayKey,
  rootOverlay,
  overlayRouteStackLength,
  routeSheetSnapSessionAuthority,
  routeSheetSnapSessionActions,
}: OverlaySheetSnapStateRuntimeArgs): OverlaySheetSnapStateRuntime => {
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
      activeOverlayKey === 'polls' ||
      activeOverlayKey === 'pollCreation' ||
      activeOverlayKey === 'bookmarks' ||
      activeOverlayKey === 'profile';
    if (isTabOverlay) {
      return ROUTE_SHARED_SNAP_PERSISTENCE_KEY;
    }

    if (overlayRouteStackLength > 1) {
      return `overlay-stack:${rootOverlay}`;
    }

    return `overlay:${resolvedShellIdentityKey}`;
  }, [
    activeOverlayKey,
    overlayRouteStackLength,
    resolvedShellIdentityKey,
    rootOverlay,
    spec?.snapPersistenceKey,
  ]);

  const persistedSnap = React.useSyncExternalStore(
    routeSheetSnapSessionAuthority.subscribe,
    () =>
      resolvedSnapPersistenceKey
        ? routeSheetSnapSessionActions.getPersistentSnap(resolvedSnapPersistenceKey)
        : null,
    () =>
      resolvedSnapPersistenceKey
        ? routeSheetSnapSessionActions.getPersistentSnap(resolvedSnapPersistenceKey)
        : null
  );

  const ensurePersistedSnap = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (!resolvedSnapPersistenceKey) {
        return;
      }
      routeSheetSnapSessionActions.recordPersistentSnap({ key: resolvedSnapPersistenceKey, snap });
    },
    [resolvedSnapPersistenceKey, routeSheetSnapSessionActions]
  );

  const recordGestureSnap = React.useCallback(
    (snap: OverlaySheetSnap) => {
      routeSheetSnapSessionActions.recordUserSnap({
        rootOverlay,
        activeOverlayKey,
        snap,
      });
    },
    [activeOverlayKey, rootOverlay, routeSheetSnapSessionActions]
  );

  const handleSnapChangeBase = React.useCallback<OverlaySheetSnapStateRuntime['handleSnapChange']>(
    (snap, meta) => {
      spec?.onSnapChange?.(snap, meta);
      ensurePersistedSnap(snap);
      if (meta?.source === 'gesture') {
        recordGestureSnap(snap);
      }
    },
    [ensurePersistedSnap, recordGestureSnap, spec]
  );

  const handleSnapStartBase = React.useCallback<OverlaySheetSnapStateRuntime['handleSnapStart']>(
    (snap, meta) => {
      spec?.onSnapStart?.(snap, meta);
    },
    [spec]
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
