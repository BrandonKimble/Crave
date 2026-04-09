import React from 'react';

import type {
  BottomSheetNativeHostEvent,
  BottomSheetNativeHostProps,
} from './BottomSheetNativeHost';
import type {
  BottomSheetNativeEventRuntime,
  BottomSheetNativeEventRuntimeArgs,
} from './bottomSheetNativeEventRuntimeContract';
import { useBottomSheetNativeActivityEventRuntime } from './useBottomSheetNativeActivityEventRuntime';
import { useBottomSheetNativeHostVisibilityRuntime } from './useBottomSheetNativeHostVisibilityRuntime';
import { useBottomSheetNativeSnapEventRuntime } from './useBottomSheetNativeSnapEventRuntime';

export const useBottomSheetNativeEventRuntime = ({
  visible,
  initialSnapPoint,
  runtime,
  resolveSnapTargetY,
  onHidden,
  onSnapStart,
  onSnapChange,
  onDragStateChange,
  onSettleStateChange,
}: BottomSheetNativeEventRuntimeArgs): BottomSheetNativeEventRuntime => {
  const { presentationState, snapController } = runtime;
  const { sheetY } = presentationState;
  const handleProgrammaticSnapEvent =
    'handleProgrammaticSnapEvent' in snapController
      ? snapController.handleProgrammaticSnapEvent
      : undefined;

  const { handleSnapStartVisibility, handleSnapChangeVisibility, pointerEvents } =
    useBottomSheetNativeHostVisibilityRuntime({
      visible,
      initialSnapPoint,
    });

  const { handleSheetYEvent, handleDragStateEvent, handleSettleStateEvent } =
    useBottomSheetNativeActivityEventRuntime({
      sheetY,
      onDragStateChange,
      onSettleStateChange,
    });

  const { handleSnapStartEvent, handleSnapChangeEvent } = useBottomSheetNativeSnapEventRuntime({
    resolveSnapTargetY,
    onHidden,
    onSnapStart,
    onSnapChange,
    sheetY,
    handleProgrammaticSnapEvent,
    handleSnapStartVisibility,
    handleSnapChangeVisibility,
  });

  const onHostEvent = React.useCallback(
    (event: BottomSheetNativeHostEvent) => {
      switch (event.eventType) {
        case 'sheet_y':
          handleSheetYEvent(event.sheetY);
          return;
        case 'snap_start':
          handleSnapStartEvent(event.snap, event.source);
          return;
        case 'snap_change':
          handleSnapChangeEvent(event.snap, event.source);
          return;
        case 'drag_state':
          handleDragStateEvent(event.isActive);
          return;
        case 'settle_state':
          handleSettleStateEvent(event.isActive);
          return;
        default:
          return;
      }
    },
    [
      handleDragStateEvent,
      handleSettleStateEvent,
      handleSheetYEvent,
      handleSnapChangeEvent,
      handleSnapStartEvent,
    ]
  );

  const hostEventProps = React.useMemo<
    Pick<BottomSheetNativeHostProps, 'onHostEvent' | 'pointerEvents'>
  >(
    () => ({
      onHostEvent,
      pointerEvents,
    }),
    [onHostEvent, pointerEvents]
  );

  return React.useMemo(
    () => ({
      hostEventProps,
    }),
    [hostEventProps]
  );
};
