import React from 'react';

import { withSearchNavSwitchRuntimeAttribution } from './search-nav-switch-runtime-attribution';

type SnapshotListener = () => void;
type EqualityFn<T> = (left: T, right: T) => boolean;

export type SnapshotAuthority<TSnapshot> = {
  subscribe: (listener: SnapshotListener) => () => void;
  subscribeSelector?: <TSelected>(
    selector: (snapshot: TSnapshot) => TSelected,
    listener: SnapshotListener,
    isEqual?: EqualityFn<TSelected>,
    attributionLabel?: string
  ) => () => void;
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
      : (optionsOrIsEqual.isEqual ?? Object.is);
  const attributionOwner =
    typeof optionsOrIsEqual === 'function' ? undefined : optionsOrIsEqual.attributionOwner;
  const attributionOperation =
    typeof optionsOrIsEqual === 'function' ? undefined : optionsOrIsEqual.attributionOperation;
  const listenersRef = React.useRef(new Set<SnapshotListener>());
  const selectorListenersRef = React.useRef(
    new Map<
      SnapshotListener,
      {
        selector: (snapshot: TSnapshot) => unknown;
        isEqual: EqualityFn<unknown>;
        selected: unknown;
      }
    >()
  );
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
      subscribeSelector: (selector, listener, selectorIsEqual = Object.is) => {
        selectorListenersRef.current.set(listener, {
          selector,
          isEqual: selectorIsEqual as EqualityFn<unknown>,
          selected: selector(snapshotRef.current),
        });
        return () => {
          selectorListenersRef.current.delete(listener);
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
        selectorListenersRef.current.forEach((record, listener) => {
          const nextSelected = record.selector(snapshotRef.current);
          if (record.isEqual(record.selected, nextSelected)) {
            return;
          }
          record.selected = nextSelected;
          listener();
        });
      }
    );
  }, [attributionOperation, attributionOwner, snapshot]);

  return authority;
};
