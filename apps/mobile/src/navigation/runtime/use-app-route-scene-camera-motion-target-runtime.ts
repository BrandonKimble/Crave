import React from 'react';

import type { AppRouteSceneCameraMotionTarget } from './app-route-scene-motion-controller';
import type { RouteSceneSwitchCameraIntent } from './app-overlay-route-transition-contract';
import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';

const ROUTE_CAMERA_RESTORE_ANIMATION_MODE = 'none';

type AppRouteSceneCameraIntentPort = {
  commit: (intent: {
    center: [number, number];
    zoom: number;
    allowDuringGesture?: boolean;
    animationMode?: 'none' | 'easeTo';
    animationDurationMs?: number;
    requestToken?: number | null;
  }) => boolean;
  hasPendingProgrammaticCameraCompletion: () => boolean;
  subscribeProgrammaticCameraAnimationCompletion: (
    handler: (payload: {
      animationCompletionId: string | null;
      status: 'finished' | 'cancelled';
      requestToken: number | null;
    }) => void
  ) => () => void;
};

export type AppRouteSceneCameraMotionTargetFocusResolution = {
  center: [number, number];
  zoom: number;
  animationMode?: 'none' | 'easeTo';
  animationDurationMs?: number;
};

type AppRouteSceneLastCameraStateRef = React.MutableRefObject<{
  center: [number, number];
  zoom: number;
} | null>;

export type UseAppRouteSceneCameraMotionTargetRuntimeArgs = {
  cameraIntentArbiter: AppRouteSceneCameraIntentPort;
  lastCameraStateRef: AppRouteSceneLastCameraStateRef;
  onCameraIntentWillCommit?: (() => void) | undefined;
};

const resolveCameraMotionTargetIntent = ({
  cameraIntent,
  lastCameraStateRef,
}: {
  cameraIntent: RouteSceneSwitchCameraIntent;
  lastCameraStateRef: AppRouteSceneLastCameraStateRef;
}): AppRouteSceneCameraMotionTargetFocusResolution | null => {
  if (cameraIntent.kind === 'restore-search') {
    const lastCameraState = lastCameraStateRef.current;
    return lastCameraState == null
      ? null
      : {
          center: lastCameraState.center,
          zoom: lastCameraState.zoom,
          animationMode: ROUTE_CAMERA_RESTORE_ANIMATION_MODE,
        };
  }
  if (cameraIntent.kind === 'focus') {
    return {
      center: cameraIntent.center,
      zoom: cameraIntent.zoom,
      animationMode: cameraIntent.animationMode,
      animationDurationMs: cameraIntent.animationDurationMs,
    };
  }
  return null;
};

export const useAppRouteSceneCameraMotionTargetRuntime = ({
  cameraIntentArbiter,
  lastCameraStateRef,
  onCameraIntentWillCommit,
}: UseAppRouteSceneCameraMotionTargetRuntimeArgs): void => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const routeSceneMotionRuntime = routeSceneRuntime.routeSceneMotionRuntime;
  const pendingCompletionRef = React.useRef<Map<number, () => void>>(new Map());
  const target = React.useMemo<AppRouteSceneCameraMotionTarget>(
    () => ({
      executeCameraIntent: (cameraIntent, transitionContract, complete) => {
        const resolvedCameraIntent = resolveCameraMotionTargetIntent({
          cameraIntent,
          lastCameraStateRef,
        });

        if (!resolvedCameraIntent) {
          return false;
        }

        onCameraIntentWillCommit?.();
        const didCommit = cameraIntentArbiter.commit({
          ...resolvedCameraIntent,
          allowDuringGesture: true,
          animationMode:
            resolvedCameraIntent.animationMode ??
            ROUTE_CAMERA_RESTORE_ANIMATION_MODE,
          animationDurationMs: resolvedCameraIntent.animationDurationMs,
          requestToken: transitionContract.settleToken,
        });
        if (!didCommit) {
          return false;
        }
        lastCameraStateRef.current = {
          center: resolvedCameraIntent.center,
          zoom: resolvedCameraIntent.zoom,
        };
        if (!cameraIntentArbiter.hasPendingProgrammaticCameraCompletion()) {
          complete();
        } else {
          pendingCompletionRef.current.set(transitionContract.settleToken, complete);
        }
        return true;
      },
    }),
    [cameraIntentArbiter, lastCameraStateRef, onCameraIntentWillCommit]
  );

  React.useEffect(
    () =>
      cameraIntentArbiter.subscribeProgrammaticCameraAnimationCompletion(
        (payload) => {
          const requestToken = payload.requestToken;
          if (requestToken == null) {
            return;
          }
          const complete = pendingCompletionRef.current.get(requestToken);
          if (!complete) {
            return;
          }
          pendingCompletionRef.current.delete(requestToken);
          complete();
        }
      ),
    [cameraIntentArbiter]
  );

  React.useEffect(
    () => () => {
      pendingCompletionRef.current.clear();
    },
    []
  );

  React.useEffect(
    () => routeSceneMotionRuntime.registerCameraMotionTarget(target),
    [routeSceneMotionRuntime, target]
  );
};
