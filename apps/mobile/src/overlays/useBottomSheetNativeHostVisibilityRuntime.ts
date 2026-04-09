import React from 'react';

import type { BottomSheetSnap } from './bottomSheetMotionTypes';

type UseBottomSheetNativeHostVisibilityRuntimeArgs = {
  visible: boolean;
  initialSnapPoint: Exclude<BottomSheetSnap, 'hidden'>;
};

export const useBottomSheetNativeHostVisibilityRuntime = ({
  visible,
  initialSnapPoint,
}: UseBottomSheetNativeHostVisibilityRuntimeArgs) => {
  const [touchBlocked, setTouchBlocked] = React.useState(!visible);
  const lastSnapRef = React.useRef<BottomSheetSnap>(visible ? initialSnapPoint : 'hidden');

  React.useEffect(() => {
    if (!visible) {
      lastSnapRef.current = 'hidden';
      setTouchBlocked(true);
      return;
    }
    setTouchBlocked(initialSnapPoint === 'hidden');
    lastSnapRef.current = initialSnapPoint;
  }, [initialSnapPoint, visible]);

  const handleSnapStartVisibility = React.useCallback((snap: BottomSheetSnap) => {
    setTouchBlocked(snap === 'hidden');
  }, []);

  const handleSnapChangeVisibility = React.useCallback((snap: BottomSheetSnap) => {
    const previousSnap = lastSnapRef.current;
    lastSnapRef.current = snap;
    setTouchBlocked(snap === 'hidden');
    return previousSnap;
  }, []);

  const pointerEvents = touchBlocked ? 'none' : 'auto';

  return React.useMemo(
    () => ({
      handleSnapStartVisibility,
      handleSnapChangeVisibility,
      pointerEvents,
    }),
    [handleSnapChangeVisibility, handleSnapStartVisibility, pointerEvents]
  );
};
