import type { Feature, Point } from 'geojson';

import type { MapBounds } from '../../../types';

type MarkerLikeProperties = {
  restaurantId: string;
  rank: number;
  lodZ?: number;
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
  buildMarkerKey: (feature: MarkerFeature<TProps>) => string;
  maxPins: number;
  visibleCandidateBuffer: number;
  stableMs: number;
  offscreenStableMs: number;
  nowMs: number;
  proposedPromoteSinceByMarkerKey: Map<string, number>;
  proposedDemoteSinceByMarkerKey: Map<string, number>;
};

type BuildMarkerRenderModelResult<TProps extends MarkerLikeProperties> = {
  nextPinnedMarkers: Array<MarkerFeature<TProps>>;
  nextPinnedMeta: MarkerRenderMeta[];
  nextPinnedKey: string;
  nextProposedPromoteSinceByMarkerKey: Map<string, number>;
  nextProposedDemoteSinceByMarkerKey: Map<string, number>;
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

const collectSelectedEntries = <TProps extends MarkerLikeProperties>(
  selectedRestaurantCandidates: Array<MarkerFeature<TProps>>,
  selectedRestaurantId: string | null,
  buildMarkerKey: (feature: MarkerFeature<TProps>) => string,
  maxPins: number
): Array<MarkerFeature<TProps>> => {
  if (!selectedRestaurantId) {
    return [];
  }
  const seenKeys = new Set<string>();
  const selectedEntries: Array<MarkerFeature<TProps>> = [];

  for (const feature of selectedRestaurantCandidates) {
    if (feature.properties.restaurantId !== selectedRestaurantId) {
      continue;
    }
    const markerKey = buildMarkerKey(feature);
    if (seenKeys.has(markerKey)) {
      continue;
    }
    seenKeys.add(markerKey);
    selectedEntries.push(feature);
    if (selectedEntries.length >= maxPins) {
      break;
    }
  }

  return selectedEntries;
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
    buildMarkerKey,
    maxPins,
    visibleCandidateBuffer,
    stableMs,
    offscreenStableMs,
    nowMs,
    proposedPromoteSinceByMarkerKey,
    proposedDemoteSinceByMarkerKey,
  } = args;
  const selectedEntries = collectSelectedEntries(
    selectedRestaurantCandidates,
    selectedRestaurantId,
    buildMarkerKey,
    maxPins
  );
  const visibleRankedCandidates: Array<MarkerFeature<TProps>> = [];
  const scanBudget = maxPins + visibleCandidateBuffer;

  for (const feature of rankedCandidates) {
    if (selectedRestaurantId && feature.properties.restaurantId === selectedRestaurantId) {
      continue;
    }
    if (!isVisibleInBounds(feature, bounds)) {
      continue;
    }
    if (visibleRankedCandidates.length < scanBudget) {
      visibleRankedCandidates.push(feature);
    }
    if (!selectedRestaurantId && visibleRankedCandidates.length >= scanBudget) {
      break;
    }
  }

  const remainingBudget = Math.max(0, maxPins - selectedEntries.length);
  const desiredOthers = visibleRankedCandidates.slice(0, remainingBudget);
  const desiredOthersKeySet = new Set(desiredOthers.map((feature) => buildMarkerKey(feature)));

  const currentPinned = currentPinnedMarkers.filter((feature) =>
    selectedRestaurantId ? feature.properties.restaurantId !== selectedRestaurantId : true
  );
  const currentPinnedByKey = new Map<string, MarkerFeature<TProps>>();
  for (const feature of currentPinned) {
    currentPinnedByKey.set(buildMarkerKey(feature), feature);
  }
  const currentPinnedKeySet = new Set(currentPinnedByKey.keys());

  const nextProposedPromoteSinceByMarkerKey = new Map(proposedPromoteSinceByMarkerKey);
  const nextProposedDemoteSinceByMarkerKey = new Map(proposedDemoteSinceByMarkerKey);

  for (const key of desiredOthersKeySet) {
    if (currentPinnedKeySet.has(key)) {
      nextProposedPromoteSinceByMarkerKey.delete(key);
      continue;
    }
    if (!nextProposedPromoteSinceByMarkerKey.has(key)) {
      nextProposedPromoteSinceByMarkerKey.set(key, nowMs);
    }
  }
  for (const key of Array.from(nextProposedPromoteSinceByMarkerKey.keys())) {
    if (!desiredOthersKeySet.has(key)) {
      nextProposedPromoteSinceByMarkerKey.delete(key);
    }
  }

  for (const key of currentPinnedKeySet) {
    if (desiredOthersKeySet.has(key)) {
      nextProposedDemoteSinceByMarkerKey.delete(key);
      continue;
    }
    if (!nextProposedDemoteSinceByMarkerKey.has(key)) {
      nextProposedDemoteSinceByMarkerKey.set(key, nowMs);
    }
  }
  for (const key of Array.from(nextProposedDemoteSinceByMarkerKey.keys())) {
    if (!currentPinnedKeySet.has(key)) {
      nextProposedDemoteSinceByMarkerKey.delete(key);
    }
  }

  const rankByMarkerKey = new Map<string, number>();
  for (const feature of desiredOthers) {
    rankByMarkerKey.set(buildMarkerKey(feature), feature.properties.rank);
  }
  for (const [markerKey, feature] of currentPinnedByKey) {
    if (!rankByMarkerKey.has(markerKey)) {
      rankByMarkerKey.set(markerKey, feature.properties.rank);
    }
  }
  const resolveRankForKey = (markerKey: string): number =>
    rankByMarkerKey.get(markerKey) ?? Number.POSITIVE_INFINITY;

  const readyToPromote = Array.from(nextProposedPromoteSinceByMarkerKey.entries())
    .filter(([, sinceAt]) => nowMs - sinceAt >= stableMs)
    .map(([markerKey]) => markerKey)
    .sort((left, right) => {
      const rankDiff = resolveRankForKey(left) - resolveRankForKey(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.localeCompare(right);
    });

  const readyToDemote = Array.from(nextProposedDemoteSinceByMarkerKey.entries())
    .filter(([markerKey, sinceAt]) => {
      const feature = currentPinnedByKey.get(markerKey);
      const effectiveStableMs =
        feature && !isVisibleInBounds(feature, bounds) ? offscreenStableMs : stableMs;
      return nowMs - sinceAt >= effectiveStableMs;
    })
    .map(([markerKey]) => markerKey)
    .sort((left, right) => {
      const rankDiff = resolveRankForKey(right) - resolveRankForKey(left);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return right.localeCompare(left);
    });

  const nextPinnedKeySet = new Set(currentPinnedKeySet);
  const swapCount = Math.min(readyToPromote.length, readyToDemote.length);
  for (let index = 0; index < swapCount; index += 1) {
    const promoteKey = readyToPromote[index];
    const demoteKey = readyToDemote[index];
    nextPinnedKeySet.delete(demoteKey);
    nextPinnedKeySet.add(promoteKey);
    nextProposedPromoteSinceByMarkerKey.delete(promoteKey);
    nextProposedDemoteSinceByMarkerKey.delete(demoteKey);
  }

  if (nextPinnedKeySet.size < remainingBudget) {
    for (const promoteKey of readyToPromote.slice(swapCount)) {
      if (nextPinnedKeySet.size >= remainingBudget) {
        break;
      }
      nextPinnedKeySet.add(promoteKey);
      nextProposedPromoteSinceByMarkerKey.delete(promoteKey);
    }
  }
  if (nextPinnedKeySet.size > remainingBudget) {
    const overflow = nextPinnedKeySet.size - remainingBudget;
    const demoteCandidates = Array.from(nextPinnedKeySet).sort((left, right) => {
      const rankDiff = resolveRankForKey(right) - resolveRankForKey(left);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return right.localeCompare(left);
    });
    for (let index = 0; index < overflow; index += 1) {
      const demoteKey = demoteCandidates[index];
      nextPinnedKeySet.delete(demoteKey);
      nextProposedDemoteSinceByMarkerKey.delete(demoteKey);
    }
  }

  const nextOthersInOrder: Array<MarkerFeature<TProps>> = [];
  const usedKeys = new Set<string>();
  for (const feature of visibleRankedCandidates) {
    const markerKey = buildMarkerKey(feature);
    if (!nextPinnedKeySet.has(markerKey) || usedKeys.has(markerKey)) {
      continue;
    }
    nextOthersInOrder.push(feature);
    usedKeys.add(markerKey);
    if (nextOthersInOrder.length >= remainingBudget) {
      break;
    }
  }
  if (nextOthersInOrder.length < remainingBudget) {
    for (const [markerKey, feature] of currentPinnedByKey) {
      if (!nextPinnedKeySet.has(markerKey) || usedKeys.has(markerKey)) {
        continue;
      }
      nextOthersInOrder.push(feature);
      usedKeys.add(markerKey);
      if (nextOthersInOrder.length >= remainingBudget) {
        break;
      }
    }
  }

  const nextPinnedMarkers = [...selectedEntries, ...nextOthersInOrder];

  const zSorted = [...nextPinnedMarkers].sort((left, right) => {
    const rankDiff = left.properties.rank - right.properties.rank;
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return buildMarkerKey(left).localeCompare(buildMarkerKey(right));
  });
  const zByMarkerKey = new Map<string, number>();
  zSorted.forEach((feature, index) => {
    const slot = maxPins - 1 - index;
    zByMarkerKey.set(buildMarkerKey(feature), slot);
  });
  const nextPinnedMarkersWithZ = nextPinnedMarkers.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      lodZ: zByMarkerKey.get(buildMarkerKey(feature)) ?? 0,
    },
  }));

  const nextPinnedKey = nextPinnedMarkersWithZ.map((feature) => buildMarkerKey(feature)).join('|');
  const nextPinnedMeta = nextPinnedMarkersWithZ.map((feature) => ({
    markerKey: buildMarkerKey(feature),
    lodZ: feature.properties.lodZ ?? 0,
  }));

  return {
    nextPinnedMarkers: nextPinnedMarkersWithZ,
    nextPinnedMeta,
    nextPinnedKey,
    nextProposedPromoteSinceByMarkerKey,
    nextProposedDemoteSinceByMarkerKey,
  };
};
