import React from 'react';
import type { SearchRouteHostVisualState } from '../../../overlays/searchRouteHostVisualState';

export type SearchSheetVisualContextValue = SearchRouteHostVisualState;

const SearchSheetVisualContext = React.createContext<SearchSheetVisualContextValue | null>(null);

export const SearchSheetVisualProvider = SearchSheetVisualContext.Provider;

export const useSearchSheetVisualContext = (): SearchSheetVisualContextValue => {
  const value = React.useContext(SearchSheetVisualContext);
  if (value == null) {
    throw new Error('useSearchSheetVisualContext must be used within a SearchSheetVisualProvider');
  }
  return value;
};
