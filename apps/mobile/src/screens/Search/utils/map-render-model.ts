import type { Feature, Point } from 'geojson';

import type { MapBounds } from '../../../types';

import { padMapBounds } from './marker-lod';

// Generous pad on the viewport used for promotion membership. It absorbs (a)
// rotation slop, since the axis-aligned bounds reported for a twisted camera
// does not match the visible rectangle, and (b) the lag between the JS bounds
// snapshot and the live camera during an active gesture. Markers in this ring
// stay eligible to remain promoted instead of flickering out at the edge.
export const MARKER_RETENTION_BOUNDS_PAD_RATIO = 0.35;

type MarkerLikeProperties = {
  restaurantId: string;
  rank: number;
  lodZ?: number;
  nativeLodZ?: number;
};

export type MarkerFeature<TProps extends MarkerLikeProperties = MarkerLikeProperties> = Feature<
  Point,
  TProps
>;

export type MarkerRenderMeta = {
  markerKey: string;
  lodZ: number;
};

type BuildMarkerRenderModelArgs<TProps extends MarkerLikeProperties> = {
  bounds: MapBounds;
  rankedCandidates: Array<MarkerFeature<TProps>>;
  selectedRestaurantCandidates: Array<MarkerFeature<TProps>>;
  currentPinnedMarkers: Array<MarkerFeature<TProps>>;
  selectedRestaurantId: string | null;
  selectedPriorityCoordinate: { lng: number; lat: number } | null;
  buildMarkerKey: (feature: MarkerFeature<TProps>) => string;
  buildVisualIdentityKey: (feature: MarkerFeature<TProps>) => string;
  maxPins: number;
  // Stage B (B3): the native screen-space projector's on-screen marker-key set
  // for the live camera. When present it replaces the padded lat/lng AABB
  // visibility test — it is accurate under twist/pitch, which an axis-aligned
  // box cannot be. Null/absent only before the first native projection arrives
  // (initial frame / pre-attach), where the padded-AABB fallback positions the set.
  nativeVisibleMarkerKeys?: ReadonlySet<string> | null;
  // When false, the on-screen visibility gate is skipped entirely: the top `maxPins`
  // candidates by rank are promoted regardless of whether they're in the current
  // viewport. Used for the OUT-OF-OVERLAP-REGION pin budget — world-wide top-rated
  // pins should exist (tile-culled off-screen, appearing as you pan) rather than only
  // when on screen. Defaults to true (the in-region / viewport-gated behavior).
  requireVisibility?: boolean;
};

type BuildMarkerRenderModelResult<TProps extends MarkerLikeProperties> = {
  nextPinnedMarkers: Array<MarkerFeature<TProps>>;
  nextPinnedMeta: MarkerRenderMeta[];
  nextPinnedKey: string;
};

const isVisibleInBounds = <TProps extends MarkerLikeProperties>(
  feature: MarkerFeature<TProps>,
  bounds: MapBounds
) => {
  const coordinate = feature.geometry.coordinates as [number, number];
  const lng = coordinate[0];
  const lat = coordinate[1];
  return (
    lat >= bounds.southWest.lat &&
    lat <= bounds.northEast.lat &&
    lng >= bounds.southWest.lng &&
    lng <= bounds.northEast.lng
  );
};

const resolveCoordinateDistanceSquared = <TProps extends MarkerLikeProperties>(
  feature: MarkerFeature<TProps>,
  coordinate: { lng: number; lat: number }
): number => {
  const [lng, lat] = feature.geometry.coordinates as [number, number];
  const lngDelta = lng - coordinate.lng;
  const latDelta = lat - coordinate.lat;
  return lngDelta * lngDelta + latDelta * latDelta;
};

