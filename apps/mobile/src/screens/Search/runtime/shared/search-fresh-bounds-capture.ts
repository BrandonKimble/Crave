// COMMIT-MOMENT FRESH-BOUNDS CAPTURE — the native-facing half of the writer surface,
// split from search-desired-state-writer so the writer (and everything importing it,
// including the resolver's model tests) stays free of react-native imports.

import { Dimensions } from 'react-native';

import { logger } from '../../../../utils';
import { captureCommittedBounds } from './search-desired-state-writer';
import type { SearchCommittedBounds } from './search-desired-state-contract';

type FreshBoundsMapRef = {
  current: {
    getVisibleBounds?: () => Promise<unknown>;
    getCoordinateFromView?: (point: [number, number]) => Promise<unknown>;
  } | null;
};

type FreshBoundsViewportService = Parameters<typeof captureCommittedBounds>[0] & {
  setBounds: (bounds: import('../../../../types').MapBounds) => void;
  captureSearchBaseline: (
    bounds: import('../../../../types').MapBounds,
    polygon: Array<[number, number]>
  ) => void;
};

const isLngLatPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number';

const boundsFromCornerPairs = (
  a: [number, number],
  b: [number, number]
): import('../../../../types').MapBounds => ({
  northEast: { lat: Math.max(a[1], b[1]), lng: Math.max(a[0], b[0]) },
  southWest: { lat: Math.min(a[1], b[1]), lng: Math.min(a[0], b[0]) },
});

const FRESH_POLYGON_CAPTURE_TIMEOUT_MS = 250;

/** Commit-moment adopt for triggers that must read the SETTLED camera off the native map
 *  (search-this-area, chip reruns after a pan/zoom): awaits the map's visible bounds +
 *  screen-accurate corner polygon, writes both into the viewport service, then returns the
 *  committed bounds. Every failure path falls back to the service's last-known bounds — a
 *  fresh capture is an accuracy upgrade, never a submit blocker (the hung-promise lesson
 *  from request preparation: getCoordinateFromView can hang on a cold map, so the polygon
 *  projection races a timeout). */
export const captureFreshCommittedBounds = async (env: {
  mapRef: FreshBoundsMapRef;
  viewportBoundsService: FreshBoundsViewportService;
}): Promise<SearchCommittedBounds | null> => {
  const map = env.mapRef.current;
  try {
    const visible = map?.getVisibleBounds ? await map.getVisibleBounds() : null;
    if (Array.isArray(visible) && isLngLatPair(visible[0]) && isLngLatPair(visible[1])) {
      env.viewportBoundsService.setBounds(boundsFromCornerPairs(visible[0], visible[1]));
      if (map?.getCoordinateFromView) {
        const { width, height } = Dimensions.get('window');
        if (width > 0 && height > 0) {
          const corners: Array<[number, number]> = [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height],
          ];
          const projection = Promise.all(
            corners.map((point) => map.getCoordinateFromView!(point).catch(() => null))
          );
          const positions = await Promise.race([
            projection,
            new Promise<null>((resolve) => {
              setTimeout(() => resolve(null), FRESH_POLYGON_CAPTURE_TIMEOUT_MS);
            }),
          ]);
          const polygon = (positions ?? []).filter(isLngLatPair);
          if (polygon.length >= 3) {
            const lngs = polygon.map(([lng]) => lng);
            const lats = polygon.map(([, lat]) => lat);
            env.viewportBoundsService.captureSearchBaseline(
              boundsFromCornerPairs(
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)]
              ),
              polygon
            );
          }
        }
      }
    }
  } catch (error) {
    logger.warn('[TUPLE] fresh bounds capture failed — adopting last-known viewport', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
  return captureCommittedBounds(env.viewportBoundsService);
};
