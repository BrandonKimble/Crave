import React from 'react';

import { runOnUI } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

type UseBottomSheetSharedActiveListRuntimeArgs = {
  resolvedActiveList: 'primary' | 'secondary';
  activePrimaryList: SharedValue<boolean>;
  scrollOffset: SharedValue<number>;
  scrollTopOffset: SharedValue<number>;
  primaryScrollOffset: SharedValue<number>;
  secondaryScrollOffset: SharedValue<number>;
  primaryScrollTopOffset: SharedValue<number>;
  secondaryScrollTopOffset: SharedValue<number>;
};

export const useBottomSheetSharedActiveListRuntime = ({
  resolvedActiveList,
  activePrimaryList,
  scrollOffset,
  scrollTopOffset,
  primaryScrollOffset,
  secondaryScrollOffset,
  primaryScrollTopOffset,
  secondaryScrollTopOffset,
}: UseBottomSheetSharedActiveListRuntimeArgs): void => {
  React.useEffect(() => {
    const shouldUsePrimary = resolvedActiveList === 'primary';
    runOnUI((usePrimary: boolean) => {
      'worklet';
      activePrimaryList.value = usePrimary;
      scrollOffset.value = usePrimary ? primaryScrollOffset.value : secondaryScrollOffset.value;
      scrollTopOffset.value = usePrimary
        ? primaryScrollTopOffset.value
        : secondaryScrollTopOffset.value;
    })(shouldUsePrimary);
  }, [
    activePrimaryList,
    primaryScrollOffset,
    primaryScrollTopOffset,
    resolvedActiveList,
    scrollOffset,
    scrollTopOffset,
    secondaryScrollOffset,
    secondaryScrollTopOffset,
  ]);
};
