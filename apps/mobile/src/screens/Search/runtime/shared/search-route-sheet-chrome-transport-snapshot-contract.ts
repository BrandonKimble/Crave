import type { StyleProp, ViewStyle } from 'react-native';

import type { SearchRouteSheetShellProps } from './search-route-sheet-shell-props-contract';

export type SearchRouteSheetChromeTransportEntry = {
  headerComponent: SearchRouteSheetShellProps['headerComponent'];
  backgroundComponent: SearchRouteSheetShellProps['backgroundComponent'];
  overlayComponent: SearchRouteSheetShellProps['overlayComponent'];
  shadowStyle: SearchRouteSheetShellProps['shadowStyle'];
  surfaceStyle: SearchRouteSheetShellProps['surfaceStyle'];
  style: StyleProp<ViewStyle> | undefined;
};

export type SearchRouteSheetChromeTransportSnapshot = {
  chromeEntry: SearchRouteSheetChromeTransportEntry | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_CHROME_TRANSPORT_SNAPSHOT: SearchRouteSheetChromeTransportSnapshot =
  {
    chromeEntry: null,
  };
