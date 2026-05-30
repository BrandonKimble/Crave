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
  | 'persistentPoll';

export type AppRouteChromeSurfaceTarget = 'results' | 'polls';

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
    isPersistentPollLaneEligible: boolean;
    shouldSuppressSearchAndTabSheetsForForegroundEditing: boolean;
    shouldSuppressTabSheetsForSuggestions: boolean;
    closeHandoffFreezeClassification: SearchFreezeClassification;
  };

export const EMPTY_ROUTE_SCENE_POLICY_SNAPSHOT: RouteScenePolicySnapshot = {
  ...EMPTY_APP_ROUTE_SCENE_SHEET_POLICY_INPUTS,
  ...EMPTY_APP_ROUTE_SCENE_FOREGROUND_POLICY_INPUTS,
  foregroundActivity: 'idle',
  chromeSurfaceTarget: 'polls',
  isPersistentPollLaneEligible: false,
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
  left.isPersistentPollLaneEligible === right.isPersistentPollLaneEligible &&
  left.shouldSuppressSearchAndTabSheetsForForegroundEditing ===
    right.shouldSuppressSearchAndTabSheetsForForegroundEditing &&
  left.shouldSuppressTabSheetsForSuggestions === right.shouldSuppressTabSheetsForSuggestions &&
  left.closeHandoffFreezeClassification === right.closeHandoffFreezeClassification &&
  areAppRouteSceneForegroundStatesEqual(left.foregroundState, right.foregroundState);
