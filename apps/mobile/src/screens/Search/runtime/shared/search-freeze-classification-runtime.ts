export type SearchFreezeClassification = 'none' | 'recovery' | 'close-handoff';

export const resolveSearchRecoveryFreezeClassification = ({
  isSearchSurfaceRedrawChromeFreezeActive,
  isSearchSurfaceRedrawPreflightFreezeActive,
  isSearchSurfaceRedrawActive,
  isResponseFrameFreezeActive,
  isChromeDeferred = false,
  searchSurfaceRedrawCommitSpanPressureActive = false,
}: {
  isSearchSurfaceRedrawChromeFreezeActive?: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive?: boolean;
  isSearchSurfaceRedrawActive?: boolean;
  isResponseFrameFreezeActive?: boolean;
  isChromeDeferred?: boolean;
  searchSurfaceRedrawCommitSpanPressureActive?: boolean;
}): SearchFreezeClassification =>
  isSearchSurfaceRedrawChromeFreezeActive ||
  isSearchSurfaceRedrawPreflightFreezeActive ||
  isSearchSurfaceRedrawActive ||
  isResponseFrameFreezeActive ||
  isChromeDeferred ||
  searchSurfaceRedrawCommitSpanPressureActive
    ? 'recovery'
    : 'none';

export const resolveSearchCloseHandoffFreezeClassification = ({
  isCloseHandoffActive,
}: {
  isCloseHandoffActive: boolean;
}): SearchFreezeClassification =>
  isCloseHandoffActive ? 'close-handoff' : 'none';