const collectSelectedEntries = <TProps extends MarkerLikeProperties>(
  selectedRestaurantCandidates: Array<MarkerFeature<TProps>>,
  selectedRestaurantId: string | null,
  selectedPriorityCoordinate: { lng: number; lat: number } | null,
  currentPinnedMarkers: Array<MarkerFeature<TProps>>,
  buildMarkerKey: (feature: MarkerFeature<TProps>) => string,
  buildVisualIdentityKey: (feature: MarkerFeature<TProps>) => string,
  maxSelectedPins: number
): Array<MarkerFeature<TProps>> => {
  if (!selectedRestaurantId) {
    return [];
  }
  const currentPinnedVisualOrder = new Map<string, number>();
  currentPinnedMarkers.forEach((feature, index) => {
    if (feature.properties.restaurantId !== selectedRestaurantId) {
      return;
    }
    const visualIdentityKey = buildVisualIdentityKey(feature);
    if (!currentPinnedVisualOrder.has(visualIdentityKey)) {
      currentPinnedVisualOrder.set(visualIdentityKey, index);
    }
  });
  const orderedCandidates = selectedRestaurantCandidates
    .filter((feature) => feature.properties.restaurantId === selectedRestaurantId)
    .map((feature, order) => {
      const visualIdentityKey = buildVisualIdentityKey(feature);
      return {
        feature,
        order,
        pinnedOrder: currentPinnedVisualOrder.get(visualIdentityKey) ?? null,
        priorityDistance:
          selectedPriorityCoordinate != null
            ? resolveCoordinateDistanceSquared(feature, selectedPriorityCoordinate)
            : null,
      };
    })
    .sort((left, right) => {
      if (left.priorityDistance != null || right.priorityDistance != null) {
        if (left.priorityDistance == null) {
          return 1;
        }
        if (right.priorityDistance == null) {
          return -1;
        }
        const distanceDiff = left.priorityDistance - right.priorityDistance;
        if (Math.abs(distanceDiff) > Number.EPSILON) {
          return distanceDiff;
        }
      }
      if (left.pinnedOrder != null || right.pinnedOrder != null) {
        if (left.pinnedOrder == null) {
          return 1;
        }
        if (right.pinnedOrder == null) {
          return -1;
        }
        return left.pinnedOrder - right.pinnedOrder;
      }
      return left.order - right.order;
    });
  const seenKeys = new Set<string>();
  const seenVisualIdentityKeys = new Set<string>();
  const selectedEntries: Array<MarkerFeature<TProps>> = [];

  for (const { feature } of orderedCandidates) {
    const markerKey = buildMarkerKey(feature);
    const visualIdentityKey = buildVisualIdentityKey(feature);
    if (seenKeys.has(markerKey) || seenVisualIdentityKeys.has(visualIdentityKey)) {
      continue;
    }
    seenKeys.add(markerKey);
    seenVisualIdentityKeys.add(visualIdentityKey);
    selectedEntries.push(feature);
    if (selectedEntries.length >= maxSelectedPins) {
      break;
    }
  }

  return selectedEntries;
};

const buildStableSlotMap = <TProps extends MarkerLikeProperties>({
  nextPinnedMarkers,
  currentPinnedMarkers,
  buildMarkerKey,
  maxPins,
}: {
  nextPinnedMarkers: Array<MarkerFeature<TProps>>;
  currentPinnedMarkers: Array<MarkerFeature<TProps>>;
  buildMarkerKey: (feature: MarkerFeature<TProps>) => string;
  maxPins: number;
}): Map<string, number> => {
  const slotCapacity = Math.max(maxPins, nextPinnedMarkers.length);
  const usedSlots = new Set<number>();
  const nextLodZByMarkerKey = new Map<string, number>();

  const nextMarkerKeySet = new Set(nextPinnedMarkers.map((feature) => buildMarkerKey(feature)));
  for (const feature of currentPinnedMarkers) {
    const markerKey = buildMarkerKey(feature);
    if (!nextMarkerKeySet.has(markerKey) || nextLodZByMarkerKey.has(markerKey)) {
      continue;
    }
    const previousSlot = feature.properties.nativeLodZ ?? feature.properties.lodZ;
    if (
      previousSlot == null ||
      !Number.isInteger(previousSlot) ||
      previousSlot < 0 ||
      previousSlot >= slotCapacity ||
      usedSlots.has(previousSlot)
    ) {
      continue;
    }
    nextLodZByMarkerKey.set(markerKey, previousSlot);
    usedSlots.add(previousSlot);
  }

  const freeSlots = Array.from({ length: slotCapacity }, (_, index) => index).filter(
    (slot) => !usedSlots.has(slot)
  );

  for (const feature of nextPinnedMarkers) {
    const markerKey = buildMarkerKey(feature);
    if (nextLodZByMarkerKey.has(markerKey)) {
      continue;
    }
    const slot = freeSlots.shift();
    if (slot == null) {
      break;
    }
    nextLodZByMarkerKey.set(markerKey, slot);
  }

  return nextLodZByMarkerKey;
};

