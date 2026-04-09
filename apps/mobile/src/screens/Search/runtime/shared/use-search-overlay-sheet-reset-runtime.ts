import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';

type UseSearchOverlaySheetResetRuntimeArgs = {
  shouldShowPollsSheet: boolean;
  showBookmarksOverlay: boolean;
  showProfileOverlay: boolean;
  showSaveListOverlay: boolean;
  setPollsSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setBookmarksSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setProfileSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setSaveSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
};

export const useSearchOverlaySheetResetRuntime = ({
  shouldShowPollsSheet,
  showBookmarksOverlay,
  showProfileOverlay,
  showSaveListOverlay,
  setPollsSheetSnap,
  setBookmarksSheetSnap,
  setProfileSheetSnap,
  setSaveSheetSnap,
}: UseSearchOverlaySheetResetRuntimeArgs): void => {
  React.useEffect(() => {
    if (!shouldShowPollsSheet) {
      setPollsSheetSnap('hidden');
    }
  }, [setPollsSheetSnap, shouldShowPollsSheet]);

  React.useEffect(() => {
    if (!showBookmarksOverlay) {
      setBookmarksSheetSnap('hidden');
    }
  }, [setBookmarksSheetSnap, showBookmarksOverlay]);

  React.useEffect(() => {
    if (!showProfileOverlay) {
      setProfileSheetSnap('hidden');
    }
  }, [setProfileSheetSnap, showProfileOverlay]);

  React.useEffect(() => {
    if (!showSaveListOverlay) {
      setSaveSheetSnap('hidden');
    }
  }, [setSaveSheetSnap, showSaveListOverlay]);
};
