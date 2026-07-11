import type { SharedValue } from 'react-native-reanimated';

import type { SearchBottomNavVisualInputs } from './search-bottom-nav-visual-input-contract';
import type { SearchAppShellPriceModalLayerModel } from './search-app-shell-render-contract';
import type { SearchAppShellRankAndScoreModalLayerModel } from './search-app-shell-render-contract';

export type SearchOverlayShellHostSnapshot = {
  isFocused: boolean;
  statusBarFadeHeight: number | null;
  backdropDimProgress: SharedValue<number> | null;
  backdropSheetTopY: SharedValue<number> | null;
  bottomNavVisualInputs: SearchBottomNavVisualInputs;
  rankAndScoreModalLayer: SearchAppShellRankAndScoreModalLayerModel | null;
  priceModalLayer: SearchAppShellPriceModalLayerModel | null;
};
