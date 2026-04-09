import { runOnJS, useAnimatedScrollHandler } from 'react-native-reanimated';

import { getBottomSheetScrollTopOffset } from './bottomSheetHostScrollRuntimeUtils';

type UseBottomSheetSecondaryScrollHandlerRuntimeArgs = {
  activePrimaryList: { value: boolean };
  momentumFlag: { value: boolean };
  onMomentumBegin?: () => void;
  onMomentumEnd?: () => void;
  onScrollOffsetChange?: (offsetY: number) => void;
  secondaryScrollOffset: { value: number };
  secondaryScrollTopOffset: { value: number };
  scrollOffset: { value: number };
  scrollTopOffset: { value: number };
};

export const useBottomSheetSecondaryScrollHandlerRuntime = ({
  activePrimaryList,
  momentumFlag,
  onMomentumBegin,
  onMomentumEnd,
  onScrollOffsetChange,
  secondaryScrollOffset,
  secondaryScrollTopOffset,
  scrollOffset,
  scrollTopOffset,
}: UseBottomSheetSecondaryScrollHandlerRuntimeArgs) =>
  useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextTopOffset = getBottomSheetScrollTopOffset(event.contentInset?.top);
        if (Math.abs(nextTopOffset - secondaryScrollTopOffset.value) > 0.5) {
          secondaryScrollTopOffset.value = nextTopOffset;
        }
        secondaryScrollOffset.value = event.contentOffset.y;
        if (!activePrimaryList.value) {
          if (Math.abs(nextTopOffset - scrollTopOffset.value) > 0.5) {
            scrollTopOffset.value = nextTopOffset;
          }
          scrollOffset.value = event.contentOffset.y;
        }
      },
      onBeginDrag: () => {
        if (activePrimaryList.value) {
          return;
        }
        momentumFlag.value = false;
      },
      onMomentumBegin: () => {
        if (activePrimaryList.value) {
          return;
        }
        momentumFlag.value = true;
        if (onMomentumBegin) {
          runOnJS(onMomentumBegin)();
        }
      },
      onMomentumEnd: () => {
        if (activePrimaryList.value) {
          return;
        }
        momentumFlag.value = false;
        if (onMomentumEnd) {
          runOnJS(onMomentumEnd)();
        }
        if (onScrollOffsetChange) {
          runOnJS(onScrollOffsetChange)(scrollOffset.value);
        }
      },
    },
    [
      activePrimaryList,
      momentumFlag,
      onMomentumBegin,
      onMomentumEnd,
      onScrollOffsetChange,
      scrollOffset,
      scrollTopOffset,
      secondaryScrollOffset,
      secondaryScrollTopOffset,
    ]
  );
