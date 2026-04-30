import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';

type UseSearchResponseFrameFreezeRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsRequestKey: string | null;
};

export const useSearchResponseFrameFreezeRuntime = ({
  searchRuntimeBus,
  resultsRequestKey,
}: UseSearchResponseFrameFreezeRuntimeArgs) => {
  const previousResultsRequestKeyRef = React.useRef<string | null>(resultsRequestKey);
  const isResponseFrameFreezeMountedRef = React.useRef(true);
  const responseFrameFreezeHandleRef = React.useRef<number | null>(null);
  const responseFrameFreezeMicrotaskReleaseRef = React.useRef(false);
  const clearResponseFrameFreezeHandle = React.useCallback(() => {
    const handle = responseFrameFreezeHandleRef.current;
    if (handle == null) {
      responseFrameFreezeMicrotaskReleaseRef.current = false;
    } else if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle);
    }
    responseFrameFreezeHandleRef.current = null;
    responseFrameFreezeMicrotaskReleaseRef.current = false;
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
      if (!isResponseFrameFreezeMountedRef.current) {
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
    responseFrameFreezeMicrotaskReleaseRef.current = true;
    queueMicrotask(() => {
      if (!responseFrameFreezeMicrotaskReleaseRef.current) {
        return;
      }
      responseFrameFreezeMicrotaskReleaseRef.current = false;
      releaseFreeze();
    });
  }, [clearResponseFrameFreezeHandle, resultsRequestKey, searchRuntimeBus]);

  React.useEffect(
    () => () => {
      isResponseFrameFreezeMountedRef.current = false;
      clearResponseFrameFreezeHandle();
    },
    [clearResponseFrameFreezeHandle]
  );
};
