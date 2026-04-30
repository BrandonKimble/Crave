import {
  areAppRouteSceneForegroundPolicyInputsEqual,
  areAppRouteSceneSheetPolicyInputsEqual,
  EMPTY_APP_ROUTE_SCENE_FOREGROUND_POLICY_INPUTS,
  areRouteScenePolicySnapshotsEqual,
  EMPTY_APP_ROUTE_SCENE_SHEET_POLICY_INPUTS,
  EMPTY_ROUTE_SCENE_POLICY_SNAPSHOT,
  type AppRouteSceneForegroundPolicyInputs,
  type AppRouteSceneSheetPolicyInputs,
  type RouteScenePolicySnapshot,
} from './app-route-scene-policy-contract';
import type { RouteScenePolicyKey } from './route-scene-policy-authority-contract';
import { resolveSearchCloseHandoffFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';

type RouteScenePolicyListener = () => void;

export type RouteScenePolicyInputAuthority = {
  setForegroundPolicyInputs: (args: {
    sceneKey: RouteScenePolicyKey;
    foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  }) => void;
  setSheetPolicyInputs: (args: {
    sceneKey: RouteScenePolicyKey;
    sheetPolicyInputs: AppRouteSceneSheetPolicyInputs;
  }) => void;
};

export type RouteScenePolicyOutputAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteScenePolicySnapshot;
};

export class RouteScenePolicyController {
  private searchSceneForegroundPolicyInputs: AppRouteSceneForegroundPolicyInputs =
    EMPTY_APP_ROUTE_SCENE_FOREGROUND_POLICY_INPUTS;

  private searchSceneSheetPolicyInputs: AppRouteSceneSheetPolicyInputs =
    EMPTY_APP_ROUTE_SCENE_SHEET_POLICY_INPUTS;

  private routeScenePolicySnapshot: RouteScenePolicySnapshot = EMPTY_ROUTE_SCENE_POLICY_SNAPSHOT;

  private readonly listeners = new Set<RouteScenePolicyListener>();

  public readonly inputAuthority: RouteScenePolicyInputAuthority;

  public readonly outputAuthority: RouteScenePolicyOutputAuthority;

  constructor() {
    this.inputAuthority = {
      setForegroundPolicyInputs: this.setRouteSceneForegroundPolicyInputs.bind(this),
      setSheetPolicyInputs: this.setRouteSceneSheetPolicyInputs.bind(this),
    };
    this.outputAuthority = {
      subscribe: this.subscribe.bind(this),
      getSnapshot: this.getSnapshot.bind(this),
    };
    this.routeScenePolicySnapshot = this.computeRouteScenePolicySnapshot();
  }

  private subscribe(listener: RouteScenePolicyListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getSnapshot(): RouteScenePolicySnapshot {
    return this.routeScenePolicySnapshot;
  }

  private setRouteSceneForegroundPolicyInputs({
    sceneKey,
    foregroundPolicyInputs,
  }: {
    sceneKey: RouteScenePolicyKey;
    foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  }): void {
    if (sceneKey !== 'search') {
      return;
    }

    if (
      areAppRouteSceneForegroundPolicyInputsEqual(
        this.searchSceneForegroundPolicyInputs,
        foregroundPolicyInputs
      )
    ) {
      return;
    }

    this.searchSceneForegroundPolicyInputs = foregroundPolicyInputs;
    this.recompute(true);
  }

  private setRouteSceneSheetPolicyInputs({
    sceneKey,
    sheetPolicyInputs,
  }: {
    sceneKey: RouteScenePolicyKey;
    sheetPolicyInputs: AppRouteSceneSheetPolicyInputs;
  }): void {
    if (sceneKey !== 'search') {
      return;
    }

    if (
      areAppRouteSceneSheetPolicyInputsEqual(this.searchSceneSheetPolicyInputs, sheetPolicyInputs)
    ) {
      return;
    }

    this.searchSceneSheetPolicyInputs = sheetPolicyInputs;
    this.recompute(true);
  }

  public resetScenePolicyInputs(sceneKey: RouteScenePolicyKey): void {
    if (sceneKey !== 'search') {
      return;
    }

    this.searchSceneForegroundPolicyInputs = EMPTY_APP_ROUTE_SCENE_FOREGROUND_POLICY_INPUTS;
    this.searchSceneSheetPolicyInputs = EMPTY_APP_ROUTE_SCENE_SHEET_POLICY_INPUTS;
    this.recompute(true);
  }

  public dispose(): void {
    this.listeners.clear();
  }

  private recompute(notify: boolean): void {
    const nextRouteScenePolicySnapshot = this.computeRouteScenePolicySnapshot();
    if (
      areRouteScenePolicySnapshotsEqual(this.routeScenePolicySnapshot, nextRouteScenePolicySnapshot)
    ) {
      return;
    }

    this.routeScenePolicySnapshot = nextRouteScenePolicySnapshot;
    if (notify) {
      this.listeners.forEach((listener) => {
        listener();
      });
    }
  }

  private computeRouteScenePolicySnapshot(): RouteScenePolicySnapshot {
    const { foregroundState } = this.searchSceneForegroundPolicyInputs;
    const { sheetContentLaneKind, shouldRenderResultsSheet } = this.searchSceneSheetPolicyInputs;
    const isPersistentPollLaneEligible = sheetContentLaneKind === 'persistent_poll';
    const foregroundActivity = foregroundState.isCloseTransitionActive
      ? 'resultsClosing'
      : isPersistentPollLaneEligible
      ? 'persistentPoll'
      : foregroundState.inputMode === 'editing'
      ? 'editing'
      : foregroundState.isSuggestionPanelActive
      ? 'suggestions'
      : foregroundState.isSearchLoading
      ? 'loading'
      : foregroundState.isSearchSessionActive || shouldRenderResultsSheet
      ? 'results'
      : 'idle';
    const shouldSuppressSearchAndTabSheetsForForegroundEditing =
      foregroundState.inputMode === 'editing';
    const shouldSuppressTabSheetsForSuggestions =
      foregroundState.isSuggestionPanelActive &&
      (sheetContentLaneKind !== 'persistent_poll' ? shouldRenderResultsSheet : true);
    const chromeSurfaceTarget =
      foregroundActivity === 'idle' || foregroundActivity === 'persistentPoll'
        ? 'polls'
        : 'results';

    return {
      ...this.searchSceneSheetPolicyInputs,
      ...this.searchSceneForegroundPolicyInputs,
      foregroundActivity,
      chromeSurfaceTarget,
      isPersistentPollLaneEligible,
      shouldSuppressSearchAndTabSheetsForForegroundEditing,
      shouldSuppressTabSheetsForSuggestions,
      closeHandoffFreezeClassification: resolveSearchCloseHandoffFreezeClassification({
        isCloseHandoffActive: foregroundState.isCloseTransitionActive,
      }),
    };
  }
}

export const createRouteScenePolicyController = (): RouteScenePolicyController =>
  new RouteScenePolicyController();
