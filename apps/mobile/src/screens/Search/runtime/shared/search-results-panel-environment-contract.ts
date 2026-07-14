import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';

import type { SearchInteractionSnapshot } from '../../context/SearchInteractionContext';
import type { RestaurantResult } from '../../../../types';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import type { MapQueryBudget } from '../map/map-query-budget';
import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import type { UsePollsPanelSpecOptions } from '../../../../overlays/panels/runtime/polls-panel-runtime-contract';
import type { ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';

export type RuntimeMechanismEmitter = (
  event: 'runtime_write_span',
  payload?: Record<string, unknown>
) => void;

export type ResultsPanelVisualRuntimeModel = {
  resultsSheetVisibilityAnimatedStyle: StyleProp<ViewStyle>;
  shouldDisableResultsSheetInteraction: boolean;
  resultsScrollRef: React.RefObject<FlashListRef<ResultsListItem> | null>;
};

export type ResultsPanelSheetRuntimeModel = Pick<
  AppRouteSharedSheetRuntimeOwner,
  | 'sharedSheetContainerAnimatedStyle'
  | 'shouldRenderMountedSharedSheet'
  | 'snapPoints'
  | 'sheetState'
  | 'sharedSheetRuntimeModel'
  | 'markSharedSheetHidden'
>;

export type SearchResultsPanelEnvironment = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationOwner: Pick<
    ResultsPresentationOwner,
    'shellModel' | 'presentationActions' | 'interactionModel'
  >;
  resultsSheetRuntime: ResultsPanelSheetRuntimeModel;
  resultsSheetInteractionModel: ResultsSheetInteractionModel;
  resultsPanelVisualRuntimeModel: ResultsPanelVisualRuntimeModel;
  pollBounds: UsePollsPanelSpecOptions['bounds'];
  startupPollsSnapshot: UsePollsPanelSpecOptions['bootstrapSnapshot'];
  userLocation: UsePollsPanelSpecOptions['userLocation'];
  searchInteractionRef: React.MutableRefObject<SearchInteractionSnapshot>;
  toggleOpenNow: () => void;
  toggleIncludeSimilar: () => void;
  togglePriceSelector: () => void;
  shouldDisableSearchBlur: boolean;
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
    rising: number | null | undefined;
    votes: number | null | undefined;
    polls: number | null | undefined;
  }) => void;
  mapQueryBudget: MapQueryBudget;
  shouldLogResultsViewability: boolean;
  onRuntimeMechanismEvent?: RuntimeMechanismEmitter;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};
