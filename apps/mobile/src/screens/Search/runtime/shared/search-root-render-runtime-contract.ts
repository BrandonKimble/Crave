import { useSearchBottomNavProps } from './use-search-bottom-nav-props';
import { useSearchMapProps } from './use-search-map-props';
import { useSearchOverlayChromeRenderModel } from './use-search-overlay-chrome-render-model';
import { useSearchPriceSheetProps } from './use-search-price-sheet-props';
import { useSearchRankAndScoreSheetsProps } from './use-search-rank-and-score-sheets-props';

export type SearchRootChromeArgs = Parameters<typeof useSearchOverlayChromeRenderModel>[0];

export type SearchRootMapArgs = Parameters<typeof useSearchMapProps>[0];

export type SearchRootBottomNavArgs = Omit<
  Parameters<typeof useSearchBottomNavProps>[0],
  'navIconRenderers'
>;

export type SearchRootRankAndScoreSheetsArgs = Parameters<
  typeof useSearchRankAndScoreSheetsProps
>[0];

export type SearchRootPriceSheetArgs = Parameters<typeof useSearchPriceSheetProps>[0];

export type SearchRootRenderRuntime = {
  searchOverlayChromeModel: ReturnType<typeof useSearchOverlayChromeRenderModel>;
  searchMapProps: ReturnType<typeof useSearchMapProps>;
  bottomNavProps: ReturnType<typeof useSearchBottomNavProps>;
  rankAndScoreSheetsProps: ReturnType<typeof useSearchRankAndScoreSheetsProps>;
  priceSheetProps: ReturnType<typeof useSearchPriceSheetProps>;
};
