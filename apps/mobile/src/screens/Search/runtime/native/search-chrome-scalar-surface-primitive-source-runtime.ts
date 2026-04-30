import type {
  SearchChromeScalarSurfacePrimitiveSnapshot,
  SearchChromeScalarSurfaceProducerRuntime,
} from './search-chrome-scalar-surface-producer-runtime';
import type { SearchChromeScalarSurfaceScalarSnapshot } from './search-chrome-scalar-surface-target-runtime';

export type SearchChromeScalarSurfacePrimitivePatch =
  Partial<SearchChromeScalarSurfacePrimitiveSnapshot>;

export type SearchChromeScalarSurfacePrimitiveSourceRuntime = {
  getSnapshot: () => SearchChromeScalarSurfacePrimitiveSnapshot;
  updatePrimitiveSnapshot: (
    patch: SearchChromeScalarSurfacePrimitivePatch
  ) => SearchChromeScalarSurfacePrimitiveSnapshot;
  applyToProducer: (
    producerRuntime: SearchChromeScalarSurfaceProducerRuntime
  ) => SearchChromeScalarSurfaceScalarSnapshot;
  clear: () => SearchChromeScalarSurfacePrimitiveSnapshot;
};

const DEFAULT_PRIMITIVE_SNAPSHOT: SearchChromeScalarSurfacePrimitiveSnapshot = {
  shouldDisableSearchShortcuts: false,
  shouldRenderSearchOverlay: false,
  headerShortcutsVisibleTarget: false,
  headerShortcutsInteractive: false,
  isSearchOverlay: false,
  isSuggestionPanelActive: false,
  isSuggestionOverlayVisible: false,
  backdropTarget: 'none',
  isSearchSessionActive: false,
  mapMovedSinceSearch: false,
  isSearchLoading: false,
  isLoadingMore: false,
  hasResults: false,
};

const arePrimitiveSnapshotsEqual = (
  left: SearchChromeScalarSurfacePrimitiveSnapshot,
  right: SearchChromeScalarSurfacePrimitiveSnapshot
): boolean =>
  left.shouldDisableSearchShortcuts === right.shouldDisableSearchShortcuts &&
  left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay &&
  left.headerShortcutsVisibleTarget === right.headerShortcutsVisibleTarget &&
  left.headerShortcutsInteractive === right.headerShortcutsInteractive &&
  left.isSearchOverlay === right.isSearchOverlay &&
  left.isSuggestionPanelActive === right.isSuggestionPanelActive &&
  left.isSuggestionOverlayVisible === right.isSuggestionOverlayVisible &&
  left.backdropTarget === right.backdropTarget &&
  left.isSearchSessionActive === right.isSearchSessionActive &&
  left.mapMovedSinceSearch === right.mapMovedSinceSearch &&
  left.isSearchLoading === right.isSearchLoading &&
  left.isLoadingMore === right.isLoadingMore &&
  left.hasResults === right.hasResults;

const clonePrimitiveSnapshot = (
  snapshot: SearchChromeScalarSurfacePrimitiveSnapshot
): SearchChromeScalarSurfacePrimitiveSnapshot => ({ ...snapshot });

export const createSearchChromeScalarSurfacePrimitiveSourceRuntime =
  (): SearchChromeScalarSurfacePrimitiveSourceRuntime => {
    let snapshot = clonePrimitiveSnapshot(DEFAULT_PRIMITIVE_SNAPSHOT);

    return {
      getSnapshot: () => snapshot,
      updatePrimitiveSnapshot: (patch) => {
        const nextSnapshot = {
          ...snapshot,
          ...patch,
        };
        if (arePrimitiveSnapshotsEqual(snapshot, nextSnapshot)) {
          return snapshot;
        }

        snapshot = nextSnapshot;
        return snapshot;
      },
      applyToProducer: (producerRuntime) => producerRuntime.applyPrimitiveSnapshot(snapshot),
      clear: () => {
        snapshot = clonePrimitiveSnapshot(DEFAULT_PRIMITIVE_SNAPSHOT);
        return snapshot;
      },
    };
  };
