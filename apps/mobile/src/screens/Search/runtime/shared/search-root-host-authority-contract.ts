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
  SearchOverlayChromeHostSnapshot,
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
} from './search-foreground-chrome-contract';
import type { SearchRootOverlaySuggestionShellContainerRuntime } from './use-search-root-overlay-suggestion-shell-container-runtime';
import type { SnapshotAuthority } from './use-snapshot-authority';

export type SearchOverlayChromeHostAuthority = SnapshotAuthority<SearchOverlayChromeHostSnapshot>;

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

// F1315: three `SearchOverlaySuggestionShell{Container,Layout,Motion}HostAuthority` aliases
// lived here, each the sole consumer of a same-named one-line hook file whose entire body was
// `useSnapshotAuthority(x)`. Neither the hooks nor the aliases had a single importer anywhere
// in apps/mobile/src — three files, three exports, zero callers. Deleted with their hooks.

export type SearchOverlaySuggestionPanelHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionPanelInputs>;

export type SearchOverlaySuggestionDataHostAuthority =
  SnapshotAuthority<SearchForegroundSuggestionDataInputs>;

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
