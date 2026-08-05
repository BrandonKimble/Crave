import type * as React from 'react';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import { useResultsPresentationSurfaceAuthoritySelector } from './results-presentation-surface-authority';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
import type { SearchRuntimeInteractionState } from './use-search-root-session-runtime-contract';
import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import {
  useResultsPresentationSurfaceHydrationPublicationRuntime,
  type SearchRootSearchSceneListHydrationPatch,
} from './use-results-presentation-surface-hydration-publication-runtime';

type UseSearchRootSearchSceneListHydrationPublicationRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  searchInteractionRef: React.MutableRefObject<SearchRuntimeInteractionState>;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
  resultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
};

export const useSearchRootSearchSceneListHydrationPublicationRuntime = ({
  activeTab,
  resultsPresentationSurfaceAuthority,
  routeSceneSwitchAuthority,
  searchInteractionRef,
  hydrationKeyRuntime,
  resultsReadModelSelectors,
}: UseSearchRootSearchSceneListHydrationPublicationRuntimeArgs) => {
  // The prepared-rows key IS the results identity key (was the one-line
  // use-search-root-search-scene-list-prepared-rows-key-patch-runtime leaf).
  const resultsPreparedRowsKey = hydrationKeyRuntime.resultsIdentityKey;

  // F1032(a)/F1732: this readiness read used to be an UNSUBSCRIBED render-time sample of the
  // surface authority (use-search-root-search-scene-list-prepared-rows-readiness-patch-runtime),
  // correct only because the same authority.publish that flips preparedRows also notifies the
  // key-scoped subscriber in use-results-presentation-surface-transaction-runtime.ts, whose
  // commit re-renders this chain in the same tick — a structural coincidence, not a contract.
  // Converted to an honest key-scoped subscription (F1040 subscribe-don't-sample): a
  // preparedRows flip now schedules this hook's own re-render, independent of the
  // surface-transaction commit cascade.
  const preparedRowsReadyResultsIdentityKey = useResultsPresentationSurfaceAuthoritySelector(
    resultsPresentationSurfaceAuthority,
    (snapshot) => snapshot.preparedRows.readyResultsIdentityKey,
    Object.is,
    ['preparedRows'] as const,
    'search_scene_list_hydration_prepared_rows_readiness'
  );

  // F1012 *-patch-runtime collapse: the ten hydration patch hooks assembled this six-field
  // object across four spread levels; it is composed here as ONE literal with explicit fields.
  // The composed object was ALWAYS a fresh identity per render (every level of the old chain
  // spread its children into a new object), so building it unmemoized preserves the downstream
  // publication effect's invalidation exactly.
  const searchSceneListHydrationPatch: SearchRootSearchSceneListHydrationPatch = {
    resultsIdentityKey: hydrationKeyRuntime.resultsIdentityKey,
    hydratedResultsKey: hydrationKeyRuntime.hydratedResultsKey,
    resultsPreparedRowsKey,
    listPreparedRowsReady:
      resultsPreparedRowsKey != null &&
      preparedRowsReadyResultsIdentityKey === resultsPreparedRowsKey,
    // Leaf-owned render gate: hydration-for-render is decided by the mounted-results store,
    // never by this publication — the patch always carries `false` (was the
    // …-render-gate-patch-runtime leaf's module constant).
    shouldHydrateResultsForRender: false,
    isResultsHydrationSettled: resultsReadModelSelectors.isResultsHydrationSettled,
  };

  useResultsPresentationSurfaceHydrationPublicationRuntime({
    activeTab,
    resultsPresentationSurfaceAuthority,
    routeSceneSwitchAuthority,
    searchInteractionRef,
    searchSceneListHydrationPatch,
  });
};
