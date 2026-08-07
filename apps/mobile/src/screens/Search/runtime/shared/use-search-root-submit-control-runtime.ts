import React from 'react';
import { emitFitAllTrace } from '../../../../navigation/runtime/pageswitch-debug-flag';
import { Dimensions } from 'react-native';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import { bboxCenter, bboxLatSpan, bboxLngSpan } from '@crave-search/shared';
import { registerMapCameraBboxFlyHandler } from '../../../../store/map-camera-command-store';
import { commitFitAllCamera, resolveWorldFitSafeRegion } from '../camera/resolve-fit-all-camera';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootRecentActivityAuthorityRuntime,
  SearchRootRequestExecutionAuthorityRuntime,
  SearchRootResultsScrollAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SubmitRuntimeResult } from './search-root-control-plane-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchRootSubmitReadModel } from './use-search-root-submit-read-model';
import { useSearchRootSubmitRuntimeViewportPorts } from './use-search-root-submit-runtime-viewport-ports';
import { useSearchRootSubmitUiPresentationIntentPorts } from './use-search-root-submit-ui-presentation-intent-ports';
import { useSearchRootSubmitUiResultsPresentationPorts } from './use-search-root-submit-ui-results-presentation-ports';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';

// F1012 *-ports collapse (F1720 triage executed): the ten one-useMemo repacker hooks of the
// submit ports family are inlined below as per-port `React.useMemo` literals — explicit field
// lists (F1668: a spread would bypass excess-property checking and silently widen the port),
// one memo per deleted hook so invalidation is byte-equivalent to the old chain. F5850: each
// memo annotates its FACTORY RETURN (`(): Port => ({...})`), a contextual return type tsc DOES
// excess-property-check — NOT a `useMemo<Port>` type argument, which is not a checking position
// and would let a widened/bogus port compile silently. The three
// load-bearing files survive as hooks: viewport-ports (owns the stable userLocation ref +
// effect), ui-presentation-intent-ports and ui-results-presentation-ports (real derivation).
type SearchSubmitOwnerArgs = Parameters<typeof useSearchSubmitOwnerValue>[0];
type SearchRootSubmitUiPorts = SearchSubmitOwnerArgs['uiPorts'];
type SearchRootSubmitRuntimePorts = SearchSubmitOwnerArgs['runtimePorts'];
type SearchRootSubmitUiSearchPorts = Pick<SearchRootSubmitUiPorts, 'isSearchEditingRef'>;
type SearchRootSubmitUiHistoryPorts = Pick<
  SearchRootSubmitUiPorts,
  'loadRecentHistory' | 'updateLocalRecentSearches'
>;
type SearchRootSubmitUiSurfacePorts = Pick<
  SearchRootSubmitUiPorts,
  'resetSheetToHidden' | 'scrollResultsToTop' | 'resetMapMoveFlag'
>;
type SearchRootSubmitUiResultsPorts = SearchRootSubmitUiHistoryPorts &
  SearchRootSubmitUiSurfacePorts;
type SearchRootSubmitUiPresentationPorts = Pick<
  SearchRootSubmitUiPorts,
  'onPageOneResultsCommitted' | 'onPresentationIntentStart' | 'onPresentationIntentAbort'
>;
type SearchRootSubmitRuntimeBusPorts = Pick<SearchRootSubmitRuntimePorts, 'searchRuntimeBus'>;
type SearchRootSubmitRuntimeRequestPorts = Pick<
  SearchRootSubmitRuntimePorts,
  'lastSearchRequestIdRef' | 'lastAutoOpenKeyRef'
>;
type SearchRootSubmitRuntimeCorePorts = SearchRootSubmitRuntimeBusPorts &
  SearchRootSubmitRuntimeRequestPorts;

type UseSearchRootSubmitControlRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  requestExecutionAuthorityRuntime: SearchRootRequestExecutionAuthorityRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  userLocation: SearchRootEnvironment['userLocation'];
};

export const useSearchRootSubmitControlRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  requestExecutionAuthorityRuntime,
  recentActivityAuthorityRuntime,
  resultsScrollAuthorityRuntime,
  resultsPresentationOwner,
  userLocation,
}: UseSearchRootSubmitControlRuntimeArgs): SubmitRuntimeResult => {
  const readModel = useSearchRootSubmitReadModel({
    stateFoundationLane,
  });
  // --- inlined ui ports (was use-search-root-submit-ui-search-ports) ---
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;
  const searchUiPorts = React.useMemo(
    (): SearchRootSubmitUiSearchPorts => ({
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
    }),
    [rootPrimitivesRuntime.searchState.isSearchEditingRef]
  );
  // --- inlined (was use-search-root-submit-ui-history-ports) ---
  const { recentActivityRuntime } = recentActivityAuthorityRuntime;
  const historyUiPorts = React.useMemo(
    (): SearchRootSubmitUiHistoryPorts => ({
      loadRecentHistory: rootDataPlaneRuntime.historyRuntime.loadRecentHistory,
      updateLocalRecentSearches:
        recentActivityRuntime.deferRecentSearchUpsert as unknown as SearchRootSubmitUiHistoryPorts['updateLocalRecentSearches'],
    }),
    [
      recentActivityRuntime.deferRecentSearchUpsert,
      rootDataPlaneRuntime.historyRuntime.loadRecentHistory,
    ]
  );
  // --- inlined (was use-search-root-submit-ui-surface-ports) ---
  const { rootSharedSheetRuntimeLane, appRouteSharedSheetRuntimeOwner } =
    rootOverlayFoundationRuntime;
  const { resultsScrollPort } = resultsScrollAuthorityRuntime;
  const surfaceUiPorts = React.useMemo(
    (): SearchRootSubmitUiSurfacePorts => ({
      resetSheetToHidden: appRouteSharedSheetRuntimeOwner.markSharedSheetHidden,
      scrollResultsToTop: resultsScrollPort.scrollResultsToTop,
      resetMapMoveFlag: rootSharedSheetRuntimeLane.resetMapMoveFlag,
    }),
    [
      resultsScrollPort.scrollResultsToTop,
      rootSharedSheetRuntimeLane.resetMapMoveFlag,
      appRouteSharedSheetRuntimeOwner.markSharedSheetHidden,
    ]
  );
  // --- inlined (was use-search-root-submit-ui-results-ports) ---
  const resultsUiPorts = React.useMemo(
    (): SearchRootSubmitUiResultsPorts => ({
      loadRecentHistory: historyUiPorts.loadRecentHistory,
      updateLocalRecentSearches: historyUiPorts.updateLocalRecentSearches,
      resetSheetToHidden: surfaceUiPorts.resetSheetToHidden,
      scrollResultsToTop: surfaceUiPorts.scrollResultsToTop,
      resetMapMoveFlag: surfaceUiPorts.resetMapMoveFlag,
    }),
    [historyUiPorts, surfaceUiPorts]
  );
  // load-bearing KEEPs: real derivation lives in these two hooks.
  const resultsPresentationPorts = useSearchRootSubmitUiResultsPresentationPorts({
    resultsPresentationOwner,
  });
  const presentationIntentPorts = useSearchRootSubmitUiPresentationIntentPorts({
    stateFoundationLane,
    resultsPresentationOwner,
    submitReadModel: readModel,
  });
  // --- inlined (was use-search-root-submit-ui-presentation-ports) ---
  const presentationUiPorts = React.useMemo(
    (): SearchRootSubmitUiPresentationPorts => ({
      onPageOneResultsCommitted: resultsPresentationPorts.onPageOneResultsCommitted,
      onPresentationIntentStart: presentationIntentPorts.onPresentationIntentStart,
      onPresentationIntentAbort: presentationIntentPorts.onPresentationIntentAbort,
    }),
    [presentationIntentPorts, resultsPresentationPorts]
  );
  // --- inlined (was use-search-root-submit-ui-ports) ---
  const uiPortsBase = React.useMemo(
    (): SearchRootSubmitUiPorts => ({
      isSearchEditingRef: searchUiPorts.isSearchEditingRef,
      loadRecentHistory: resultsUiPorts.loadRecentHistory,
      updateLocalRecentSearches: resultsUiPorts.updateLocalRecentSearches,
      resetSheetToHidden: resultsUiPorts.resetSheetToHidden,
      scrollResultsToTop: resultsUiPorts.scrollResultsToTop,
      resetMapMoveFlag: resultsUiPorts.resetMapMoveFlag,
      onPageOneResultsCommitted: presentationUiPorts.onPageOneResultsCommitted,
      onPresentationIntentStart: presentationUiPorts.onPresentationIntentStart,
      onPresentationIntentAbort: presentationUiPorts.onPresentationIntentAbort,
    }),
    [presentationUiPorts, resultsUiPorts, searchUiPorts]
  );
  // Wave-4 §3: the list-world fitAll camera (owner decree: fit EVERY list pin in the
  // safe region between the search bar and the mid-snap sheet top — derived from the
  // same snapPoints the sheet itself uses, never a magic fraction). Arbiter-false is a
  // RED bark, never silence.
  const { cameraIntentArbiter } = sessionCoreLane;
  const sharedSheetSnapPoints =
    rootOverlayFoundationRuntime.appRouteSharedSheetRuntimeOwner.snapPoints;
  const uiPorts = React.useMemo(
    () => ({
      ...uiPortsBase,
      onListWorldPresented: ({
        members,
      }: {
        members: readonly { latitude: number; longitude: number }[];
      }) => {
        const window = Dimensions.get('window');
        // The MEASURED chrome datum (same derivation as the profile band camera):
        // searchBarTop + searchBarFrame.height. The expanded snap point is NOT the
        // visual bar bottom — sim-proven 2026-07-13: using it hid north members under
        // the search chrome.
        const searchBarBottomPx =
          rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.searchBarTop +
          (stateFoundationLane.rootSuggestionRuntime.searchBarFrame?.height ?? 0);
        const safeRegion = resolveWorldFitSafeRegion({
          mapWidthPx: window.width,
          mapHeightPx: window.height,
          searchBarBottomPx,
          sheetMiddleTopPx: sharedSheetSnapPoints.middle,
        });
        const committed = commitFitAllCamera({
          arbiter: cameraIntentArbiter,
          members,
          safeRegion,
        });
        emitFitAllTrace(
          `[FITALL] commit=${committed} members=${members.length} region=${JSON.stringify(safeRegion)}`
        );
        if (!committed && __DEV__) {
          // eslint-disable-next-line no-console
          console.error(
            '[FITALL] list-world camera intent was NOT executed by the arbiter — the ' +
              'fit decree ("every list pin in the safe region") silently failed.'
          );
        }
      },
    }),
    [
      cameraIntentArbiter,
      sharedSheetSnapPoints,
      uiPortsBase,
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime,
      stateFoundationLane.rootSuggestionRuntime,
    ]
  );
  // THE public bbox fly seam (home-surface Job 4): non-search surfaces (polls
  // place chip, home city picker) command the camera through the SAME fitAll
  // executor list worlds ride. This runtime hook's effects fire (it is a real
  // committed runtime), so the module-scope registration lives here, next to
  // the arbiter it needs.
  //
  // WRAP-AWARE (red-team 2026-08-01): a bbox may CROSS the antimeridian
  // (minLng > maxLng — the shared convention, and the US country row now
  // derives one under the largest-gap law). Handing the fitter two raw
  // corners made its planar min/max scan read that bbox inside-out and fly
  // to the exact COMPLEMENT of the place — the US jumped to the Caspian Sea,
  // fully zoomed out. So the bbox is UNWRAPPED here with the shared law
  // (bboxCenter/bboxLatSpan/bboxLngSpan, all arc-aware) into a diagonal pair
  // about its true center; the fitter's arithmetic then yields the right
  // center and span with no change to the map surface itself.
  React.useEffect(
    () =>
      registerMapCameraBboxFlyHandler((bbox) => {
        const window = Dimensions.get('window');
        const searchBarBottomPx =
          rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.searchBarTop +
          (stateFoundationLane.rootSuggestionRuntime.searchBarFrame?.height ?? 0);
        const safeRegion = resolveWorldFitSafeRegion({
          mapWidthPx: window.width,
          mapHeightPx: window.height,
          searchBarBottomPx,
          sheetMiddleTopPx: sharedSheetSnapPoints.middle,
        });
        const center = bboxCenter(bbox);
        const halfLat = bboxLatSpan(bbox) / 2;
        const halfLng = bboxLngSpan(bbox) / 2;
        return commitFitAllCamera({
          arbiter: cameraIntentArbiter,
          members: [
            { latitude: center.lat - halfLat, longitude: center.lng - halfLng },
            { latitude: center.lat + halfLat, longitude: center.lng + halfLng },
          ],
          safeRegion,
        });
      }),
    [
      cameraIntentArbiter,
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime,
      sharedSheetSnapPoints,
      stateFoundationLane.rootSuggestionRuntime,
    ]
  );

  // --- inlined runtime ports (was use-search-root-submit-runtime-bus-ports) ---
  const busRuntimePorts = React.useMemo(
    (): SearchRootSubmitRuntimeBusPorts => ({
      searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    }),
    [sessionCoreLane.searchRuntimeBus]
  );
  // --- inlined (was use-search-root-submit-runtime-request-ports) ---
  const { sessionPrimitivesLane } = stateFoundationLane;
  const { lastAutoOpenKeyRef } = requestExecutionAuthorityRuntime;
  const requestRuntimePorts = React.useMemo(
    (): SearchRootSubmitRuntimeRequestPorts => ({
      lastSearchRequestIdRef: sessionPrimitivesLane.primitives.lastSearchRequestIdRef,
      lastAutoOpenKeyRef,
    }),
    [lastAutoOpenKeyRef, sessionPrimitivesLane.primitives.lastSearchRequestIdRef]
  );
  // --- inlined (was use-search-root-submit-runtime-core-ports) ---
  const coreRuntimePorts = React.useMemo(
    (): SearchRootSubmitRuntimeCorePorts => ({
      searchRuntimeBus: busRuntimePorts.searchRuntimeBus,
      lastSearchRequestIdRef: requestRuntimePorts.lastSearchRequestIdRef,
      lastAutoOpenKeyRef: requestRuntimePorts.lastAutoOpenKeyRef,
    }),
    [busRuntimePorts, requestRuntimePorts]
  );
  // load-bearing KEEP: owns the stable userLocation ref + tracking effect.
  const viewportRuntimePorts = useSearchRootSubmitRuntimeViewportPorts({
    runSearch: stateFoundationLane.rootDataPlaneRuntime.requestStatusRuntime.runSearch,
    mapRef: rootPrimitivesRuntime.mapState.mapRef,
    viewportBoundsService: sessionCoreLane.viewportBoundsService,
    userLocation,
  });
  // --- inlined (was use-search-root-submit-runtime-ports) ---
  const runtimePorts = React.useMemo(
    (): SearchRootSubmitRuntimePorts => ({
      searchRuntimeBus: coreRuntimePorts.searchRuntimeBus,
      lastSearchRequestIdRef: coreRuntimePorts.lastSearchRequestIdRef,
      lastAutoOpenKeyRef: coreRuntimePorts.lastAutoOpenKeyRef,
      resultsPresentationSurfaceAuthority: sessionCoreLane.resultsPresentationSurfaceAuthority,
      runSearch: viewportRuntimePorts.runSearch,
      mapRef: viewportRuntimePorts.mapRef,
      viewportBoundsService: viewportRuntimePorts.viewportBoundsService,
      userLocationRef: viewportRuntimePorts.userLocationRef,
    }),
    [coreRuntimePorts, sessionCoreLane.resultsPresentationSurfaceAuthority, viewportRuntimePorts]
  );

  return useSearchSubmitOwnerValue({
    readModel,
    uiPorts,
    runtimePorts,
  });
};
