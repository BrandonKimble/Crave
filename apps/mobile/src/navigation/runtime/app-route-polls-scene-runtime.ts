import type { PollsPanelFeedRuntime } from '../../overlays/panels/runtime/polls-panel-feed-runtime';
import type { UsePollsPanelSpecOptions } from '../../overlays/panels/runtime/polls-panel-runtime-contract';
import { markSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';

type Listener = () => void;

export type AppRoutePollsSceneState = UsePollsPanelSpecOptions;

export type AppRoutePollsSceneBodySnapshot = Pick<
  AppRoutePollsSceneState,
  | 'bounds'
  | 'bootstrapSnapshot'
  | 'userLocation'
  | 'params'
  | 'initialSnapPoint'
  | 'mode'
  | 'currentSnap'
  | 'navBarTop'
  | 'navBarHeight'
  | 'searchBarTop'
  | 'snapPoints'
  | 'interactionRef'
>;

export type AppRoutePollsSceneHeaderModel = {
  title: string;
  badgeCount: string;
  badgeLabel: string;
  isBadgeMuted: boolean;
  headerAction: PollsPanelFeedRuntime['headerAction'];
  marketKey: string | null;
  marketName: string | null;
  candidatePlaceName: string | null;
  marketOverride: string | null;
} | null;

export type AppRoutePollsSceneRuntime = {
  sceneAuthority: {
    getSnapshot: () => AppRoutePollsSceneState;
  };
  sceneBodyAuthority: {
    subscribe: (listener: Listener) => () => void;
    getSnapshot: () => AppRoutePollsSceneBodySnapshot;
  };
  headerModelAuthority: {
    subscribe: (listener: Listener) => () => void;
    getSnapshot: () => AppRoutePollsSceneHeaderModel;
  };
  sceneActions: {
    publishSceneState: (snapshot: AppRoutePollsSceneState) => void;
    clearSceneState: () => void;
    publishHeaderModel: (snapshot: AppRoutePollsSceneHeaderModel) => void;
    clearHeaderModel: () => void;
  };
  dispose: () => void;
};

export const EMPTY_APP_ROUTE_POLLS_SCENE_STATE: AppRoutePollsSceneState = {
  visible: false,
  mode: 'docked',
};

const EMPTY_APP_ROUTE_POLLS_SCENE_BODY_SNAPSHOT: AppRoutePollsSceneBodySnapshot = {
  mode: 'docked',
};

export const arePollsSceneStatesEqual = (
  left: AppRoutePollsSceneState,
  right: AppRoutePollsSceneState
): boolean =>
  left.visible === right.visible &&
  left.bounds === right.bounds &&
  left.bootstrapSnapshot === right.bootstrapSnapshot &&
  left.userLocation === right.userLocation &&
  left.params === right.params &&
  left.initialSnapPoint === right.initialSnapPoint &&
  left.mode === right.mode &&
  left.currentSnap === right.currentSnap &&
  left.navBarTop === right.navBarTop &&
  left.navBarHeight === right.navBarHeight &&
  left.searchBarTop === right.searchBarTop &&
  left.snapPoints === right.snapPoints &&
  left.onSnapStart === right.onSnapStart &&
  left.onSnapChange === right.onSnapChange &&
  left.externalSheetMotionRequest === right.externalSheetMotionRequest &&
  left.onRequestPollCreationExpand === right.onRequestPollCreationExpand &&
  left.onRequestReturnToSearch === right.onRequestReturnToSearch &&
  left.interactionRef === right.interactionRef;

export const arePollsSceneHeaderModelsEqual = (
  left: AppRoutePollsSceneHeaderModel,
  right: AppRoutePollsSceneHeaderModel
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.title === right.title &&
    left.badgeCount === right.badgeCount &&
    left.badgeLabel === right.badgeLabel &&
    left.isBadgeMuted === right.isBadgeMuted &&
    left.headerAction === right.headerAction &&
    left.marketKey === right.marketKey &&
    left.marketName === right.marketName &&
    left.candidatePlaceName === right.candidatePlaceName &&
    left.marketOverride === right.marketOverride
  );
};

