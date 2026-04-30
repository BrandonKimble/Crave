export type SearchFreezeClassification = 'none' | 'recovery' | 'close-handoff';

export const resolveSearchRecoveryFreezeClassification = ({
  isRunOneChromeFreezeActive,
  isRunOnePreflightFreezeActive,
  isRun1HandoffActive,
  isResponseFrameFreezeActive,
  isChromeDeferred = false,
  runOneCommitSpanPressureActive = false,
}: {
  isRunOneChromeFreezeActive?: boolean;
  isRunOnePreflightFreezeActive?: boolean;
  isRun1HandoffActive?: boolean;
  isResponseFrameFreezeActive?: boolean;
  isChromeDeferred?: boolean;
  runOneCommitSpanPressureActive?: boolean;
}): SearchFreezeClassification =>
  isRunOneChromeFreezeActive ||
  isRunOnePreflightFreezeActive ||
  isRun1HandoffActive ||
  isResponseFrameFreezeActive ||
  isChromeDeferred ||
  runOneCommitSpanPressureActive
    ? 'recovery'
    : 'none';

export const resolveSearchCloseHandoffFreezeClassification = ({
  isCloseHandoffActive,
}: {
  isCloseHandoffActive: boolean;
}): SearchFreezeClassification =>
  isCloseHandoffActive ? 'close-handoff' : 'none';
