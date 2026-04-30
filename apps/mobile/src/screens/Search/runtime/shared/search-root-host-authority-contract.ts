import type { SearchMapRenderHostLayerRuntime } from './search-map-render-host-layer-runtime-contract';
import type { SearchOverlayHostGateSnapshot } from './search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from './search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type { SearchOverlayShellHostSnapshot } from './search-overlay-shell-host-snapshot-contract';
import type { RouteLocalRestaurantOverlayInteractionSnapshot } from '../../../../navigation/runtime/route-local-restaurant-overlay-interaction-snapshot-contract';
import type { RouteLocalRestaurantOverlayPanelContentSnapshot } from '../../../../navigation/runtime/route-local-restaurant-overlay-panel-content-snapshot-contract';
import type { RouteLocalRestaurantOverlayPolicySnapshot } from '../../../../navigation/runtime/route-local-restaurant-overlay-policy-snapshot-contract';
import type { RouteGlobalRestaurantOverlaySnapshot } from '../../../../navigation/runtime/route-global-restaurant-overlay-snapshot-contract';
import type { RouteLocalRestaurantOverlaySessionSnapshot } from '../../../../navigation/runtime/route-local-restaurant-overlay-session-snapshot-contract';
import type { SearchRouteSheetHostFrameSnapshot } from './search-route-sheet-host-frame-snapshot-contract';
import type {
  SearchOverlayChromeContainerSnapshot,
  SearchOverlayChromeFrameSnapshot,
  SearchOverlayChromeHeaderProps,
  SearchOverlayChromeSuggestionSurfaceProps,
  SearchForegroundHeaderSearchBarInteractionInputs,
  SearchForegroundHeaderSearchBarLayoutInputs,
  SearchForegroundHeaderSearchBarVisualInputs,
  SearchForegroundHeaderSearchThisAreaInteractionInputs,
  SearchForegroundHeaderSearchThisAreaVisualInputs,
  SearchForegroundHeaderShortcutsInputs,
  SearchForegroundSuggestionDataInputs,
  SearchForegroundSuggestionLayoutInputs,
  SearchForegroundSuggestionMotionInputs,
  SearchForegroundSuggestionPanelInputs,
  SearchForegroundSuggestionScrollInputs,
  SearchForegroundSuggestionSelectionInputs,
  SearchForegroundSuggestionStatusInputs,
} from './search-foreground-chrome-contract';
import type { SearchRootOverlaySuggestionShellContainerRuntime } from './use-search-root-overlay-suggestion-shell-container-runtime';
import type { SnapshotAuthority } from './use-snapshot-authority';

export type SearchOverlayChromeFrameHostAuthority =
  SnapshotAuthority<SearchOverlayChromeFrameSnapshot>;

export type SearchOverlayChromeContainerHostAuthority =
  SnapshotAuthority<SearchOverlayChromeContainerSnapshot>;

export type SearchOverlayChromeHeaderHostAuthority =
  SnapshotAuthority<SearchOverlayChromeHeaderProps>;

export type SearchOverlayChromeSuggestionSurfaceHostAuthority =
  SnapshotAuthority<SearchOverlayChromeSuggestionSurfaceProps>;

export type SearchOverlayGateHostAuthority = SnapshotAuthority<SearchOverlayHostGateSnapshot>;

export type SearchOverlayHeaderSearchBarLayoutHostAuthority =
  SnapshotAuthority<SearchForegroundHeaderSearchBarLayoutInputs>;

export type SearchOverlayHeaderSearchBarVisualHostAuthority =
  SnapshotAuthority<SearchForegroundHeaderSearchBarVisualInputs>;

export type SearchOverlayHeaderSearchBarInteractionHostAuthority =
  SnapshotAuthority<SearchForegroundHeaderSearchBarInteractionInputs>;

export type SearchOverlayHeaderSearchThisAreaVisualHostAuthority =
  SnapshotAuthority<SearchForegroundHeaderSearchThisAreaVisualInputs>;

export type SearchOverlayHeaderSearchThisAreaInteractionHostAuthority =
  SnapshotAuthority<SearchForegroundHeaderSearchThisAreaInteractionInputs>;

export type SearchOverlayHeaderShortcutsHostAuthority =
  SnapshotAuthority<SearchForegroundHeaderShortcutsInputs>;

export type SearchOverlaySuggestionShellContainerHostAuthority =
  SnapshotAuthority<SearchRootOverlaySuggestionShellContainerRuntime>;

export type SearchOverlaySuggestionShellLayoutHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionLayoutInputs>;

export type SearchOverlaySuggestionShellMotionHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionMotionInputs>;

export type SearchOverlaySuggestionPanelHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionPanelInputs>;

export type SearchOverlaySuggestionDataHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionDataInputs>;

export type SearchOverlaySuggestionStatusHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionStatusInputs>;

export type SearchOverlaySuggestionScrollHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionScrollInputs>;

export type SearchOverlaySuggestionSelectionHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionSelectionInputs>;

export type SearchOverlayShellHostAuthority = SnapshotAuthority<SearchOverlayShellHostSnapshot>;

export type SearchOverlayGlobalRestaurantHostAuthority =
  SnapshotAuthority<RouteGlobalRestaurantOverlaySnapshot>;

export type SearchOverlayLocalRestaurantSessionHostAuthority =
  SnapshotAuthority<RouteLocalRestaurantOverlaySessionSnapshot>;

export type SearchOverlayLocalRestaurantPanelContentHostAuthority =
  SnapshotAuthority<RouteLocalRestaurantOverlayPanelContentSnapshot>;

export type SearchOverlayLocalRestaurantPolicyHostAuthority =
  SnapshotAuthority<RouteLocalRestaurantOverlayPolicySnapshot>;

export type SearchOverlayLocalRestaurantInteractionHostAuthority =
  SnapshotAuthority<RouteLocalRestaurantOverlayInteractionSnapshot>;

export type SearchOverlayLocalRestaurantSheetHostAuthority =
  SnapshotAuthority<SearchOverlayLocalRestaurantSheetHostSnapshot>;

export type SearchRouteSheetFrameHostAuthority =
  SnapshotAuthority<SearchRouteSheetHostFrameSnapshot>;

export type SearchMapRenderHostAuthority = SnapshotAuthority<SearchMapRenderHostLayerRuntime>;
