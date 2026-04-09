import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';

import {
  isBottomSheetListSurface,
  type BottomSheetWithFlashListContentOnlyProps,
  type BottomSheetWithFlashListListProps,
} from './bottomSheetWithFlashListContract';
import type {
  BottomSheetSurfaceRefsRuntime,
  UseBottomSheetSurfaceRuntimeArgs,
} from './bottomSheetSurfaceRuntimeContract';

type UseBottomSheetSurfaceRefsRuntimeArgs<T> = {
  activeList: 'primary' | 'secondary';
  surfaceProps: UseBottomSheetSurfaceRuntimeArgs<T>['surfaceProps'];
};

export const useBottomSheetSurfaceRefsRuntime = <T>({
  activeList,
  surfaceProps,
}: UseBottomSheetSurfaceRefsRuntimeArgs<T>): BottomSheetSurfaceRefsRuntime<T> => {
  const listProps = isBottomSheetListSurface(surfaceProps)
    ? (surfaceProps as BottomSheetWithFlashListListProps<T>)
    : null;
  const contentProps =
    listProps == null ? (surfaceProps as BottomSheetWithFlashListContentOnlyProps) : null;

  const internalListRef = React.useRef<FlashListRef<T> | null>(null);
  const flashListRef = listProps?.listRef ?? internalListRef;
  const internalSecondaryListRef = React.useRef<FlashListRef<T> | null>(null);
  const secondaryFlashListRef = listProps?.secondaryList?.listRef ?? internalSecondaryListRef;
  const shouldRenderDualLists = listProps?.secondaryList != null;
  const resolvedActiveList = shouldRenderDualLists ? activeList : 'primary';

  return React.useMemo(
    () => ({
      listProps,
      contentProps,
      flashListRef,
      secondaryFlashListRef,
      shouldRenderDualLists,
      resolvedActiveList,
    }),
    [
      contentProps,
      flashListRef,
      listProps,
      resolvedActiveList,
      secondaryFlashListRef,
      shouldRenderDualLists,
    ]
  );
};
