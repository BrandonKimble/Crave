import type React from 'react';

import type { OverlaySheetSnap } from '../../overlays/types';

export const appRouteResultsSheetLastVisibleStateRef: React.MutableRefObject<
  Exclude<OverlaySheetSnap, 'hidden'>
> = {
  current: 'middle',
};
