import React from 'react';

export const useResponseFrameFreeze = (resultsRequestKey: string | null): boolean => {
  const [isResponseFrameFreezeActive, setIsResponseFrameFreezeActive] = React.useState(false);
  const previousResultsRequestKeyRef = React.useRef<string | null>(resultsRequestKey);
  const pendingFreezeRequestKeyRef = React.useRef<string | null>(null);
  const isMountedRef = React.useRef(true);
  const responseFrameFreezeHandleRef = React.useRef<number | ReturnType<typeof setTimeout> | null>(
    null
  );
  const shouldFreezeOnResponseCommitFrame =
    resultsRequestKey != null && resultsRequestKey !== previousResultsRequestKeyRef.current;
  if (shouldFreezeOnResponseCommitFrame) {
    pendingFreezeRequestKeyRef.current = resultsRequestKey;
  }

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
      pendingFreezeRequestKeyRef.current = null;
      return;
    }
    if (pendingFreezeRequestKeyRef.current !== resultsRequestKey) {
      return;
    }
    previousResultsRequestKeyRef.current = resultsRequestKey;
    pendingFreezeRequestKeyRef.current = null;
    if (!shouldFreezeOnResponseCommitFrame) {
      return;
    }
    clearResponseFrameFreezeHandle();
    setIsResponseFrameFreezeActive(true);
    const releaseFreeze = () => {
      responseFrameFreezeHandleRef.current = null;
      if (!isMountedRef.current) {
        return;
      }
      setIsResponseFrameFreezeActive(false);
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
  }, [clearResponseFrameFreezeHandle, shouldFreezeOnResponseCommitFrame]);

  React.useEffect(
    () => () => {
      isMountedRef.current = false;
      clearResponseFrameFreezeHandle();
    },
    [clearResponseFrameFreezeHandle]
  );

  return isResponseFrameFreezeActive || shouldFreezeOnResponseCommitFrame;
};

export default useResponseFrameFreeze;
