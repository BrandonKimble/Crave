import type React from 'react';

import type { OverlaySheetSnap } from '../../overlays/types';

export const appRouteSharedSheetLastVisibleStateRef: React.MutableRefObject<
  Exclude<OverlaySheetSnap, 'hidden'>
> = {
  current: 'middle',
};
