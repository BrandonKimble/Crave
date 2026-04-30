import type React from 'react';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetProfilerGateSnapshot = {
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};

export type SearchOverlayLocalRestaurantSheetProfilerGateAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetProfilerGateSnapshot;
};
