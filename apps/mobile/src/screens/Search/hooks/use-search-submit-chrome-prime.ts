import React from 'react';

import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';

type UseSearchSubmitChromePrimeResult = {
  beginSubmitChromePriming: () => void;
};

/**
 * Publishes `isSubmitChromePriming` to the bus instead of returning it via
 * useState. This eliminates 2 SearchScreen re-renders per search submit
 * (set true + set false).
 */
export const useSearchSubmitChromePrime = (
  searchRuntimeBus: SearchRuntimeBus
): UseSearchSubmitChromePrimeResult => {
  const submitChromePrimeTokenRef = React.useRef(0);
  const submitChromePrimeReleaseHandleRef = React.useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);

  const clearSubmitChromePrimeReleaseHandle = React.useCallback(() => {
    const handle = submitChromePrimeReleaseHandleRef.current;
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
    submitChromePrimeReleaseHandleRef.current = null;
  }, []);

  const beginSubmitChromePriming = React.useCallback(() => {
    const token = submitChromePrimeTokenRef.current + 1;
    submitChromePrimeTokenRef.current = token;
    searchRuntimeBus.publish({ isSubmitChromePriming: true });
    clearSubmitChromePrimeReleaseHandle();
    const release = () => {
      if (submitChromePrimeTokenRef.current !== token) {
        return;
      }
      searchRuntimeBus.publish({ isSubmitChromePriming: false });
    };
    if (typeof requestAnimationFrame === 'function') {
      submitChromePrimeReleaseHandleRef.current = requestAnimationFrame(() => {
        submitChromePrimeReleaseHandleRef.current = null;
        release();
      });
      return;
    }
    submitChromePrimeReleaseHandleRef.current = setTimeout(() => {
      submitChromePrimeReleaseHandleRef.current = null;
      release();
    }, 0);
  }, [clearSubmitChromePrimeReleaseHandle, searchRuntimeBus]);

  React.useEffect(
    () => () => {
      clearSubmitChromePrimeReleaseHandle();
    },
    [clearSubmitChromePrimeReleaseHandle]
  );

  return {
    beginSubmitChromePriming,
  };
};

export default useSearchSubmitChromePrime;
