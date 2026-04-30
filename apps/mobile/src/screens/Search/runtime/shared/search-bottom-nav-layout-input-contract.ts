import type { LayoutChangeEvent } from 'react-native';

export type SearchBottomNavLayoutInputs = {
  bottomInset: number;
  handleBottomNavLayout: (event: LayoutChangeEvent) => void;
} | null;

export const EMPTY_SEARCH_BOTTOM_NAV_LAYOUT_INPUTS: SearchBottomNavLayoutInputs = null;
