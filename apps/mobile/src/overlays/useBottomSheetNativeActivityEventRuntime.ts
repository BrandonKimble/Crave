import React from 'react';

import type { SharedValue } from 'react-native-reanimated';

type UseBottomSheetNativeActivityEventRuntimeArgs = {
  sheetY: SharedValue<number>;
  onDragStateChange?: (isActive: boolean) => void;
  onSettleStateChange?: (isActive: boolean) => void;
};

export const useBottomSheetNativeActivityEventRuntime = ({
  sheetY,
  onDragStateChange,
  onSettleStateChange,
}: UseBottomSheetNativeActivityEventRuntimeArgs) => {
  const handleSheetYEvent = React.useCallback(
    (nextSheetY: number) => {
      sheetY.value = nextSheetY;
    },
    [sheetY]
  );

  const handleDragStateEvent = React.useCallback(
    (isActive: boolean) => {
      onDragStateChange?.(isActive);
    },
    [onDragStateChange]
  );

  const handleSettleStateEvent = React.useCallback(
    (isActive: boolean) => {
      onSettleStateChange?.(isActive);
    },
    [onSettleStateChange]
  );

  return React.useMemo(
    () => ({
      handleSheetYEvent,
      handleDragStateEvent,
      handleSettleStateEvent,
    }),
    [handleDragStateEvent, handleSettleStateEvent, handleSheetYEvent]
  );
};
