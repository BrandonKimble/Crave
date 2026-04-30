import React from 'react';

import { withSearchNavSwitchRuntimeAttribution } from './search-nav-switch-runtime-attribution';

type SnapshotListener = () => void;

export type SnapshotAuthority<TSnapshot> = {
  subscribe: (listener: SnapshotListener) => () => void;
  getSnapshot: () => TSnapshot;
};

type SnapshotAuthorityOptions<TSnapshot> = {
  isEqual?: (left: TSnapshot, right: TSnapshot) => boolean;
  attributionOwner?: string;
  attributionOperation?: string;
};

export const useSnapshotAuthority = <TSnapshot>(
  snapshot: TSnapshot,
  optionsOrIsEqual:
    | ((left: TSnapshot, right: TSnapshot) => boolean)
    | SnapshotAuthorityOptions<TSnapshot> = Object.is
): SnapshotAuthority<TSnapshot> => {
  const isEqual =
    typeof optionsOrIsEqual === 'function'
      ? optionsOrIsEqual
      : optionsOrIsEqual.isEqual ?? Object.is;
  const attributionOwner =
    typeof optionsOrIsEqual === 'function'
      ? undefined
      : optionsOrIsEqual.attributionOwner;
  const attributionOperation =
    typeof optionsOrIsEqual === 'function'
      ? undefined
      : optionsOrIsEqual.attributionOperation;
  const listenersRef = React.useRef(new Set<SnapshotListener>());
  const snapshotRef = React.useRef(snapshot);
  const didChangeRef = React.useRef(false);

  const previousSnapshot = snapshotRef.current;
  const didChange = !isEqual(previousSnapshot, snapshot);
  if (didChange) {
    snapshotRef.current = snapshot;
  }
  didChangeRef.current = didChange;

  const authority = React.useMemo<SnapshotAuthority<TSnapshot>>(
    () => ({
      subscribe: (listener: SnapshotListener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      getSnapshot: () => snapshotRef.current,
    }),
    []
  );

  React.useLayoutEffect(() => {
    if (!didChangeRef.current) {
      return;
    }
    const operation = attributionOperation ?? 'notify';
    withSearchNavSwitchRuntimeAttribution(
      attributionOwner ?? 'snapshotAuthority',
      operation,
      () => {
        listenersRef.current.forEach((listener) => {
          listener();
        });
      }
    );
  }, [attributionOperation, attributionOwner, snapshot]);

  return authority;
};
