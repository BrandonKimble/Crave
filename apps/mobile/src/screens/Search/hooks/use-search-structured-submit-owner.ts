import React from 'react';

import type { NaturalSearchRequest } from '../../../types';
import type { FavoriteListType } from '../../../services/favorite-lists';
import { logger } from '../../../utils';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import {
  captureCommittedBounds,
  writeSearchDesiredTuple,
} from '../runtime/shared/search-desired-state-writer';
import type { SearchCommittedBounds } from '../runtime/shared/search-desired-state-contract';
import type { SegmentValue } from '../constants/search';
import type {
  SearchSubmitEntrySurface,
  SearchSubmitInPlaceRerunIntentKind,
  StructuredSearchFilters,
} from './use-search-submit-entry-owner';

type RunRestaurantEntitySearchParams = {
  restaurantId: string;
  restaurantName: string;
  submissionSource: NaturalSearchRequest['submissionSource'];
  typedPrefix?: string;
  preserveSheetState?: boolean;
  entrySurface: SearchSubmitEntrySurface;
};

type RunBestHereOptions = {
  preserveSheetState?: boolean;
  replaceResultsInPlace?: boolean;
  transitionFromDockedPolls?: boolean;
  filters?: StructuredSearchFilters;
  forceFreshBounds?: boolean;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  entrySurface: SearchSubmitEntrySurface;
};

type UseSearchStructuredSubmitOwnerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  viewportBoundsService: ViewportBoundsService;
  /** S3-pre commit-moment adopt: awaits the SETTLED native camera (bounds + polygon)
   *  before the tuple write, so the resolver reads bounds from the tuple only. */
  captureFreshTupleBounds: () => Promise<SearchCommittedBounds | null>;
  /** S3b: the world resolver — every launch in this owner resolves through it. */
  resolveDesiredWorld: (
    args: import('../runtime/resolver/search-world-resolver').SearchWorldResolveArgs
  ) => Promise<void>;
  beginResolverSubmitForegroundUi: (options: {
    mode: 'natural' | 'shortcut' | null;
    targetTab: SegmentValue;
    submittedLabel: string;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
    entrySurface: SearchSubmitEntrySurface;
  }) => void;
  onPresentationIntentAbort?: () => void;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
  resetMapMoveFlag: () => void;
};

