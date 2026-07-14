import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchChromeVisibilityTarget,
  RouteSceneSwitchSheetVisibilityTarget,
} from './app-overlay-route-transition-contract';
import { PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET } from './app-overlay-route-transition-contract';

type AppRouteSceneChromePolicy = { kind: 'search-chrome-from-snap' } | { kind: 'preserve' };

export type AppRouteSheetScenePolicy = {
  sheetTargetGroup: OverlayKey | null;
  defaultFirstEntrySnap: BottomSheetSnap | null;
  allowedSnaps: readonly BottomSheetSnap[];
  requiresExpandedPresentation: boolean;
  canSwipeDismiss: boolean;
  /**
   * Per-scene `overlay:` snap persistence only. Root-page posture memory is NOT persistence —
   * it lives in the two posture seats (`postureSeat` below); the old 'shared' lane was deleted
   * with the dual shared-snap store collapse (plans/root-snap-law.md §Leg 4).
   */
  snapPersistence: 'none' | 'scene';
  /**
   * TWO-POSTURE LAW membership (plans/root-snap-law.md §Leg 2/§Leg 3): which posture seat this
   * scene presents at when it is a NAV-PAGE (topLevelSwitch) target. 'home' = the search root's
   * docked-polls posture; 'content' = the ONE shared posture of every other root page; null =
   * not a root page (children/modals never resolve through a posture seat). This field is the
   * SINGLE source of truth the seat resolver AND the descriptor table's topLevelSwitch rows
   * derive from — a new root page declares its seat HERE (the exhaustive Record makes skipping
   * the decision a compile error) and inherits the law by construction.
   */
  postureSeat: 'home' | 'content' | null;
};

type AppRouteScenePolicy = AppRouteSheetScenePolicy & {
  chromePolicy: AppRouteSceneChromePolicy;
};

const SHEET_HOST_TARGET_GROUP: OverlayKey = 'sheetHost';

const APP_ROUTE_SCENE_POLICY_BY_KEY: Record<OverlayKey, AppRouteScenePolicy> = {
  search: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: 'home',
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  polls: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    // Non-dismissable by swipe (like every other route sheet): a downward drag rubber-bands at
    // the docked bar (collapsed) instead of swiping the lane to hidden. The docked bar is a
    // permanent fixture; the programmatic dismiss path (`requestReturnToSearchFromPolls` →
    // `dismissDockedPolls`) still works since explicit snap targets aren't bounded by the
    // gesture upperBound.
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: 'home',
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  bookmarks: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: 'content',
    chromePolicy: { kind: 'preserve' },
  },
  profile: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: 'content',
    chromePolicy: { kind: 'preserve' },
  },
  saveList: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  pollCreation: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  pollDetail: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  restaurant: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'middle',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  sheetHost: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  price: {
    sheetTargetGroup: null,
    defaultFirstEntrySnap: null,
    allowedSnaps: [],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  // ── Stub-pass child scenes (plans/page-registry.md §1) — clone the saveList policy.
  userProfile: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  listDetail: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  followList: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  notifications: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  settings: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  editProfile: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  // W2 (page-registry §7.4): the post page — full-page child, same policy family.
  postPhotos: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  // W3 messaging (§4.1/§7.9): both full-page children — tapping Message/inbox
  // fully extends the sheet (requiresExpandedPresentation), back restores the
  // prior snap via the standard child-dismiss glide.
  messagesInbox: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  dmSession: {
    sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  scoreInfo: {
    sheetTargetGroup: null,
    defaultFirstEntrySnap: null,
    allowedSnaps: [],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    snapPersistence: 'none',
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
};

/**
 * The runtime enumeration of every OverlayKey — derived from the exhaustive policy Record, so
 * it grows with the type by construction (no parallel hand list). Consumers: descriptor-table
 * row derivation, exhaustiveness sweeps.
 */
export const APP_ROUTE_SCENE_KEYS = Object.keys(APP_ROUTE_SCENE_POLICY_BY_KEY) as OverlayKey[];

export const resolveAppRouteSheetScenePolicy = (sceneKey: OverlayKey): AppRouteSheetScenePolicy => {
  const {
    sheetTargetGroup,
    defaultFirstEntrySnap,
    allowedSnaps,
    requiresExpandedPresentation,
    canSwipeDismiss,
    snapPersistence,
    postureSeat,
  } = APP_ROUTE_SCENE_POLICY_BY_KEY[sceneKey];
  return {
    sheetTargetGroup,
    defaultFirstEntrySnap,
    allowedSnaps,
    requiresExpandedPresentation,
    canSwipeDismiss,
    snapPersistence,
    postureSeat,
  };
};

export const appRouteSceneUsesSharedSheetTarget = ({
  sceneKey,
  sheetTargetGroup,
}: {
  sceneKey: OverlayKey;
  sheetTargetGroup: OverlayKey;
}): boolean => APP_ROUTE_SCENE_POLICY_BY_KEY[sceneKey]?.sheetTargetGroup === sheetTargetGroup;

export const resolveAppRouteSceneSheetHostSceneKey = (sceneKey: OverlayKey): OverlayKey | null =>
  APP_ROUTE_SCENE_POLICY_BY_KEY[sceneKey]?.sheetTargetGroup ?? null;

export const resolveAppRouteSceneChromeVisibilityTarget = ({
  targetSceneKey,
  snapTarget,
}: {
  targetSceneKey: OverlayKey;
  snapTarget: BottomSheetSnap | null;
}): RouteSceneSwitchChromeVisibilityTarget => {
  const policy = APP_ROUTE_SCENE_POLICY_BY_KEY[targetSceneKey].chromePolicy;
  if (policy.kind !== 'search-chrome-from-snap' || snapTarget == null) {
    return PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET;
  }

  return {
    searchChrome: snapTarget === 'hidden' ? 'hidden' : 'visible',
  };
};

export const resolveAppRouteSceneSheetVisibilityTarget = ({
  snapTarget,
}: {
  snapTarget: BottomSheetSnap | null;
}): RouteSceneSwitchSheetVisibilityTarget => {
  if (snapTarget == null) {
    return 'preserve';
  }
  return snapTarget === 'hidden' ? 'hidden' : 'visible';
};

// Leg 6 (§4): resolveAppRouteSceneHeaderActionModeTarget is DELETED — the header action is
// host-owned and PF-derived (resolveHeaderNavAction); headerActionPolicy died with it.
