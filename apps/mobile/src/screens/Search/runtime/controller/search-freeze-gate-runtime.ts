import type { SearchFreezeClassification } from '../shared/search-freeze-classification-runtime';

type SearchFreezeGateRuntimeValue = {
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRun1HandoffActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

export const createSearchFreezeGateRuntimeValue = ({
  isRunOneChromeFreezeActive,
  isRunOnePreflightFreezeActive,
  isRun1HandoffActive,
  isResponseFrameFreezeActive,
  freezeClassification,
}: SearchFreezeGateRuntimeValue): SearchFreezeGateRuntimeValue => ({
  isRunOneChromeFreezeActive,
  isRunOnePreflightFreezeActive,
  isRun1HandoffActive,
  isResponseFrameFreezeActive,
  freezeClassification,
});
