import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  AppRouteSharedSheetRuntimeOwner,
  AppRouteSharedSheetVisualBinding,
} from './app-route-shared-sheet-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import {
  getAppRouteSharedSheetVisualBinding,
  useAppRouteSharedSheetRuntime,
} from './use-app-route-shared-sheet-runtime';

const AppRouteSharedSheetRuntimeContext =
  React.createContext<AppRouteSharedSheetRuntimeOwner | null>(null);

const AppRouteSharedSheetVisualBindingContext =
  React.createContext<AppRouteSharedSheetVisualBinding | null>(null);

export const useAppRouteSharedSheetRuntimeOwner = (): AppRouteSharedSheetRuntimeOwner => {
  const runtimeOwner = React.useContext(AppRouteSharedSheetRuntimeContext);
  if (runtimeOwner == null) {
    throw new Error(
      'useAppRouteSharedSheetRuntimeOwner must be used within AppRouteSharedSheetRuntimeProvider'
    );
  }
  return runtimeOwner;
};

export const useAppRouteSharedSheetVisualBindingOwner = (): AppRouteSharedSheetVisualBinding => {
  const visualBinding = React.useContext(AppRouteSharedSheetVisualBindingContext);
  if (visualBinding == null) {
    throw new Error(
      'useAppRouteSharedSheetVisualBindingOwner must be used within AppRouteSharedSheetRuntimeProvider'
    );
  }
  return visualBinding;
};

export const AppRouteSharedSheetRuntimeProvider = ({
  children,
  routeSceneRuntime,
}: React.PropsWithChildren<{
  routeSceneRuntime: AppRouteSceneRuntime;
}>) => {
  const insets = useSafeAreaInsets();
  const runtimeOwner = useAppRouteSharedSheetRuntime({
    insetsTop: insets.top,
    routeSceneRuntime,
  });
  const visualBinding = React.useMemo(
    () => getAppRouteSharedSheetVisualBinding(runtimeOwner),
    [
      runtimeOwner.sheetMomentum,
      runtimeOwner.sheetScrollOffset,
      runtimeOwner.sheetTranslateY,
      runtimeOwner.snapPoints,
    ]
  );

  React.useEffect(() => {
    routeSceneRuntime.publishRouteSharedSheetVisualBinding(visualBinding);
  }, [routeSceneRuntime, visualBinding]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.publishRouteSharedSheetVisualBinding(null);
    },
    [routeSceneRuntime]
  );

  return (
    <AppRouteSharedSheetVisualBindingContext.Provider value={visualBinding}>
      <AppRouteSharedSheetRuntimeContext.Provider value={runtimeOwner}>
        {children}
      </AppRouteSharedSheetRuntimeContext.Provider>
    </AppRouteSharedSheetVisualBindingContext.Provider>
  );
};
