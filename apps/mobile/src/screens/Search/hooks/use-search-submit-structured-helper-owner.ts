import React from 'react';

import type { MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { StructuredSearchRequest } from '../../../services/search';

export type ShortcutCoverageSnapshot = {
  bounds: MapBounds | null;
  entities: StructuredSearchRequest['entities'];
};

type RestaurantEntityStructuredRequestOptions = {
  restaurantId: string;
  restaurantName: string;
  submissionSource: NaturalSearchRequest['submissionSource'];
  typedPrefix?: string;
};

type UseSearchSubmitStructuredHelperOwnerArgs = {
  onShortcutSearchCoverageSnapshot?: (snapshot: {
    searchRequestId: string;
    bounds: MapBounds | null;
    entities: StructuredSearchRequest['entities'];
  }) => void;
};

export const useSearchSubmitStructuredHelperOwner = ({
  onShortcutSearchCoverageSnapshot,
}: UseSearchSubmitStructuredHelperOwnerArgs) => {
  const shortcutBoundsSnapshotRef = React.useRef<MapBounds | null>(null);
  const shortcutSearchRequestIdRef = React.useRef<string | null>(null);

  const primeShortcutStructuredRequest = React.useCallback(
    (payload: StructuredSearchRequest): ShortcutCoverageSnapshot => {
      shortcutSearchRequestIdRef.current = null;
      shortcutBoundsSnapshotRef.current = payload.bounds ?? null;
      return {
        bounds: payload.bounds ?? null,
        entities: payload.entities,
      };
    },
    []
  );

  const applyShortcutStructuredAppendRequestState = React.useCallback(
    (payload: StructuredSearchRequest) => {
      if (shortcutBoundsSnapshotRef.current) {
        payload.bounds = shortcutBoundsSnapshotRef.current;
      }
      if (shortcutSearchRequestIdRef.current) {
        payload.searchRequestId = shortcutSearchRequestIdRef.current;
      }
    },
    []
  );

  const publishShortcutCoverageForResponse = React.useCallback(
    (response: SearchResponse, coverageSnapshot: ShortcutCoverageSnapshot) => {
      const responseSearchRequestId = response.metadata?.searchRequestId ?? null;
      if (!responseSearchRequestId || !onShortcutSearchCoverageSnapshot) {
        return;
      }
      shortcutSearchRequestIdRef.current = responseSearchRequestId;
      onShortcutSearchCoverageSnapshot({
        searchRequestId: responseSearchRequestId,
        ...coverageSnapshot,
      });
    },
    [onShortcutSearchCoverageSnapshot]
  );

  const applyRestaurantEntityStructuredRequest = React.useCallback(
    (
      payload: StructuredSearchRequest,
      {
        restaurantId,
        restaurantName,
        submissionSource,
        typedPrefix,
      }: RestaurantEntityStructuredRequestOptions
    ): NaturalSearchRequest['submissionContext'] => {
      payload.entities = {
        restaurants: [
          {
            normalizedName: restaurantName,
            entityIds: [restaurantId],
            originalText: restaurantName,
          },
        ],
      };
      payload.sourceQuery = restaurantName;
      payload.submissionSource = submissionSource;
      const submissionContext = {
        typedPrefix: typedPrefix ?? restaurantName,
        matchType: 'entity',
        selectedEntityId: restaurantId,
        selectedEntityType: 'restaurant',
      };
      payload.submissionContext = submissionContext;
      return submissionContext;
    },
    []
  );

  return React.useMemo(
    () => ({
      primeShortcutStructuredRequest,
      applyShortcutStructuredAppendRequestState,
      publishShortcutCoverageForResponse,
      applyRestaurantEntityStructuredRequest,
    }),
    [
      applyRestaurantEntityStructuredRequest,
      applyShortcutStructuredAppendRequestState,
      primeShortcutStructuredRequest,
      publishShortcutCoverageForResponse,
    ]
  );
};
