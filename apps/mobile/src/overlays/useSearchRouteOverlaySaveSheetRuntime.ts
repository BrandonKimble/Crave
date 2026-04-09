import React from 'react';

import { useKeyedCallback } from '../hooks/useCallbackFactory';
import type { SearchRouteSaveSheetState } from './searchRouteOverlayCommandStore';
import type { SearchRouteOverlaySaveSheetRuntime } from './searchRouteOverlayCommandRuntimeContract';

type UseSearchRouteOverlaySaveSheetRuntimeArgs = {
  saveSheetState: SearchRouteSaveSheetState;
  setSaveSheetState: (next: React.SetStateAction<SearchRouteSaveSheetState>) => void;
};

export const useSearchRouteOverlaySaveSheetRuntime = ({
  saveSheetState,
  setSaveSheetState,
}: UseSearchRouteOverlaySaveSheetRuntimeArgs): SearchRouteOverlaySaveSheetRuntime => {
  const getDishSaveHandler = useKeyedCallback(
    (connectionId: string) =>
      setSaveSheetState({
        visible: true,
        listType: 'dish',
        target: { connectionId },
      }),
    [setSaveSheetState]
  );
  const getRestaurantSaveHandler = useKeyedCallback(
    (restaurantId: string) =>
      setSaveSheetState({
        visible: true,
        listType: 'restaurant',
        target: { restaurantId },
      }),
    [setSaveSheetState]
  );
  const handleRestaurantSavePress = React.useCallback(
    (restaurantId: string) => {
      setSaveSheetState({
        visible: true,
        listType: 'restaurant',
        target: { restaurantId },
      });
    },
    [setSaveSheetState]
  );
  const handleCloseSaveSheet = React.useCallback(() => {
    setSaveSheetState((prev) => ({ ...prev, visible: false, target: null }));
  }, [setSaveSheetState]);

  return React.useMemo(
    () => ({
      saveSheetState,
      showSaveListOverlay: saveSheetState.visible,
      getDishSaveHandler,
      getRestaurantSaveHandler,
      handleRestaurantSavePress,
      handleCloseSaveSheet,
    }),
    [
      getDishSaveHandler,
      getRestaurantSaveHandler,
      handleCloseSaveSheet,
      handleRestaurantSavePress,
      saveSheetState,
    ]
  );
};
