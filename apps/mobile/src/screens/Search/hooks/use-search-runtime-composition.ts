import React from 'react';
import {
  createSearchSessionController,
  type SearchSessionController,
} from '../runtime/controller/search-session-controller';
import {
  createOverlayRuntimeController,
  type OverlayRuntimeController,
} from '../runtime/controller/overlay-runtime-controller';
import {
  createRunOneHandoffCoordinator,
  type RunOneHandoffCoordinator,
} from '../runtime/controller/run-one-handoff-coordinator';
import {
  createCameraIntentArbiter,
  type CameraIntentArbiter,
} from '../runtime/map/camera-intent-arbiter';
import {
  createPhaseBMaterializer,
  type PhaseBMaterializer,
} from '../runtime/scheduler/phase-b-materializer';
import {
  createFrameBudgetGovernor,
  type FrameBudgetGovernor,
} from '../runtime/scheduler/frame-budget-governor';
import { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import {
  createViewportBoundsService,
  type ViewportBoundsService,
} from '../runtime/viewport/viewport-bounds-service';
import {
  createSearchRuntimeBus,
  type SearchRuntimeBus,
} from '../runtime/shared/search-runtime-bus';
import { useHandoffBusBridge } from '../runtime/shared/use-handoff-bus-bridge';

type UseSearchRuntimeCompositionArgs = {
  setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  setMapZoom: React.Dispatch<React.SetStateAction<number | null>>;
};

type UseSearchRuntimeCompositionResult = {
  viewportBoundsService: ViewportBoundsService;
  latestBoundsRef: ViewportBoundsService['boundsRef'];
  cameraIntentArbiter: CameraIntentArbiter;
  overlayRuntimeController: OverlayRuntimeController;
  searchSessionController: SearchSessionController;
  searchRuntimeBus: SearchRuntimeBus;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};

export const useSearchRuntimeComposition = ({
  setMapCenter,
  setMapZoom,
}: UseSearchRuntimeCompositionArgs): UseSearchRuntimeCompositionResult => {
  const viewportBoundsServiceRef = React.useRef<ViewportBoundsService | null>(null);
  if (!viewportBoundsServiceRef.current) {
    viewportBoundsServiceRef.current = createViewportBoundsService();
  }
  const viewportBoundsService = viewportBoundsServiceRef.current;

  const cameraIntentArbiterRef = React.useRef<CameraIntentArbiter | null>(null);
  if (!cameraIntentArbiterRef.current) {
    cameraIntentArbiterRef.current = createCameraIntentArbiter({
      setMapCenter: (center: [number, number]) => {
        setMapCenter(center);
      },
      setMapZoom: (zoom: number) => {
        setMapZoom(zoom);
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

  const frameBudgetGovernorRef = React.useRef<FrameBudgetGovernor | null>(null);
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

  // Bridge handoff coordinator phase transitions directly to the bus,
  // so children can read handoff-derived state via bus selectors instead
  // of receiving it through SearchScreen props (eliminates re-render cascade).
  useHandoffBusBridge(
    runOneHandoffCoordinatorRef as React.MutableRefObject<RunOneHandoffCoordinator>,
    searchRuntimeBus
  );

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

  return {
    viewportBoundsService,
    latestBoundsRef: viewportBoundsService.boundsRef,
    cameraIntentArbiter,
    overlayRuntimeController,
    searchSessionController,
    searchRuntimeBus,
    runOneHandoffCoordinatorRef:
      runOneHandoffCoordinatorRef as React.MutableRefObject<RunOneHandoffCoordinator>,
    runtimeWorkSchedulerRef:
      runtimeWorkSchedulerRef as React.MutableRefObject<RuntimeWorkScheduler>,
    phaseBMaterializerRef: phaseBMaterializerRef as React.MutableRefObject<PhaseBMaterializer>,
  };
};
