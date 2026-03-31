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

const buildStableLodSlotMap = <TProps extends MarkerLikeProperties>({
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
  const nextMarkerKeySet = new Set(nextPinnedMarkers.map((feature) => buildMarkerKey(feature)));
  const nextLodZByMarkerKey = new Map<string, number>();
  const availableSlots = Array.from({ length: maxPins }, (_, index) => index);
  const claimedSlots = new Set<number>();

  currentPinnedMarkers.forEach((feature) => {
    const markerKey = buildMarkerKey(feature);
    if (!nextMarkerKeySet.has(markerKey)) {
      return;
    }
    const lodZ = feature.properties.lodZ;
    if (
      typeof lodZ !== 'number' ||
      !Number.isFinite(lodZ) ||
      lodZ < 0 ||
      lodZ >= maxPins ||
      claimedSlots.has(lodZ)
    ) {
      return;
    }
    nextLodZByMarkerKey.set(markerKey, lodZ);
    claimedSlots.add(lodZ);
  });

  const freeSlotsDescending = availableSlots
    .filter((slot) => !claimedSlots.has(slot))
    .sort((left, right) => right - left);
  const unassignedMarkers = nextPinnedMarkers
    .filter((feature) => !nextLodZByMarkerKey.has(buildMarkerKey(feature)))
    .sort((left, right) => {
      const rankDiff = left.properties.rank - right.properties.rank;
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return buildMarkerKey(left).localeCompare(buildMarkerKey(right));
    });

  unassignedMarkers.forEach((feature, index) => {
    const slot = freeSlotsDescending[index];
    if (slot == null) {
      return;
    }
    nextLodZByMarkerKey.set(buildMarkerKey(feature), slot);
  });

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
  const retentionBudget = Math.max(remainingBudget, remainingBudget + visibleCandidateBuffer);
  const retainedOthers = visibleRankedCandidates.slice(0, retentionBudget);
  const retainedOthersKeySet = new Set(retainedOthers.map((feature) => buildMarkerKey(feature)));

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
    if (retainedOthersKeySet.has(key)) {
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
  const visibleRankedCandidateByKey = new Map<string, MarkerFeature<TProps>>();
  for (const feature of desiredOthers) {
    const markerKey = buildMarkerKey(feature);
    rankByMarkerKey.set(markerKey, feature.properties.rank);
    visibleRankedCandidateByKey.set(markerKey, feature);
  }
  for (const feature of visibleRankedCandidates) {
    const markerKey = buildMarkerKey(feature);
    if (!visibleRankedCandidateByKey.has(markerKey)) {
      visibleRankedCandidateByKey.set(markerKey, feature);
    }
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
  for (const feature of currentPinnedMarkers) {
    const markerKey = buildMarkerKey(feature);
    if (!nextPinnedKeySet.has(markerKey) || usedKeys.has(markerKey)) {
      continue;
    }
    if (selectedRestaurantId && feature.properties.restaurantId === selectedRestaurantId) {
      continue;
    }
    nextOthersInOrder.push(visibleRankedCandidateByKey.get(markerKey) ?? feature);
    usedKeys.add(markerKey);
    if (nextOthersInOrder.length >= remainingBudget) {
      break;
    }
  }
  if (nextOthersInOrder.length < remainingBudget) {
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

  const zByMarkerKey = buildStableLodSlotMap({
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
