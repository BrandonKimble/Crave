import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import type { MapBounds } from '../../../types';
import {
  createOverlayRuntimeController,
  type OverlayRuntimeController,
} from '../runtime/controller/overlay-runtime-controller';
import {
  createRunOneHandoffCoordinator,
  type RunOneHandoffCoordinator,
} from '../runtime/controller/run-one-handoff-coordinator';
import {
  createSearchSessionController,
  type SearchSessionController,
} from '../runtime/controller/search-session-controller';
import {
  createCameraIntentArbiter,
  type CameraIntentArbiter,
} from '../runtime/map/camera-intent-arbiter';
import { createMapQueryBudget, type MapQueryBudget } from '../runtime/map/map-query-budget';
import type { SearchMapNativeCameraExecutor } from '../runtime/map/search-map-native-camera-executor';
import { createFrameBudgetGovernor } from '../runtime/scheduler/frame-budget-governor';
import {
  createPhaseBMaterializer,
  type PhaseBMaterializer,
} from '../runtime/scheduler/phase-b-materializer';
import { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import {
  createSearchRuntimeBus,
  type SearchRuntimeBus,
} from '../runtime/shared/search-runtime-bus';
import {
  createViewportBoundsService,
  type ViewportBoundsService,
} from '../runtime/viewport/viewport-bounds-service';

type MapCameraAnimation = {
  mode: 'none' | 'easeTo';
  durationMs: number;
  completionId: string | null;
};

type UseSearchRuntimeOwnerArgs = {
  startupPollBounds: MapBounds | null;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  searchMapNativeCameraExecutor: SearchMapNativeCameraExecutor;
  setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  setMapZoom: React.Dispatch<React.SetStateAction<number | null>>;
  setMapCameraAnimation: React.Dispatch<React.SetStateAction<MapCameraAnimation>>;
};

export type SearchRuntimeOwner = {
  mapQueryBudget: MapQueryBudget;
  viewportBoundsService: ViewportBoundsService;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  cameraIntentArbiter: CameraIntentArbiter;
  overlayRuntimeController: OverlayRuntimeController;
  searchSessionController: SearchSessionController;
  searchRuntimeBus: SearchRuntimeBus;
  runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};

export const useSearchRuntimeOwner = ({
  startupPollBounds,
  cameraRef,
  searchMapNativeCameraExecutor,
  setMapCenter,
  setMapZoom,
  setMapCameraAnimation,
}: UseSearchRuntimeOwnerArgs): SearchRuntimeOwner => {
  const mapQueryBudgetRef = React.useRef<MapQueryBudget | null>(null);
  if (!mapQueryBudgetRef.current) {
    mapQueryBudgetRef.current = createMapQueryBudget();
  }
  const mapQueryBudget = mapQueryBudgetRef.current;

  const viewportBoundsServiceRef = React.useRef<ViewportBoundsService | null>(null);
  if (!viewportBoundsServiceRef.current) {
    viewportBoundsServiceRef.current = createViewportBoundsService(startupPollBounds);
  }
  const viewportBoundsService = viewportBoundsServiceRef.current;
  const latestBoundsRef = viewportBoundsService.boundsRef;

  const cameraIntentArbiterRef = React.useRef<CameraIntentArbiter | null>(null);
  if (!cameraIntentArbiterRef.current) {
    cameraIntentArbiterRef.current = createCameraIntentArbiter({
      commandCameraViewport: ({
        center,
        zoom,
        animationMode,
        animationDurationMs,
        completionId,
      }) => {
        if (
          searchMapNativeCameraExecutor.executeCameraCommand({
            center,
            zoom,
            animationMode,
            animationDurationMs,
            animationCompletionId: completionId,
          })
        ) {
          return true;
        }
        const camera = cameraRef.current;
        if (typeof camera?.setCamera !== 'function') {
          return false;
        }
        camera.setCamera({
          type: 'CameraStop',
          centerCoordinate: center,
          zoomLevel: zoom,
          animationMode,
          animationDuration: animationDurationMs,
          animationCompletionId: completionId,
        });
        return true;
      },
      setMapCenter: (center: [number, number]) => {
        setMapCenter(center);
      },
      setMapZoom: (zoom: number) => {
        setMapZoom(zoom);
      },
      setMapCameraAnimation: (animation: MapCameraAnimation) => {
        setMapCameraAnimation(animation);
      },
    });
  }
  const cameraIntentArbiter = cameraIntentArbiterRef.current;

  const overlayRuntimeControllerRef = React.useRef<OverlayRuntimeController | null>(null);
  if (!overlayRuntimeControllerRef.current) {
    overlayRuntimeControllerRef.current = createOverlayRuntimeController();
  }
  const overlayRuntimeController = overlayRuntimeControllerRef.current;

  const searchSessionControllerRef = React.useRef<SearchSessionController | null>(null);
  if (!searchSessionControllerRef.current) {
    searchSessionControllerRef.current = createSearchSessionController();
  }
  const searchSessionController = searchSessionControllerRef.current;

  const searchRuntimeBusRef = React.useRef<SearchRuntimeBus | null>(null);
  if (!searchRuntimeBusRef.current) {
    searchRuntimeBusRef.current = createSearchRuntimeBus();
  }
  const searchRuntimeBus = searchRuntimeBusRef.current;

  const frameBudgetGovernorRef = React.useRef<ReturnType<typeof createFrameBudgetGovernor> | null>(
    null
  );
  if (!frameBudgetGovernorRef.current) {
    frameBudgetGovernorRef.current = createFrameBudgetGovernor();
  }

  const runtimeWorkSchedulerRef = React.useRef<RuntimeWorkScheduler | null>(null);
  if (!runtimeWorkSchedulerRef.current) {
    runtimeWorkSchedulerRef.current = new RuntimeWorkScheduler(frameBudgetGovernorRef.current);
  }

  const runOneHandoffCoordinatorRef = React.useRef<RunOneHandoffCoordinator | null>(null);
  if (!runOneHandoffCoordinatorRef.current) {
    runOneHandoffCoordinatorRef.current = createRunOneHandoffCoordinator();
  }

  const phaseBMaterializerRef = React.useRef<PhaseBMaterializer | null>(null);
  if (!phaseBMaterializerRef.current) {
    phaseBMaterializerRef.current = createPhaseBMaterializer(runtimeWorkSchedulerRef.current);
  }

  React.useEffect(() => {
    const coordinator = runOneHandoffCoordinatorRef.current;
    const runtimeBus = searchRuntimeBusRef.current;
    if (!coordinator || !runtimeBus) {
      return;
    }

    const publishDerivedState = () => {
      const snapshot = coordinator.getSnapshot();
      const phase = snapshot.phase;
      const operationId = snapshot.operationId;
      const isOperationInFlight = operationId != null;
      const isActive = phase !== 'idle';
      const commitSpanPressure = snapshot.metadata.commitSpanPressure === true;

      runtimeBus.batch(() => {
        runtimeBus.publish({
          runOneHandoffPhase: phase,
          runOneHandoffOperationId: operationId,
          isRun1HandoffActive: isActive,
          isRunOnePreflightFreezeActive: isOperationInFlight && phase === 'idle',
          isRunOneChromeFreezeActive: isActive && phase !== 'h4_chrome_resume',
          isChromeDeferred: phase === 'h2_marker_enter' || phase === 'h3_hydration_ramp',
          runOneCommitSpanPressureActive: isActive && commitSpanPressure,
          allowHydrationFinalizeCommit: !isOperationInFlight || phase === 'h4_chrome_resume',
          runOneSelectionFeedbackOperationId: isActive && operationId ? operationId : null,
        });
      });
    };

    publishDerivedState();
    return coordinator.subscribe(() => {
      publishDerivedState();
    });
  }, []);

  React.useEffect(
    () => () => {
      searchRuntimeBusRef.current?.reset();
      phaseBMaterializerRef.current?.resetHydrationCommit();
      runtimeWorkSchedulerRef.current?.stopFrameLoop();
      runtimeWorkSchedulerRef.current?.clear();
      runOneHandoffCoordinatorRef.current?.reset();
    },
    []
  );

  return React.useMemo(
    () => ({
      mapQueryBudget,
      viewportBoundsService,
      latestBoundsRef,
      cameraIntentArbiter,
      overlayRuntimeController,
      searchSessionController,
      searchRuntimeBus,
      runtimeWorkSchedulerRef:
        runtimeWorkSchedulerRef as React.MutableRefObject<RuntimeWorkScheduler>,
      runOneHandoffCoordinatorRef:
        runOneHandoffCoordinatorRef as React.MutableRefObject<RunOneHandoffCoordinator>,
      phaseBMaterializerRef: phaseBMaterializerRef as React.MutableRefObject<PhaseBMaterializer>,
    }),
    [
      cameraIntentArbiter,
      latestBoundsRef,
      mapQueryBudget,
      overlayRuntimeController,
      phaseBMaterializerRef,
      runOneHandoffCoordinatorRef,
      runtimeWorkSchedulerRef,
      searchRuntimeBus,
      searchSessionController,
      viewportBoundsService,
    ]
  );
};
