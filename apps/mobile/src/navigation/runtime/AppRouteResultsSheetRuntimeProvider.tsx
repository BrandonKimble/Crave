import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  AppRouteResultsSheetRuntimeOwner,
  AppRouteResultsSheetVisualBinding,
} from './app-route-results-sheet-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import {
  getAppRouteResultsSheetVisualBinding,
  useAppRouteResultsSheetRuntime,
} from './use-app-route-results-sheet-runtime';

const AppRouteResultsSheetRuntimeContext =
  React.createContext<AppRouteResultsSheetRuntimeOwner | null>(null);

const AppRouteResultsSheetVisualBindingContext =
  React.createContext<AppRouteResultsSheetVisualBinding | null>(null);

export const useAppRouteResultsSheetRuntimeOwner = (): AppRouteResultsSheetRuntimeOwner => {
  const runtimeOwner = React.useContext(AppRouteResultsSheetRuntimeContext);
  if (runtimeOwner == null) {
    throw new Error(
      'useAppRouteResultsSheetRuntimeOwner must be used within AppRouteResultsSheetRuntimeProvider'
    );
  }
  return runtimeOwner;
};

export const useAppRouteResultsSheetVisualBindingOwner = (): AppRouteResultsSheetVisualBinding => {
  const visualBinding = React.useContext(AppRouteResultsSheetVisualBindingContext);
  if (visualBinding == null) {
    throw new Error(
      'useAppRouteResultsSheetVisualBindingOwner must be used within AppRouteResultsSheetRuntimeProvider'
    );
  }
  return visualBinding;
};

export const AppRouteResultsSheetRuntimeProvider = ({
  children,
  routeSceneRuntime,
}: React.PropsWithChildren<{
  routeSceneRuntime: AppRouteSceneRuntime;
}>) => {
  const insets = useSafeAreaInsets();
  const runtimeOwner = useAppRouteResultsSheetRuntime({
    insetsTop: insets.top,
    routeSceneRuntime,
  });
  const visualBinding = React.useMemo(
    () => getAppRouteResultsSheetVisualBinding(runtimeOwner),
    [
      runtimeOwner.resultsMomentum,
      runtimeOwner.resultsScrollOffset,
      runtimeOwner.sheetTranslateY,
      runtimeOwner.snapPoints,
    ]
  );

  React.useEffect(() => {
    routeSceneRuntime.publishRouteResultsSheetVisualBinding(visualBinding);
  }, [routeSceneRuntime, visualBinding]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.publishRouteResultsSheetVisualBinding(null);
    },
    [routeSceneRuntime]
  );

  return (
    <AppRouteResultsSheetVisualBindingContext.Provider value={visualBinding}>
      <AppRouteResultsSheetRuntimeContext.Provider value={runtimeOwner}>
        {children}
      </AppRouteResultsSheetRuntimeContext.Provider>
    </AppRouteResultsSheetVisualBindingContext.Provider>
  );
};
