import React from 'react';

import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchResultsPanelHydrationKeyRuntime } from './search-results-panel-hydration-runtime-contract';
import type { SearchResultsPanelResultsRuntimeState } from './search-results-panel-runtime-state-contract';
import { logPerfScenarioStackAttribution } from '../../../../perf/perf-scenario-attribution';

type UseSearchResultsPanelHydrationKeyRuntimeArgs = {
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  resultsRuntimeState: Pick<
    SearchResultsPanelResultsRuntimeState,
    'resultsHydrationCandidateKey' | 'resultsPage' | 'resultsRequestKey'
  >;
  isSearchSceneRenderAdmitted: () => boolean;
};

export const useSearchResultsPanelHydrationKeyRuntime = ({
  resultsPresentationSurfaceAuthority,
  resultsRuntimeState,
  isSearchSceneRenderAdmitted,
}: UseSearchResultsPanelHydrationKeyRuntimeArgs): SearchResultsPanelHydrationKeyRuntime => {
  const [hydratedResultsKey, setHydratedResultsKey] = React.useState<string | null>(null);
  const hydratedResultsKeyRef = React.useRef<string | null>(hydratedResultsKey);
  hydratedResultsKeyRef.current = hydratedResultsKey;

  const setHydratedResultsKeySync = React.useCallback(
    (nextHydrationKey: string | null) => {
      logPerfScenarioStackAttribution({
        owner: 'results_hydration_key_writer',
        path: `setHydratedResultsKeySync:${hydratedResultsKeyRef.current ?? 'null'}->${
          nextHydrationKey ?? 'null'
        }`,
        details: {
          surfaceHydratedResultsKey:
            resultsPresentationSurfaceAuthority.getSnapshot().hydratedResultsKey,
          surfaceResultsHydrationKey:
            resultsPresentationSurfaceAuthority.getSnapshot().resultsHydrationKey,
        },
      });
      hydratedResultsKeyRef.current = nextHydrationKey;
      if (typeof React.startTransition === 'function') {
        React.startTransition(() => {
          setHydratedResultsKey(nextHydrationKey);
        });
      } else {
        setHydratedResultsKey(nextHydrationKey);
      }
      resultsPresentationSurfaceAuthority.publish(
        {
          hydratedResultsKey: nextHydrationKey,
        },
        'results_hydration_key_writer'
      );
    },
    [resultsPresentationSurfaceAuthority]
  );

  const resultsPage = resultsRuntimeState.resultsPage ?? 1;
  const resultsHydrationCandidate = resultsRuntimeState.resultsHydrationCandidateKey;
  const resultsHydrationKey =
    resultsHydrationCandidate == null
      ? null
      : resultsPage === 1
        ? resultsHydrationCandidate
        : hydratedResultsKey;
  const isHydrationPendingForRuntime =
    resultsHydrationKey != null &&
    resultsHydrationKey !== (hydratedResultsKeyRef.current ?? hydratedResultsKey);
  const shouldHydrateResultsForRender =
    isHydrationPendingForRuntime && isSearchSceneRenderAdmitted();
  const requestVersionKey = React.useMemo(
    () =>
      `${resultsRuntimeState.resultsRequestKey ?? 'no-request'}::${
        resultsHydrationKey ?? 'no-hydration'
      }`,
    [resultsHydrationKey, resultsRuntimeState.resultsRequestKey]
  );

  React.useEffect(
    () =>
      resultsPresentationSurfaceAuthority.subscribe(
        () => {
          const runtimeHydratedResultsKey =
            resultsPresentationSurfaceAuthority.getSnapshot().hydratedResultsKey;
          if (
            runtimeHydratedResultsKey != null &&
            runtimeHydratedResultsKey !== hydratedResultsKeyRef.current
          ) {
            logPerfScenarioStackAttribution({
              owner: 'results_hydration_key_external_sync',
              path: `${hydratedResultsKeyRef.current ?? 'null'}->${
                runtimeHydratedResultsKey ?? 'null'
              }`,
              details: {
                surfaceResultsHydrationKey:
                  resultsPresentationSurfaceAuthority.getSnapshot().resultsHydrationKey,
              },
            });
            hydratedResultsKeyRef.current = runtimeHydratedResultsKey;
            setHydratedResultsKey(runtimeHydratedResultsKey);
          }
        },
        ['hydratedResultsKey'] as const,
        'results_panel_hydration_key_external_sync'
      ),
    [resultsPresentationSurfaceAuthority]
  );

  React.useEffect(() => {
    if (resultsRuntimeState.resultsRequestKey == null) {
      setHydratedResultsKeySync(null);
    }
  }, [resultsRuntimeState.resultsRequestKey, setHydratedResultsKeySync]);

  return React.useMemo(
    () => ({
      resultsHydrationKey,
      hydratedResultsKey,
      shouldHydrateResultsForRender,
      setHydratedResultsKeySync,
      requestVersionKey,
    }),
    [
      hydratedResultsKey,
      requestVersionKey,
      resultsHydrationKey,
      setHydratedResultsKeySync,
      shouldHydrateResultsForRender,
    ]
  );
};
