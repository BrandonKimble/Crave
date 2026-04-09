import React from 'react';
import { useSharedValue } from 'react-native-reanimated';

type UseBottomSheetHostActiveScrollRuntimeArgs = {
  activeList?: 'primary' | 'secondary';
  dualListEnabled?: boolean;
  scrollOffset: { value: number };
};

export const useBottomSheetHostActiveScrollRuntime = ({
  activeList = 'primary',
  dualListEnabled = false,
  scrollOffset,
}: UseBottomSheetHostActiveScrollRuntimeArgs) => {
  const primaryScrollOffset = useSharedValue(0);
  const secondaryScrollOffset = useSharedValue(0);
  const primaryScrollTopOffset = useSharedValue(0);
  const secondaryScrollTopOffset = useSharedValue(0);
  const scrollTopOffset = useSharedValue(0);
  const activePrimaryList = useSharedValue(true);

  React.useEffect(() => {
    const shouldUsePrimary = !dualListEnabled || activeList === 'primary';
    activePrimaryList.value = shouldUsePrimary;
    scrollOffset.value = shouldUsePrimary ? primaryScrollOffset.value : secondaryScrollOffset.value;
    scrollTopOffset.value = shouldUsePrimary
      ? primaryScrollTopOffset.value
      : secondaryScrollTopOffset.value;
  }, [
    activeList,
    activePrimaryList,
    dualListEnabled,
    primaryScrollOffset,
    primaryScrollTopOffset,
    scrollOffset,
    scrollTopOffset,
    secondaryScrollOffset,
    secondaryScrollTopOffset,
  ]);

  return React.useMemo(
    () => ({
      activePrimaryList,
      primaryScrollOffset,
      secondaryScrollOffset,
      primaryScrollTopOffset,
      secondaryScrollTopOffset,
      scrollTopOffset,
    }),
    [
      activePrimaryList,
      primaryScrollOffset,
      primaryScrollTopOffset,
      scrollTopOffset,
      secondaryScrollOffset,
      secondaryScrollTopOffset,
    ]
  );
};
