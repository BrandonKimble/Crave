import type {
  AppRouteChromeSurfaceTarget,
  AppRouteSceneForegroundState,
  AppRouteSceneForegroundActivity,
  RouteScenePolicySnapshot,
} from './app-route-scene-policy-contract';
import type { SearchFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';

export type RouteSceneTransitionVisibilitySnapshot = {
  inputMode: AppRouteSceneForegroundState['inputMode'];
  isCloseTransitionActive: boolean;
  foregroundActivity: AppRouteSceneForegroundActivity;
  chromeSurfaceTarget: AppRouteChromeSurfaceTarget;
  isPersistentPollLaneEligible: boolean;
  closeHandoffFreezeClassification: SearchFreezeClassification;
};

export type RouteSceneSheetPolicyVisibilitySnapshot = {
  shouldSuppressSearchAndTabSheetsForForegroundEditing: boolean;
  shouldSuppressTabSheetsForSuggestions: boolean;
  shouldRenderResultsSheet: boolean;
};

export type RouteSceneChromeSurfaceVisibilitySnapshot = {
  chromeSurfaceTarget: AppRouteChromeSurfaceTarget;
};

export type RouteSceneVisibilityPolicySnapshot = {
  transitionVisibility: RouteSceneTransitionVisibilitySnapshot;
  sheetPolicyVisibility: RouteSceneSheetPolicyVisibilitySnapshot;
  chromeSurfaceVisibility: RouteSceneChromeSurfaceVisibilitySnapshot;
};

export type RouteSceneVisibilityPolicyRuntime = {
  getSnapshot: () => RouteSceneVisibilityPolicySnapshot;
  updateTransitionVisibility: (
    snapshot: RouteSceneTransitionVisibilitySnapshot
  ) => RouteSceneVisibilityPolicySnapshot;
  updateSheetPolicyVisibility: (
    snapshot: RouteSceneSheetPolicyVisibilitySnapshot
  ) => RouteSceneVisibilityPolicySnapshot;
  updateChromeSurfaceVisibility: (
    snapshot: RouteSceneChromeSurfaceVisibilitySnapshot
  ) => RouteSceneVisibilityPolicySnapshot;
  updateInputMode: (
    inputMode: AppRouteSceneForegroundState['inputMode']
  ) => RouteSceneVisibilityPolicySnapshot;
  updateCloseTransitionActive: (
    isCloseTransitionActive: boolean
  ) => RouteSceneVisibilityPolicySnapshot;
  updateFromRouteScenePolicySnapshot: (
    snapshot: RouteScenePolicySnapshot
  ) => RouteSceneVisibilityPolicySnapshot;
  dispose: () => void;
};

export const EMPTY_ROUTE_SCENE_TRANSITION_VISIBILITY_SNAPSHOT: RouteSceneTransitionVisibilitySnapshot =
  {
    inputMode: 'idle',
    isCloseTransitionActive: false,
    foregroundActivity: 'idle',
    chromeSurfaceTarget: 'polls',
    isPersistentPollLaneEligible: false,
    closeHandoffFreezeClassification: 'none',
  };

export const EMPTY_ROUTE_SCENE_SHEET_POLICY_VISIBILITY_SNAPSHOT: RouteSceneSheetPolicyVisibilitySnapshot =
  {
    shouldSuppressSearchAndTabSheetsForForegroundEditing: false,
    shouldSuppressTabSheetsForSuggestions: false,
    shouldRenderResultsSheet: false,
  };

export const EMPTY_ROUTE_SCENE_CHROME_SURFACE_VISIBILITY_SNAPSHOT: RouteSceneChromeSurfaceVisibilitySnapshot =
  {
    chromeSurfaceTarget: 'polls',
  };

export const EMPTY_ROUTE_SCENE_VISIBILITY_POLICY_SNAPSHOT: RouteSceneVisibilityPolicySnapshot = {
  transitionVisibility: EMPTY_ROUTE_SCENE_TRANSITION_VISIBILITY_SNAPSHOT,
  sheetPolicyVisibility: EMPTY_ROUTE_SCENE_SHEET_POLICY_VISIBILITY_SNAPSHOT,
  chromeSurfaceVisibility: EMPTY_ROUTE_SCENE_CHROME_SURFACE_VISIBILITY_SNAPSHOT,
};

export const areRouteSceneTransitionVisibilitySnapshotsEqual = (
  left: RouteSceneTransitionVisibilitySnapshot,
  right: RouteSceneTransitionVisibilitySnapshot
): boolean =>
  left.foregroundActivity === right.foregroundActivity &&
  left.inputMode === right.inputMode &&
  left.isCloseTransitionActive === right.isCloseTransitionActive &&
  left.chromeSurfaceTarget === right.chromeSurfaceTarget &&
  left.isPersistentPollLaneEligible === right.isPersistentPollLaneEligible &&
  left.closeHandoffFreezeClassification === right.closeHandoffFreezeClassification;

export const areRouteSceneSheetPolicyVisibilitySnapshotsEqual = (
  left: RouteSceneSheetPolicyVisibilitySnapshot,
  right: RouteSceneSheetPolicyVisibilitySnapshot
): boolean =>
  left.shouldSuppressSearchAndTabSheetsForForegroundEditing ===
    right.shouldSuppressSearchAndTabSheetsForForegroundEditing &&
  left.shouldSuppressTabSheetsForSuggestions === right.shouldSuppressTabSheetsForSuggestions &&
  left.shouldRenderResultsSheet === right.shouldRenderResultsSheet;

export const areRouteSceneChromeSurfaceVisibilitySnapshotsEqual = (
  left: RouteSceneChromeSurfaceVisibilitySnapshot,
  right: RouteSceneChromeSurfaceVisibilitySnapshot
): boolean => left.chromeSurfaceTarget === right.chromeSurfaceTarget;

export const createRouteSceneVisibilityPolicySnapshotFromRouteScenePolicy = (
  snapshot: RouteScenePolicySnapshot
): RouteSceneVisibilityPolicySnapshot => ({
  transitionVisibility: {
    inputMode: snapshot.foregroundState.inputMode,
    isCloseTransitionActive: snapshot.foregroundState.isCloseTransitionActive,
    foregroundActivity: snapshot.foregroundActivity,
    chromeSurfaceTarget: snapshot.chromeSurfaceTarget,
    isPersistentPollLaneEligible: snapshot.isPersistentPollLaneEligible,
    closeHandoffFreezeClassification: snapshot.closeHandoffFreezeClassification,
  },
  sheetPolicyVisibility: {
    shouldSuppressSearchAndTabSheetsForForegroundEditing:
      snapshot.shouldSuppressSearchAndTabSheetsForForegroundEditing,
    shouldSuppressTabSheetsForSuggestions: snapshot.shouldSuppressTabSheetsForSuggestions,
    shouldRenderResultsSheet: snapshot.shouldRenderResultsSheet,
  },
  chromeSurfaceVisibility: {
    chromeSurfaceTarget: snapshot.chromeSurfaceTarget,
  },
});
