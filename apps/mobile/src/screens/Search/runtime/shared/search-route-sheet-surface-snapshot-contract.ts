import type { StyleProp, ViewStyle } from 'react-native';

export type SearchRouteSheetSurfaceSnapshot = {
  sheetClipStyle: StyleProp<ViewStyle> | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_SURFACE_SNAPSHOT: SearchRouteSheetSurfaceSnapshot =
  {
    sheetClipStyle: null,
  };
