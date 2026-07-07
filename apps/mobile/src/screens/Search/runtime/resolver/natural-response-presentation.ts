// Natural-response PRESENTATION FACTS (S3b-2): the tab a landed natural response should
// adopt, and the single-restaurant candidate that collapses the sheet + auto-opens the
// profile. Both are derived from the RESPONSE VALUE (world metadata), never from live
// UI state — re-homed from the response owner (its inline copies die in S3d).

import type { NaturalSearchRequest, SearchResponse } from '../../../../types';
import type { SegmentValue } from '../../constants/search';
import { resolveSubmissionDefaultTab } from '../../hooks/use-search-submit-entry-owner';

type ResultsActiveTab = 'dishes' | 'restaurants';

const resolveIntentDefaultTab = (response: SearchResponse): SegmentValue | null => {
  const filters = [
    ...(response.plan?.restaurantFilters ?? []),
    ...(response.plan?.connectionFilters ?? []),
  ];
  const hasRestaurantAttributeFilter = filters.some(
    (filter) =>
      filter.entityType === 'restaurant_attribute' &&
      Array.isArray(filter.entityIds) &&
      filter.entityIds.length > 0
  );
  if (hasRestaurantAttributeFilter) {
    return 'restaurants';
  }
  const hasFoodFilter = filters.some(
    (filter) =>
      filter.entityType === 'food' && Array.isArray(filter.entityIds) && filter.entityIds.length > 0
  );
  if (hasFoodFilter) {
    return 'dishes';
  }
  return null;
};

/** The exact adopt rule from the response owner: intent (submission context, then the
 *  response plan's filters) wins when its axis has rows; otherwise stay when possible;
 *  otherwise whichever axis has rows. */
export const resolveNaturalResponseAdoptedTab = (params: {
  response: SearchResponse;
  currentTab: ResultsActiveTab;
  submissionContext?: NaturalSearchRequest['submissionContext'];
}): ResultsActiveTab => {
  const { response, currentTab, submissionContext } = params;
  const hasFoodResults = (response.dishes?.length ?? 0) > 0;
  const hasRestaurantsResults = (response.restaurants?.length ?? 0) > 0;
  const submissionDefaultTab = resolveSubmissionDefaultTab(submissionContext);
  const intentDefaultTab = submissionDefaultTab ?? resolveIntentDefaultTab(response);
  if (intentDefaultTab === 'dishes' && hasFoodResults) {
    return 'dishes';
  }
  if (intentDefaultTab === 'restaurants' && hasRestaurantsResults) {
    return 'restaurants';
  }
  if (!hasFoodResults && !hasRestaurantsResults) {
    return currentTab;
  }
  if (currentTab === 'dishes' && hasFoodResults) {
    return 'dishes';
  }
  if (currentTab === 'restaurants' && hasRestaurantsResults) {
    return 'restaurants';
  }
  return hasFoodResults ? 'dishes' : 'restaurants';
};
