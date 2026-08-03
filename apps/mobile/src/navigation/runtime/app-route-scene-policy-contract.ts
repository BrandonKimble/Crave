import type { SearchFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';

export type AppRouteSceneForegroundState = {
  inputMode: 'idle' | 'editing';
  isCloseTransitionActive: boolean;
  isSuggestionPanelActive: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
};

export type AppRouteSceneForegroundActivity =
  | 'idle'
  | 'editing'
  | 'suggestions'
  | 'loading'
  | 'results'
  | 'resultsClosing'
  | 'dockedScene';

export type AppRouteChromeSurfaceTarget = 'results' | 'dockedScene';

/**
 * THE chrome-surface-target formula — one home, every caller.
 *
 * It was derived twice by the byte-same expression, in the route-scene policy
 * controller and in the visibility policy controller, off two different foreground
 * ACTIVITY ladders. The ladders are legitimately different (one is the full policy
 * derivation, the other tracks only the editing/close-transition edges the transition
 * visibility snapshot owns), but "which activities show docked chrome" is ONE question
 * and must have one answer. Add an activity to the union and the compiler brings you
 * here, not to two places that can drift apart silently.
 */
export const resolveAppRouteChromeSurfaceTarget = (
  foregroundActivity: AppRouteSceneForegroundActivity
): AppRouteChromeSurfaceTarget =>
  foregroundActivity === 'idle' || foregroundActivity === 'dockedScene' ? 'dockedScene' : 'results';

export const EMPTY_APP_ROUTE_SCENE_FOREGROUND_STATE: AppRouteSceneForegroundState = {
  inputMode: 'idle',
  isCloseTransitionActive: false,
  isSuggestionPanelActive: false,
  isSearchSessionActive: false,
  isSearchLoading: false,
};

export type AppRouteSceneSheetPolicyInputs = {
  sheetContentLaneKind: string;
  shouldRenderRouteSheetSurface: boolean;
};

export type AppRouteSceneForegroundPolicyInputs = {
  foregroundState: AppRouteSceneForegroundState;
};

export const EMPTY_APP_ROUTE_SCENE_SHEET_POLICY_INPUTS: AppRouteSceneSheetPolicyInputs = {
  sheetContentLaneKind: 'hidden',
  shouldRenderRouteSheetSurface: false,
};

export const EMPTY_APP_ROUTE_SCENE_FOREGROUND_POLICY_INPUTS: AppRouteSceneForegroundPolicyInputs = {
  foregroundState: EMPTY_APP_ROUTE_SCENE_FOREGROUND_STATE,
};

export type RouteScenePolicySnapshot = AppRouteSceneSheetPolicyInputs &
  AppRouteSceneForegroundPolicyInputs & {
    foregroundActivity: AppRouteSceneForegroundActivity;
    chromeSurfaceTarget: AppRouteChromeSurfaceTarget;
    isDockedLaneEligible: boolean;
    shouldSuppressSearchAndTabSheetsForForegroundEditing: boolean;
    shouldSuppressTabSheetsForSuggestions: boolean;
    closeHandoffFreezeClassification: SearchFreezeClassification;
  };

export const EMPTY_ROUTE_SCENE_POLICY_SNAPSHOT: RouteScenePolicySnapshot = {
  ...EMPTY_APP_ROUTE_SCENE_SHEET_POLICY_INPUTS,
  ...EMPTY_APP_ROUTE_SCENE_FOREGROUND_POLICY_INPUTS,
  foregroundActivity: 'idle',
  chromeSurfaceTarget: 'dockedScene',
  isDockedLaneEligible: false,
  shouldSuppressSearchAndTabSheetsForForegroundEditing: false,
  shouldSuppressTabSheetsForSuggestions: false,
  closeHandoffFreezeClassification: 'none',
};

export const areAppRouteSceneForegroundStatesEqual = (
  left: AppRouteSceneForegroundState,
  right: AppRouteSceneForegroundState
): boolean =>
  left.inputMode === right.inputMode &&
  left.isCloseTransitionActive === right.isCloseTransitionActive &&
  left.isSuggestionPanelActive === right.isSuggestionPanelActive &&
  left.isSearchSessionActive === right.isSearchSessionActive &&
  left.isSearchLoading === right.isSearchLoading;

export const areAppRouteSceneSheetPolicyInputsEqual = (
  left: AppRouteSceneSheetPolicyInputs,
  right: AppRouteSceneSheetPolicyInputs
): boolean =>
  left.sheetContentLaneKind === right.sheetContentLaneKind &&
  left.shouldRenderRouteSheetSurface === right.shouldRenderRouteSheetSurface;

export const areAppRouteSceneForegroundPolicyInputsEqual = (
  left: AppRouteSceneForegroundPolicyInputs,
  right: AppRouteSceneForegroundPolicyInputs
): boolean => areAppRouteSceneForegroundStatesEqual(left.foregroundState, right.foregroundState);

export const areRouteScenePolicySnapshotsEqual = (
  left: RouteScenePolicySnapshot,
  right: RouteScenePolicySnapshot
): boolean =>
  left.sheetContentLaneKind === right.sheetContentLaneKind &&
  left.shouldRenderRouteSheetSurface === right.shouldRenderRouteSheetSurface &&
  left.foregroundActivity === right.foregroundActivity &&
  left.chromeSurfaceTarget === right.chromeSurfaceTarget &&
  left.isDockedLaneEligible === right.isDockedLaneEligible &&
  left.shouldSuppressSearchAndTabSheetsForForegroundEditing ===
    right.shouldSuppressSearchAndTabSheetsForForegroundEditing &&
  left.shouldSuppressTabSheetsForSuggestions === right.shouldSuppressTabSheetsForSuggestions &&
  left.closeHandoffFreezeClassification === right.closeHandoffFreezeClassification &&
  areAppRouteSceneForegroundStatesEqual(left.foregroundState, right.foregroundState);
