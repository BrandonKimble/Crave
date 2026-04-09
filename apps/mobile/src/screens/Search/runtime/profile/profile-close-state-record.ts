import type { ProfileCloseState, ProfileControllerState } from './profile-runtime-state-record';
import { resetProfileTransitionState } from './profile-transition-state-mutations';

export const finalizePreparedProfileCloseRecord = ({
  controllerState,
  clearRestaurantPanelSnapshot,
  resetRestaurantFocusSession,
}: {
  controllerState: ProfileControllerState;
  clearRestaurantPanelSnapshot: () => void;
  resetRestaurantFocusSession: () => void;
}): void => {
  clearRestaurantPanelSnapshot();
  resetRestaurantFocusSession();
  controllerState.runtime.close.multiLocationZoomBaseline = null;
  controllerState.runtime.close.previousForegroundUiRestoreState = null;
  controllerState.runtime.close.dismissBehavior = 'restore';
  controllerState.runtime.close.shouldClearSearchOnDismiss = false;
  resetProfileTransitionState(controllerState.runtime.transition);
};

export const getProfileDismissBehaviorFromRecord = (
  controllerState: ProfileControllerState
): ProfileCloseState['dismissBehavior'] => controllerState.runtime.close.dismissBehavior;

export const setProfileDismissBehaviorOnRecord = (
  controllerState: ProfileControllerState,
  dismissBehavior: ProfileCloseState['dismissBehavior']
): void => {
  controllerState.runtime.close.dismissBehavior = dismissBehavior;
};

export const getProfileShouldClearSearchOnDismissFromRecord = (
  controllerState: ProfileControllerState
): boolean => controllerState.runtime.close.shouldClearSearchOnDismiss;

export const setProfileShouldClearSearchOnDismissOnRecord = (
  controllerState: ProfileControllerState,
  shouldClearSearchOnDismiss: boolean
): void => {
  controllerState.runtime.close.shouldClearSearchOnDismiss = shouldClearSearchOnDismiss;
};

export const getProfileMultiLocationZoomBaselineFromRecord = (
  controllerState: ProfileControllerState
): number | null => controllerState.runtime.close.multiLocationZoomBaseline;

export const setProfileMultiLocationZoomBaselineOnRecord = (
  controllerState: ProfileControllerState,
  multiLocationZoomBaseline: number | null
): void => {
  controllerState.runtime.close.multiLocationZoomBaseline = multiLocationZoomBaseline;
};

export const getPreviousForegroundUiRestoreStateFromRecord = (
  controllerState: ProfileControllerState
) => controllerState.runtime.close.previousForegroundUiRestoreState;

export const capturePreviousForegroundUiRestoreStateIfAbsentOnRecord = (
  controllerState: ProfileControllerState,
  restoreState: ProfileControllerState['runtime']['close']['previousForegroundUiRestoreState']
): void => {
  if (restoreState && !controllerState.runtime.close.previousForegroundUiRestoreState) {
    controllerState.runtime.close.previousForegroundUiRestoreState = restoreState;
  }
};
