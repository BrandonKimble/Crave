import type { ScrollViewProps } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { ReanimatedScrollEvent } from 'react-native-reanimated/lib/typescript/hook/commonTypes';
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
  /** Native rubber's `d`: the ACTIVE list's viewport height (same one-writer law). */
  scrollViewportHeight: SharedValue<number>;
  boundaryFactsKnown: SharedValue<boolean>;
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
// Native baseline: critically damped (no overshoot), ~450ms return — the impulse's
// depth comes from the carried velocity, the spring only shapes the return.
const TOP_REBOUND_SPRING = { mass: 1, stiffness: 170, damping: 26 } as const;
// Arrival speed is DERIVED from momentum offset deltas (probe-proven 2026-07-23:
// event.velocity is null in these Reanimated scroll events; the deltas are the
// velocity — ~1 event/frame at 60Hz, so pt/frame × 60 = pt/s).
const MOMENTUM_EDGE_MIN_DELTA_PT_PER_FRAME = 4;
const FRAMES_PER_SECOND = 60;

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
  scrollViewportHeight,
  boundaryFactsKnown,
  contentOverscroll,
  primaryScrollOffset,
  secondaryScrollOffset,
  primaryScrollTopOffset,
  secondaryScrollTopOffset,
}: UseBottomSheetSharedScrollEventsRuntimeArgs): UseBottomSheetSharedScrollEventsRuntimeResult => {
  // One impulse per momentum episode (reset when a new drag begins).
  const topReboundFired = useSharedValue(false);
  // The previous momentum event's offset + step — the derived arrival velocity's inputs.
  const momentumPrevOffset = useSharedValue(0);
  const momentumPrevDelta = useSharedValue(0);

  // ─── ONE HANDLER FACTORY (red-team ledger: the config was hand-copied three times —
  // the drift disease). Each list role differs by exactly two facts: which per-list
  // offset pair it owns, and whether it is the active list when activePrimaryList is
  // true. Everything else — the shared-fact writes (scrollOffset/scrollTopOffset/
  // maxScrollOffset/scrollViewportHeight), the top momentum-rebound impulse, the
  // momentum bookkeeping — is written ONCE here. All inner functions are worklets
  // (the babel plugin workletizes directive-marked closures created at hook time).
  const buildHandlerConfig = ({
    activeWhenPrimary,
    ownScrollOffset,
    ownScrollTopOffset,
  }: {
    activeWhenPrimary: boolean;
    ownScrollOffset: SharedValue<number>;
    ownScrollTopOffset: SharedValue<number>;
  }) => {
    const isActiveList = () => {
      'worklet';
      return activePrimaryList.value === activeWhenPrimary;
    };
    return {
      onScroll: (event: ReanimatedScrollEvent) => {
        'worklet';
        const nextTopOffset = getScrollTopOffset(event.contentInset?.top);
        if (Math.abs(nextTopOffset - ownScrollTopOffset.value) > 0.5) {
          ownScrollTopOffset.value = nextTopOffset;
        }
        ownScrollOffset.value = event.contentOffset.y;
        if (!isActiveList()) {
          return;
        }
        if (Math.abs(nextTopOffset - scrollTopOffset.value) > 0.5) {
          scrollTopOffset.value = nextTopOffset;
        }
        scrollOffset.value = event.contentOffset.y;
        // BOUNDARY FACTS ARE NOT WRITTEN HERE (polls red team, probe-proven
        // 2026-07-24): event.contentSize is NULL in these Reanimated scroll events
        // (like event.velocity) — deriving max here wrote a POISONED trusted 0
        // (max=0, vp=real, known=true) on every scroll, which activated the bottom
        // pan against the native scroll (the polls double-motion). The container's
        // layout/content-size publication is THE one writer of max/viewport/known.
        if (isInMomentum.value) {
          const stepDelta = Math.abs(event.contentOffset.y - momentumPrevOffset.value);
          const arrivalDelta = Math.max(stepDelta, momentumPrevDelta.value);
          if (
            !topReboundFired.value &&
            event.contentOffset.y <= scrollTopOffset.value + 0.5 &&
            arrivalDelta >= MOMENTUM_EDGE_MIN_DELTA_PT_PER_FRAME
          ) {
            topReboundFired.value = true;
            contentOverscroll.value = withSpring(0, {
              ...TOP_REBOUND_SPRING,
              velocity: -arrivalDelta * FRAMES_PER_SECOND,
            });
          }
          momentumPrevDelta.value = stepDelta;
          momentumPrevOffset.value = event.contentOffset.y;
        }
      },
      onBeginDrag: () => {
        'worklet';
        if (!isActiveList()) {
          return;
        }
        console.log(
          `[ARBDBG] scroll beginDrag off=${scrollOffset.value.toFixed(1)} activeWhenPrimary=${activeWhenPrimary}`
        );
        isInMomentum.value = false;
        topReboundFired.value = false;
        momentumPrevDelta.value = 0;
        momentumPrevOffset.value = scrollOffset.value;
      },
      onMomentumBegin: () => {
        'worklet';
        if (!isActiveList()) {
          return;
        }
        isInMomentum.value = true;
        if (onMomentumBeginJS) {
          runOnJS(onMomentumBeginJS)();
        }
      },
      onMomentumEnd: () => {
        'worklet';
        if (!isActiveList()) {
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
    };
  };

  const handlerDeps = [
    activePrimaryList,
    isInMomentum,
    onMomentumBeginJS,
    onMomentumEndJS,
    onScrollOffsetChange,
    scrollOffset,
    scrollTopOffset,
    maxScrollOffset,
    scrollViewportHeight,
    contentOverscroll,
  ];

  const primaryAnimatedScrollHandler = useAnimatedScrollHandler(
    buildHandlerConfig({
      activeWhenPrimary: true,
      ownScrollOffset: primaryScrollOffset,
      ownScrollTopOffset: primaryScrollTopOffset,
    }),
    [...handlerDeps, primaryScrollOffset, primaryScrollTopOffset]
  );

  const primaryScrollViewAnimatedScrollHandler = useAnimatedScrollHandler(
    buildHandlerConfig({
      activeWhenPrimary: true,
      ownScrollOffset: primaryScrollOffset,
      ownScrollTopOffset: primaryScrollTopOffset,
    }),
    [...handlerDeps, primaryScrollOffset, primaryScrollTopOffset]
  );

  const secondaryAnimatedScrollHandler = useAnimatedScrollHandler(
    buildHandlerConfig({
      activeWhenPrimary: false,
      ownScrollOffset: secondaryScrollOffset,
      ownScrollTopOffset: secondaryScrollTopOffset,
    }),
    [...handlerDeps, secondaryScrollOffset, secondaryScrollTopOffset]
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
