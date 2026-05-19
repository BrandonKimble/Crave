import type React from 'react';

import type { SearchPriceSheetProps } from '../../components/SearchPriceSheet';
import type { SearchRankAndScoreSheetsProps } from '../../components/SearchRankAndScoreSheets';

export type SearchAppShellRankAndScoreModalLayerModel = {
  rankAndScoreSheetsProps: SearchRankAndScoreSheetsProps | null;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};

export type SearchAppShellPriceModalLayerModel = {
  priceSheetProps: SearchPriceSheetProps | null;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};
