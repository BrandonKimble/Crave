import React from 'react';

import { resolveExpandedTop } from '../../../../overlays/sheetUtils';
import { SCREEN_HEIGHT } from '../../constants/search';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';

type SearchOverlayChromeTransitionConfig = {
  sheetY: ResultsSheetRuntimeOwner['sheetTranslateY'];
  expanded: number;
  middle: number;
};

type UseSearchOverlayChromeSnapsRuntimeArgs = {
  searchBarTop: number;
  insetsTop: number;
  showSaveListOverlay: boolean;
  showProfileOverlay: boolean;
  showBookmarksOverlay: boolean;
  showPollsOverlay: boolean;
  isSearchOverlay: boolean;
  isSuggestionPanelActive: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  shouldRenderResultsSheet: boolean;
  sheetTranslateY: ResultsSheetRuntimeOwner['sheetTranslateY'];
  snapPoints: ResultsSheetRuntimeOwner['snapPoints'];
};

const buildExpandedMiddleChromeSnaps = (searchBarTop: number, insetTop: number) => {
  const expanded = resolveExpandedTop(searchBarTop, insetTop);
  const rawMiddle = SCREEN_HEIGHT * 0.4;
  const middle = Math.max(expanded + 96, rawMiddle);
  const hidden = SCREEN_HEIGHT + 80;
  const clampedMiddle = Math.min(middle, hidden - 120);
  return { expanded, middle: clampedMiddle };
};

export const useSearchOverlayChromeSnapsRuntime = ({
  searchBarTop,
  insetsTop,
  showSaveListOverlay,
  showProfileOverlay,
  showBookmarksOverlay,
  showPollsOverlay,
  isSearchOverlay,
  isSuggestionPanelActive,
  isSearchSessionActive,
  isSearchLoading,
  shouldRenderResultsSheet,
  sheetTranslateY,
  snapPoints,
}: UseSearchOverlayChromeSnapsRuntimeArgs): SearchOverlayChromeTransitionConfig => {
  const pollsChromeSnaps = React.useMemo(
    () => buildExpandedMiddleChromeSnaps(searchBarTop, insetsTop),
    [insetsTop, searchBarTop]
  );
  const bookmarksChromeSnaps = React.useMemo(
    () => buildExpandedMiddleChromeSnaps(searchBarTop, insetsTop),
    [insetsTop, searchBarTop]
  );
  const profileChromeSnaps = React.useMemo(
    () => buildExpandedMiddleChromeSnaps(searchBarTop, insetsTop),
    [insetsTop, searchBarTop]
  );
  const saveChromeSnaps = React.useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insetsTop);
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.5);
    return { expanded, middle };
  }, [insetsTop, searchBarTop]);
  const shouldUsePollsChrome =
    showPollsOverlay ||
    (isSearchOverlay &&
      !isSuggestionPanelActive &&
      !isSearchSessionActive &&
      !isSearchLoading &&
      !shouldRenderResultsSheet);

  return React.useMemo(() => {
    if (showSaveListOverlay) {
      return {
        sheetY: sheetTranslateY,
        expanded: saveChromeSnaps.expanded,
        middle: saveChromeSnaps.middle,
      };
    }
    if (showProfileOverlay) {
      return {
        sheetY: sheetTranslateY,
        expanded: profileChromeSnaps.expanded,
        middle: profileChromeSnaps.middle,
      };
    }
    if (showBookmarksOverlay) {
      return {
        sheetY: sheetTranslateY,
        expanded: bookmarksChromeSnaps.expanded,
        middle: bookmarksChromeSnaps.middle,
      };
    }
    if (shouldUsePollsChrome) {
      return {
        sheetY: sheetTranslateY,
        expanded: pollsChromeSnaps.expanded,
        middle: pollsChromeSnaps.middle,
      };
    }
    return {
      sheetY: sheetTranslateY,
      expanded: snapPoints.expanded,
      middle: snapPoints.middle,
    };
  }, [
    bookmarksChromeSnaps.expanded,
    bookmarksChromeSnaps.middle,
    pollsChromeSnaps.expanded,
    pollsChromeSnaps.middle,
    profileChromeSnaps.expanded,
    profileChromeSnaps.middle,
    saveChromeSnaps.expanded,
    saveChromeSnaps.middle,
    sheetTranslateY,
    shouldUsePollsChrome,
    showBookmarksOverlay,
    showProfileOverlay,
    showSaveListOverlay,
    snapPoints.expanded,
    snapPoints.middle,
  ]);
};
