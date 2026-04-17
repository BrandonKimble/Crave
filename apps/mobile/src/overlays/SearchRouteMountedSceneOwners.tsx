import React from 'react';
import { InteractionManager, unstable_batchedUpdates } from 'react-native';

import { useOverlayStore, type OverlayRouteEntry } from '../store/overlayStore';
import { useSearchRouteOverlayCommandStore } from './searchRouteOverlayCommandStore';
import { useSearchRouteOverlaySheetKeys } from './useSearchRouteOverlaySheetKeys';
import { useSearchRouteOverlayTransitionController } from './useSearchRouteOverlayTransitionController';
import { useSearchRouteOverlayRuntimeStore } from './searchRouteOverlayRuntimeStore';
import { useSearchRouteBookmarksSceneDefinition } from './useSearchRouteBookmarksPanelSpec';
import { useSearchRoutePollCreationPanelSpec } from './useSearchRoutePollCreationPanelSpec';
import { useSearchRouteProfileSceneDefinition } from './useSearchRouteProfilePanelSpec';
import { useSearchRouteSaveListPanelSpec } from './useSearchRouteSaveListPanelSpec';
import { useSearchRouteMountedSceneRegistryStore } from './searchRouteMountedSceneRegistryStore';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchResolvedRouteHostModelContract';
import { useSearchRouteOverlayPublishedState } from './useSearchRouteOverlayPublishedState';
import { useSearchRouteOverlayCommandActions } from './useSearchRouteOverlayCommandActions';
import { useSearchRouteOverlayCommandState } from './useSearchRouteOverlayCommandState';
import { useSearchRouteOverlayRouteState } from './useSearchRouteOverlayRouteState';
import { useSearchRoutePollsSceneDefinition } from './useSearchRoutePollsPanelSpec';
import {
  getActiveSearchNavSwitchPerfProbe,
  getActiveSearchNavSwitchProbeAgeMs,
} from '../screens/Search/runtime/shared/search-nav-switch-perf-probe';
import { logger } from '../utils';
import type { SearchRouteSceneDefinition } from './searchOverlayRouteHostContract';

const useSceneDefinitionDiag = (
  scene: string,
  sceneDefinition: SearchRouteSceneDefinition | null | undefined
) => {
  const previousRef = React.useRef<SearchRouteSceneDefinition | null>(null);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    const previous = previousRef.current;
    if (activeProbe && previous !== sceneDefinition) {
      logger.debug('[NAV-SWITCH-SCENE-DEFINITION]', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        ageMs: getActiveSearchNavSwitchProbeAgeMs(),
        scene,
        changed: true,
        shellSpecChanged: previous?.shellSpec !== sceneDefinition?.shellSpec,
        sceneSurfaceChanged: previous?.sceneSurface !== sceneDefinition?.sceneSurface,
        shellSnapRequest: sceneDefinition?.shellSnapRequest?.snap ?? null,
      });
    }
    previousRef.current = sceneDefinition ?? null;
  }, [scene, sceneDefinition]);
};

const isPollCreationRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'pollCreation'> => route.key === 'pollCreation';

const useSceneOwnerOverlaySheetKeys = () => {
  const shouldShowSearchPanel = useSearchRouteOverlayRuntimeStore(
    (state) => state.renderPolicy.shouldShowSearchPanel
  );
  const shouldShowDockedPollsPanel = useSearchRouteOverlayRuntimeStore(
    (state) => state.renderPolicy.shouldShowDockedPollsPanel
  );
  const isDockedPollsDismissed = useSearchRouteOverlayCommandStore(
    (state) => state.isDockedPollsDismissed
  );
  const showSaveListOverlay = useSearchRouteOverlayCommandStore(
    (state) => state.saveSheetState.visible
  );
  const rootOverlayKey = useOverlayStore(
    (state) => state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key
  );
  const activeOverlayRouteKey = useOverlayStore((state) => state.activeOverlayRoute.key);

  return useSearchRouteOverlaySheetKeys({
    shouldShowSearchPanel,
    shouldShowDockedPollsPanel,
    isDockedPollsDismissed,
    rootOverlayKey,
    activeOverlayRouteKey,
    showSaveListOverlay,
  });
};

const useTabSceneLayoutRuntime = (visible: boolean) => {
  const visualState =
    useSearchRouteOverlayRuntimeStore((state) => state.visualState) ??
    EMPTY_SEARCH_ROUTE_VISUAL_STATE;
  const snapPoints = React.useMemo(
    () => ({
      expanded: visualState.snapPoints.expanded,
      middle: visualState.snapPoints.middle,
      collapsed: visualState.snapPoints.collapsed,
      hidden: visualState.snapPoints.hidden,
    }),
    [
      visualState.snapPoints.collapsed,
      visualState.snapPoints.expanded,
      visualState.snapPoints.hidden,
      visualState.snapPoints.middle,
    ]
  );

  return React.useMemo(
    () => ({
      visible,
      navBarTop: visualState.navBarTopForSnaps,
      searchBarTop: visualState.searchBarTop,
      snapPoints,
    }),
    [snapPoints, visible, visualState.navBarTopForSnaps, visualState.searchBarTop]
  );
};

