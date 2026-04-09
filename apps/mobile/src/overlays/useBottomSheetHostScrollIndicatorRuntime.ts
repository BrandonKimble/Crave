import React from 'react';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { isBottomSheetScrollAtTop } from './bottomSheetHostScrollRuntimeUtils';

type UseBottomSheetHostScrollIndicatorRuntimeArgs = {
  showsVerticalScrollIndicator?: boolean;
  scrollOffset: { value: number };
  scrollTopOffset: { value: number };
};

export const useBottomSheetHostScrollIndicatorRuntime = ({
  showsVerticalScrollIndicator = false,
  scrollOffset,
  scrollTopOffset,
}: UseBottomSheetHostScrollIndicatorRuntimeArgs) => {
  const baseShowsVerticalScrollIndicatorSV = useSharedValue(Boolean(showsVerticalScrollIndicator));
  const [effectiveShowsVerticalScrollIndicator, setEffectiveShowsVerticalScrollIndicator] =
    React.useState(Boolean(showsVerticalScrollIndicator));

  const setIndicatorVisible = React.useCallback((value: boolean) => {
    setEffectiveShowsVerticalScrollIndicator((previous) => (previous === value ? previous : value));
  }, []);

  React.useEffect(() => {
    const next = Boolean(showsVerticalScrollIndicator);
    baseShowsVerticalScrollIndicatorSV.value = next;
    if (!next) {
      setIndicatorVisible(false);
    }
  }, [baseShowsVerticalScrollIndicatorSV, setIndicatorVisible, showsVerticalScrollIndicator]);

  useAnimatedReaction(
    () => {
      const atTop = isBottomSheetScrollAtTop(scrollOffset.value, scrollTopOffset.value);
      return baseShowsVerticalScrollIndicatorSV.value && !atTop;
    },
    (shouldShow, previousShouldShow) => {
      if (shouldShow === previousShouldShow) {
        return;
      }
      runOnJS(setIndicatorVisible)(shouldShow);
    },
    [baseShowsVerticalScrollIndicatorSV, scrollOffset, scrollTopOffset, setIndicatorVisible]
  );

  return effectiveShowsVerticalScrollIndicator;
};
