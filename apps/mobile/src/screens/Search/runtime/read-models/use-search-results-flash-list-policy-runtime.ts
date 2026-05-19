import React from 'react';

export const useSearchResultsFlashListPolicyRuntime = () =>
  React.useMemo(
    () => ({
      drawDistance: 160,
      overrideProps: {
        initialDrawBatchSize: 3,
      },
    }),
    []
  );
