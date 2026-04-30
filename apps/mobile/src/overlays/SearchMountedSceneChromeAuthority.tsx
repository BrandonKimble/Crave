import React from 'react';

import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';

type SearchMountedSceneChromeSurface = 'underlay' | 'background' | 'overlay';

export type SearchMountedSceneChromeSnapshot = {
  underlayComponent: React.ReactNode | null;
  backgroundComponent: React.ReactNode | null;
  overlayComponent: React.ReactNode | null;
};

type Listener = () => void;

export const EMPTY_SEARCH_MOUNTED_SCENE_CHROME_SNAPSHOT: SearchMountedSceneChromeSnapshot = {
  underlayComponent: null,
  backgroundComponent: null,
  overlayComponent: null,
};

const listeners = new Set<Listener>();
let snapshot: SearchMountedSceneChromeSnapshot = EMPTY_SEARCH_MOUNTED_SCENE_CHROME_SNAPSHOT;

const areSearchMountedSceneChromeSnapshotsEqual = (
  left: SearchMountedSceneChromeSnapshot,
  right: SearchMountedSceneChromeSnapshot
): boolean =>
  left === right ||
  (left.underlayComponent === right.underlayComponent &&
    left.backgroundComponent === right.backgroundComponent &&
    left.overlayComponent === right.overlayComponent);

export const publishSearchMountedSceneChromeSnapshot = (
  nextSnapshot: SearchMountedSceneChromeSnapshot
): void => {
  if (areSearchMountedSceneChromeSnapshotsEqual(snapshot, nextSnapshot)) {
    return;
  }

  snapshot = nextSnapshot;
  listeners.forEach((listener) => {
    listener();
  });
};

const searchMountedSceneChromeAuthority = {
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
};

const selectSearchMountedSceneChromeSurface = (
  chromeSnapshot: SearchMountedSceneChromeSnapshot,
  surface: SearchMountedSceneChromeSurface
): React.ReactNode | null => {
  switch (surface) {
    case 'underlay':
      return chromeSnapshot.underlayComponent;
    case 'background':
      return chromeSnapshot.backgroundComponent;
    case 'overlay':
      return chromeSnapshot.overlayComponent;
    default:
      return null;
  }
};

export const SearchMountedSceneChromeSurfaceHost = React.memo(
  ({ surface }: { surface: SearchMountedSceneChromeSurface }) => {
    const surfaceComponent = useRouteAuthoritySelector({
      subscribe: searchMountedSceneChromeAuthority.subscribe,
      getSnapshot: searchMountedSceneChromeAuthority.getSnapshot,
      selector: React.useCallback(
        (chromeSnapshot: SearchMountedSceneChromeSnapshot) =>
          selectSearchMountedSceneChromeSurface(chromeSnapshot, surface),
        [surface]
      ),
      isEqual: Object.is,
      attributionOwner: 'SearchMountedSceneChromeSurfaceHost',
      attributionOperation: `surfaceSelector:${surface}`,
    });

    return surfaceComponent;
  }
);

SearchMountedSceneChromeSurfaceHost.displayName = 'SearchMountedSceneChromeSurfaceHost';
