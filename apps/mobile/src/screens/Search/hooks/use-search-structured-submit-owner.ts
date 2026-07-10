import React from 'react';

import type { NaturalSearchRequest } from '../../../types';
import type { FavoriteListType } from '../../../services/favorite-lists';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import {
  captureCommittedBounds,
  writeSearchDesiredTuple,
} from '../runtime/shared/search-desired-state-writer';
import type { SearchCommittedBounds } from '../runtime/shared/search-desired-state-contract';
import type { SegmentValue } from '../constants/search';
// S-A (the great trigger deletion): the presentation flags left these params — the
// reconciler derives them from the tuple delta. searchThisArea survives as the one
// honest trigger fact (it selects the settled-camera bounds adopt + the writer cause).
type RunRestaurantEntitySearchParams = {
  restaurantId: string;
  restaurantName: string;
  submissionSource: NaturalSearchRequest['submissionSource'];
  typedPrefix?: string;
};

type RunBestHereOptions = {
  searchThisArea?: boolean;
  forceFreshBounds?: boolean;
};

type UseSearchStructuredSubmitOwnerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  viewportBoundsService: ViewportBoundsService;
  /** S3-pre commit-moment adopt: awaits the SETTLED native camera (bounds + polygon)
   *  before the tuple write, so the resolver reads bounds from the tuple only. */
  captureFreshTupleBounds: () => Promise<SearchCommittedBounds | null>;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
  resetMapMoveFlag: () => void;
};

export const useSearchStructuredSubmitOwner = ({
  searchRuntimeBus,
  viewportBoundsService,
  captureFreshTupleBounds,
  logSearchPhase = () => {},
  resetMapMoveFlag,
}: UseSearchStructuredSubmitOwnerArgs) => {
  const runRestaurantEntitySearch = React.useCallback(
    async (params: RunRestaurantEntitySearchParams) => {
      logSearchPhase('runRestaurantEntitySearch:start', { reset: true });
      const trimmedName = params.restaurantName.trim();
      if (!trimmedName) {
        return;
      }
      resetMapMoveFlag();
      // S3c: a restaurant tap IS an entity-identity tuple write + resolve (skip-LLM
      // structured lane routed by the fetch table).
      writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: {
            kind: 'entity',
            entityType: 'restaurant',
            entityId: params.restaurantId,
            displayName: trimmedName,
          },
          tab: 'restaurants',
          filterVariant: { includeSimilar: false },
          committedBounds: captureCommittedBounds(viewportBoundsService),
        },
        'entity_tap'
      );
    },
    [logSearchPhase, resetMapMoveFlag, searchRuntimeBus, viewportBoundsService]
  );

  const submitViewportShortcut = React.useCallback(
    async (targetTab: SegmentValue, submittedLabel: string, options: RunBestHereOptions) => {
      logSearchPhase('runBestHere:start', { reset: true });
      // S2: the trigger writes the DESIRED TUPLE first (identity + tab + adopted viewport);
      // the writer projects searchMode/submittedQuery/session in the same publish. The
      // submit machinery below still executes the resolution until S3's resolver.
      // S3-pre: STA (and any post-camera-move commit moment) awaits the SETTLED native
      // camera so the tuple's bounds are the request bounds — never a stale service read.
      const adoptedBounds =
        options?.searchThisArea || options?.forceFreshBounds
          ? await captureFreshTupleBounds()
          : captureCommittedBounds(viewportBoundsService);
      writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: {
            kind: 'shortcut',
            shortcutTab: targetTab === 'dishes' ? 'dishes' : 'restaurants',
          },
          tab: targetTab === 'dishes' ? 'dishes' : 'restaurants',
          filterVariant: { includeSimilar: false },
          committedBounds: adoptedBounds,
        },
        options?.searchThisArea ? 'search_this_area' : 'initial_submit'
      );
      if (!options?.searchThisArea) {
        resetMapMoveFlag();
      }
      // S4b: the submit IS the tuple write — the reconciler classifies the transition,
      // derives the presentation intent, and drives resolution.
    },
    [
      captureFreshTupleBounds,
      logSearchPhase,
      resetMapMoveFlag,
      searchRuntimeBus,
      viewportBoundsService,
    ]
  );

  const launchFavoritesListResults = React.useCallback(
    async (params: { listId: string; listType: FavoriteListType; submittedLabel: string }) => {
      logSearchPhase('launchFavorites:start', { reset: true });
      const targetTab: SegmentValue = params.listType === 'dish' ? 'dishes' : 'restaurants';
      resetMapMoveFlag();
      // S3c/S-D.2: favorites-as-search IS a list-identity tuple write + resolve. No
      // viewport adopt (committedBounds null — the results define the camera); the
      // fetch table routes listId to getListResults, the adopt rule honors the list
      // axis, and favorites suppress the single-restaurant collapse in the fetcher.
      writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: {
            kind: 'list',
            listId: params.listId,
            listType: params.listType,
            displayTitle: params.submittedLabel,
          },
          tab: targetTab === 'dishes' ? 'dishes' : 'restaurants',
          filterVariant: { includeSimilar: false },
          committedBounds: null,
        },
        'favorites_launch'
      );
    },
    [logSearchPhase, resetMapMoveFlag, searchRuntimeBus]
  );

  return React.useMemo(
    () => ({
      runRestaurantEntitySearch,
      submitViewportShortcut,
      launchFavoritesListResults,
    }),
    [launchFavoritesListResults, submitViewportShortcut, runRestaurantEntitySearch]
  );
};
