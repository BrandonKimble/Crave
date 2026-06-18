import React from 'react';

export const useSearchRootProfilePendingMarkerRuntime = (): React.MutableRefObject<
  number | null
> => {
  const pendingMarkerOpenAnimationFrameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      const pendingFrame = pendingMarkerOpenAnimationFrameRef.current;
      if (pendingFrame != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    };
  }, []);

  return pendingMarkerOpenAnimationFrameRef;
};
