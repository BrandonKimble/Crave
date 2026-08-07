import {
  areAppRouteSceneForegroundPolicyInputsEqual,
  areAppRouteSceneSheetPolicyInputsEqual,
  EMPTY_APP_ROUTE_SCENE_FOREGROUND_POLICY_INPUTS,
  areRouteScenePolicySnapshotsEqual,
  EMPTY_APP_ROUTE_SCENE_SHEET_POLICY_INPUTS,
  EMPTY_ROUTE_SCENE_POLICY_SNAPSHOT,
  resolveAppRouteChromeSurfaceTarget,
  type AppRouteSceneForegroundPolicyInputs,
  type AppRouteSceneSheetPolicyInputs,
  type RouteScenePolicySnapshot,
} from './app-route-scene-policy-contract';
import { resolveSearchCloseHandoffFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';

type RouteScenePolicyListener = () => void;

/**
 * F5418: these verbs carry no scene key. This controller's state IS the search
 * scene (two `searchScene*PolicyInputs` singletons), so a second scene must not be
 * RECEIVABLE — the guards that used to drop one silently were unfalsifiable, and
 * deleting them alone would have let a second scene alias onto search state.
 */
export type RouteScenePolicyInputAuthority = {
  setForegroundPolicyInputs: (args: {
    foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  }) => void;
  setSheetPolicyInputs: (args: { sheetPolicyInputs: AppRouteSceneSheetPolicyInputs }) => void;
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
    foregroundPolicyInputs,
  }: {
    foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  }): void {
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
    sheetPolicyInputs,
  }: {
    sheetPolicyInputs: AppRouteSceneSheetPolicyInputs;
  }): void {
    if (
      areAppRouteSceneSheetPolicyInputsEqual(this.searchSceneSheetPolicyInputs, sheetPolicyInputs)
    ) {
      return;
    }

    this.searchSceneSheetPolicyInputs = sheetPolicyInputs;
    this.recompute(true);
  }

  // F956(d): `resetScenePolicyInputs` lived here — a public method with no caller
  // anywhere in apps/mobile/src (symbol + bare-string grep both empty). Deleted rather
  // than kept "in case": an untested reset path on a policy controller is a liability,
  // and git has it if a real reset requirement ever shows up.

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
    const { sheetContentLaneKind, shouldRenderRouteSheetSurface } =
      this.searchSceneSheetPolicyInputs;
    const isDockedLaneEligible =
      sheetContentLaneKind === 'docked_scene' || sheetContentLaneKind === 'results_closing';
    const foregroundActivity = foregroundState.isCloseTransitionActive
      ? 'resultsClosing'
      : isDockedLaneEligible
        ? 'dockedScene'
        : foregroundState.inputMode === 'editing'
          ? 'editing'
          : foregroundState.isSuggestionPanelActive
            ? 'suggestions'
            : foregroundState.isSearchLoading
              ? 'loading'
              : foregroundState.isSearchSessionActive || shouldRenderRouteSheetSurface
                ? 'results'
                : 'idle';
    const shouldSuppressSearchAndTabSheetsForForegroundEditing =
      foregroundState.inputMode === 'editing';
    const shouldSuppressTabSheetsForSuggestions =
      foregroundState.isSuggestionPanelActive &&
      (sheetContentLaneKind !== 'docked_scene' ? shouldRenderRouteSheetSurface : true);
    const chromeSurfaceTarget = resolveAppRouteChromeSurfaceTarget(foregroundActivity);

    return {
      ...this.searchSceneSheetPolicyInputs,
      ...this.searchSceneForegroundPolicyInputs,
      foregroundActivity,
      chromeSurfaceTarget,
      isDockedLaneEligible,
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