const useSceneDefinitionPublisher = (
  scene: 'search' | 'polls' | 'bookmarks' | 'profile' | 'pollCreation' | 'saveList',
  sceneDefinition: SearchRouteSceneDefinition | null | undefined,
  options?: {
    clearOnUnmount?: boolean;
  }
) => {
  const setSceneDefinition = useSearchRouteMountedSceneRegistryStore(
    (state) => state.setSceneDefinition
  );
  const clearSceneDefinition = useSearchRouteMountedSceneRegistryStore(
    (state) => state.clearSceneDefinition
  );

  useSceneDefinitionDiag(scene, sceneDefinition);

  React.useEffect(() => {
    setSceneDefinition(scene, sceneDefinition ?? null);
  }, [scene, sceneDefinition, setSceneDefinition]);

  React.useEffect(
    () => () => {
      if (options?.clearOnUnmount === false) {
        return;
      }
      clearSceneDefinition(scene);
    },
    [clearSceneDefinition, options?.clearOnUnmount, scene]
  );
};

const BookmarksSceneOwner = React.memo(({ mounted }: { mounted: boolean }) => {
  const rootOverlayKey = useOverlayStore(
    (state) => state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key
  );
  const visible = rootOverlayKey === 'bookmarks';
  const { navBarTop, searchBarTop, snapPoints } = useTabSceneLayoutRuntime(visible);
  const tabOverlaySnapRequest = useSearchRouteOverlayCommandStore(
    (state) => state.tabOverlaySnapRequest
  );
  const setBookmarksSheetSnap = useSearchRouteOverlayCommandStore(
    (state) => state.setBookmarksSheetSnap
  );
  const setTabOverlaySnapRequest = useSearchRouteOverlayCommandStore(
    (state) => state.setTabOverlaySnapRequest
  );
  const transitionController = useSearchRouteOverlayTransitionController();
  const sceneDefinition = useSearchRouteBookmarksSceneDefinition({
    mounted,
    visible,
    rootOverlayKey,
    navBarTop,
    searchBarTop,
    snapPoints,
    tabOverlaySnapRequest,
    setBookmarksSheetSnap,
    setTabOverlaySnapRequest,
    transitionController,
  });

  useSceneDefinitionPublisher('bookmarks', sceneDefinition);
  return null;
});

const ProfileSceneOwner = React.memo(({ mounted }: { mounted: boolean }) => {
  const rootOverlayKey = useOverlayStore(
    (state) => state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key
  );
  const visible = rootOverlayKey === 'profile';
  const { navBarTop, searchBarTop, snapPoints } = useTabSceneLayoutRuntime(visible);
  const tabOverlaySnapRequest = useSearchRouteOverlayCommandStore(
    (state) => state.tabOverlaySnapRequest
  );
  const setProfileSheetSnap = useSearchRouteOverlayCommandStore(
    (state) => state.setProfileSheetSnap
  );
  const setTabOverlaySnapRequest = useSearchRouteOverlayCommandStore(
    (state) => state.setTabOverlaySnapRequest
  );
  const transitionController = useSearchRouteOverlayTransitionController();
  const sceneDefinition = useSearchRouteProfileSceneDefinition({
    mounted,
    visible,
    rootOverlayKey,
    navBarTop,
    searchBarTop,
    snapPoints,
    tabOverlaySnapRequest,
    setProfileSheetSnap,
    setTabOverlaySnapRequest,
    transitionController,
  });

  useSceneDefinitionPublisher('profile', sceneDefinition);
  return null;
});

const PollCreationSceneOwner = React.memo(() => {
  const publishedVisualState = useSearchRouteOverlayRuntimeStore((state) => state.visualState);
  const activePollCreationRoute = useOverlayStore((state) =>
    isPollCreationRouteEntry(state.activeOverlayRoute) ? state.activeOverlayRoute : null
  );
  const pollCreationSnapRequest = useSearchRouteOverlayCommandStore(
    (state) => state.pollCreationSnapRequest
  );
  const setPollCreationSnapRequest = useSearchRouteOverlayCommandStore(
    (state) => state.setPollCreationSnapRequest
  );
  const setPollsSheetSnap = useSearchRouteOverlayCommandStore((state) => state.setPollsSheetSnap);
  const sceneDefinition = useSearchRoutePollCreationPanelSpec({
    publishedVisualState,
    pollCreationMarketKey: activePollCreationRoute?.params?.marketKey ?? null,
    pollCreationMarketName: activePollCreationRoute?.params?.marketName ?? null,
    pollCreationBounds: activePollCreationRoute?.params?.bounds ?? null,
    shouldShowPollCreationPanel: activePollCreationRoute != null,
    pollCreationSnapRequest,
    setPollCreationSnapRequest,
    setPollsSheetSnap,
  });

  useSceneDefinitionPublisher('pollCreation', sceneDefinition);
  return null;
});

