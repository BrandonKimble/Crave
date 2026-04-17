import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { FlashListRef } from '@shopify/flash-list';

import type { SearchRoutePollsPanelInputs } from '../../../../overlays/searchOverlayRouteHostContract';
import type { SearchInteractionSnapshot } from '../../context/SearchInteractionContext';
import type { RestaurantResult } from '../../../../types';
import type { SearchFiltersLayoutCache } from '../../components/SearchFilters';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import type { MapQueryBudget } from '../map/map-query-budget';
import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import type { ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';

export type RuntimeMechanismEmitter = (
  event: 'runtime_write_span',
  payload?: Record<string, unknown>
) => void;

export type ResultsPanelVisualRuntimeModel = {
  resultsWashAnimatedStyle: StyleProp<ViewStyle>;
  resultsSheetVisibilityAnimatedStyle: StyleProp<ViewStyle>;
  shouldDisableResultsSheetInteraction: boolean;
  resultsScrollRef: React.RefObject<FlashListRef<ResultsListItem> | null>;
};

export type ResultsPanelSheetRuntimeModel = Pick<
  ResultsSheetRuntimeOwner,
  | 'headerDividerAnimatedStyle'
  | 'resultsContainerAnimatedStyle'
  | 'shouldRenderResultsSheet'
  | 'snapPoints'
  | 'sheetState'
  | 'resultsSheetRuntimeModel'
  | 'resetResultsSheetToHidden'
>;

export type UseSearchResultsRoutePublicationArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationOwner: Pick<
    ResultsPresentationOwner,
    'shellModel' | 'presentationActions' | 'interactionModel'
  >;
  resultsSheetRuntime: ResultsPanelSheetRuntimeModel;
  resultsSheetInteractionModel: ResultsSheetInteractionModel;
  resultsPanelVisualRuntimeModel: ResultsPanelVisualRuntimeModel;
  pollBounds: SearchRoutePollsPanelInputs['pollBounds'];
  startupPollsSnapshot: SearchRoutePollsPanelInputs['startupPollsSnapshot'];
  userLocation: SearchRoutePollsPanelInputs['userLocation'];
  searchInteractionRef: React.MutableRefObject<SearchInteractionSnapshot>;
  toggleOpenNow: () => void;
  toggleVotesFilter: () => void;
  togglePriceSelector: () => void;
  shouldDisableSearchBlur: boolean;
  searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
  handleSearchFiltersLayoutCache: (next: SearchFiltersLayoutCache) => void;
  getDishSaveHandler: (connectionId: string) => () => void;
  getRestaurantSaveHandler: (restaurantId: string) => () => void;
  stableOpenRestaurantProfileFromResults: (
    restaurant: RestaurantResult,
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  openScoreInfo: (payload: {
    type: 'dish' | 'restaurant';
    title: string;
    score: number | null | undefined;
    votes: number | null | undefined;
    polls: number | null | undefined;
  }) => void;
  mapQueryBudget: MapQueryBudget;
  overlayHeaderActionProgress: SharedValue<number>;
  shouldLogResultsViewability: boolean;
  onRuntimeMechanismEvent?: RuntimeMechanismEmitter;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};
