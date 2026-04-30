import React from 'react';

import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { BottomSheetProgrammaticRuntimeModel } from './useBottomSheetRuntime';
import type { OverlaySheetSnap } from './types';
import { useOverlaySheetSnapStateRuntime } from './useOverlaySheetSnapStateRuntime';
import type { RestaurantRouteSheetStateRuntime } from './useRestaurantRouteSheetStateRuntime';

export type RestaurantRouteSheetSnapCallbacksRuntime = {
  handleSheetSnapStart: (
    snap: OverlaySheetSnap,
    meta?: {
      source: 'gesture' | 'programmatic';
    }
  ) => void;
  handleSheetSnapChange: (
    snap: OverlaySheetSnap,
    meta?: {
      source: 'gesture' | 'programmatic';
    }
  ) => void;
  handleSnapSettleComplete: (settleToken: number) => void;
};

type UseRestaurantRouteSheetSnapCallbacksRuntimeArgs = {
  sheetStateRuntime: RestaurantRouteSheetStateRuntime;
};

export const useRestaurantRouteSheetSnapCallbacksRuntime = ({
  sheetStateRuntime,
}: UseRestaurantRouteSheetSnapCallbacksRuntimeArgs): RestaurantRouteSheetSnapCallbacksRuntime => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const routeSceneMotionRuntime = routeSceneRuntime.routeSceneMotionRuntime;
  const {
    activeShellSpec,
    visible,
    resolvedShellIdentityKey,
    activeSemanticOverlayKey,
    rootOverlayKey,
    overlayRouteStackLength,
    resolvedRuntimeModel,
    restaurantRouteSource,
  } = sheetStateRuntime;
  const requestedShellSnapRef = React.useRef(activeShellSpec.shellSnapRequest ?? null);
  const currentSnapRef = React.useRef<OverlaySheetSnap>('hidden');
  const {
    persistedSnap,
    resolvedSnapPersistenceKey,
    ensurePersistedSnap,
    handleSnapChange: handleSnapChangeBase,
    handleSnapStart: handleSnapStartBase,
  } = useOverlaySheetSnapStateRuntime({
    spec: activeShellSpec,
    resolvedShellIdentityKey,
    activeOverlayKey: activeSemanticOverlayKey,
    rootOverlay: rootOverlayKey,
    overlayRouteStackLength,
    routeSheetSnapSessionAuthority: routeSceneRuntime.routeSheetSnapSessionAuthority,
    routeSheetSnapSessionActions: routeSceneRuntime.routeSheetSnapSessionActions,
  });
  const requestShellSnap = React.useCallback(
    (request: typeof requestedShellSnapRef.current) => {
      requestedShellSnapRef.current = request;
      if (!request) {
        if (resolvedRuntimeModel.snapController.motionCommand.value?.settleToken != null) {
          return;
        }
        routeSceneMotionRuntime.requestLocalSheetMotion('restaurant', null, {
          localMotionKey: restaurantRouteSource,
        });
        return;
      }
      routeSceneMotionRuntime.requestLocalSheetMotion('restaurant', request, {
        localMotionKey: restaurantRouteSource,
      });
    },
    [
      resolvedRuntimeModel.snapController.motionCommand,
      restaurantRouteSource,
      routeSceneMotionRuntime,
    ]
  );

  React.useEffect(() => {
    requestShellSnap(activeShellSpec.shellSnapRequest ?? null);
  }, [activeShellSpec.shellSnapRequest, requestShellSnap]);

  React.useEffect(() => {
    if (!visible || !activeShellSpec) {
      return;
    }

    if (currentSnapRef.current !== 'hidden') {
      if (requestedShellSnapRef.current !== null) {
        requestShellSnap(null);
      }
      return;
    }

    const desiredSnap = persistedSnap ?? activeShellSpec.initialSnapPoint ?? 'middle';
    if (resolvedSnapPersistenceKey && !persistedSnap) {
      ensurePersistedSnap(desiredSnap);
    }
    if (requestedShellSnapRef.current?.snap !== desiredSnap) {
      if (resolvedRuntimeModel.snapController.motionCommand.value?.settleToken != null) {
        return;
      }
      requestShellSnap({ snap: desiredSnap });
    }
  }, [
    activeShellSpec,
    ensurePersistedSnap,
    persistedSnap,
    requestShellSnap,
    resolvedRuntimeModel.snapController.motionCommand,
    resolvedSnapPersistenceKey,
    visible,
  ]);

  const handleProgrammaticSnapEvent =
    'handleProgrammaticSnapEvent' in resolvedRuntimeModel.snapController
      ? (
          resolvedRuntimeModel.snapController as BottomSheetProgrammaticRuntimeModel['snapController']
        ).handleProgrammaticSnapEvent
      : undefined;

  const handleSheetSnapStart = React.useCallback(
    (
      snap: OverlaySheetSnap,
      meta?: {
        source: 'gesture' | 'programmatic';
      }
    ) => {
      handleSnapStartBase(snap, meta);
    },
    [handleSnapStartBase]
  );

  const handleSheetSnapChange = React.useCallback(
    (
      snap: OverlaySheetSnap,
      meta?: {
        source: 'gesture' | 'programmatic';
      }
    ) => {
      currentSnapRef.current = snap;
      handleProgrammaticSnapEvent?.(snap, meta?.source ?? 'gesture');
      handleSnapChangeBase(snap, meta);
      if (requestedShellSnapRef.current && snap === requestedShellSnapRef.current.snap) {
        requestShellSnap(null);
      }
    },
    [handleProgrammaticSnapEvent, handleSnapChangeBase, requestShellSnap]
  );
  const handleSnapSettleComplete = React.useCallback(
    (settleToken: number) => {
      routeSceneMotionRuntime.completeFromSheetSettle(settleToken);
    },
    [routeSceneMotionRuntime]
  );

  return React.useMemo(
    () => ({
      handleSheetSnapStart,
      handleSheetSnapChange,
      handleSnapSettleComplete,
    }),
    [handleSheetSnapChange, handleSheetSnapStart, handleSnapSettleComplete]
  );
};
