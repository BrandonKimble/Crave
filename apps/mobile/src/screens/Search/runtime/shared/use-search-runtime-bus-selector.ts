import React from 'react';
import { useSyncExternalStore } from 'react';

import type {
  SearchRuntimeBus,
  SearchRuntimeBusKey,
  SearchRuntimeBusState,
} from './search-runtime-bus';

type EqualityFn<T> = (left: T, right: T) => boolean;

export const useSearchRuntimeBusSelector = <T>(
  bus: SearchRuntimeBus,
  selector: (state: SearchRuntimeBusState) => T,
  isEqual: EqualityFn<T> = Object.is,
  observedKeys?: readonly SearchRuntimeBusKey[],
  debugLabel?: string
): T => {
  const observedKeysSignature =
    observedKeys != null && observedKeys.length > 0 ? observedKeys.join('|') : '';
  // Callers pass a fresh `as const` array literal on every render, so `observedKeys` never
  // has a stable identity of its own. Re-key the memo off the joined-string signature
  // (the actual content that matters to `bus.subscribe`) so `scopedObservedKeys` — and in
  // turn `subscribe` below — stays referentially stable across renders that observe the
  // same keys. This is deliberate, not a missing dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scopedObservedKeys = React.useMemo(() => observedKeys, [observedKeysSignature]);
  const cacheRef = React.useRef<{ version: number; selected: T }>({
    version: -1,
    selected: selector(bus.getState()),
  });
  const subscribe = React.useCallback(
    (listener: () => void) => bus.subscribe(listener, scopedObservedKeys, debugLabel),
    [bus, debugLabel, scopedObservedKeys]
  );

  const getSnapshot = React.useCallback(() => {
    const version = bus.getVersion();
    if (version !== cacheRef.current.version) {
      const selected = selector(bus.getState());
      if (!isEqual(cacheRef.current.selected, selected)) {
        cacheRef.current.selected = selected;
      }
      cacheRef.current.version = version;
    }
    return cacheRef.current.selected;
  }, [bus, isEqual, selector]);

  // Reuse the cached, stable getter as the server snapshot too: React Native never takes
  // this path today, but `useSyncExternalStore` requires it to return a referentially
  // stable value across calls when nothing changed, or a hydration mismatch becomes an
  // infinite re-render loop the moment this code runs under SSR or a future React that
  // consults it. A fresh object per call (the prior `() => selector(bus.getState())`)
  // would have been exactly that trap.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
