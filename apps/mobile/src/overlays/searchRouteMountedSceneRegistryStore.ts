import React from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { SearchRouteOverlaySceneRegistry } from './searchResolvedRouteHostModelContract';
import type {
  SearchRouteSceneDefinition,
  SearchRouteSceneShellSpec,
} from './searchOverlayRouteHostContract';
import type { OverlayKey } from './types';

type SearchRouteMountedSceneRegistryState = {
  sceneRegistry: SearchRouteOverlaySceneRegistry;
  setSceneDefinition: (
    sceneKey: OverlayKey,
    sceneDefinition: SearchRouteSceneDefinition | null
  ) => void;
  clearSceneDefinition: (sceneKey: OverlayKey) => void;
};

export const useSearchRouteMountedSceneRegistryStore = create<SearchRouteMountedSceneRegistryState>(
  (set) => ({
    sceneRegistry: {},
    setSceneDefinition: (sceneKey, sceneDefinition) =>
      set((state) => {
        const previous = state.sceneRegistry[sceneKey] ?? null;
        if (previous === sceneDefinition) {
          return state;
        }

        if (!sceneDefinition) {
          if (!(sceneKey in state.sceneRegistry)) {
            return state;
          }
          const nextSceneRegistry = { ...state.sceneRegistry };
          delete nextSceneRegistry[sceneKey];
          return { sceneRegistry: nextSceneRegistry };
        }

        return {
          sceneRegistry: {
            ...state.sceneRegistry,
            [sceneKey]: sceneDefinition,
          },
        };
      }),
    clearSceneDefinition: (sceneKey) =>
      set((state) => {
        if (!(sceneKey in state.sceneRegistry)) {
          return state;
        }
        const nextSceneRegistry = { ...state.sceneRegistry };
        delete nextSceneRegistry[sceneKey];
        return { sceneRegistry: nextSceneRegistry };
      }),
  })
);

export const useSearchRouteMountedSceneRegistryState = (): SearchRouteOverlaySceneRegistry =>
  useSearchRouteMountedSceneRegistryStore(useShallow((state) => state.sceneRegistry));

export const useSearchRouteMountedSceneKeys = (): OverlayKey[] =>
  useSearchRouteMountedSceneRegistryStore(
    useShallow((state) => Object.keys(state.sceneRegistry) as OverlayKey[])
  );

export const useSearchRouteMountedSceneDefinition = (
  sceneKey: OverlayKey | null | undefined
): SearchRouteSceneDefinition | null =>
  useSearchRouteMountedSceneRegistryStore((state) =>
    sceneKey ? (state.sceneRegistry[sceneKey] ?? null) : null
  );

export const useSearchRouteMountedSceneShellState = (
  sceneKey: OverlayKey | null | undefined
): {
  shellSpec: SearchRouteSceneShellSpec | null;
  shellSnapRequest: SearchRouteSceneDefinition['shellSnapRequest'];
} =>
  useSearchRouteMountedSceneRegistryStore(
    useShallow((state) => {
      const definition = sceneKey ? (state.sceneRegistry[sceneKey] ?? null) : null;
      return {
        shellSpec: definition?.shellSpec ?? null,
        shellSnapRequest: definition?.shellSnapRequest ?? null,
      };
    })
  );

const getMountedSceneSurface = (
  sceneKey: OverlayKey | null | undefined
): SearchRouteSceneDefinition['sceneSurface'] =>
  sceneKey
    ? (useSearchRouteMountedSceneRegistryStore.getState().sceneRegistry[sceneKey]?.sceneSurface ??
      null)
    : null;

export const useSearchRouteMountedSceneSurface = (
  sceneKey: OverlayKey | null | undefined,
  isActive: boolean
): SearchRouteSceneDefinition['sceneSurface'] => {
  const [sceneSurface, setSceneSurface] = React.useState(() => getMountedSceneSurface(sceneKey));

  React.useEffect(() => {
    setSceneSurface(getMountedSceneSurface(sceneKey));
  }, [isActive, sceneKey]);

  React.useEffect(() => {
    const unsubscribe = useSearchRouteMountedSceneRegistryStore.subscribe((state) => {
      const nextSceneSurface = sceneKey
        ? (state.sceneRegistry[sceneKey]?.sceneSurface ?? null)
        : null;
      const shouldUpdateWhileHidden = nextSceneSurface?.inactiveRenderMode === 'live';
      if (!isActive && !shouldUpdateWhileHidden) {
        return;
      }

      setSceneSurface((previous) => (previous === nextSceneSurface ? previous : nextSceneSurface));
    });

    return unsubscribe;
  }, [isActive, sceneKey]);

  return sceneSurface;
};

export const getSearchRouteMountedSceneShellSnapRequest = (
  sceneKey: OverlayKey | null | undefined
): SearchRouteSceneDefinition['shellSnapRequest'] =>
  sceneKey
    ? (useSearchRouteMountedSceneRegistryStore.getState().sceneRegistry[sceneKey]
        ?.shellSnapRequest ?? null)
    : null;

export const useSearchRouteMountedSceneMounted = (sceneKey: OverlayKey): boolean =>
  useSearchRouteMountedSceneRegistryStore((state) => Boolean(state.sceneRegistry[sceneKey]));
