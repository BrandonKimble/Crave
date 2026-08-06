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
        attributionLabel?: string;
      }
    >()
  );
  const snapshotRef = React.useRef(snapshot);
  // F1327(b). TWO MARKERS, BECAUSE THERE ARE TWO QUESTIONS, and one marker
  // answering both is what made this primitive drop notifications.
  //   snapshotRef        — "what is the current value?" (read by getSnapshot,
  //                        which consumers call DURING render, so it must be
  //                        advanced during render).
  //   deliveryRef.notified — "what have subscribers already been told?" advanced
  //                        ONLY inside the effect below.
  // The old code derived "did it change" during render and stored the answer in
  // a ref. Render is not run-once: React double-invokes it (StrictMode, dev),
  // the first pass advanced snapshotRef, the second pass then compared the new
  // snapshot against the already-advanced ref, computed `didChange === false`,
  // and the effect skipped the notify — every edge silently lost. Proven in
  // use-snapshot-authority.spec.ts, which goes RED on the old shape.
  // An edge can no longer be consumed by a render that does not deliver it,
  // because only the delivering effect advances the marker.
  // One ref, taking over the slot `didChangeRef` vacated, so this repair costs
  // the composition ZERO net hooks (a hook-count census asserts on it —
  // use-search-root-overlay-local-restaurant-sheet-host-runtime.spec.ts).
  // `isEqual` rides along because it can be a fresh closure each render and the
  // effect must use the latest WITHOUT taking it as a dependency, which would
  // re-notify on identity alone.
  const deliveryRef = React.useRef({ notified: snapshot, isEqual });
  deliveryRef.current.isEqual = isEqual;

  // Idempotent by construction: re-running this with the same `snapshot` is a
  // no-op, so a double-invoked render leaves the same state a single one would.
  if (!isEqual(snapshotRef.current, snapshot)) {
    snapshotRef.current = snapshot;
  }

  const authority = React.useMemo<SnapshotAuthority<TSnapshot>>(
    () => ({
      subscribe: (listener: SnapshotListener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      subscribeSelector: (selector, listener, selectorIsEqual = Object.is, attributionLabel) => {
        selectorListenersRef.current.set(listener, {
          selector,
          isEqual: selectorIsEqual as EqualityFn<unknown>,
          selected: selector(snapshotRef.current),
          attributionLabel,
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
    const deliveredSnapshot = snapshotRef.current;
    if (deliveryRef.current.isEqual(deliveryRef.current.notified, deliveredSnapshot)) {
      return;
    }
    deliveryRef.current.notified = deliveredSnapshot;
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
          if (record.attributionLabel) {
            withSearchNavSwitchRuntimeAttribution(
              attributionOwner ?? 'snapshotAuthority',
              record.attributionLabel,
              listener
            );
          } else {
            listener();
          }
        });
      }
    );
  }, [attributionOperation, attributionOwner, snapshot]);

  return authority;
};
