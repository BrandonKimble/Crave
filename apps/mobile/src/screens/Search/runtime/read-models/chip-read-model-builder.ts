import React from 'react';

export type SearchFilterChipReadModel = {
  activeTab: 'dishes' | 'restaurants';
  priceButtonLabel: string;
  priceButtonActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
  projectionKey: string;
};

type UseSearchFilterChipReadModelArgs = {
  requestVersionKey: string;
  activeTab: 'dishes' | 'restaurants';
  priceButtonLabel: string;
  priceButtonActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
};

export const useSearchFilterChipReadModel = (
  args: UseSearchFilterChipReadModelArgs
): SearchFilterChipReadModel => {
  const cacheRef = React.useRef<{ key: string; value: SearchFilterChipReadModel } | null>(null);
  const projectionKey = `${args.requestVersionKey}::${args.activeTab}::${args.priceButtonLabel}::${
    args.priceButtonActive ? 1 : 0
  }::${args.openNow ? 1 : 0}::${args.votesFilterActive ? 1 : 0}::${
    args.isPriceSelectorVisible ? 1 : 0
  }`;

  React.useEffect(() => {
    cacheRef.current = null;
  }, [args.requestVersionKey]);

  if (cacheRef.current?.key === projectionKey) {
    return cacheRef.current.value;
  }

  const nextValue: SearchFilterChipReadModel = {
    activeTab: args.activeTab,
    priceButtonLabel: args.priceButtonLabel,
    priceButtonActive: args.priceButtonActive,
    openNow: args.openNow,
    votesFilterActive: args.votesFilterActive,
    isPriceSelectorVisible: args.isPriceSelectorVisible,
    projectionKey,
  };
  cacheRef.current = {
    key: projectionKey,
    value: nextValue,
  };
  return nextValue;
};
