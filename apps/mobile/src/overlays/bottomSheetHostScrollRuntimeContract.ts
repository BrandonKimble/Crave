import type { SharedValue } from 'react-native-reanimated';

export type BottomSheetHostScrollRuntimeArgs = {
  activeList?: 'primary' | 'secondary';
  dualListEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  momentumFlag: SharedValue<boolean>;
  scrollOffset: SharedValue<number>;
  onMomentumBegin?: () => void;
  onMomentumEnd?: () => void;
  onScrollOffsetChange?: (offsetY: number) => void;
};
