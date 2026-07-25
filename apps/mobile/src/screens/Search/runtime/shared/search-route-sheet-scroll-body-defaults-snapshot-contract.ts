import type { SearchRouteSheetShellProps } from './search-route-sheet-shell-props-contract';

export type SearchRouteSheetScrollBodyDefaultsEntry = Pick<
  SearchRouteSheetShellProps,
  | 'contentContainerStyle'
  | 'keyboardShouldPersistTaps'
  | 'scrollIndicatorInsets'
  | 'keyboardDismissMode'
  | 'testID'
  | 'flashListProps'
>;

export type SearchRouteSheetScrollBodyDefaultsSnapshot = {
  bodyDefaultsEntry: SearchRouteSheetScrollBodyDefaultsEntry | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_SCROLL_BODY_DEFAULTS_SNAPSHOT: SearchRouteSheetScrollBodyDefaultsSnapshot =
  {
    bodyDefaultsEntry: null,
  };
