import { useSearchCloseVisualHandoffRuntime } from './use-search-close-visual-handoff-runtime';

type UseSearchRootOverlayCloseHandoffRuntimeArgs = {
  isCloseTransitionActive: boolean;
  sheetTranslateY: Parameters<typeof useSearchCloseVisualHandoffRuntime>[0]['sheetTranslateY'];
  collapsedSnap: number;
  notifyCloseCollapsedBoundaryReached: () => void;
};

export const useSearchRootOverlayCloseHandoffRuntime = ({
  isCloseTransitionActive,
  sheetTranslateY,
  collapsedSnap,
  notifyCloseCollapsedBoundaryReached,
}: UseSearchRootOverlayCloseHandoffRuntimeArgs) =>
  useSearchCloseVisualHandoffRuntime({
    isCloseTransitionActive,
    sheetTranslateY,
    collapsedSnap,
    notifyCloseCollapsedBoundaryReached,
  });