export const useSearchStructuredSubmitOwner = ({
  searchRuntimeBus,
  viewportBoundsService,
  captureFreshTupleBounds,
  resolveDesiredWorld,
  beginResolverSubmitForegroundUi,
  onPresentationIntentAbort,
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
      const preserveSheetState = Boolean(params.preserveSheetState);
      resetMapMoveFlag();
      // S3c: a restaurant tap IS an entity-identity tuple write + resolve (skip-LLM
      // structured lane routed by the fetch table).
      const writeResult = writeSearchDesiredTuple(
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
      await resolveDesiredWorld({
        tuple: writeResult.tuple,
        generation: writeResult.generation,
        cause: 'entity_tap',
        onResolutionBegan: () => {
          beginResolverSubmitForegroundUi({
            mode: 'shortcut',
            targetTab: 'restaurants',
            submittedLabel: trimmedName,
            preserveSheetState,
            transitionFromDockedPolls: false,
            entrySurface: params.entrySurface,
          });
          logSearchPhase('runRestaurantEntitySearch:ui-lanes-scheduled');
        },
        onResolutionFailed: (reason) => {
          logger.error('Restaurant entity search failed', { message: reason });
          searchRuntimeBus.publish({ isMapActivationDeferred: false });
          onPresentationIntentAbort?.();
        },
      });
    },
    [
      beginResolverSubmitForegroundUi,
      logSearchPhase,
      onPresentationIntentAbort,
      resetMapMoveFlag,
      resolveDesiredWorld,
      searchRuntimeBus,
      viewportBoundsService,
    ]
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
        options?.presentationIntentKind === 'search_this_area' || options?.forceFreshBounds
          ? await captureFreshTupleBounds()
          : captureCommittedBounds(viewportBoundsService);
      const writeResult = writeSearchDesiredTuple(
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
        options?.presentationIntentKind === 'search_this_area'
          ? 'search_this_area'
          : 'initial_submit'
      );
      const preserveSheetState = Boolean(options?.preserveSheetState);
      const transitionFromDockedPolls =
        !preserveSheetState && Boolean(options?.transitionFromDockedPolls);
      const shouldReplaceResultsInPlace = Boolean(options?.replaceResultsInPlace);
      const presentationIntentKind = options?.presentationIntentKind;
      const entrySurface = options.entrySurface;
      if (presentationIntentKind !== 'search_this_area') {
        resetMapMoveFlag();
      }
      // S3b: the submit IS a tuple write + resolve. The resolver's ladder serves cache
      // hits instantly (re-entering a just-seen viewport), the seam owns the commit, the
      // presentation intent arms in onResolutionBegan AFTER activeOperationId publishes.
      await resolveDesiredWorld({
        tuple: writeResult.tuple,
        generation: writeResult.generation,
        cause:
          presentationIntentKind === 'search_this_area' ? 'search_this_area' : 'initial_submit',
        presentationIntentKind,
        onResolutionBegan: () => {
          beginResolverSubmitForegroundUi({
            mode: 'shortcut',
            targetTab,
            submittedLabel,
            preserveSheetState,
            transitionFromDockedPolls,
            presentationIntentKind,
            entrySurface,
          });
          logSearchPhase('runBestHere:ui-lanes-scheduled');
        },
        onResolutionFailed: (reason) => {
          logger.error('Best-here search failed', { message: reason });
          searchRuntimeBus.publish({ isMapActivationDeferred: false });
          onPresentationIntentAbort?.();
        },
      });
      void shouldReplaceResultsInPlace;
    },
    [
      beginResolverSubmitForegroundUi,
      captureFreshTupleBounds,
      logSearchPhase,
      onPresentationIntentAbort,
      resetMapMoveFlag,
      resolveDesiredWorld,
      searchRuntimeBus,
      viewportBoundsService,
    ]
  );

  const launchFavoritesListResults = React.useCallback(
    async (params: { listId: string; listType: FavoriteListType; submittedLabel: string }) => {
      logSearchPhase('launchFavorites:start', { reset: true });
      const targetTab: SegmentValue = params.listType === 'dish' ? 'dishes' : 'restaurants';
      resetMapMoveFlag();
      // S3c: favorites-as-search IS an entities-identity tuple write + resolve. No
      // viewport adopt (committedBounds null — the results define the camera); the
      // fetch table routes listId to getListResults, the adopt rule honors the list
      // axis, and favorites suppress the single-restaurant collapse in the fetcher.
      const writeResult = writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: {
            kind: 'entities',
            restaurantIds: [],
            foodIds: [],
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
      await resolveDesiredWorld({
        tuple: writeResult.tuple,
        generation: writeResult.generation,
        cause: 'favorites_launch',
        onResolutionBegan: () => {
          beginResolverSubmitForegroundUi({
            mode: 'natural',
            targetTab,
            submittedLabel: params.submittedLabel,
            preserveSheetState: false,
            transitionFromDockedPolls: false,
            entrySurface: 'home',
          });
          logSearchPhase('launchFavorites:ui-lanes-scheduled');
        },
        onResolutionFailed: (reason) => {
          logger.error('Favorites list results request failed', {
            message: reason,
            listId: params.listId,
          });
          searchRuntimeBus.publish({ isMapActivationDeferred: false });
          onPresentationIntentAbort?.();
        },
      });
    },
    [
      beginResolverSubmitForegroundUi,
      logSearchPhase,
      onPresentationIntentAbort,
      resetMapMoveFlag,
      resolveDesiredWorld,
      searchRuntimeBus,
    ]
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
