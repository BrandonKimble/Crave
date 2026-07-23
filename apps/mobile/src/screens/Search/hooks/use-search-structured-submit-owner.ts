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
  /** SEE-LOCATIONS mode: the world = this restaurant's in-viewport locations
   *  as pins (the "See locations" autocomplete chip's search). */
  seeLocations?: boolean;
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
            ...(params.seeLocations ? { seeLocations: true } : null),
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

  // Wave-4 §3 (favorites-as-search RESTORED): a list open IS a list-identity tuple
  // write — the reconciler classifies it (list identities derive preserveSheetState,
  // so the pushed listDetail child keeps the sheet; no results-scene takeover) and
  // the resolver fetches by listId (identity-fetched membership — the committed
  // bounds are only the camera's starting datum, NEVER a membership filter).
  const launchListSearchResults = React.useCallback(
    async (params: {
      listId: string;
      listType: FavoriteListType;
      displayTitle: string;
      /** The list owner when opened from ANOTHER user's surface — identity-relevant
       *  (scopes virtual-All unions / viewer-role resolution). */
      targetUserId?: string | null;
      /** RT-18 access material for shared reads (slug opens) — never identity. */
      shareSlug?: string | null;
      /** Strip 'world' flip: a re-slice carries the new slice; absent = initial enter
       *  (server defaults). Its presence flips the write cause to list_reslice, which
       *  the reconciler classifies as a variant_rerun (same identity, new filters). */
      slice?: {
        sort?: 'custom' | 'best' | 'recent';
        openNow?: boolean;
        priceLevels?: number[];
        cityPlaceId?: string | null;
      };
    }): Promise<void> => {
      const isReslice = params.slice != null;
      logSearchPhase('launchListSearchResults:start', { reset: !isReslice });
      // A re-slice keeps the user's map context (the world is bounds-independent; the
      // map re-slice is driven by membership, not a fresh viewport). Only a fresh enter
      // resets the move flag.
      if (!isReslice) {
        resetMapMoveFlag();
      }
      writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: {
            kind: 'list',
            listId: params.listId,
            listType: params.listType === 'dish' ? 'dish' : 'restaurant',
            displayTitle: params.displayTitle,
            targetUserId: params.targetUserId ?? null,
            shareSlug: params.shareSlug ?? null,
          },
          tab: params.listType === 'dish' ? 'dishes' : 'restaurants',
          filterVariant: {
            includeSimilar: false,
            openNow: params.slice?.openNow ?? false,
            priceLevels: params.slice?.priceLevels ?? [],
            rising: false,
            ...(params.slice?.sort != null ? { listSort: params.slice.sort } : {}),
            ...(params.slice?.cityPlaceId != null ? { cityPlaceId: params.slice.cityPlaceId } : {}),
          },
          // A list world is BOUNDS-INDEPENDENT (the fetch arm is "no LLM, no
          // bounds"; the camera derives from the members via fitAll). Carrying
          // the live viewport here only polluted the worldKey — the same list
          // opened from different viewports minted different worlds (junk
          // continental bboxes in the key, sim-proven 2026-07-13) and defeated
          // the world cache. null ⇒ boundsKey 'none', one world per list+filters.
          committedBounds: null,
        },
        isReslice ? 'list_reslice' : 'favorites_launch'
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

  return React.useMemo(
    () => ({
      runRestaurantEntitySearch,
      submitViewportShortcut,
      launchListSearchResults,
    }),
    [submitViewportShortcut, runRestaurantEntitySearch, launchListSearchResults]
  );
};
