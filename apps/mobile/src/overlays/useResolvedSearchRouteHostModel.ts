import React from 'react';

import { logger } from '../utils';
import type { ResolvedSearchRouteHostModel } from './searchResolvedRouteHostModelContract';
import {
  useSearchRouteMountedSceneKeys,
  useSearchRouteMountedSceneMounted,
  useSearchRouteMountedSceneShellState,
} from './searchRouteMountedSceneRegistryStore';
import { useSearchRouteOverlayCommandState } from './useSearchRouteOverlayCommandState';
import { useSearchRouteFrozenOverlayRenderModel } from './useSearchRouteFrozenOverlayRenderModel';
import { useSearchRouteOverlayPublishedState } from './useSearchRouteOverlayPublishedState';
import { useSearchRouteOverlayRouteState } from './useSearchRouteOverlayRouteState';
import { useSearchRouteOverlaySheetKeys } from './useSearchRouteOverlaySheetKeys';
import { useSearchRouteOverlayTransitionController } from './useSearchRouteOverlayTransitionController';
import {
  getActiveSearchNavSwitchPerfProbe,
  getActiveSearchNavSwitchProbeAgeMs,
} from '../screens/Search/runtime/shared/search-nav-switch-perf-probe';

const SEARCH_ROUTE_SHEET_SHELL_IDENTITY_KEY = 'search-route-sheet';

const diffSnapshots = (
  previousSnapshot: Record<string, unknown>,
  nextSnapshot: Record<string, unknown>
) =>
  Object.assign(
    {},
    ...Object.keys({ ...previousSnapshot, ...nextSnapshot }).flatMap((key) => {
      const previousValue = previousSnapshot[key];
      const nextValue = nextSnapshot[key];
      return JSON.stringify(previousValue) === JSON.stringify(nextValue)
        ? []
        : [{ [key]: { previous: previousValue, next: nextValue } }];
    })
  );

