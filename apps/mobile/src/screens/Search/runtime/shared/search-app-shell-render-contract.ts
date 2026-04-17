import type { SharedValue } from 'react-native-reanimated';

import type { SearchBottomNavProps } from '../../components/SearchBottomNav';
import type { SearchPriceSheetProps } from '../../components/SearchPriceSheet';
import type { SearchRankAndScoreSheetsProps } from '../../components/SearchRankAndScoreSheets';
import type { SearchOverlayChromeModel } from './search-foreground-chrome-contract';

export type SearchAppShellOverlayModel = {
  searchOverlayChromeModel: SearchOverlayChromeModel;
  routeOverlayChromeTransitionProgress: SharedValue<number>;
  routeOverlayBackdropDimProgress: SharedValue<number>;
  bottomNavProps: SearchBottomNavProps;
  statusBarFadeHeight: number;
  shouldRenderSearchOverlay: boolean;
};

export type SearchAppShellModalModel = {
  rankAndScoreSheetsProps: SearchRankAndScoreSheetsProps;
  priceSheetProps: SearchPriceSheetProps;
};
