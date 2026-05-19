import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import type { OverlayRouteParamsMap } from './app-overlay-route-types';
import type { AppRouteSceneSwitchAuthority } from './app-route-scene-switch-authority';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';

export type AppSearchRouteCommandActions = {
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
}: {
  routeSceneSwitchAuthority: Pick<AppRouteSceneSwitchAuthority, 'getSnapshot'>;
  routeSceneSwitchActions: RouteSceneSwitchTransitionActions;
}): AppSearchRouteCommandActions => {
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
    returnAppSearchRouteToDockedSearch,
    ensureAppSearchRouteSearchScene,
    openAppSearchRoutePollsHome,
    ensureAppSearchRouteSearchEntry,
  };
};
