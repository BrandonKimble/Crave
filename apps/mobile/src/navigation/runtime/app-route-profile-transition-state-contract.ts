import type { FoodResult, RestaurantResult, RestaurantResultScorePreview } from '../../types';

// F9430 (owed as F1058/RT-2): this used to declare 'idle'|'opening'|'open'|'closing',
// but since the L3 transition-machine deletion the ONLY writers are
// setProfileTransitionStatus('open') (profile-direct-presentation-runtime) and the
// reset/initial 'idle'. 'opening'/'closing' had no writer — a boolean wearing a
// 4-state costume, where a future stray write of a phantom state would slip past the
// single-edge gates (=== 'idle', === 'open') with no total handling. Narrowed to the
// two reachable states so the phantom states are UNREPRESENTABLE, not merely unwritten.
export type ProfileTransitionStatus = 'idle' | 'open';

type MapCameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

export type RestaurantFocusSession = {
  restaurantId: string | null;
  locationKey: string | null;
  hasAppliedInitialMultiLocationZoomOut: boolean;
};

export type HydratedRestaurantProfile = {
  restaurant: RestaurantResult;
  dishes: FoodResult[];
};

export type RestaurantProfileSeed = RestaurantResult | RestaurantResultScorePreview;

export type RestaurantProfileShellData = {
  restaurant: RestaurantProfileSeed;
  dishes: FoodResult[];
  queryLabel: string;
  isFavorite: boolean;
  isLoading?: boolean;
};

export type RestaurantPanelSnapshot = RestaurantProfileShellData;

export type CameraSnapshot = {
  center: [number, number];
  zoom: number;
  padding: MapCameraPadding | null;
};

// D56: `savedCamera` is DELETED from both this capture and the transition record. It was the
// THIRD camera-origin ledger (F1506) — a single mutable first-write-wins slot that kept the
// FIRST profile's camera across a profile→profile switch, raced the session-origin ledger on a
// terminal X (mitigated only by a queueMicrotask ordering contract), and sourced its value from
// the known-stale idle-only `lastCameraStateRef` (F1507, the cd59e8a2 bug class the search lane
// had already left). The restaurant entry's OriginSnapshot.camera replaces it wholesale: same
// padded CameraSnapshot shape, captured at the SAME push commit that mints the entry, restored
// by the SAME pop that restores the sheet. `savedResultsScrollOffset` is untouched — a different
// axis with a different owner.
export type ProfileTransitionSnapshotCapture = {
  savedResultsScrollOffset: number | null;
};

// L3 slice 4: the machine's preparedSnapshot/completionState (settle ledger) fields are
// DELETED — the transition state is now the small honest record the pop-teardown owner
// reads: an interim status flag + the saved presentation the restore consumes.
export type ProfileTransitionState = {
  status: ProfileTransitionStatus;
  savedResultsScrollOffset: number | null;
};
