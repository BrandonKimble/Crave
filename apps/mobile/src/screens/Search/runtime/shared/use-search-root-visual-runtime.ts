import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useSearchChromeTransitionRuntime } from './use-search-chrome-transition-runtime';
import { useSearchCloseVisualHandoffRuntime } from './use-search-close-visual-handoff-runtime';
import {
  useSearchForegroundVisualRuntime,
  type SearchForegroundVisualRuntime,
} from './use-search-foreground-visual-runtime';
import { useSearchOverlayChromeSnapsRuntime } from './use-search-overlay-chrome-snaps-runtime';
import { useSearchOverlaySheetResetRuntime } from './use-search-overlay-sheet-reset-runtime';
import { useSearchShortcutHarnessBridgeRuntime } from './use-search-shortcut-harness-bridge-runtime';

type UseSearchRootVisualRuntimeArgs = {
  overlayChromeSnapsArgs: Parameters<typeof useSearchOverlayChromeSnapsRuntime>[0];
  overlaySheetResetArgs: Parameters<typeof useSearchOverlaySheetResetRuntime>[0];
  closeVisualHandoffArgs: Omit<
    Parameters<typeof useSearchCloseVisualHandoffRuntime>[0],
    'notifyCloseCollapsedBoundaryReached'
  >;
  notifyCloseCollapsedBoundaryReached: () => void;
  foregroundVisualArgs: Omit<
    Parameters<typeof useSearchForegroundVisualRuntime>[0],
    'searchChromeOpacity' | 'searchChromeScale'
  >;
  shortcutHarnessArgs: Parameters<typeof useSearchShortcutHarnessBridgeRuntime>[0];
};

export type SearchRootVisualRuntime = SearchForegroundVisualRuntime & {
  overlayHeaderActionProgress: SharedValue<number>;
  closeVisualHandoffProgress: ReturnType<
    typeof useSearchCloseVisualHandoffRuntime
  >['closeVisualHandoffProgress'];
  searchBarInputAnimatedStyle: ReturnType<
    typeof useSearchChromeTransitionRuntime
  >['searchBarInputAnimatedStyle'];
};

export const useSearchRootVisualRuntime = ({
  overlayChromeSnapsArgs,
  overlaySheetResetArgs,
  closeVisualHandoffArgs,
  notifyCloseCollapsedBoundaryReached,
  foregroundVisualArgs,
  shortcutHarnessArgs,
}: UseSearchRootVisualRuntimeArgs): SearchRootVisualRuntime => {
  const chromeTransitionConfig = useSearchOverlayChromeSnapsRuntime(overlayChromeSnapsArgs);
  useSearchOverlaySheetResetRuntime(overlaySheetResetArgs);

  const { closeVisualHandoffProgress } = useSearchCloseVisualHandoffRuntime({
    ...closeVisualHandoffArgs,
    notifyCloseCollapsedBoundaryReached,
  });
  const overlayHeaderActionProgress = useSharedValue(0);
  const { searchChromeOpacity, searchChromeScale, searchBarInputAnimatedStyle } =
    useSearchChromeTransitionRuntime({
      expandedSnap: chromeTransitionConfig.expanded,
      middleSnap: chromeTransitionConfig.middle,
      sheetTranslateY: chromeTransitionConfig.sheetY,
    });
  const foregroundVisualRuntime = useSearchForegroundVisualRuntime({
    ...foregroundVisualArgs,
    searchChromeOpacity,
    searchChromeScale,
  });

  useSearchShortcutHarnessBridgeRuntime(shortcutHarnessArgs);

  return {
    ...foregroundVisualRuntime,
    overlayHeaderActionProgress,
    closeVisualHandoffProgress,
    searchBarInputAnimatedStyle,
  };
};
