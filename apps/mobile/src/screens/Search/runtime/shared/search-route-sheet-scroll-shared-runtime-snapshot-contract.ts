import type { SearchRouteSheetShellProps } from './search-route-sheet-shell-props-contract';

export type SearchRouteSheetScrollSharedRuntimeEntry = Pick<
  SearchRouteSheetShellProps,
  | 'listScrollEnabled'
  | 'onHidden'
  | 'onScrollOffsetChange'
  | 'onMomentumBeginJS'
  | 'onMomentumEndJS'
  | 'showsVerticalScrollIndicator'
  | 'testID'
  | 'dismissThreshold'
  | 'preventSwipeDismiss'
  | 'interactionEnabled'
  | 'animateOnMount'
>;

export type SearchRouteSheetScrollSharedRuntimeSnapshot = {
  sharedRuntimeEntry: SearchRouteSheetScrollSharedRuntimeEntry | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_SCROLL_SHARED_RUNTIME_SNAPSHOT: SearchRouteSheetScrollSharedRuntimeSnapshot =
  {
    sharedRuntimeEntry: null,
  };
