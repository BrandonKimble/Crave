import type { ScrollViewProps } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import { runOnJS, useAnimatedScrollHandler, useSharedValue, withSpring } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { getScrollTopOffset } from './bottomSheetSharedRuntimeUtils';

type UseBottomSheetSharedScrollEventsRuntimeArgs = {
  activePrimaryList: SharedValue<boolean>;
  isInMomentum: SharedValue<boolean>;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  onScrollOffsetChange?: (offsetY: number) => void;
  scrollOffset: SharedValue<number>;
  /** Boundary-physics: the ACTIVE list's max interior offset (contentSize − viewport, ≥0). */
  maxScrollOffset: SharedValue<number>;
  /** Boundary-physics law §3 (top momentum case): the runtime-owned overscroll the
   *  momentum-rebound impulse drives when a momentum scroll lands on the pinned top. */
  contentOverscroll: SharedValue<number>;
  scrollTopOffset: SharedValue<number>;
  primaryScrollOffset: SharedValue<number>;
  secondaryScrollOffset: SharedValue<number>;
  primaryScrollTopOffset: SharedValue<number>;
  secondaryScrollTopOffset: SharedValue<number>;
};

// The momentum-rebound impulse (boundary-physics law §3): a momentum scroll that lands
// on the pinned top boundary converts its arrival velocity into a rubber-band impulse —
// contentOverscroll dips negative and springs home. RN iOS reports scroll velocity in
// pt/ms; Reanimated springs take pt/s.
const TOP_REBOUND_SPRING = { damping: 28, stiffness: 300, mass: 0.6 } as const;
const MOMENTUM_EDGE_MIN_VELOCITY_PT_MS = 0.15;

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
  maxScrollOffset,
  contentOverscroll,
  primaryScrollOffset,
  secondaryScrollOffset,
  primaryScrollTopOffset,
  secondaryScrollTopOffset,
}: UseBottomSheetSharedScrollEventsRuntimeArgs): UseBottomSheetSharedScrollEventsRuntimeResult => {
  // One impulse per momentum episode (reset when a new drag/momentum begins).
  const topReboundFired = useSharedValue(false);
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
          maxScrollOffset.value = Math.max(
            0,
            (event.contentSize?.height ?? 0) - (event.layoutMeasurement?.height ?? 0)
          );
          const arrivalVelocity = Math.abs(event.velocity?.y ?? 0);
          if (
            isInMomentum.value &&
            !topReboundFired.value &&
            event.contentOffset.y <= scrollTopOffset.value + 0.5 &&
            arrivalVelocity >= MOMENTUM_EDGE_MIN_VELOCITY_PT_MS
          ) {
            topReboundFired.value = true;
            contentOverscroll.value = withSpring(0, {
              ...TOP_REBOUND_SPRING,
              velocity: -arrivalVelocity * 1000,
            });
          }
        }
      },
      onBeginDrag: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
        topReboundFired.value = false;
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
          maxScrollOffset.value = Math.max(
            0,
            (event.contentSize?.height ?? 0) - (event.layoutMeasurement?.height ?? 0)
          );
          const arrivalVelocity = Math.abs(event.velocity?.y ?? 0);
          if (
            isInMomentum.value &&
            !topReboundFired.value &&
            event.contentOffset.y <= scrollTopOffset.value + 0.5 &&
            arrivalVelocity >= MOMENTUM_EDGE_MIN_VELOCITY_PT_MS
          ) {
            topReboundFired.value = true;
            contentOverscroll.value = withSpring(0, {
              ...TOP_REBOUND_SPRING,
              velocity: -arrivalVelocity * 1000,
            });
          }
        }
      },
      onBeginDrag: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
        topReboundFired.value = false;
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
          maxScrollOffset.value = Math.max(
            0,
            (event.contentSize?.height ?? 0) - (event.layoutMeasurement?.height ?? 0)
          );
          const arrivalVelocity = Math.abs(event.velocity?.y ?? 0);
          if (
            isInMomentum.value &&
            !topReboundFired.value &&
            event.contentOffset.y <= scrollTopOffset.value + 0.5 &&
            arrivalVelocity >= MOMENTUM_EDGE_MIN_VELOCITY_PT_MS
          ) {
            topReboundFired.value = true;
            contentOverscroll.value = withSpring(0, {
              ...TOP_REBOUND_SPRING,
              velocity: -arrivalVelocity * 1000,
            });
          }
        }
      },
      onBeginDrag: () => {
        topReboundFired.value = false;
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
