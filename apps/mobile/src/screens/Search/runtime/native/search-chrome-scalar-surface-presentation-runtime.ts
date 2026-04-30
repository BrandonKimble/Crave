import type { SearchBackdropTarget } from '../shared/results-presentation-shell-contract';
import type { SearchChromeScalarSurfacePrimitiveSourceRuntime } from './search-chrome-scalar-surface-primitive-source-runtime';

export type SearchChromeScalarSurfacePresentationRuntime = {
  syncShellPresentationScalars: (snapshot: {
    shouldRenderSearchOverlay: boolean;
    headerShortcutsVisibleTarget: boolean;
    headerShortcutsInteractive: boolean;
    backdropTarget: SearchBackdropTarget;
  }) => void;
  syncSuggestionOverlayVisible: (isSuggestionOverlayVisible: boolean) => void;
};

export const createSearchChromeScalarSurfacePresentationRuntime = (
  primitiveSourceRuntime: SearchChromeScalarSurfacePrimitiveSourceRuntime
): SearchChromeScalarSurfacePresentationRuntime => ({
  syncShellPresentationScalars: ({
    shouldRenderSearchOverlay,
    headerShortcutsVisibleTarget,
    headerShortcutsInteractive,
    backdropTarget,
  }) => {
    primitiveSourceRuntime.updatePrimitiveSnapshot({
      shouldRenderSearchOverlay,
      headerShortcutsVisibleTarget,
      headerShortcutsInteractive,
      backdropTarget: backdropTarget === 'default' ? 'none' : backdropTarget,
    });
  },
  syncSuggestionOverlayVisible: (isSuggestionOverlayVisible) => {
    primitiveSourceRuntime.updatePrimitiveSnapshot({
      isSuggestionOverlayVisible,
    });
  },
});
