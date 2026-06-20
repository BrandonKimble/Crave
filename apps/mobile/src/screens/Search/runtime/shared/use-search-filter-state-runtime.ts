import { useShallow } from 'zustand/react/shallow';

import { useSearchStore } from '../../../../store/searchStore';

export const useSearchFilterStateRuntime = () =>
  useSearchStore(
    useShallow((state) => ({
      openNow: state.openNow,
      setOpenNow: state.setOpenNow,
      priceLevels: state.priceLevels,
      setPriceLevels: state.setPriceLevels,
      votes100Plus: state.votes100Plus,
      setVotes100Plus: state.setVotes100Plus,
      risingActive: state.risingActive,
      setRisingActive: state.setRisingActive,
      resetFilters: state.resetFilters,
    }))
  );
