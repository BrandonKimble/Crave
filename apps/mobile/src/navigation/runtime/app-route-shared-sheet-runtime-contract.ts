import type React from 'react';

import type { SharedValue } from 'react-native-reanimated';

import { calculateSnapPoints, type SheetPosition } from '../../overlays/sheetUtils';
import type { BottomSheetRuntimeModel } from '../../overlays/useBottomSheetRuntime';

export type AppRouteSharedSheetRuntimeOwner = {
  // F1376: an IDENTITY-STABLE mutable box, not a value — `syncSnapPoints` (in
  // use-app-route-shared-sheet-values-runtime.ts) mutates its four fields IN PLACE on a
  // geometry change; the object reference never changes for the runtime's lifetime.
  // Read its fields at ANIMATION time (worklet), never compare or memo-key on the
  // object itself — a `left.snapPoints === right.snapPoints` identity check (e.g.
  // route-shared-sheet-visual-state-controller.ts's binding equality) is PROVABLY
  // invariant and cannot observe a geometry change.
  snapPoints: ReturnType<typeof calculateSnapPoints>;
  panelVisible: boolean;
  sheetState: SheetPosition;
  // Residue-kill item 12: the published sheet position/scroll pair is GONE from
  // this owner — position is the track's own SV (track-sheet-position-authority)
  // and scroll is a point-in-time getter there.
  sheetMomentum: SharedValue<boolean>;
  sharedSheetRuntimeModel: BottomSheetRuntimeModel;
  shouldRenderMountedSharedSheet: boolean;
  shouldRenderMountedSharedSheetRef: React.MutableRefObject<boolean>;
  markSharedSheetHidden: () => void;
  prepareSharedSheetForSearchPresentation: () => boolean;
};

export type AppRouteSharedSheetVisualBinding = Pick<
  AppRouteSharedSheetRuntimeOwner,
  'snapPoints' | 'sheetMomentum'
> & {
  getCurrentSheetSnap: () => SheetPosition;
};