const SearchSceneOwner = React.memo(() => {
  const searchSceneDefinition = useSearchRouteOverlayRuntimeStore(
    (state) => state.searchSceneDefinition
  );

  useSceneDefinitionPublisher('search', searchSceneDefinition);
  return null;
});

const PollsSceneOwner = React.memo(() => {
  const { publishedVisualState, dockedPollsPanelInputs } = useSearchRouteOverlayPublishedState();
  const commandState = useSearchRouteOverlayCommandState();
  const commandActions = useSearchRouteOverlayCommandActions();
  const transitionController = useSearchRouteOverlayTransitionController();
  const routeState = useSearchRouteOverlayRouteState();
  const overlaySheetKeys = useSceneOwnerOverlaySheetKeys();
  const sceneDefinition = useSearchRoutePollsSceneDefinition({
    publishedVisualState,
    rootOverlayKey: routeState.rootOverlayKey,
    pollOverlayParams: routeState.pollOverlayParams,
    commandState,
    commandActions,
    transitionController,
    overlaySheetKeys,
    searchRouteDockedPollsPanelInputs: dockedPollsPanelInputs,
  });

  useSceneDefinitionPublisher('polls', sceneDefinition);
  return null;
});

const SaveListSceneOwner = React.memo(() => {
  const publishedVisualState = useSearchRouteOverlayRuntimeStore((state) => state.visualState);
  const saveSheetState = useSearchRouteOverlayCommandStore((state) => state.saveSheetState);
  const setSaveSheetState = useSearchRouteOverlayCommandStore((state) => state.setSaveSheetState);
  const setSaveSheetSnap = useSearchRouteOverlayCommandStore((state) => state.setSaveSheetSnap);
  const sceneDefinition = useSearchRouteSaveListPanelSpec({
    publishedVisualState,
    saveSheetState,
    setSaveSheetState,
    setSaveSheetSnap,
  });

  useSceneDefinitionPublisher('saveList', sceneDefinition);
  return null;
});

const SearchRouteMountedSceneOwners = () => {
  const overlaySheetKeys = useSceneOwnerOverlaySheetKeys();
  const publishedVisualState = useSearchRouteOverlayRuntimeStore((state) => state.visualState);
  const transitionController = useSearchRouteOverlayTransitionController();
  const isBookmarksActive = overlaySheetKeys.overlaySheetKey === 'bookmarks';
  const isProfileActive = overlaySheetKeys.overlaySheetKey === 'profile';
  const isSaveListActive = overlaySheetKeys.overlaySheetKey === 'saveList';
  const [mountedScenes, setMountedScenes] = React.useState({
    bookmarks: isBookmarksActive,
    profile: isProfileActive,
  });
  const [inactiveTabsPrewarmed, setInactiveTabsPrewarmed] = React.useState(false);
  const hasScheduledScenePrewarmRef = React.useRef(false);

  React.useEffect(() => {
    if (!isBookmarksActive && !isProfileActive) {
      return;
    }

    setMountedScenes((previous) => {
      const next = {
        bookmarks: previous.bookmarks || isBookmarksActive,
        profile: previous.profile || isProfileActive,
      };
      return next.bookmarks === previous.bookmarks && next.profile === previous.profile
        ? previous
        : next;
    });
  }, [isBookmarksActive, isProfileActive]);

  React.useEffect(() => {
    if (
      inactiveTabsPrewarmed ||
      hasScheduledScenePrewarmRef.current ||
      !publishedVisualState ||
      transitionController.isOverlaySwitchInFlight()
    ) {
      return;
    }

    hasScheduledScenePrewarmRef.current = true;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }
      unstable_batchedUpdates(() => {
        setMountedScenes((previous) =>
          previous.bookmarks && previous.profile
            ? previous
            : {
                bookmarks: true,
                profile: true,
              }
        );
        setInactiveTabsPrewarmed(true);
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [inactiveTabsPrewarmed, publishedVisualState, transitionController]);

  return (
    <>
      <SearchSceneOwner />
      <PollsSceneOwner />
      <BookmarksSceneOwner
        mounted={mountedScenes.bookmarks || inactiveTabsPrewarmed || isBookmarksActive}
      />
      <ProfileSceneOwner
        mounted={mountedScenes.profile || inactiveTabsPrewarmed || isProfileActive}
      />
      <PollCreationSceneOwner />
      {isSaveListActive ? <SaveListSceneOwner /> : null}
    </>
  );
};

export default React.memo(SearchRouteMountedSceneOwners);
