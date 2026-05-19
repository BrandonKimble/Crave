import React from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';

import type { ComposedGesture, GestureType } from 'react-native-gesture-handler';

import BottomSheetScrollContainer from './BottomSheetScrollContainer';

type UseBottomSheetSharedScrollContainerRuntimeArgs = {
  gesturesScroll: GestureType | ComposedGesture;
  scrollHeaderComponent?: React.ReactNode;
};

type UseBottomSheetSharedScrollContainerRuntimeResult = {
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
};

export const useBottomSheetSharedScrollContainerRuntime = ({
  gesturesScroll,
  scrollHeaderComponent,
}: UseBottomSheetSharedScrollContainerRuntimeArgs): UseBottomSheetSharedScrollContainerRuntimeResult => {
  const transparent = scrollHeaderComponent != null;

  const ScrollComponent = React.useMemo(() => {
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => (
      <BottomSheetScrollContainer
        {...props}
        ref={ref}
        gesture={gesturesScroll}
        transparent={transparent}
      />
    ));
    Component.displayName = 'OverlaySheetScrollView';
    return Component;
  }, [gesturesScroll, transparent]);

  return {
    ScrollComponent,
  };
};