const arePollsSceneHeaderContentModelsEqual = (
  left: AppRoutePollsSceneHeaderModel,
  right: AppRoutePollsSceneHeaderModel
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.title === right.title &&
    left.badgeCount === right.badgeCount &&
    left.badgeLabel === right.badgeLabel &&
    left.isBadgeMuted === right.isBadgeMuted &&
    left.marketKey === right.marketKey &&
    left.marketName === right.marketName &&
    left.candidatePlaceName === right.candidatePlaceName &&
    left.marketOverride === right.marketOverride
  );
};

const markPollsSceneStateFieldDiff = (field: string, left: unknown, right: unknown): void => {
  if (!Object.is(left, right)) {
    markSearchNavSwitchRuntimeAttribution('PollsSceneStateDiff', `field:${field}`);
  }
};

const resolvePollsSceneBodySnapshot = (
  snapshot: AppRoutePollsSceneState
): AppRoutePollsSceneBodySnapshot => ({
  bounds: snapshot.bounds,
  bootstrapSnapshot: snapshot.bootstrapSnapshot,
  userLocation: snapshot.userLocation,
  params: snapshot.params,
  initialSnapPoint: snapshot.initialSnapPoint,
  mode: snapshot.mode,
  currentSnap: snapshot.currentSnap,
  navBarTop: snapshot.navBarTop,
  navBarHeight: snapshot.navBarHeight,
  searchBarTop: snapshot.searchBarTop,
  snapPoints: snapshot.snapPoints,
  interactionRef: snapshot.interactionRef,
});

const arePollsSceneBodyRenderSnapshotsEqual = (
  left: AppRoutePollsSceneBodySnapshot,
  right: AppRoutePollsSceneBodySnapshot
): boolean =>
  left.bootstrapSnapshot === right.bootstrapSnapshot &&
  left.userLocation === right.userLocation &&
  left.params === right.params &&
  left.interactionRef === right.interactionRef;

class AppRoutePollsSceneController implements AppRoutePollsSceneRuntime {
  private sceneSnapshot = EMPTY_APP_ROUTE_POLLS_SCENE_STATE;

  private sceneBodySnapshot = EMPTY_APP_ROUTE_POLLS_SCENE_BODY_SNAPSHOT;

  private headerModelSnapshot: AppRoutePollsSceneHeaderModel = null;

  private readonly sceneBodyListeners = new Set<Listener>();

  private readonly headerModelListeners = new Set<Listener>();

  public readonly sceneAuthority: AppRoutePollsSceneRuntime['sceneAuthority'] = {
    getSnapshot: () => this.sceneSnapshot,
  };

  public readonly sceneBodyAuthority: AppRoutePollsSceneRuntime['sceneBodyAuthority'] = {
    subscribe: (listener) => this.subscribeSceneBody(listener),
    getSnapshot: () => this.sceneBodySnapshot,
  };

  public readonly headerModelAuthority: AppRoutePollsSceneRuntime['headerModelAuthority'] = {
    subscribe: (listener) => this.subscribeHeaderModel(listener),
    getSnapshot: () => this.headerModelSnapshot,
  };

  public readonly sceneActions: AppRoutePollsSceneRuntime['sceneActions'] = {
    publishSceneState: (snapshot) => this.publishSceneState(snapshot),
    clearSceneState: () => this.publishSceneState(EMPTY_APP_ROUTE_POLLS_SCENE_STATE),
    publishHeaderModel: (snapshot) => this.publishHeaderModel(snapshot),
    clearHeaderModel: () => this.publishHeaderModel(null),
  };

  public dispose(): void {
    this.sceneBodyListeners.clear();
    this.headerModelListeners.clear();
    this.sceneSnapshot = EMPTY_APP_ROUTE_POLLS_SCENE_STATE;
    this.sceneBodySnapshot = EMPTY_APP_ROUTE_POLLS_SCENE_BODY_SNAPSHOT;
    this.headerModelSnapshot = null;
  }

