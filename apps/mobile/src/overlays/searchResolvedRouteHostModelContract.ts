import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type {
  SearchRouteOverlayRenderPolicy,
  SearchRouteSceneDefinition,
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
  SearchRouteSceneShellSpec,
} from './searchOverlayRouteHostContract';
import type { OverlayRouteParamsMap } from '../store/overlayStore';
import type { OverlayKey, OverlaySceneRegistrySpec } from './types';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';
import { getSearchStartupGeometrySeed } from '../screens/Search/runtime/shared/search-startup-geometry';

const searchStartupGeometrySeed = getSearchStartupGeometrySeed();

export const EMPTY_SEARCH_ROUTE_VISUAL_STATE = {
  sheetTranslateY: { value: 0 },
  resultsScrollOffset: { value: 0 },
  resultsMomentum: { value: false },
  overlayHeaderActionProgress: { value: 0 },
  navBarHeight: searchStartupGeometrySeed.bottomNavHeight,
  navBarTopForSnaps: searchStartupGeometrySeed.navBarTopForSnaps,
  searchBarTop: searchStartupGeometrySeed.searchBarTop,
  snapPoints: searchStartupGeometrySeed.routeOverlaySnapPoints,
  closeVisualHandoffProgress: { value: 0 },
  navBarCutoutHeight: searchStartupGeometrySeed.navBarCutoutHeight,
  navBarCutoutProgress: { value: 0 },
  bottomNavHiddenTranslateY: searchStartupGeometrySeed.bottomNavHiddenTranslateY,
  navBarCutoutIsHiding: false,
} as unknown as SearchRouteHostVisualState;

export type SearchRouteOverlayKey = 'search' | 'polls' | null;

export type SearchRouteOverlaySheetKeys = {
  searchRouteOverlayKey: SearchRouteOverlayKey;
  overlaySheetKey: OverlayKey | null;
  resolvedOverlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  isPersistentPollLane: boolean;
  isSearchOverlay: boolean;
  showPollsOverlay: boolean;
  showBookmarksOverlay: boolean;
  showProfileOverlay: boolean;
  showSaveListOverlay: boolean;
};

export type SearchRouteOverlayPublishedState = {
  publishedVisualState: SearchRouteHostVisualState | null;
  searchSceneDefinition: SearchRouteSceneDefinition | null;
  searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
  dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
  renderPolicy: SearchRouteOverlayRenderPolicy;
};

export type SearchRouteOverlayRouteState = {
  rootOverlayKey: OverlayKey;
  activeOverlayRouteKey: OverlayKey;
  pollOverlayParams: OverlayRouteParamsMap['polls'];
  pollCreationMarketKey: OverlayRouteParamsMap['pollCreation'] extends
    | { marketKey?: infer T }
    | undefined
    ? T
    : never;
  pollCreationMarketName: OverlayRouteParamsMap['pollCreation'] extends
    | { marketName?: infer T }
    | undefined
    ? T
    : never;
  pollCreationBounds: OverlayRouteParamsMap['pollCreation'] extends { bounds?: infer T } | undefined
    ? T
    : never;
  shouldShowPollCreationPanel: boolean;
};

export type SearchRouteOverlaySceneRegistry = Partial<
  Record<OverlayKey, SearchRouteSceneDefinition>
>;
export type SearchRouteResolvedHostInput = {
  activeSceneKey: OverlayKey | null;
  activeShellSpec: SearchRouteSceneShellSpec | null;
  sceneKeys: OverlayKey[];
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
};

export type ResolvedSearchRouteHostModel = {
  activeSceneKey: OverlayKey;
  activeSceneSpec: OverlaySceneRegistrySpec;
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  overlayHeaderActionMode: OverlayHeaderActionMode;
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
  visualState: SearchRouteHostVisualState;
};
