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
  observedKeys?: readonly SearchRuntimeBusKey[]
): T => {
  const observedKeysSignature =
    observedKeys != null && observedKeys.length > 0 ? observedKeys.join('|') : '';
  const scopedObservedKeys = React.useMemo(() => observedKeys, [observedKeysSignature]);
  const cacheRef = React.useRef<{ version: number; selected: T }>({
    version: -1,
    selected: selector(bus.getState()),
  });
  const subscribe = React.useCallback(
    (listener: () => void) => bus.subscribe(listener, scopedObservedKeys),
    [bus, scopedObservedKeys]
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      const version = bus.getVersion();
      if (version !== cacheRef.current.version) {
        const selected = selector(bus.getState());
        if (!isEqual(cacheRef.current.selected, selected)) {
          cacheRef.current.selected = selected;
        }
        cacheRef.current.version = version;
      }
      return cacheRef.current.selected;
    },
    () => selector(bus.getState())
  );
};
