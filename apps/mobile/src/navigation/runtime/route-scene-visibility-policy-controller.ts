import {
  areRouteSceneChromeSurfaceVisibilitySnapshotsEqual,
  areRouteSceneSheetPolicyVisibilitySnapshotsEqual,
  areRouteSceneTransitionVisibilitySnapshotsEqual,
  createRouteSceneVisibilityPolicySnapshotFromRouteScenePolicy,
  EMPTY_ROUTE_SCENE_VISIBILITY_POLICY_SNAPSHOT,
  type RouteSceneChromeSurfaceVisibilitySnapshot,
  type RouteSceneSheetPolicyVisibilitySnapshot,
  type RouteSceneTransitionVisibilitySnapshot,
  type RouteSceneVisibilityPolicyRuntime,
  type RouteSceneVisibilityPolicySnapshot,
} from './app-route-scene-visibility-policy-contract';
import type {
  AppRouteSceneForegroundState,
  RouteScenePolicySnapshot,
} from './app-route-scene-policy-contract';
import { resolveSearchCloseHandoffFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';

export class RouteSceneVisibilityPolicyController implements RouteSceneVisibilityPolicyRuntime {
  private snapshot = EMPTY_ROUTE_SCENE_VISIBILITY_POLICY_SNAPSHOT;

  public getSnapshot(): RouteSceneVisibilityPolicySnapshot {
    return this.snapshot;
  }

  public updateTransitionVisibility(
    transitionVisibility: RouteSceneTransitionVisibilitySnapshot
  ): RouteSceneVisibilityPolicySnapshot {
    if (
      areRouteSceneTransitionVisibilitySnapshotsEqual(
        this.snapshot.transitionVisibility,
        transitionVisibility
      )
    ) {
      return this.snapshot;
    }
    this.snapshot = {
      ...this.snapshot,
      transitionVisibility,
    };
    return this.snapshot;
  }

  public updateSheetPolicyVisibility(
    sheetPolicyVisibility: RouteSceneSheetPolicyVisibilitySnapshot
  ): RouteSceneVisibilityPolicySnapshot {
    if (
      areRouteSceneSheetPolicyVisibilitySnapshotsEqual(
        this.snapshot.sheetPolicyVisibility,
        sheetPolicyVisibility
      )
    ) {
      return this.snapshot;
    }
    this.snapshot = {
      ...this.snapshot,
      sheetPolicyVisibility,
    };
    return this.snapshot;
  }

  public updateChromeSurfaceVisibility(
    chromeSurfaceVisibility: RouteSceneChromeSurfaceVisibilitySnapshot
  ): RouteSceneVisibilityPolicySnapshot {
    if (
      areRouteSceneChromeSurfaceVisibilitySnapshotsEqual(
        this.snapshot.chromeSurfaceVisibility,
        chromeSurfaceVisibility
      )
    ) {
      return this.snapshot;
    }
    this.snapshot = {
      ...this.snapshot,
      chromeSurfaceVisibility,
    };
    return this.snapshot;
  }

  public updateInputMode(
    inputMode: AppRouteSceneForegroundState['inputMode']
  ): RouteSceneVisibilityPolicySnapshot {
    this.updateTransitionVisibilityFromActionState({
      inputMode,
    });
    return this.updateSheetPolicyVisibility({
      ...this.snapshot.sheetPolicyVisibility,
      shouldSuppressSearchAndTabSheetsForForegroundEditing: inputMode === 'editing',
    });
  }

  public updateCloseTransitionActive(
    isCloseTransitionActive: boolean
  ): RouteSceneVisibilityPolicySnapshot {
    return this.updateTransitionVisibilityFromActionState({
      isCloseTransitionActive,
    });
  }

  public updateFromRouteScenePolicySnapshot(
    routeScenePolicySnapshot: RouteScenePolicySnapshot
  ): RouteSceneVisibilityPolicySnapshot {
    const nextSnapshot =
      createRouteSceneVisibilityPolicySnapshotFromRouteScenePolicy(routeScenePolicySnapshot);
    if (
      areRouteSceneTransitionVisibilitySnapshotsEqual(
        this.snapshot.transitionVisibility,
        nextSnapshot.transitionVisibility
      ) &&
      areRouteSceneSheetPolicyVisibilitySnapshotsEqual(
        this.snapshot.sheetPolicyVisibility,
        nextSnapshot.sheetPolicyVisibility
      ) &&
      areRouteSceneChromeSurfaceVisibilitySnapshotsEqual(
        this.snapshot.chromeSurfaceVisibility,
        nextSnapshot.chromeSurfaceVisibility
      )
    ) {
      return this.snapshot;
    }
    this.snapshot = nextSnapshot;
    return this.snapshot;
  }

  public dispose(): void {
    this.snapshot = EMPTY_ROUTE_SCENE_VISIBILITY_POLICY_SNAPSHOT;
  }

  private updateTransitionVisibilityFromActionState({
    inputMode = this.snapshot.transitionVisibility.inputMode,
    isCloseTransitionActive = this.snapshot.transitionVisibility.isCloseTransitionActive,
  }: {
    inputMode?: AppRouteSceneForegroundState['inputMode'];
    isCloseTransitionActive?: boolean;
  }): RouteSceneVisibilityPolicySnapshot {
    const previous = this.snapshot.transitionVisibility;
    const previousActivity = previous.foregroundActivity;
    const foregroundActivity = isCloseTransitionActive
      ? 'resultsClosing'
      : inputMode === 'editing'
      ? 'editing'
      : previousActivity === 'editing' || previousActivity === 'resultsClosing'
      ? 'idle'
      : previousActivity;
    const transitionVisibility: RouteSceneTransitionVisibilitySnapshot = {
      ...previous,
      inputMode,
      isCloseTransitionActive,
      foregroundActivity,
      chromeSurfaceTarget:
        foregroundActivity === 'idle' || foregroundActivity === 'persistentPoll'
          ? 'polls'
          : 'results',
      closeHandoffFreezeClassification: resolveSearchCloseHandoffFreezeClassification({
        isCloseHandoffActive: isCloseTransitionActive,
      }),
    };
    this.updateTransitionVisibility(transitionVisibility);
    return this.updateChromeSurfaceVisibility({
      chromeSurfaceTarget: transitionVisibility.chromeSurfaceTarget,
    });
  }
}

export const createRouteSceneVisibilityPolicyController = (): RouteSceneVisibilityPolicyRuntime =>
  new RouteSceneVisibilityPolicyController();
