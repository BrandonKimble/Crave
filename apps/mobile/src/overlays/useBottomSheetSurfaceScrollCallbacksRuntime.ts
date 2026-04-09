import React from 'react';

import type { BottomSheetWithFlashListProps } from './bottomSheetWithFlashListContract';

type UseBottomSheetSurfaceScrollCallbacksRuntimeArgs<T> = {
  flashListProps: BottomSheetWithFlashListProps<T>['flashListProps'];
  onScrollBeginDrag?: BottomSheetWithFlashListProps<T>['onScrollBeginDrag'];
  onScrollEndDrag?: BottomSheetWithFlashListProps<T>['onScrollEndDrag'];
  onScrollOffsetChange?: BottomSheetWithFlashListProps<T>['onScrollOffsetChange'];
  scrollOffset: { value: number };
};

export const useBottomSheetSurfaceScrollCallbacksRuntime = <T>({
  flashListProps,
  onScrollBeginDrag,
  onScrollEndDrag,
  onScrollOffsetChange,
  scrollOffset,
}: UseBottomSheetSurfaceScrollCallbacksRuntimeArgs<T>) => {
  const handleScrollBeginDrag = React.useCallback(
    (event?: unknown) => {
      onScrollBeginDrag?.();
      flashListProps?.onScrollBeginDrag?.(event as never);
    },
    [flashListProps, onScrollBeginDrag]
  );

  const handleScrollEndDrag = React.useCallback(
    (event?: unknown) => {
      onScrollEndDrag?.();
      if (onScrollOffsetChange) {
        onScrollOffsetChange(scrollOffset.value);
      }
      flashListProps?.onScrollEndDrag?.(event as never);
    },
    [flashListProps, onScrollEndDrag, onScrollOffsetChange, scrollOffset]
  );

  const handleContentScrollEndDrag = React.useCallback(() => {
    onScrollEndDrag?.();
    if (onScrollOffsetChange) {
      onScrollOffsetChange(scrollOffset.value);
    }
  }, [onScrollEndDrag, onScrollOffsetChange, scrollOffset]);

  return React.useMemo(
    () => ({
      handleScrollBeginDrag,
      handleScrollEndDrag,
      handleContentScrollEndDrag,
    }),
    [handleContentScrollEndDrag, handleScrollBeginDrag, handleScrollEndDrag]
  );
};
