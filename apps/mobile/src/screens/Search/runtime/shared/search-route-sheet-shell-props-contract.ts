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
  | 'bounces'
  | 'alwaysBounceVertical'
  | 'overScrollMode'
  | 'testID'
  | 'interactionEnabled'
  | 'animateOnMount'
  | 'flashListProps'
  | 'shadowStyle'
  | 'surfaceStyle'
>;
