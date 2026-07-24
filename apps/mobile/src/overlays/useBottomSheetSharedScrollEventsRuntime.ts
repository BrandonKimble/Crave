import type { ScrollViewProps } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import { runOnJS, useAnimatedScrollHandler } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { getScrollTopOffset } from './bottomSheetSharedRuntimeUtils';

type UseBottomSheetSharedScrollEventsRuntimeArgs = {
  activePrimaryList: SharedValue<boolean>;
  isInMomentum: SharedValue<boolean>;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  onScrollOffsetChange?: (offsetY: number) => void;
  scrollOffset: SharedValue<number>;
  scrollTopOffset: SharedValue<number>;
  primaryScrollOffset: SharedValue<number>;
  secondaryScrollOffset: SharedValue<number>;
  primaryScrollTopOffset: SharedValue<number>;
  secondaryScrollTopOffset: SharedValue<number>;
};

type UseBottomSheetSharedScrollEventsRuntimeResult = {
  primaryListOnScroll: FlashListProps<unknown>['onScroll'];
  secondaryListOnScroll: FlashListProps<unknown>['onScroll'];
  primaryScrollViewOnScroll: ScrollViewProps['onScroll'];
};

export const useBottomSheetSharedScrollEventsRuntime = ({
  activePrimaryList,
  isInMomentum,
  onMomentumBeginJS,
  onMomentumEndJS,
  onScrollOffsetChange,
  scrollOffset,
  scrollTopOffset,
  primaryScrollOffset,
  secondaryScrollOffset,
  primaryScrollTopOffset,
  secondaryScrollTopOffset,
}: UseBottomSheetSharedScrollEventsRuntimeArgs): UseBottomSheetSharedScrollEventsRuntimeResult => {
  const primaryAnimatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextTopOffset = getScrollTopOffset(event.contentInset?.top);
        if (Math.abs(nextTopOffset - primaryScrollTopOffset.value) > 0.5) {
          primaryScrollTopOffset.value = nextTopOffset;
        }
        primaryScrollOffset.value = event.contentOffset.y;
        if (activePrimaryList.value) {
          if (Math.abs(nextTopOffset - scrollTopOffset.value) > 0.5) {
            scrollTopOffset.value = nextTopOffset;
          }
          scrollOffset.value = event.contentOffset.y;
        }
      },
      onBeginDrag: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
      },
      onMomentumBegin: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = true;
        if (onMomentumBeginJS) {
          runOnJS(onMomentumBeginJS)();
        }
      },
      onMomentumEnd: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
        if (onMomentumEndJS) {
          runOnJS(onMomentumEndJS)();
        }
        if (onScrollOffsetChange) {
          runOnJS(onScrollOffsetChange)(scrollOffset.value);
        }
      },
    },
    [
      activePrimaryList,
      isInMomentum,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollOffsetChange,
      primaryScrollOffset,
      primaryScrollTopOffset,
      scrollOffset,
      scrollTopOffset,
    ]
  );

  const primaryScrollViewAnimatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextTopOffset = getScrollTopOffset(event.contentInset?.top);
        if (Math.abs(nextTopOffset - primaryScrollTopOffset.value) > 0.5) {
          primaryScrollTopOffset.value = nextTopOffset;
        }
        primaryScrollOffset.value = event.contentOffset.y;
        if (activePrimaryList.value) {
          if (Math.abs(nextTopOffset - scrollTopOffset.value) > 0.5) {
            scrollTopOffset.value = nextTopOffset;
          }
          scrollOffset.value = event.contentOffset.y;
        }
      },
      onBeginDrag: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
      },
      onMomentumBegin: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = true;
        if (onMomentumBeginJS) {
          runOnJS(onMomentumBeginJS)();
        }
      },
      onMomentumEnd: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
        if (onMomentumEndJS) {
          runOnJS(onMomentumEndJS)();
        }
        if (onScrollOffsetChange) {
          runOnJS(onScrollOffsetChange)(scrollOffset.value);
        }
      },
    },
    [
      activePrimaryList,
      isInMomentum,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollOffsetChange,
      primaryScrollOffset,
      primaryScrollTopOffset,
      scrollOffset,
      scrollTopOffset,
    ]
  );

  const secondaryAnimatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextTopOffset = getScrollTopOffset(event.contentInset?.top);
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
        isInMomentum.value = false;
      },
      onMomentumBegin: () => {
        if (activePrimaryList.value) {
          return;
        }
        isInMomentum.value = true;
        if (onMomentumBeginJS) {
          runOnJS(onMomentumBeginJS)();
        }
      },
      onMomentumEnd: () => {
        if (activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
        if (onMomentumEndJS) {
          runOnJS(onMomentumEndJS)();
        }
        if (onScrollOffsetChange) {
          runOnJS(onScrollOffsetChange)(scrollOffset.value);
        }
      },
    },
    [
      activePrimaryList,
      isInMomentum,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollOffsetChange,
      scrollOffset,
      scrollTopOffset,
      secondaryScrollOffset,
      secondaryScrollTopOffset,
    ]
  );

  return {
    primaryListOnScroll:
      primaryAnimatedScrollHandler as unknown as FlashListProps<unknown>['onScroll'],
    secondaryListOnScroll:
      secondaryAnimatedScrollHandler as unknown as FlashListProps<unknown>['onScroll'],
    primaryScrollViewOnScroll:
      primaryScrollViewAnimatedScrollHandler as unknown as ScrollViewProps['onScroll'],
  };
};
