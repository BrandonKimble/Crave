import { useSearchPriceSheetProps } from './use-search-price-sheet-props';
import { useSearchRankAndScoreSheetsProps } from './use-search-rank-and-score-sheets-props';
import type {
  SearchRootPriceSheetArgs,
  SearchRootRankAndScoreSheetsArgs,
  SearchRootRenderRuntime,
} from './search-root-render-runtime-contract';

type UseSearchRootModalSheetRenderRuntimeArgs = {
  rankAndScoreSheetsArgs: SearchRootRankAndScoreSheetsArgs;
  priceSheetArgs: SearchRootPriceSheetArgs;
};

export type SearchRootModalSheetRenderRuntime = Pick<
  SearchRootRenderRuntime,
  'rankAndScoreSheetsProps' | 'priceSheetProps'
>;

export const useSearchRootModalSheetRenderRuntime = ({
  rankAndScoreSheetsArgs,
  priceSheetArgs,
}: UseSearchRootModalSheetRenderRuntimeArgs): SearchRootModalSheetRenderRuntime => ({
  rankAndScoreSheetsProps: useSearchRankAndScoreSheetsProps(rankAndScoreSheetsArgs),
  priceSheetProps: useSearchPriceSheetProps(priceSheetArgs),
});
