import React from 'react';

import {
  createSearchSessionController,
  type SearchSessionController,
} from '../runtime/controller/search-session-controller';

export type SearchRuntimeSessionServicesRuntime = {
  searchSessionController: SearchSessionController;
};

export const useSearchRuntimeSessionServicesRuntime =
(): SearchRuntimeSessionServicesRuntime => {
  const searchSessionControllerRef = React.useRef<SearchSessionController | null>(null);
  if (!searchSessionControllerRef.current) {
    searchSessionControllerRef.current = createSearchSessionController();
  }
  const searchSessionController = searchSessionControllerRef.current;

  return React.useMemo(
    () => ({
      searchSessionController,
    }),
    [searchSessionController]
  );
};
