import React from 'react';
import { useSyncExternalStore } from 'react';

import type { SearchRuntimeBus, SearchRuntimeBusState } from './search-runtime-bus';

type EqualityFn<T> = (left: T, right: T) => boolean;

export const useSearchRuntimeBusSelector = <T>(
  bus: SearchRuntimeBus,
  selector: (state: SearchRuntimeBusState) => T,
  isEqual: EqualityFn<T> = Object.is
): T => {
  const cacheRef = React.useRef<{ version: number; selected: T }>({
    version: -1,
    selected: selector(bus.getState()),
  });

  return useSyncExternalStore(
    bus.subscribe.bind(bus),
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
