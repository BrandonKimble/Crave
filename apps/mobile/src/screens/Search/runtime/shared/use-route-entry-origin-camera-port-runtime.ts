import React from 'react';

import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import { logCameraOriginDebug } from '../../../../navigation/runtime/pageswitch-debug-flag';
import { registerRouteEntryOriginCameraPort } from '../../../../navigation/runtime/route-entry-origin-camera-delegate';
import { resolveRouteEntryOriginCamera } from './route-entry-origin-camera-source';
import type { SearchRootCameraViewportRuntime } from './search-root-session-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';

/**
 * D56 — registers the CAMERA half of the route-entry origin seam (findings F1500-F1516).
 *
 * REPLACES `use-search-session-origin-camera-runtime` (deleted). That runtime kept ONE
 * module-local slot, keyed to `committedBounds` object identity — which is null BY DESIGN for
 * every list entry point (F1502), tracks the LATEST search rather than the flow TRIGGER
 * (F1504), restores only on a terminal idle so a pop to a surviving world restored nothing at
 * all (F1505), and re-read the whole search bus on EVERY publish to learn about two edges
 * (F1511). All four are properties of the slot, not bugs in it — so the slot is gone and the
 * camera rides the entry, like the detent and the scroll lanes.
 *
 * This hook owns no state. It answers two questions for the origin seam:
 *
 * READ (at push commit, before any motion — the same instant the sheet fields are taken):
 *   - a programmatic camera intent IN FLIGHT ⇒ the ARBITER'S COMMITTED TARGET wins. The user
 *     perceives the destination of a fly-to as "where I am"; capturing the intermediate frame
 *     would return them to a place they never chose. (D56 ruling on red-team objection (a).)
 *   - otherwise ⇒ `ViewportBoundsService.getCamera()`, the {center,zoom} riding the SAME native
 *     viewport event as the bounds. Explicitly NOT `lastCameraStateRef`, the idle-only tracker
 *     that lags programmatic moves — the cd59e8a2 bug class (F1507).
 *   - padding comes from the live shell (`mapCameraPadding` on the bus) so the captured shape is
 *     the RICHER padded one the profile ledger used to keep; band-centering survives the collapse.
 *
 * COMMIT (at pop restore): through `commitCameraViewport`, i.e. through the CameraIntentArbiter
 * — never a direct camera write. `allowDuringGesture` is true for the same reason the old
 * terminal restore set it: a dismiss is a deliberate return, and a stray finger on the map must
 * not silently swallow it.
 */
export const useRouteEntryOriginCameraPortRuntime = ({
  searchRuntimeBus,
  viewportBoundsService,
  cameraIntentArbiter,
  commitCameraViewport,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  viewportBoundsService: {
    getCamera: () => { center: [number, number]; zoom: number } | null;
  };
  cameraIntentArbiter: CameraIntentArbiter;
  commitCameraViewport: SearchRootCameraViewportRuntime['commitCameraViewport'];
}): void => {
  React.useEffect(() => {
    return registerRouteEntryOriginCameraPort({
      readOriginCamera: (): CameraSnapshot | null => {
        const { camera, source } = resolveRouteEntryOriginCamera({
          inFlightCameraTarget: cameraIntentArbiter.getInFlightCameraTarget(),
          liveViewportCamera: viewportBoundsService.getCamera(),
          livePadding: searchRuntimeBus.getState().profileShellState.mapCameraPadding,
        });
        logCameraOriginDebug('capture', {
          source,
          center: camera?.center ?? null,
          zoom: camera?.zoom ?? null,
          hasPadding: camera?.padding != null,
        });
        return camera;
      },
      commitOriginCamera: (camera: CameraSnapshot) => {
        commitCameraViewport(
          { center: camera.center, zoom: camera.zoom, padding: camera.padding },
          { allowDuringGesture: true }
        );
      },
    });
  }, [cameraIntentArbiter, commitCameraViewport, searchRuntimeBus, viewportBoundsService]);
};
