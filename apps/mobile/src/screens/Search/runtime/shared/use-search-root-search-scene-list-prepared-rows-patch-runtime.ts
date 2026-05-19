import React from 'react';

import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';
import { useSearchRootSearchSceneListPreparedRowsKeyPatchRuntime } from './use-search-root-search-scene-list-prepared-rows-key-patch-runtime';
import { useSearchRootSearchSceneListPreparedRowsReadinessPatchRuntime } from './use-search-root-search-scene-list-prepared-rows-readiness-patch-runtime';

export const useSearchRootSearchSceneListPreparedRowsPatchRuntime = ({
  hydrationKeyRuntime,
}: {
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
}): Pick<
  SearchRootSearchSceneListHydrationPatch,
  'resultsPreparedRowsKey' | 'listPreparedRowsReady'
> => {
  const resultsPreparedRowsKey = useSearchRootSearchSceneListPreparedRowsKeyPatchRuntime({
    hydrationKeyRuntime,
  });
  const listPreparedRowsReady = useSearchRootSearchSceneListPreparedRowsReadinessPatchRuntime({
    resultsPreparedRowsKey,
  });

  return React.useMemo(
    () => ({
      resultsPreparedRowsKey,
      listPreparedRowsReady,
    }),
    [listPreparedRowsReady, resultsPreparedRowsKey]
  );
};
