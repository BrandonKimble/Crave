import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';

const SearchRuntimeBusContext = React.createContext<SearchRuntimeBus | null>(null);

export const SearchRuntimeBusProvider = SearchRuntimeBusContext.Provider;

export const useSearchRuntimeBus = (): SearchRuntimeBus => {
  const bus = React.useContext(SearchRuntimeBusContext);
  if (bus == null) {
    throw new Error('useSearchRuntimeBus must be used within SearchRuntimeBusProvider');
  }
  return bus;
};