export const buildMarkerRenderModel = <TProps extends MarkerLikeProperties>(
  args: BuildMarkerRenderModelArgs<TProps>
): BuildMarkerRenderModelResult<TProps> => {
  const {
    bounds,
    rankedCandidates,
    selectedRestaurantCandidates,
    currentPinnedMarkers,
    selectedRestaurantId,
    selectedPriorityCoordinate,
    buildMarkerKey,
    buildVisualIdentityKey,
    maxPins,
    nativeVisibleMarkerKeys,
    requireVisibility = true,
  } = args;
  const selectedEntries = collectSelectedEntries(
    selectedRestaurantCandidates,
    selectedRestaurantId,
    selectedPriorityCoordinate,
    currentPinnedMarkers,
    buildMarkerKey,
    buildVisualIdentityKey,
    selectedRestaurantCandidates.length
  );
  const selectedVisualIdentityKeySet = new Set(
    selectedEntries.map((feature) => buildVisualIdentityKey(feature))
  );
  const remainingBudget = Math.max(0, maxPins);
  // Stable membership policy. A marker that is currently promoted and still
  // within the (padded) viewport is retained in the candidate pool, so a
  // transient or rotated viewport query that fails to return it cannot demote
  // it. New candidates only displace a retained pin under genuine rank
  // contention (when more than `maxPins` markers are in view). This is what
  // prevents the whole promoted set from collapsing during pan/twist while the
  // results are unchanged — the defect was recomputing membership from scratch
  // each frame against an instantaneous query with no retention.
  const retentionBounds = padMapBounds(bounds, MARKER_RETENTION_BOUNDS_PAD_RATIO);
  // Screen-space visibility (native projection) is authoritative when available;
  // it is the only test that is correct under twist/pitch. The padded lat/lng box
  // is the bootstrap fallback for the first frame before the projector reports.
  const isVisible = (feature: MarkerFeature<TProps>): boolean => {
    if (!requireVisibility) {
      return true; // out-of-region budget: promote top-N by rank regardless of viewport.
    }
    return nativeVisibleMarkerKeys != null
      ? nativeVisibleMarkerKeys.has(buildMarkerKey(feature))
      : isVisibleInBounds(feature, retentionBounds);
  };
  const byRank = (left: MarkerFeature<TProps>, right: MarkerFeature<TProps>): number => {
    const rankDiff =
      (left.properties.rank ?? Number.POSITIVE_INFINITY) -
      (right.properties.rank ?? Number.POSITIVE_INFINITY);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return buildMarkerKey(left).localeCompare(buildMarkerKey(right));
  };
  const seenVisualIdentityKeys = new Set<string>();
  // A currently-promoted pin is retained regardless of the bounds test: we do
  // NOT demote a pin merely because the (axis-aligned, gesture-lagged) viewport
  // query failed to return it. In-view markers take slot priority; off-view
  // retained pins fill leftover slots, so a pin only demotes when an in-view
  // marker genuinely needs its slot (real contention). This is what stops the
  // promoted set from collapsing on pan/twist when the results are unchanged.
  const retainedInView: Array<MarkerFeature<TProps>> = [];
  const retainedOffView: Array<MarkerFeature<TProps>> = [];
  for (const feature of currentPinnedMarkers) {
    const visualIdentityKey = buildVisualIdentityKey(feature);
    if (
      selectedVisualIdentityKeySet.has(visualIdentityKey) ||
      seenVisualIdentityKeys.has(visualIdentityKey)
    ) {
      continue;
    }
    seenVisualIdentityKeys.add(visualIdentityKey);
    if (isVisible(feature)) {
      retainedInView.push(feature);
    } else {
      retainedOffView.push(feature);
    }
  }
  const freshInView: Array<MarkerFeature<TProps>> = [];
  for (const feature of rankedCandidates) {
    const visualIdentityKey = buildVisualIdentityKey(feature);
    if (
      selectedVisualIdentityKeySet.has(visualIdentityKey) ||
      seenVisualIdentityKeys.has(visualIdentityKey) ||
      !isVisible(feature)
    ) {
      continue;
    }
    seenVisualIdentityKeys.add(visualIdentityKey);
    freshInView.push(feature);
  }
  const inViewByRank = [...retainedInView, ...freshInView].sort(byRank);
  const offViewByRank = retainedOffView.sort(byRank);
  const desiredOthers = [...inViewByRank, ...offViewByRank].slice(0, remainingBudget);

  const nextPinnedMarkers: Array<MarkerFeature<TProps>> = [];
  const usedVisualIdentityKeys = new Set<string>();
  for (const feature of [...selectedEntries, ...desiredOthers]) {
    const visualIdentityKey = buildVisualIdentityKey(feature);
    if (usedVisualIdentityKeys.has(visualIdentityKey)) {
      continue;
    }
    usedVisualIdentityKeys.add(visualIdentityKey);
    nextPinnedMarkers.push(feature);
  }
  const zByMarkerKey = buildStableSlotMap({
    nextPinnedMarkers,
    currentPinnedMarkers,
    buildMarkerKey,
    maxPins,
  });
  const nextPinnedMarkersWithZ = nextPinnedMarkers.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      lodZ: zByMarkerKey.get(buildMarkerKey(feature)) ?? 0,
    },
  }));

  const nextPinnedMeta = nextPinnedMarkersWithZ.map((feature) => ({
    markerKey: buildMarkerKey(feature),
    lodZ: feature.properties.lodZ ?? 0,
  }));
  const nextPinnedKey = nextPinnedMeta
    .map(({ markerKey, lodZ }) => `${markerKey}:${lodZ}`)
    .join('|');

  return {
    nextPinnedMarkers: nextPinnedMarkersWithZ,
    nextPinnedMeta,
    nextPinnedKey,
  };
};
