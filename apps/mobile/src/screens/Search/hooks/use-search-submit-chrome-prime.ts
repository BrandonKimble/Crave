import React from 'react';

type UseSearchSubmitChromePrimeResult = {
  isSubmitChromePriming: boolean;
  beginSubmitChromePriming: () => void;
};

export const useSearchSubmitChromePrime = (): UseSearchSubmitChromePrimeResult => {
  const [isSubmitChromePriming, setIsSubmitChromePriming] = React.useState(false);
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
    setIsSubmitChromePriming(true);
    clearSubmitChromePrimeReleaseHandle();
    const release = () => {
      if (submitChromePrimeTokenRef.current !== token) {
        return;
      }
      setIsSubmitChromePriming(false);
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
  }, [clearSubmitChromePrimeReleaseHandle]);

  React.useEffect(
    () => () => {
      clearSubmitChromePrimeReleaseHandle();
    },
    [clearSubmitChromePrimeReleaseHandle]
  );

  return {
    isSubmitChromePriming,
    beginSubmitChromePriming,
  };
};

export default useSearchSubmitChromePrime;
