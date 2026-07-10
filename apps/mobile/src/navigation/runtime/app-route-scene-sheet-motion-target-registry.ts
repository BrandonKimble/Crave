import type { SharedValue } from 'react-native-reanimated';

import type { RouteSceneSwitchTransitionContract } from './app-overlay-route-transition-contract';
import type {
  BottomSheetMotionCommand,
  BottomSheetSnap,
} from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import { appRouteSceneUsesSharedSheetTarget } from './app-route-scene-policy-registry';

type Listener = () => void;

export type AppRouteSceneSheetMotionTarget = {
  sceneKey: OverlayKey;
  localMotionKey?: string;
  motionCommandValue: SharedValue<BottomSheetMotionCommand | null>;
  resolveCurrentSnapTarget?: () => BottomSheetSnap | null;
  matchesTransitionContract?: (transitionContract: RouteSceneSwitchTransitionContract) => boolean;
};

export type AppRouteSceneSheetMotionTargetResolution =
  | {
      kind: 'ready';
      target: AppRouteSceneSheetMotionTarget;
    }
  | {
      kind: 'awaiting-target';
    }
  | {
      kind: 'unavailable';
    };

const SHEET_HOST_TARGET_KEY: OverlayKey = 'sheetHost';

export class AppRouteSceneSheetMotionTargetRegistry {
  private readonly targetsBySceneKey = new Map<OverlayKey, AppRouteSceneSheetMotionTarget[]>();

  private readonly listeners = new Set<Listener>();

  public dispose(): void {
    this.targetsBySceneKey.clear();
    this.listeners.clear();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public resolveTarget(
    sceneKey: OverlayKey,
    transitionContract?: RouteSceneSwitchTransitionContract | null,
    localMotionKey?: string
  ): AppRouteSceneSheetMotionTarget | undefined {
    const candidates = [
      ...this.getSceneTargets(sceneKey),
      ...(appRouteSceneUsesSharedSheetTarget({
        sceneKey,
        sheetTargetGroup: SHEET_HOST_TARGET_KEY,
      })
        ? this.getSceneTargets(SHEET_HOST_TARGET_KEY)
        : []),
    ];
    const orderedCandidates = [...candidates].reverse();
    if (localMotionKey != null) {
      const matchingLocalTarget = orderedCandidates.find(
        (target) => target.localMotionKey === localMotionKey
      );
      if (matchingLocalTarget != null) {
        return matchingLocalTarget;
      }
    }
    if (!transitionContract) {
      return orderedCandidates[0];
    }
    const matchingTarget = orderedCandidates.find(
      (target) => target.matchesTransitionContract?.(transitionContract) ?? true
    );
    if (matchingTarget != null) {
      return matchingTarget;
    }
    if (sceneKey === 'restaurant' && transitionContract.targetSceneKey === 'restaurant') {
      return undefined;
    }
    return orderedCandidates[0];
  }

  public resolveTransitionTarget(
    sceneKey: OverlayKey,
    transitionContract: RouteSceneSwitchTransitionContract
  ): AppRouteSceneSheetMotionTargetResolution {
    const target = this.resolveTarget(sceneKey, transitionContract);
    if (target != null) {
      return {
        kind: 'ready',
        target,
      };
    }
    if (this.requiresTransitionTarget(sceneKey, transitionContract)) {
      return {
        kind: 'awaiting-target',
      };
    }
    return {
      kind: 'unavailable',
    };
  }

  public targetOwnsScene(target: AppRouteSceneSheetMotionTarget, sceneKey: OverlayKey): boolean {
    return (
      target.sceneKey === sceneKey ||
      appRouteSceneUsesSharedSheetTarget({
        sceneKey,
        sheetTargetGroup: target.sceneKey,
      })
    );
  }

  public registerTarget(target: AppRouteSceneSheetMotionTarget): () => void {
    const targets = this.targetsBySceneKey.get(target.sceneKey) ?? [];
    this.targetsBySceneKey.set(target.sceneKey, [...targets, target]);
    this.notify();
    return () => {
      const currentTargets = this.targetsBySceneKey.get(target.sceneKey);
      if (!currentTargets) {
        return;
      }
      const nextTargets = currentTargets.filter((currentTarget) => currentTarget !== target);
      if (nextTargets.length === 0) {
        this.targetsBySceneKey.delete(target.sceneKey);
        this.notify();
        return;
      }
      this.targetsBySceneKey.set(target.sceneKey, nextTargets);
      this.notify();
    };
  }

  public resolveCurrentSnapTarget(sceneKey: OverlayKey): BottomSheetSnap | null {
    return this.resolveTarget(sceneKey)?.resolveCurrentSnapTarget?.() ?? null;
  }

  private getSceneTargets(sceneKey: OverlayKey): readonly AppRouteSceneSheetMotionTarget[] {
    return this.targetsBySceneKey.get(sceneKey) ?? [];
  }

  private requiresTransitionTarget(
    sceneKey: OverlayKey,
    transitionContract: RouteSceneSwitchTransitionContract
  ): boolean {
    return (
      transitionContract.motionPlanes.includes('sheet') &&
      (transitionContract.sheetHostSceneKey === sceneKey ||
        transitionContract.sheetIntent?.sceneKey === sceneKey)
    );
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createAppRouteSceneSheetMotionTargetRegistry =
  (): AppRouteSceneSheetMotionTargetRegistry => new AppRouteSceneSheetMotionTargetRegistry();
