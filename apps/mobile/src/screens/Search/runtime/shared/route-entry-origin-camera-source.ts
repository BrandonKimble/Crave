import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

/**
 * D56 — WHERE IS THE USER, as they perceive it, at the instant a flow is triggered.
 *
 * Pure so the ruling is testable without a map: the observed viewport is the answer while the
 * map is settled, and the ARBITER'S COMMITTED TARGET is the answer while a programmatic move is
 * in flight. A fly-to's intermediate frames are not a place the user chose — returning them
 * there would be returning them somewhere they never were. (D56 red-team objection (a).)
 *
 * NOT sourced from `lastCameraStateRef`: that tracker only updates on map IDLE and is skipped
 * while busy, so it is stale for exactly the in-flight case this function has to be right about
 * — the cd59e8a2 bug class (F1507).
 */
export const resolveRouteEntryOriginCamera = ({
  inFlightCameraTarget,
  liveViewportCamera,
  livePadding,
}: {
  inFlightCameraTarget: {
    center: [number, number];
    zoom: number;
    padding: CameraSnapshot['padding'];
  } | null;
  liveViewportCamera: { center: [number, number]; zoom: number } | null;
  livePadding: CameraSnapshot['padding'];
}): { camera: CameraSnapshot | null; source: 'arbiterTarget' | 'viewport' | 'none' } => {
  if (inFlightCameraTarget != null) {
    return {
      source: 'arbiterTarget',
      camera: {
        center: [inFlightCameraTarget.center[0], inFlightCameraTarget.center[1]],
        zoom: inFlightCameraTarget.zoom,
        padding: inFlightCameraTarget.padding ? { ...inFlightCameraTarget.padding } : null,
      },
    };
  }
  if (liveViewportCamera == null) {
    // No viewport event has ever landed (cold boot, map not mounted). `null` is the honest
    // answer — the restore then does nothing rather than flying somewhere invented.
    return { source: 'none', camera: null };
  }
  return {
    source: 'viewport',
    camera: {
      center: [liveViewportCamera.center[0], liveViewportCamera.center[1]],
      zoom: liveViewportCamera.zoom,
      padding: livePadding ? { ...livePadding } : null,
    },
  };
};
