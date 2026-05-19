import type { SearchFreezeClassification } from '../shared/search-freeze-classification-runtime';

type SearchFreezeGateRuntimeValue = {
  isSearchSurfaceRedrawChromeFreezeActive: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive: boolean;
  isSearchSurfaceRedrawActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

export const createSearchFreezeGateRuntimeValue = ({
  isSearchSurfaceRedrawChromeFreezeActive,
  isSearchSurfaceRedrawPreflightFreezeActive,
  isSearchSurfaceRedrawActive,
  isResponseFrameFreezeActive,
  freezeClassification,
}: SearchFreezeGateRuntimeValue): SearchFreezeGateRuntimeValue => ({
  isSearchSurfaceRedrawChromeFreezeActive,
  isSearchSurfaceRedrawPreflightFreezeActive,
  isSearchSurfaceRedrawActive,
  isResponseFrameFreezeActive,
  freezeClassification,
});
