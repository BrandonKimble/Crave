import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type {
  SearchRouteOverlayRenderPolicy,
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
} from './searchOverlayRouteHostContract';
import type { OverlayRouteParamsMap } from '../store/overlayStore';
import type { OverlayContentSpec, OverlayKey } from './types';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';

export const EMPTY_SEARCH_ROUTE_VISUAL_STATE = {
  sheetTranslateY: { value: 0 },
  resultsScrollOffset: { value: 0 },
  resultsMomentum: { value: false },
  overlayHeaderActionProgress: { value: 0 },
  navBarHeight: 0,
  navBarTopForSnaps: 0,
  searchBarTop: 0,
  snapPoints: [0, 0, 0] as const,
  closeVisualHandoffProgress: { value: 0 },
  navBarCutoutHeight: 0,
  navBarCutoutProgress: { value: 0 },
  bottomNavHiddenTranslateY: 0,
  navBarCutoutIsHiding: false,
} as const satisfies SearchRouteHostVisualState;

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
  searchPanelSpec: OverlayContentSpec<unknown> | null;
  searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
  dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
  renderPolicy: SearchRouteOverlayRenderPolicy;
};

export type SearchRouteOverlayRouteState = {
  rootOverlayKey: OverlayKey;
  activeOverlayRouteKey: OverlayKey;
  pollOverlayParams: OverlayRouteParamsMap['polls'];
  pollCreationCoverageKey: OverlayRouteParamsMap['pollCreation'] extends
    | { coverageKey: infer T }
    | undefined
    ? T
    : never;
  pollCreationCoverageName: OverlayRouteParamsMap['pollCreation'] extends
    | { coverageName?: infer T }
    | undefined
    ? T
    : never;
  shouldShowPollCreationPanel: boolean;
};

export type SearchRouteOverlayActiveSheetSpec = {
  overlaySheetKey: OverlayKey | null;
  overlaySheetSpec: OverlayContentSpec<unknown> | null;
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
};

export type SearchRouteOverlaySheetVisibilityState = {
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  overlaySheetSpec: OverlayContentSpec<unknown> | null;
};

export type ResolvedSearchRouteHostModel = {
  overlaySheetKey: OverlayKey;
  overlaySheetSpec: OverlayContentSpec<unknown>;
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  overlayHeaderActionMode: OverlayHeaderActionMode;
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
  visualState: SearchRouteHostVisualState;
};
