import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import type { OverlayRouteParamsMap } from './app-overlay-route-types';
import type { AppRouteSceneSwitchAuthority } from './app-route-scene-switch-authority';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';
import type { AppRouteSheetSnapSessionActions } from './app-route-sheet-snap-session-runtime';

export type AppSearchRouteCommandActions = {
  openAppSearchRouteResults: (args: {
    snap: Exclude<OverlaySheetSnap, 'hidden'>;
    mode?: 'spring' | 'instant';
  }) => void;
  dismissAppSearchRouteResultsToPolls: (args?: { sourceSceneKey?: OverlayKey }) => void;
  returnAppSearchRouteToDockedSearch: (args?: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }) => void;
  ensureAppSearchRouteSearchScene: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  openAppSearchRoutePollsHome: (args?: {
    params?: OverlayRouteParamsMap['polls'];
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }) => void;
  ensureAppSearchRouteSearchEntry: (args: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }) => void;
};

export const createAppSearchRouteCommandActions = ({
  routeSceneSwitchAuthority,
  routeSceneSwitchActions,
  routeSheetSnapSessionActions,
}: {
  routeSceneSwitchAuthority: Pick<AppRouteSceneSwitchAuthority, 'getSnapshot'>;
  routeSceneSwitchActions: RouteSceneSwitchTransitionActions;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
}): AppSearchRouteCommandActions => {
  const openAppSearchRouteResults = ({
    snap,
    mode,
  }: {
    snap: Exclude<OverlaySheetSnap, 'hidden'>;
    mode?: 'spring' | 'instant';
  }): void => {
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap, mode },
      snapPersistence: 'sharedOnly',
    });
  };

  const dismissAppSearchRouteResultsToPolls = ({
    sourceSceneKey,
  }: {
    sourceSceneKey?: OverlayKey;
  } = {}): void => {
    routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
      sceneKey: 'polls',
      snap: 'collapsed',
    });
    routeSheetSnapSessionActions.setIsDockedPollsDismissed(false);
    routeSceneSwitchActions.requestOverlaySwitch({
      ...(sourceSceneKey != null ? { sourceSceneKey } : null),
      targetSceneKey: 'polls',
      sheetTransitionKind: 'terminalDismiss',
      sheetOpenerSource: 'systemDismiss',
      sheetMotion: { kind: 'snapTo', snap: 'collapsed' },
      contentHandoff: 'preserveOutgoingUntilSettle',
      snapPersistence: 'sharedOnly',
      routeAction: 'setRoot',
      dockedPollsRestoreSnap: 'collapsed',
    });
  };

  const returnAppSearchRouteToDockedSearch = ({
    snap = 'collapsed',
  }: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  } = {}): void => {
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap },
      dockedPollsRestoreSnap: snap,
    });
  };

  const ensureAppSearchRouteSearchScene = ({
    snap = 'collapsed',
  }: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  } = {}): void => {
    if (routeSceneSwitchAuthority.getSnapshot().routeActiveSceneKey === 'search') {
      return;
    }
    returnAppSearchRouteToDockedSearch({ snap });
  };

  const openAppSearchRoutePollsHome = ({
    params,
    snap = 'expanded',
  }: {
    params?: OverlayRouteParamsMap['polls'];
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  } = {}): void => {
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'polls',
      pollsParams: params ?? null,
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'navTab',
      sheetMotion: { kind: 'snapTo', snap },
    });
  };

  const ensureAppSearchRouteSearchEntry = ({
    rootOverlay,
    activeOverlayKey,
    snap = 'collapsed',
  }: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }): void => {
    if (rootOverlay !== 'search') {
      returnAppSearchRouteToDockedSearch({ snap });
      return;
    }
    if (activeOverlayKey !== 'search') {
      routeSceneSwitchActions.requestOverlaySwitch({
        targetSceneKey: 'search',
        sheetTransitionKind: 'topLevelSwitch',
        sheetOpenerSource: 'routeCommand',
        sheetMotion: { kind: 'snapTo', snap },
        dockedPollsRestoreSnap: snap,
      });
    }
  };

  return {
    openAppSearchRouteResults,
    dismissAppSearchRouteResultsToPolls,
    returnAppSearchRouteToDockedSearch,
    ensureAppSearchRouteSearchScene,
    openAppSearchRoutePollsHome,
    ensureAppSearchRouteSearchEntry,
  };
};
