import type { Coordinate, MapBounds, RestaurantResult, SearchResponse } from '../../../../types';
import type {
  CameraSnapshot,
  ProfileForegroundUiRestoreState,
  ProfileTransitionSnapshotCapture,
  ProfileTransitionStatus,
  RestaurantFocusSession,
  RestaurantProfileSeed,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type {
  CloseRestaurantProfileOptions,
  ProfileOpenOptions,
  ProfilePreviewOpenOptions,
  RestaurantProfileLocation,
  SearchProfileSource,
} from './profile-action-model-contract';

export type { ProfileForegroundUiRestoreState } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

export type ProfileActionExecutionPorts = {
  prepareForegroundUiForProfileOpen: (options?: {
    captureSaveSheetState?: boolean;
  }) => ProfileForegroundUiRestoreState | null;
  setDismissBehavior: (dismissBehavior: 'restore' | 'clear') => void;
  setShouldClearSearchOnDismiss: (shouldClearSearchOnDismiss: boolean) => void;
  capturePreviousForegroundUiRestoreStateIfAbsent: (
    restoreState: ProfileForegroundUiRestoreState | null
  ) => void;
  capturePreparedProfileTransitionSnapshot: (
    snapshotCapture: ProfileTransitionSnapshotCapture
  ) => void;
  setNextFocusSession: (session: RestaurantFocusSession) => void;
  setMultiLocationZoomBaseline: (zoomBaseline: number | null) => void;
  setLastCameraState: (
    state: { center: [number, number]; zoom: number } | null | undefined
  ) => void;
  setMapHighlightedRestaurantId: (restaurantId: string | null) => void;
  openPreparedProfilePresentation: (
    restaurantId: string,
    targetCamera: CameraSnapshot | null | undefined
  ) => void;
  closePreparedProfilePresentation: (restaurantId: string | null) => void;
  focusPreparedProfileCamera: (targetCamera: CameraSnapshot) => void;
  seedRestaurantProfile: (
    restaurant: RestaurantProfileSeed,
    queryLabel: string,
    options?: { selectedLocationId?: string | null }
  ) => void;
  hydrateRestaurantProfileById: (restaurantId: string) => void;
  deferRecentlyViewedTrack: (restaurantId: string, restaurantName: string) => void;
  recordRestaurantView: (restaurantId: string, source: SearchProfileSource) => Promise<void>;
  prepareForProfileClose: () => void;
};

export type ProfileRefreshSelectionExecutionPorts = {
  setMapHighlightedRestaurantId: (restaurantId: string | null) => void;
  seedRestaurantProfile: (
    restaurant: RestaurantProfileSeed,
    queryLabel: string,
    options?: { selectedLocationId?: string | null }
  ) => void;
  focusRestaurantProfileCamera: (restaurant: RestaurantResult, source: SearchProfileSource) => void;
  hydrateRestaurantProfileById: (restaurantId: string) => void;
};

export type ProfileAutoOpenActionExecutionPorts = {
  clearPendingSelection: () => void;
  refreshOpenRestaurantProfileSelection: (restaurant: RestaurantResult, queryLabel: string) => void;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    options: { source: 'autocomplete' | 'auto_open_single_candidate' }
  ) => void;
  setLastAutoOpenKey: (key: string | null) => void;
};

/** F1064 — THE LATE-BOUND HALVES, MADE UNSTUBBABLE.
 *
 *  `focusRestaurantProfileCamera` (refresh-selection) and
 *  `refreshOpenRestaurantProfileSelection` / `openRestaurantProfile` (auto-open) are
 *  PROFILE ACTIONS, and the actions do not exist yet when their port bags are built —
 *  the genuine construction-order cycle documented in profile-seeded-camera-focus-handler.ts.
 *  The port builders used to fill them with `(a, b) => { void a; void b; }` no-ops that
 *  WORKED ONLY because a downstream spread overrode them. Delete that spread by accident
 *  and the profile silently stops focusing/opening: no type error, no crash, a dead button.
 *
 *  So the builders no longer DECLARE those fields. They return the halves they actually
 *  own; the consumer supplies the actions in the same spread that always did the real work
 *  — and now the spread is load-bearing at the TYPE level.
 *  RED recipe: delete `focusRestaurantProfileCamera,` from the spread at
 *  profile-owner-runtime-actions-runtime.ts:41-43 (or the two action lines at
 *  profile-owner-auto-open-kickoff-runtime.ts:35-38) and tsc fails naming the missing
 *  property — where it used to compile into a dead button. */
