import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import {
  createCameraIntentArbiter,
  type CameraIntentArbiter,
} from '../runtime/map/camera-intent-arbiter';
import { registerCameraHostAvailabilityNotifier } from '../runtime/map/search-map-camera-host-availability';
import { logCameraCommitPath } from '../../../navigation/runtime/pageswitch-debug-flag';
import { recordLogBreadcrumb } from '../../../observability/crash-reporting';
import type { CameraSnapshot } from '../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ViewportCameraState } from '../runtime/viewport/viewport-bounds-service';

type MapCameraAnimation = {
  mode: 'none' | 'easeTo';
  durationMs: number;
  completionId: string | null;
};

type UseSearchRuntimeCameraIntentRuntimeArgs = {
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  getObservedCamera: () => ViewportCameraState | null;
  setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  setMapZoom: React.Dispatch<React.SetStateAction<number | null>>;
  setMapBearing: React.Dispatch<React.SetStateAction<number | null>>;
  setMapPitch: React.Dispatch<React.SetStateAction<number | null>>;
  setMapCameraAnimation: React.Dispatch<React.SetStateAction<MapCameraAnimation>>;
};

export type SearchRuntimeCameraIntentRuntime = {
  cameraIntentArbiter: CameraIntentArbiter;
};

export const useSearchRuntimeCameraIntentRuntime = ({
  cameraRef,
  getObservedCamera,
  setMapCenter,
  setMapZoom,
  setMapBearing,
  setMapPitch,
  setMapCameraAnimation,
}: UseSearchRuntimeCameraIntentRuntimeArgs): SearchRuntimeCameraIntentRuntime => {
  const cameraIntentArbiterRef = React.useRef<CameraIntentArbiter | null>(null);
  const latestCameraRef = React.useRef(cameraRef);
  const latestGetObservedCameraRef = React.useRef(getObservedCamera);
  latestCameraRef.current = cameraRef;
  latestGetObservedCameraRef.current = getObservedCamera;

  const executeCameraRefCommand = React.useCallback(
    ({
      center,
      zoom,
      bearing,
      pitch,
      padding,
      animationMode,
      animationDurationMs,
      completionId,
    }: {
      center: [number, number];
      zoom: number;
      bearing?: number | null;
      pitch?: number | null;
      padding?: CameraSnapshot['padding'];
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      completionId: string | null;
    }): boolean => {
      const camera = latestCameraRef.current.current;
      if (typeof camera?.setCamera !== 'function') {
        return false;
      }
      camera.setCamera({
        type: 'CameraStop',
        centerCoordinate: center,
        zoomLevel: zoom,
        heading: bearing ?? undefined,
        pitch: pitch ?? undefined,
        padding: padding ?? undefined,
        animationMode,
        animationDuration: animationDurationMs,
        animationCompletionId: completionId,
      });
      return true;
    },
    []
  );

  if (!cameraIntentArbiterRef.current) {
    cameraIntentArbiterRef.current = createCameraIntentArbiter(
      {
        // D61 — cameraRef.setCamera is the ONLY writer. The old native host-registry
        // fallback (fire-and-forget promise whose reject dropped the intent and whose
        // resolve could mean "parked, never applied") is DELETED; a hostless window now
        // returns false and the arbiter parks the intent until the camera remounts
        // (registerCameraHostAvailabilityNotifier below) or a newer intent supersedes it.
        commandCameraViewport: ({
          center,
          zoom,
          bearing,
          pitch,
          padding,
          animationMode,
          animationDurationMs,
          completionId,
        }) => {
          if (
            executeCameraRefCommand({
              center,
              zoom,
              bearing,
              pitch,
              padding,
              animationMode,
              animationDurationMs,
              completionId,
            })
          ) {
            // F1716 attribution probe: WHICH leg carried a [CAMCOMMIT]. The commit log
            // alone cannot distinguish a landed ref command from a parked one.
            logCameraCommitPath('ref');
            return true;
          }
          return false;
        },
        setMapCenter: (center: [number, number]) => {
          setMapCenter((previous) =>
            previous && previous[0] === center[0] && previous[1] === center[1] ? previous : center
          );
        },
        setMapZoom: (zoom: number) => {
          setMapZoom((previous) => (previous === zoom ? previous : zoom));
        },
        setMapBearing: (bearing: number | null) => {
          setMapBearing((previous) => (previous === bearing ? previous : bearing));
        },
        setMapPitch: (pitch: number | null) => {
          setMapPitch((previous) => (previous === pitch ? previous : pitch));
        },
        setMapCameraAnimation: (animation: MapCameraAnimation) => {
          setMapCameraAnimation((previous) =>
            previous.mode === animation.mode &&
            previous.durationMs === animation.durationMs &&
            previous.completionId === animation.completionId
              ? previous
              : animation
          );
        },
      },
      {
        // D61 watchdog oracle — the OBSERVED composite camera. Read through a latest-ref so
        // the arbiter (created once) always consults the live service.
        getObservedCamera: () => latestGetObservedCameraRef.current(),
        logCommitPath: (leg, data) => {
          logCameraCommitPath(leg, data);
        },
        onWatchdogSurrender: (detail) => {
          // LOUD by design: a surrender means a committed animated intent neither
          // completed, nor landed on the composite, nor landed on one re-commit. The
          // __DEV__ bark is UNGATED (violation, not telemetry — FITALL precedent) and
          // prod records a breadcrumb through the crash-reporting seam.
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.error(
              `[CAMCOMMIT-path] surrendered: camera intent never landed ` +
                `(target=${JSON.stringify(detail.target)} observed=${JSON.stringify(detail.observed)})`
            );
          }
          recordLogBreadcrumb('error', 'camera watchdog surrender', detail);
        },
      }
    );
  }
  const cameraIntentArbiter = cameraIntentArbiterRef.current;

  // D61 — the park's wake-up call: when the map component (re)attaches its camera ref,
  // replay the parked intent. This hook lives in the ROOT runtime layer, where effects
  // fire (never in a scene body-spec hook — proven-dead effects there, CLAUDE.md law).
  React.useEffect(
    () =>
      registerCameraHostAvailabilityNotifier(() => {
        cameraIntentArbiter.notifyCameraWriterAvailable();
      }),
    [cameraIntentArbiter]
  );

  return React.useMemo(
    () => ({
      cameraIntentArbiter,
    }),
    [cameraIntentArbiter]
  );
};
