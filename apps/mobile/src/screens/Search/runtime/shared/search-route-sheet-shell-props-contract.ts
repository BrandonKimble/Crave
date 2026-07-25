import type { SearchRouteSceneStackShellSpec } from '../../../../overlays/searchOverlayRouteHostContract';

export type SearchRouteSheetShellProps = Pick<
  SearchRouteSceneStackShellSpec,
  | 'listScrollEnabled'
  | 'headerComponent'
  | 'backgroundComponent'
  | 'overlayComponent'
  | 'contentContainerStyle'
  | 'keyboardShouldPersistTaps'
  | 'scrollIndicatorInsets'
  | 'onScrollOffsetChange'
  | 'onMomentumBeginJS'
  | 'onMomentumEndJS'
  | 'showsVerticalScrollIndicator'
  | 'keyboardDismissMode'
  | 'testID'
  | 'interactionEnabled'
  | 'animateOnMount'
  | 'flashListProps'
  | 'shadowStyle'
  | 'surfaceStyle'
>;
