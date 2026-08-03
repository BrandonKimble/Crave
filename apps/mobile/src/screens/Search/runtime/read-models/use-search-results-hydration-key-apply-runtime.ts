import React from 'react';

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

export const useSearchResultsHydrationKeyApplyRuntime = ({
  setHydratedResultsKeySync,
}: {
  setHydratedResultsKeySync: (nextHydrationKey: string | null) => void;
}) =>
  React.useCallback(
    (nextHydrationKey: string | null) => {
      const commitStartedAtMs = getNowMs();
      setHydratedResultsKeySync(nextHydrationKey);
      return getNowMs() - commitStartedAtMs;
    },
    [setHydratedResultsKeySync]
  );
