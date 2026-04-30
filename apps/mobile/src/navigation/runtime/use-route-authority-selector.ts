import React from 'react';
import { useSyncExternalStore } from 'react';

import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';

type EqualityFn<T> = (left: T, right: T) => boolean;

export const useRouteAuthoritySelector = <TRootSnapshot, TSelected>({
  subscribe,
  subscribeSelector,
  getSnapshot,
  selector,
  isEqual = Object.is,
  attributionOwner,
  attributionOperation,
  subscriptionAttributionLabel,
}: {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  subscribeSelector?: (
    selector: (snapshot: TRootSnapshot) => TSelected,
    listener: () => void,
    isEqual?: EqualityFn<TSelected>,
    attributionLabel?: string
  ) => () => void;
  getSnapshot: () => TRootSnapshot;
  selector: (snapshot: TRootSnapshot) => TSelected;
  isEqual?: EqualityFn<TSelected>;
  attributionOwner?: string;
  attributionOperation?: string;
  subscriptionAttributionLabel?: string;
}): TSelected => {
  const cacheRef = React.useRef<{
    rootSnapshot: TRootSnapshot;
    selected: TSelected;
  } | null>(null);

  const subscribeWithAttribution = React.useCallback(
    (listener: () => void) => {
      const attributedListener = () => {
        const wakeupStartedAtMs =
          attributionOwner && attributionOperation
            ? startSearchNavSwitchRuntimeAttributionSpan()
            : null;
        try {
          listener();
        } finally {
          finishSearchNavSwitchRuntimeAttributionSpan({
            owner: attributionOwner ?? 'routeAuthoritySelector',
            operation: `${attributionOperation ?? 'subscription'}:wakeup`,
            startedAtMs: wakeupStartedAtMs,
          });
        }
      };
      const attributionLabel =
        subscriptionAttributionLabel ?? attributionOwner ?? attributionOperation;
      return subscribeSelector
        ? subscribeSelector(selector, attributedListener, isEqual, attributionLabel)
        : subscribe(attributedListener, attributionLabel);
    },
    [
      attributionOperation,
      attributionOwner,
      isEqual,
      selector,
      subscribe,
      subscribeSelector,
      subscriptionAttributionLabel,
    ]
  );

  return useSyncExternalStore(
    subscribeWithAttribution,
    () => {
      const selectorStartedAtMs =
        attributionOwner && attributionOperation
          ? startSearchNavSwitchRuntimeAttributionSpan()
          : null;
      const rootSnapshot = getSnapshot();
      const cache = cacheRef.current;
      if (cache == null || cache.rootSnapshot !== rootSnapshot) {
        const selected = selector(rootSnapshot);
        cacheRef.current =
          cache != null && isEqual(cache.selected, selected)
            ? {
                rootSnapshot,
                selected: cache.selected,
              }
            : {
                rootSnapshot,
                selected,
              };
      }
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: attributionOwner ?? 'routeAuthoritySelector',
        operation: attributionOperation ?? 'getSnapshot',
        startedAtMs: selectorStartedAtMs,
      });
      return cacheRef.current!.selected;
    },
    () => selector(getSnapshot())
  );
};
