import React from 'react';
import { emitFitAllTrace } from '../../../../navigation/runtime/pageswitch-debug-flag';
import { Dimensions } from 'react-native';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import { bboxCenter, bboxLatSpan, bboxLngSpan } from '@crave-search/shared';
import { registerMapCameraBboxFlyHandler } from '../../../../store/map-camera-command-store';
import { commitFitAllCamera, resolveWorldFitSafeRegion } from '../camera/resolve-fit-all-camera';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootRecentActivityAuthorityRuntime,
  SearchRootRequestExecutionAuthorityRuntime,
  SearchRootResultsScrollAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SubmitRuntimeResult } from './use-search-root-control-plane-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchRootSubmitReadModel } from './use-search-root-submit-read-model';
import { useSearchRootSubmitRuntimePorts } from './use-search-root-submit-runtime-ports';
import { useSearchRootSubmitUiPorts } from './use-search-root-submit-ui-ports';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootSubmitControlRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  requestExecutionAuthorityRuntime: SearchRootRequestExecutionAuthorityRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  profileOwner: ProfileOwner;
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
  profileOwner,
  userLocation,
}: UseSearchRootSubmitControlRuntimeArgs): SubmitRuntimeResult => {
  const readModel = useSearchRootSubmitReadModel({
    stateFoundationLane,
  });
  const uiPortsBase = useSearchRootSubmitUiPorts({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    recentActivityAuthorityRuntime,
    resultsScrollAuthorityRuntime,
    resultsPresentationOwner,
    profileOwner,
    submitReadModel: readModel,
  });
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

  const runtimePorts = useSearchRootSubmitRuntimePorts({
    sessionCoreLane,
    stateFoundationLane,
    requestExecutionAuthorityRuntime,
    userLocation,
  });

  return useSearchSubmitOwnerValue({
    readModel,
    uiPorts,
    runtimePorts,
  });
};
