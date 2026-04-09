import React from 'react';

import { useSearchFilterModalOwner } from '../../hooks/use-search-filter-modal-owner';

type UseSearchFilterModalRuntimeArgs = Parameters<typeof useSearchFilterModalOwner>[0] & {
  votes100Plus: boolean;
};

export const useSearchFilterModalRuntime = ({
  votes100Plus,
  ...args
}: UseSearchFilterModalRuntimeArgs) => {
  const modalRuntime = useSearchFilterModalOwner(args);
  const rankButtonIsActive = args.scoreMode === 'global_quality';

  return React.useMemo(
    () => ({
      ...modalRuntime,
      openNow: args.openNow,
      priceButtonIsActive: args.priceLevels.length > 0,
      rankButtonIsActive,
      rankButtonLabelText: rankButtonIsActive ? 'Global' : 'Rank',
      votesFilterActive: votes100Plus,
    }),
    [args.openNow, args.priceLevels.length, rankButtonIsActive, modalRuntime, votes100Plus]
  );
};
