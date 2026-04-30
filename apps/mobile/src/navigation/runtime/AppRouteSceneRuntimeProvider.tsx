import React from 'react';

import {
  createAppRouteSceneRuntime,
  type AppRouteSceneRuntime,
} from './app-route-scene-runtime';

const AppRouteSceneRuntimeContext =
  React.createContext<AppRouteSceneRuntime | null>(null);

export const AppRouteSceneRuntimeProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const runtimeRef = React.useRef<AppRouteSceneRuntime | null>(null);

  if (runtimeRef.current == null) {
    runtimeRef.current = createAppRouteSceneRuntime();
  }

  const runtime = runtimeRef.current;

  React.useEffect(
    () => () => {
      runtime.dispose();
    },
    [runtime]
  );

  return (
    <AppRouteSceneRuntimeContext.Provider value={runtime}>
      {children}
    </AppRouteSceneRuntimeContext.Provider>
  );
};

export const useAppRouteSceneRuntime = (): AppRouteSceneRuntime => {
  const runtime = React.useContext(AppRouteSceneRuntimeContext);
  if (!runtime) {
    throw new Error(
      'useAppRouteSceneRuntime must be used within AppRouteSceneRuntimeProvider'
    );
  }
  return runtime;
};
