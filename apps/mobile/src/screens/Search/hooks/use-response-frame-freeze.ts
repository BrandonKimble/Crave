import React from 'react';

import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';

/**
 * Publishes `isResponseFrameFreezeActive` to the bus instead of returning a
 * boolean via useState. This eliminates 2 SearchScreen re-renders per results
 * arrival (set true + set false).
 */
export const useResponseFrameFreeze = (
  resultsRequestKey: string | null,
  searchRuntimeBus: SearchRuntimeBus
): void => {
  const previousResultsRequestKeyRef = React.useRef<string | null>(resultsRequestKey);
  const isMountedRef = React.useRef(true);
  const responseFrameFreezeHandleRef = React.useRef<number | ReturnType<typeof setTimeout> | null>(
    null
  );

  const clearResponseFrameFreezeHandle = React.useCallback(() => {
    const handle = responseFrameFreezeHandleRef.current;
    if (handle == null) {
      return;
    }
    if (typeof handle === 'number') {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
      }
    } else {
      clearTimeout(handle);
    }
    responseFrameFreezeHandleRef.current = null;
  }, []);

  React.useLayoutEffect(() => {
    if (!resultsRequestKey) {
      previousResultsRequestKeyRef.current = null;
      return;
    }
    const shouldFreezeOnResponseCommitFrame =
      resultsRequestKey !== previousResultsRequestKeyRef.current;
    if (!shouldFreezeOnResponseCommitFrame) {
      return;
    }
    previousResultsRequestKeyRef.current = resultsRequestKey;
    clearResponseFrameFreezeHandle();
    searchRuntimeBus.publish({ isResponseFrameFreezeActive: true });
    const releaseFreeze = () => {
      responseFrameFreezeHandleRef.current = null;
      if (!isMountedRef.current) {
        return;
      }
      searchRuntimeBus.publish({ isResponseFrameFreezeActive: false });
    };
    if (typeof requestAnimationFrame === 'function') {
      responseFrameFreezeHandleRef.current = requestAnimationFrame(() => {
        releaseFreeze();
      });
      return;
    }
    responseFrameFreezeHandleRef.current = setTimeout(() => {
      releaseFreeze();
    }, 0);
  }, [clearResponseFrameFreezeHandle, resultsRequestKey, searchRuntimeBus]);

  React.useEffect(
    () => () => {
      isMountedRef.current = false;
      clearResponseFrameFreezeHandle();
    },
    [clearResponseFrameFreezeHandle]
  );
};

export default useResponseFrameFreeze;