  private subscribeSceneBody(listener: Listener): () => void {
    this.sceneBodyListeners.add(listener);
    return () => {
      this.sceneBodyListeners.delete(listener);
    };
  }

  private subscribeHeaderModel(listener: Listener): () => void {
    this.headerModelListeners.add(listener);
    return () => {
      this.headerModelListeners.delete(listener);
    };
  }

  private publishSceneState(snapshot: AppRoutePollsSceneState): void {
    if (arePollsSceneStatesEqual(this.sceneSnapshot, snapshot)) {
      return;
    }
    markPollsSceneStateFieldDiff('visible', this.sceneSnapshot.visible, snapshot.visible);
    markPollsSceneStateFieldDiff('bounds', this.sceneSnapshot.bounds, snapshot.bounds);
    markPollsSceneStateFieldDiff(
      'bootstrapSnapshot',
      this.sceneSnapshot.bootstrapSnapshot,
      snapshot.bootstrapSnapshot
    );
    markPollsSceneStateFieldDiff(
      'userLocation',
      this.sceneSnapshot.userLocation,
      snapshot.userLocation
    );
    markPollsSceneStateFieldDiff('params', this.sceneSnapshot.params, snapshot.params);
    markPollsSceneStateFieldDiff(
      'initialSnapPoint',
      this.sceneSnapshot.initialSnapPoint,
      snapshot.initialSnapPoint
    );
    markPollsSceneStateFieldDiff('mode', this.sceneSnapshot.mode, snapshot.mode);
    markPollsSceneStateFieldDiff(
      'currentSnap',
      this.sceneSnapshot.currentSnap,
      snapshot.currentSnap
    );
    markPollsSceneStateFieldDiff('navBarTop', this.sceneSnapshot.navBarTop, snapshot.navBarTop);
    markPollsSceneStateFieldDiff(
      'navBarHeight',
      this.sceneSnapshot.navBarHeight,
      snapshot.navBarHeight
    );
    markPollsSceneStateFieldDiff(
      'searchBarTop',
      this.sceneSnapshot.searchBarTop,
      snapshot.searchBarTop
    );
    markPollsSceneStateFieldDiff('snapPoints', this.sceneSnapshot.snapPoints, snapshot.snapPoints);
    markPollsSceneStateFieldDiff(
      'externalSheetMotionRequest',
      this.sceneSnapshot.externalSheetMotionRequest,
      snapshot.externalSheetMotionRequest
    );
    markPollsSceneStateFieldDiff(
      'interactionRef',
      this.sceneSnapshot.interactionRef,
      snapshot.interactionRef
    );
    const previousSceneBodySnapshot = this.sceneBodySnapshot;
    const nextSceneBodySnapshot = resolvePollsSceneBodySnapshot(snapshot);
    const shouldNotifySceneBodyListeners = !arePollsSceneBodyRenderSnapshotsEqual(
      previousSceneBodySnapshot,
      nextSceneBodySnapshot
    );
    this.sceneSnapshot = snapshot;
    this.sceneBodySnapshot = nextSceneBodySnapshot;
    if (shouldNotifySceneBodyListeners) {
      markSearchNavSwitchRuntimeAttribution('PollsSceneBodyAuthority', 'notify');
      this.sceneBodyListeners.forEach((listener) => {
        listener();
      });
    }
  }

  private publishHeaderModel(snapshot: AppRoutePollsSceneHeaderModel): void {
    if (arePollsSceneHeaderModelsEqual(this.headerModelSnapshot, snapshot)) {
      return;
    }
    const shouldNotifyHeaderModelListeners = !arePollsSceneHeaderContentModelsEqual(
      this.headerModelSnapshot,
      snapshot
    );
    this.headerModelSnapshot = snapshot;
    if (!shouldNotifyHeaderModelListeners) {
      return;
    }
    this.headerModelListeners.forEach((listener) => {
      listener();
    });
  }
}

export const createAppRoutePollsSceneRuntime = (): AppRoutePollsSceneRuntime =>
  new AppRoutePollsSceneController();
