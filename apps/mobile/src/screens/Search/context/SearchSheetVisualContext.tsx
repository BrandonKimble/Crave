import React from 'react';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';

type AnimatedNumberLike = { value: number };

export type SearchSheetVisualContextValue = {
  sheetTranslateY: SharedValue<number>;
  resultsScrollOffset: SharedValue<number>;
  resultsMomentum: SharedValue<boolean>;
  closeVisualHandoffProgress: AnimatedNumberLike;
  navBarCutoutHeight: number;
  navBarCutoutProgress: SharedValue<number> | DerivedValue<number>;
  bottomNavHiddenTranslateY: number;
  navBarCutoutIsHiding: boolean;
};

const SearchSheetVisualContext = React.createContext<SearchSheetVisualContextValue | null>(null);

export const SearchSheetVisualProvider = SearchSheetVisualContext.Provider;

export const useSearchSheetVisualContext = (): SearchSheetVisualContextValue => {
  const value = React.useContext(SearchSheetVisualContext);
  if (value == null) {
    throw new Error('useSearchSheetVisualContext must be used within a SearchSheetVisualProvider');
  }
  return value;
};
