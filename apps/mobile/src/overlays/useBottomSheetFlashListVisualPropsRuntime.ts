import React from 'react';
import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

import type {
  BottomSheetWithFlashListListProps,
  BottomSheetWithFlashListProps,
} from './bottomSheetWithFlashListContract';

const DEFAULT_DRAW_DISTANCE = 140;
const DEFAULT_INITIAL_DRAW_BATCH_SIZE = 8;

type UseBottomSheetFlashListVisualPropsRuntimeArgs<T> = {
  flashListProps: BottomSheetWithFlashListProps<T>['flashListProps'];
  listProps: BottomSheetWithFlashListListProps<T> | null;
};

export const useBottomSheetFlashListVisualPropsRuntime = <T>({
  flashListProps,
  listProps,
}: UseBottomSheetFlashListVisualPropsRuntimeArgs<T>) => {
  const flashListSurfaceStyle = React.useMemo<ViewStyle | undefined>(
    () => StyleSheet.flatten(flashListProps?.style) ?? undefined,
    [flashListProps?.style]
  );

  const resolvedFlashListProps = React.useMemo(() => {
    if (!listProps) {
      return null;
    }
    const overrideProps = {
      initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
      ...(flashListProps?.overrideProps ?? {}),
    };
    return {
      drawDistance: DEFAULT_DRAW_DISTANCE,
      removeClippedSubviews: false,
      estimatedItemSize: listProps.estimatedItemSize,
      ...flashListProps,
      overrideProps,
    };
  }, [flashListProps, listProps]);

  return React.useMemo(
    () => ({
      flashListSurfaceStyle,
      resolvedFlashListProps,
    }),
    [flashListSurfaceStyle, resolvedFlashListProps]
  );
};
