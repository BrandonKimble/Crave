import type { SearchOverlayChromeHostSnapshot } from '../../screens/Search/runtime/shared/search-foreground-chrome-contract';
import type { SearchOverlayHostGateSnapshot } from '../../screens/Search/runtime/shared/search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayShellHostSnapshot } from '../../screens/Search/runtime/shared/search-overlay-shell-host-snapshot-contract';
import type {
  SearchOverlayChromeHostAuthority,
  SearchOverlayGateHostAuthority,
  SearchOverlayLocalRestaurantSheetHostAuthority,
  SearchOverlayShellHostAuthority,
} from '../../screens/Search/runtime/shared/search-root-host-authority-contract';
import type { SearchRoutePanelInteractionRef } from '../../overlays/searchOverlayRouteHostContract';

export type AppRouteOverlayHostPublicationLane = {
  publishOverlayChromeHostSnapshot: (snapshot: SearchOverlayChromeHostSnapshot) => void;
  publishOverlayGateSnapshot: (snapshot: SearchOverlayHostGateSnapshot) => void;
  publishOverlayShellSnapshot: (snapshot: SearchOverlayShellHostSnapshot) => void;
  publishOverlayRestaurantHostAuthorities: (authorities: {
    overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  }) => void;
  publishSearchInteractionRef: (searchInteractionRef: SearchRoutePanelInteractionRef) => void;
  clearSearchOverlayHostPublication: () => void;
};

export type AppRouteOverlayHostAuthoritySurface = {
  overlayChromeHostAuthority: SearchOverlayChromeHostAuthority;
  overlayGateHostAuthority: SearchOverlayGateHostAuthority;
  overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  subscribeSearchInteractionRef: (listener: () => void) => () => void;
  getSearchInteractionRefSnapshot: () => SearchRoutePanelInteractionRef | null;
};