export type ProfileRefreshSelectionOwnedPorts = Omit<
  ProfileRefreshSelectionExecutionPorts,
  'focusRestaurantProfileCamera'
>;

export type ProfileAutoOpenOwnedPorts = Omit<
  ProfileAutoOpenActionExecutionPorts,
  'refreshOpenRestaurantProfileSelection' | 'openRestaurantProfile'
>;

export type CreateProfileActionRuntimeArgs = {
  queryState: {
    currentQueryLabel: string;
    currentQueryKey: string;
    results: SearchResponse | null;
    isProfileAutoOpenSuppressed: boolean;
  };
  selectionState: {
    resolveRestaurantMapLocations: (restaurant: RestaurantResult) => RestaurantProfileLocation[];
    resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
    pickClosestLocationToCenter: (
      locations: RestaurantProfileLocation[],
      center: Coordinate | null
    ) => RestaurantProfileLocation | null;
    pickPreferredRestaurantMapLocation: (
      restaurant: RestaurantResult,
      anchor: Coordinate | null
    ) => RestaurantProfileLocation | null;
    profileMultiLocationMinZoom: number;
    restaurantFocusCenterEpsilon: number;
    restaurantFocusZoomEpsilon: number;
  };
  runtimeState: {
    getProfileTransitionStatus: () => ProfileTransitionStatus;
    getCurrentPanelRestaurantId: () => string | null;
    hasPanelSnapshot: () => boolean;
    getCurrentLastCameraState: () => { center: [number, number]; zoom: number } | null;
    getCurrentViewportBounds: () => MapBounds | null;
    getCurrentMapZoom: () => number | null;
    getFallbackMapZoom: () => number;
    resolveProfileCameraPadding: () => CameraSnapshot['padding'];
    getProfileTransitionSnapshotCapture: () => ProfileTransitionSnapshotCapture;
    getProfileMultiLocationZoomBaseline: () => number | null;
    getRestaurantFocusSession: () => RestaurantFocusSession;
    getPendingSelection: () => { restaurantId: string } | null;
    getActiveOpenRestaurantId: () => string | null;
    getLastAutoOpenKey: () => string | null;
  };
  actionExecutionPorts: ProfileActionExecutionPorts;
  refreshSelectionExecutionPorts: ProfileRefreshSelectionExecutionPorts;
  autoOpenActionExecutionPorts: ProfileAutoOpenActionExecutionPorts;
};

/** F1064 — the PRESENTATION factories (preview/open/focus) read `actionExecutionPorts` and
 *  `runtimeState` ONLY. Demanding the other two port bags from them forced their one caller
 *  to fabricate six no-op ports purely to satisfy the type. Each factory now takes exactly
 *  what it uses, so there is nothing left to fabricate.
 *  RED recipe: pass a `refreshSelectionExecutionPorts:` key to
 *  createProfilePreviewActionRuntime and tsc rejects the excess property. */
export type CreateProfilePresentationActionRuntimeArgs = Omit<
  CreateProfileActionRuntimeArgs,
  'refreshSelectionExecutionPorts' | 'autoOpenActionExecutionPorts'
>;

export type ProfileRestaurantActionModelRuntimeArgs = Pick<
  CreateProfileActionRuntimeArgs,
  'queryState' | 'selectionState' | 'runtimeState'
>;

export type ProfileActionRuntime = {
  focusRestaurantProfileCamera: (
    restaurant: RestaurantResult,
    source: SearchProfileSource,
    options?: {
      pressedCoordinate?: Coordinate | null;
      preferPressedCoordinate?: boolean;
    }
  ) => void;
  refreshOpenRestaurantProfileSelection: (restaurant: RestaurantResult, queryLabel: string) => void;
  openRestaurantProfilePreview: (
    restaurantId: string,
    restaurantName: string,
    options?: ProfilePreviewOpenOptions
  ) => void;
  openRestaurantProfile: (restaurant: RestaurantResult, options?: ProfileOpenOptions) => void;
  openRestaurantProfileFromResults: (
    restaurant: RestaurantResult,
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  closeRestaurantProfile: (options?: CloseRestaurantProfileOptions) => void;
  runNextProfileAutoOpenAction: () => void;
};