export const useResolvedSearchRouteHostModel = (): ResolvedSearchRouteHostModel | null => {
  const { publishedVisualState, searchPanelInteractionRef, renderPolicy } =
    useSearchRouteOverlayPublishedState();
  const commandState = useSearchRouteOverlayCommandState();
  const transitionController = useSearchRouteOverlayTransitionController();
  const routeState = useSearchRouteOverlayRouteState();
  const overlaySheetKeys = useSearchRouteOverlaySheetKeys({
    shouldShowSearchPanel: renderPolicy.shouldShowSearchPanel,
    shouldShowDockedPollsPanel: renderPolicy.shouldShowDockedPollsPanel,
    isDockedPollsDismissed: commandState.isDockedPollsDismissed,
    activeOverlayRouteKey: routeState.activeOverlayRouteKey,
    rootOverlayKey: routeState.rootOverlayKey,
    showSaveListOverlay: commandState.saveSheetState.visible,
  });
  const isBookmarksActive = overlaySheetKeys.overlaySheetKey === 'bookmarks';
  const isProfileActive = overlaySheetKeys.overlaySheetKey === 'profile';
  const activeSceneKey = overlaySheetKeys.overlaySheetKey;
  const registeredSceneKeys = useSearchRouteMountedSceneKeys();
  const activeSceneShellState = useSearchRouteMountedSceneShellState(activeSceneKey);
  const bookmarksMounted = useSearchRouteMountedSceneMounted('bookmarks');
  const profileMounted = useSearchRouteMountedSceneMounted('profile');
  const shouldSuppressOverlaySheetForForegroundEditing =
    renderPolicy.shouldSuppressSearchAndTabSheetsForForegroundEditing &&
    (activeSceneKey === 'search' ||
      activeSceneKey === 'polls' ||
      activeSceneKey === 'bookmarks' ||
      activeSceneKey === 'profile');
  const shouldSuppressTabOverlaySheetForSuggestions =
    renderPolicy.shouldSuppressTabSheetsForSuggestions &&
    (activeSceneKey === 'polls' || activeSceneKey === 'bookmarks' || activeSceneKey === 'profile');
  const shouldFreezeOverlaySheetForRender =
    renderPolicy.shouldFreezeOverlaySheetForCloseHandoff ||
    (activeSceneKey === 'polls' && transitionController.isOverlaySwitchInFlight());
  const overlaySheetVisible =
    !shouldSuppressOverlaySheetForForegroundEditing &&
    !shouldSuppressTabOverlaySheetForSuggestions &&
    overlaySheetKeys.resolvedOverlaySheetVisible;
  const activeShellSpec = React.useMemo(
    () =>
      activeSceneShellState.shellSpec
        ? {
            ...activeSceneShellState.shellSpec,
            shellIdentityKey: SEARCH_ROUTE_SHEET_SHELL_IDENTITY_KEY,
            sceneIdentityKey:
              activeSceneShellState.shellSpec.sceneIdentityKey ??
              activeSceneShellState.shellSpec.overlayKey,
          }
        : null,
    [activeSceneShellState.shellSpec]
  );
  const hostRenderInput = React.useMemo(
    () => ({
      activeSceneKey,
      activeShellSpec,
      sceneKeys: registeredSceneKeys,
      overlaySheetVisible,
      overlaySheetApplyNavBarCutout: overlaySheetKeys.overlaySheetApplyNavBarCutout,
      searchInteractionRef: activeSceneKey === 'search' ? searchPanelInteractionRef : null,
    }),
    [
      activeSceneKey,
      activeShellSpec,
      overlaySheetKeys.overlaySheetApplyNavBarCutout,
      overlaySheetVisible,
      registeredSceneKeys,
      searchPanelInteractionRef,
    ]
  );

  const overlayDiagRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const nextSnapshot = JSON.stringify({
      rootOverlayKey: routeState.rootOverlayKey,
      activeOverlayRouteKey: routeState.activeOverlayRouteKey,
      renderPolicy,
      activeSceneKey,
      registeredSceneKeys,
      resolvedOverlaySheetVisible: overlaySheetKeys.resolvedOverlaySheetVisible,
      isPersistentPollLane: overlaySheetKeys.isPersistentPollLane,
      activeSceneSemanticOverlayKey: activeShellSpec?.overlayKey ?? null,
      activeSceneIdentityKey: activeShellSpec?.sceneIdentityKey ?? null,
      activeSceneShellIdentityKey: activeShellSpec?.shellIdentityKey ?? null,
      activeSceneInitialSnapPoint: activeShellSpec?.initialSnapPoint ?? null,
      activeSceneSnapPoints: activeShellSpec?.snapPoints
        ? {
            expanded: activeShellSpec.snapPoints.expanded,
            middle: activeShellSpec.snapPoints.middle,
            collapsed: activeShellSpec.snapPoints.collapsed,
            hidden: activeShellSpec.snapPoints.hidden,
          }
        : null,
      overlaySheetVisible,
      overlaySheetApplyNavBarCutout: overlaySheetKeys.overlaySheetApplyNavBarCutout,
      visibleSceneKey: activeSceneKey,
    });

    if (overlayDiagRef.current === nextSnapshot) {
      return;
    }

    overlayDiagRef.current = nextSnapshot;
    logger.debug('[SEARCH-OVERLAY-HOST-DIAG] resolvedHostModel', JSON.parse(nextSnapshot));
  }, [
    activeSceneKey,
    activeShellSpec,
    overlaySheetKeys,
    overlaySheetVisible,
    renderPolicy,
    registeredSceneKeys,
    routeState.activeOverlayRouteKey,
    routeState.rootOverlayKey,
  ]);

  const hostAttributionSnapshot = React.useMemo(
    () => ({
      rootOverlayKey: routeState.rootOverlayKey,
      activeOverlayRouteKey: routeState.activeOverlayRouteKey,
      activeSceneKey,
      activeSceneSemanticOverlayKey: activeShellSpec?.overlayKey ?? null,
      activeSceneIdentityKey: activeShellSpec?.sceneIdentityKey ?? null,
      activeSceneShellIdentityKey: activeShellSpec?.shellIdentityKey ?? null,
      activeSceneInitialSnapPoint: activeShellSpec?.initialSnapPoint ?? null,
      bookmarksMounted,
      profileMounted,
      bookmarksVisible: isBookmarksActive,
      profileVisible: isProfileActive,
      overlaySheetVisible,
    }),
    [
      activeSceneKey,
      activeShellSpec,
      isBookmarksActive,
      isProfileActive,
      overlaySheetVisible,
      bookmarksMounted,
      profileMounted,
      routeState.activeOverlayRouteKey,
      routeState.rootOverlayKey,
    ]
  );
  const previousHostAttributionRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (!activeProbe) {
      previousHostAttributionRef.current = null;
      return;
    }

    const nextSnapshotKey = JSON.stringify(hostAttributionSnapshot);
    const previousSnapshotKey = previousHostAttributionRef.current;
    if (previousSnapshotKey && previousSnapshotKey !== nextSnapshotKey) {
      const previousSnapshot = JSON.parse(previousSnapshotKey) as Record<string, unknown>;
      const nextSnapshot = hostAttributionSnapshot as Record<string, unknown>;
      const changes = diffSnapshots(previousSnapshot, nextSnapshot);
      const attribution: string[] = [];

      if (previousSnapshot.bookmarksMounted !== true && nextSnapshot.bookmarksMounted === true) {
        attribution.push('scene_mount:bookmarks');
      }
      if (previousSnapshot.profileMounted !== true && nextSnapshot.profileMounted === true) {
        attribution.push('scene_mount:profile');
      }
      if (previousSnapshot.activeSceneKey !== nextSnapshot.activeSceneKey) {
        attribution.push(`active_scene:${String(nextSnapshot.activeSceneKey)}`);
      }
      if (
        previousSnapshot.activeSceneSemanticOverlayKey !==
        nextSnapshot.activeSceneSemanticOverlayKey
      ) {
        attribution.push(`semantic_overlay:${String(nextSnapshot.activeSceneSemanticOverlayKey)}`);
      }
      if (previousSnapshot.activeSceneIdentityKey !== nextSnapshot.activeSceneIdentityKey) {
        attribution.push(`scene_identity:${String(nextSnapshot.activeSceneIdentityKey)}`);
      }
      if (
        previousSnapshot.activeSceneInitialSnapPoint !== nextSnapshot.activeSceneInitialSnapPoint
      ) {
        attribution.push('snap_profile_change');
      }

      if (attribution.length > 0) {
        logger.debug('[NAV-SWITCH-ATTRIBUTION] hostDelta', {
          seq: activeProbe.seq,
          from: activeProbe.from,
          to: activeProbe.to,
          ageMs: getActiveSearchNavSwitchProbeAgeMs(),
          attribution,
          changes,
        });
      }
    }

    previousHostAttributionRef.current = nextSnapshotKey;
  }, [hostAttributionSnapshot]);

  return useSearchRouteFrozenOverlayRenderModel({
    publishedVisualState,
    searchHeaderActionResetToken: commandState.searchHeaderActionResetToken,
    shouldFreezeOverlaySheetForRender,
    shouldFreezeOverlaySheetForCloseHandoff: renderPolicy.shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne: renderPolicy.shouldFreezeOverlayHeaderActionForRunOne,
    hostRenderInput,
  });
};
