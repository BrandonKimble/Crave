import React from 'react';

import { createAppRouteSceneRuntime, type AppRouteSceneRuntime } from './app-route-scene-runtime';
import { registerResidentWorldRouteStateReader } from './resident-world-read-registry';

const AppRouteSceneRuntimeContext = React.createContext<AppRouteSceneRuntime | null>(null);

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

  // §Q redo (presenter shared gate): register the module-level residency reader so
  // module-scope senders (native render owner flush, source-frame publisher) can gate
  // on "is a world-bearing entry resident?" without React plumbing.
  React.useEffect(
    () =>
      registerResidentWorldRouteStateReader(() => runtime.routeSceneSwitchRuntime.getRouteState()),
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
    throw new Error('useAppRouteSceneRuntime must be used within AppRouteSceneRuntimeProvider');
  }
  return runtime;
};
