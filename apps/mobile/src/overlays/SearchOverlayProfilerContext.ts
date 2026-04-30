import React from 'react';

const SearchOverlayProfilerContext =
  React.createContext<React.ProfilerOnRenderCallback | null>(null);

export const SearchOverlayProfilerProvider = SearchOverlayProfilerContext.Provider;

export const useSearchOverlayProfilerRender = (): React.ProfilerOnRenderCallback | null =>
  React.useContext(SearchOverlayProfilerContext);
