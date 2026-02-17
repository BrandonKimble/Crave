import { logger } from '../../../../utils';
import type { FoodResult, RestaurantResult } from '../../../../types';

export type ResultsSectionRow = {
  kind: 'section';
  key: string;
  label: string;
};

export type ResultsShowMoreRow = {
  kind: 'show_more_exact';
  key: string;
  hiddenCount: number;
};

export type ResultsListItem =
  | FoodResult
  | RestaurantResult
  | ResultsSectionRow
  | ResultsShowMoreRow;

const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const EMPTY_RESULTS: Array<FoodResult | RestaurantResult> = [];

type BuildSafeResultsDataArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: ReadonlyArray<FoodResult> | null | undefined;
  restaurants: ReadonlyArray<RestaurantResult> | null | undefined;
};

export const buildSafeResultsData = ({
  activeTab,
  dishes,
  restaurants,
}: BuildSafeResultsDataArgs): Array<FoodResult | RestaurantResult> => {
  const source = activeTab === 'dishes' ? dishes : restaurants;
  if (!Array.isArray(source)) {
    logger.error('resultsData not array', { tab: activeTab, type: typeof source });
    return activeTab === 'dishes' ? EMPTY_DISHES : EMPTY_RESTAURANTS;
  }
  if (source.length === 0) {
    return EMPTY_RESULTS;
  }
  const filtered = source.filter(
    (item): item is FoodResult | RestaurantResult => item !== null && item !== undefined
  );
  return filtered.length > 0 ? filtered : EMPTY_RESULTS;
};

type BuildSectionedResultsDataArgs = {
  activeTab: 'dishes' | 'restaurants';
  safeResultsData: ReadonlyArray<FoodResult | RestaurantResult>;
  exactDishesOnPage: number | null;
  exactRestaurantsOnPage: number | null;
  showAllExactDishes: boolean;
  showAllExactRestaurants: boolean;
  exactVisibleLimit: number;
};

export const buildSectionedResultsData = ({
  activeTab,
  safeResultsData,
  exactDishesOnPage,
  exactRestaurantsOnPage,
  showAllExactDishes,
  showAllExactRestaurants,
  exactVisibleLimit,
}: BuildSectionedResultsDataArgs): ResultsListItem[] => {
  const isDishesTab = activeTab === 'dishes';
  const exactCountRaw = isDishesTab ? exactDishesOnPage : exactRestaurantsOnPage;
  const exactCount =
    typeof exactCountRaw === 'number' && Number.isFinite(exactCountRaw) && exactCountRaw > 0
      ? Math.floor(exactCountRaw)
      : 0;

  if (exactCount <= 0 || safeResultsData.length <= exactCount) {
    return safeResultsData;
  }

  const exactAll = safeResultsData.slice(0, exactCount);
  const relaxedAll = safeResultsData.slice(exactCount);
  const showAllExact = isDishesTab ? showAllExactDishes : showAllExactRestaurants;
  const exactVisible = showAllExact ? exactAll : exactAll.slice(0, exactVisibleLimit);
  const hiddenCount = Math.max(0, exactAll.length - exactVisible.length);

  const rows: ResultsListItem[] = [
    { kind: 'section', key: `${activeTab}-section-exact`, label: 'Exact matches' },
    ...exactVisible,
  ];

  if (hiddenCount > 0 && !showAllExact) {
    rows.push({
      kind: 'show_more_exact',
      key: `${activeTab}-show-more-exact`,
      hiddenCount,
    });
  }

  if (relaxedAll.length > 0) {
    rows.push({
      kind: 'section',
      key: `${activeTab}-section-broader`,
      label: 'Broader matches',
    });
    rows.push(...relaxedAll);
  }

  return rows;
};

type BuildHydratedResultsDataArgs = {
  sectionedResultsData: ReadonlyArray<ResultsListItem>;
  maxHydratedRows: number | null;
};

export const buildHydratedResultsData = ({
  sectionedResultsData,
  maxHydratedRows,
}: BuildHydratedResultsDataArgs): ResultsListItem[] => {
  if (maxHydratedRows == null) {
    return sectionedResultsData as ResultsListItem[];
  }
  const normalizedMaxRows = Number.isFinite(maxHydratedRows)
    ? Math.max(0, Math.floor(maxHydratedRows))
    : sectionedResultsData.length;
  const targetCount = Math.min(normalizedMaxRows, sectionedResultsData.length);
  if (targetCount <= 0) {
    return [];
  }
  if (targetCount >= sectionedResultsData.length) {
    return sectionedResultsData as ResultsListItem[];
  }
  return sectionedResultsData.slice(0, targetCount) as ResultsListItem[];
};
