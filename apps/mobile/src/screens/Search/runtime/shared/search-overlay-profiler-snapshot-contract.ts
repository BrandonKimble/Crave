import type { ProfilerOnRenderCallback } from 'react';

export type SearchOverlayProfilerSnapshot = {
  onProfilerRender: ProfilerOnRenderCallback | null;
};
