import type { OverlayKey } from '../../overlays/types';
import {
  APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS,
  APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS,
} from './app-overlay-route-types';
import type {
  AppRouteSceneBodyAdmissionPolicy,
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from './app-route-scene-descriptor-contract';
import {
  areAppRouteSceneBodyAdmissionPoliciesEqual,
  areAppRouteSceneBodyContentSpecsEqual,
  areAppRouteSceneBodyTransportSpecsEqual,
  areAppRouteSceneChromePublicationsEqual,
  areAppRouteSceneShellSpecsEqual,
} from './app-route-scene-descriptor-contract';

export const APP_ROUTE_STATIC_SCENE_INPUT_KEYS = APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS;

export const APP_ROUTE_SCENE_INPUT_KEYS = APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS;

export type AppRouteStaticSceneInputKey = (typeof APP_ROUTE_STATIC_SCENE_INPUT_KEYS)[number];

export type AppRouteSceneInputKey = (typeof APP_ROUTE_SCENE_INPUT_KEYS)[number];

/**
 * Scenes whose body runs a live data lane the scene-stack tracks for activity
 * (mount / subscribe / surface-diff). SINGLE source of truth — three call sites
 * gate on this, and three hand-kept copies could silently drift apart. NOT
 * derived from metadata: `search` also has live data but is intentionally
 * excluded because it renders through the bespoke search-surface body path, not
 * the normal scene-body data lane.
 */
const SCENE_BODY_DATA_ACTIVITY_KEYS = new Set<AppRouteSceneInputKey>([
  'polls',
  'pollCreation',
  'pollDetail',
  'saveList',
]);

export const isSceneBodyDataActivityKey = (
  sceneKey: OverlayKey | string | null | undefined
): boolean =>
  sceneKey != null && SCENE_BODY_DATA_ACTIVITY_KEYS.has(sceneKey as AppRouteSceneInputKey);

export type AppRouteSceneInputSnapshot = {
  sceneKey: OverlayKey;
  shellSpec: AppRouteSceneStackShellSpec | null;
  sceneChrome: AppRouteSceneChromePublication | null;
  sceneBodyContent: AppRouteSceneBodyContentSpec | null;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec | null;
  sceneBodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null;
};

type Listener = () => void;

type SceneLaneListenerSet = {
  shell: Set<Listener>;
  chrome: Set<Listener>;
  body: Set<Listener>;
};

export type AppRouteSceneInputAuthority = {
  subscribeSceneShell: (sceneKey: AppRouteSceneInputKey, listener: Listener) => () => void;
  subscribeSceneChrome: (sceneKey: AppRouteSceneInputKey, listener: Listener) => () => void;
  subscribeSceneBody: (sceneKey: AppRouteSceneInputKey, listener: Listener) => () => void;
  getSnapshot: () => Readonly<
    Partial<Record<AppRouteSceneInputKey, AppRouteSceneInputSnapshot | null>>
  >;
  getSceneInputSnapshot: (
    sceneKey: OverlayKey | null | undefined
  ) => AppRouteSceneInputSnapshot | null;
};

export type AppRouteSceneInputActions = {
  publishSceneDescriptor: (args: {
    sceneKey: AppRouteSceneInputKey;
    shellSpec: AppRouteSceneStackShellSpec | null;
    sceneChrome: AppRouteSceneChromePublication | null;
    sceneBodyContent: AppRouteSceneBodyContentSpec | null;
    sceneBodyTransport: AppRouteSceneBodyTransportSpec | null;
    sceneBodyAdmissionPolicy?: AppRouteSceneBodyAdmissionPolicy | null;
  }) => void;
  publishSceneShell: (args: {
    sceneKey: AppRouteSceneInputKey;
    shellSpec: AppRouteSceneStackShellSpec | null;
  }) => void;
  publishSceneChrome: (args: {
    sceneKey: AppRouteSceneInputKey;
    sceneChrome: AppRouteSceneChromePublication | null;
  }) => void;
  publishSceneBody: (args: {
    sceneKey: AppRouteSceneInputKey;
    sceneBodyContent: AppRouteSceneBodyContentSpec | null;
    sceneBodyTransport: AppRouteSceneBodyTransportSpec | null;
    sceneBodyAdmissionPolicy?: AppRouteSceneBodyAdmissionPolicy | null;
  }) => void;
  clearSceneShell: (sceneKey: AppRouteSceneInputKey) => void;
  clearSceneChrome: (sceneKey: AppRouteSceneInputKey) => void;
  clearSceneBody: (sceneKey: AppRouteSceneInputKey) => void;
  clearSceneInput: (sceneKey: AppRouteSceneInputKey) => void;
  clearAllSceneInputs: () => void;
};

export const isAppRouteSceneInputKey = (
  sceneKey: OverlayKey | null | undefined
): sceneKey is AppRouteSceneInputKey =>
  sceneKey != null && (APP_ROUTE_SCENE_INPUT_KEYS as readonly string[]).includes(sceneKey);

const createEmptySceneInputSnapshot = ({
  sceneKey,
}: {
  sceneKey: OverlayKey;
}): AppRouteSceneInputSnapshot => ({
  sceneKey,
  shellSpec: null,
  sceneChrome: null,
  sceneBodyContent: null,
  sceneBodyTransport: null,
  sceneBodyAdmissionPolicy: null,
});

export class AppRouteSceneInputController {
  private readonly sceneListenersByKey = new Map<AppRouteSceneInputKey, SceneLaneListenerSet>();

  private currentSnapshot: Readonly<
    Partial<Record<AppRouteSceneInputKey, AppRouteSceneInputSnapshot | null>>
  > = {};

  public readonly authority: AppRouteSceneInputAuthority = {
    subscribeSceneShell: (sceneKey, listener) =>
      this.subscribeSceneLane(sceneKey, 'shell', listener),
    subscribeSceneChrome: (sceneKey, listener) =>
      this.subscribeSceneLane(sceneKey, 'chrome', listener),
    subscribeSceneBody: (sceneKey, listener) => this.subscribeSceneLane(sceneKey, 'body', listener),
    getSnapshot: () => this.currentSnapshot,
    getSceneInputSnapshot: (sceneKey) =>
      isAppRouteSceneInputKey(sceneKey) ? (this.currentSnapshot[sceneKey] ?? null) : null,
  };

  public readonly actions: AppRouteSceneInputActions = {
    publishSceneDescriptor: this.publishSceneDescriptor.bind(this),
    publishSceneShell: this.publishSceneShell.bind(this),
    publishSceneChrome: this.publishSceneChrome.bind(this),
    publishSceneBody: this.publishSceneBody.bind(this),
    clearSceneShell: this.clearSceneShell.bind(this),
    clearSceneChrome: this.clearSceneChrome.bind(this),
    clearSceneBody: this.clearSceneBody.bind(this),
    clearSceneInput: this.clearSceneInput.bind(this),
    clearAllSceneInputs: this.clearAllSceneInputs.bind(this),
  };

  public dispose(): void {
    this.sceneListenersByKey.clear();
    this.currentSnapshot = {};
  }

  private getSceneListeners(sceneKey: AppRouteSceneInputKey): SceneLaneListenerSet {
    const existingListeners = this.sceneListenersByKey.get(sceneKey);
    if (existingListeners != null) {
      return existingListeners;
    }

    const listeners = {
      shell: new Set<Listener>(),
      chrome: new Set<Listener>(),
      body: new Set<Listener>(),
    };
    this.sceneListenersByKey.set(sceneKey, listeners);
    return listeners;
  }

  private pruneSceneListeners(sceneKey: AppRouteSceneInputKey): void {
    const listeners = this.sceneListenersByKey.get(sceneKey);
    if (
      listeners != null &&
      listeners.shell.size === 0 &&
      listeners.chrome.size === 0 &&
      listeners.body.size === 0
    ) {
      this.sceneListenersByKey.delete(sceneKey);
    }
  }

  private subscribeSceneLane(
    sceneKey: AppRouteSceneInputKey,
    lane: keyof SceneLaneListenerSet,
    listener: Listener
  ): () => void {
    const listeners = this.getSceneListeners(sceneKey)[lane];
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      this.pruneSceneListeners(sceneKey);
    };
  }

  private notifySceneLane(sceneKey: AppRouteSceneInputKey, lane: keyof SceneLaneListenerSet): void {
    this.sceneListenersByKey.get(sceneKey)?.[lane].forEach((listener) => {
      listener();
    });
  }

  private getWritableSceneInputSnapshot(
    sceneKey: AppRouteSceneInputKey
  ): AppRouteSceneInputSnapshot {
    return this.currentSnapshot[sceneKey] ?? createEmptySceneInputSnapshot({ sceneKey });
  }

  private setSceneInputSnapshot({
    sceneKey,
    snapshot,
  }: {
    sceneKey: AppRouteSceneInputKey;
    snapshot: AppRouteSceneInputSnapshot;
  }): void {
    this.currentSnapshot = {
      ...this.currentSnapshot,
      [sceneKey]: snapshot,
    };
  }

  private setSceneInputSnapshotOrClear({
    sceneKey,
    snapshot,
  }: {
    sceneKey: AppRouteSceneInputKey;
    snapshot: AppRouteSceneInputSnapshot;
  }): void {
    const shouldClearSceneInput =
      snapshot.shellSpec == null &&
      snapshot.sceneChrome == null &&
      snapshot.sceneBodyContent == null &&
      snapshot.sceneBodyTransport == null &&
      snapshot.sceneBodyAdmissionPolicy == null;

    this.currentSnapshot = {
      ...this.currentSnapshot,
      [sceneKey]: shouldClearSceneInput ? null : snapshot,
    };
  }

  private publishSceneDescriptor({
    sceneKey,
    shellSpec,
    sceneChrome,
    sceneBodyContent,
    sceneBodyTransport,
    sceneBodyAdmissionPolicy = null,
  }: {
    sceneKey: AppRouteSceneInputKey;
    shellSpec: AppRouteSceneStackShellSpec | null;
    sceneChrome: AppRouteSceneChromePublication | null;
    sceneBodyContent: AppRouteSceneBodyContentSpec | null;
    sceneBodyTransport: AppRouteSceneBodyTransportSpec | null;
    sceneBodyAdmissionPolicy?: AppRouteSceneBodyAdmissionPolicy | null;
  }): void {
    const previousSceneInput = this.getWritableSceneInputSnapshot(sceneKey);
    const didShellChange = !areAppRouteSceneShellSpecsEqual(
      previousSceneInput.shellSpec,
      shellSpec
    );
    const didChromeChange = !areAppRouteSceneChromePublicationsEqual(
      previousSceneInput.sceneChrome,
      sceneChrome
    );
    const didBodyContentChange = !areAppRouteSceneBodyContentSpecsEqual(
      previousSceneInput.sceneBodyContent,
      sceneBodyContent
    );
    const didBodyTransportChange = !areAppRouteSceneBodyTransportSpecsEqual(
      previousSceneInput.sceneBodyTransport,
      sceneBodyTransport
    );
    const didBodyAdmissionPolicyChange = !areAppRouteSceneBodyAdmissionPoliciesEqual(
      previousSceneInput.sceneBodyAdmissionPolicy,
      sceneBodyAdmissionPolicy
    );

    if (
      !didShellChange &&
      !didChromeChange &&
      !didBodyContentChange &&
      !didBodyTransportChange &&
      !didBodyAdmissionPolicyChange
    ) {
      return;
    }

    this.setSceneInputSnapshot({
      sceneKey,
      snapshot: {
        ...previousSceneInput,
        shellSpec,
        sceneChrome,
        sceneBodyContent,
        sceneBodyTransport,
        sceneBodyAdmissionPolicy,
      },
    });

    if (didShellChange) {
      this.notifySceneLane(sceneKey, 'shell');
    }
    if (didChromeChange) {
      this.notifySceneLane(sceneKey, 'chrome');
    }
    if (didBodyContentChange || didBodyTransportChange || didBodyAdmissionPolicyChange) {
      this.notifySceneLane(sceneKey, 'body');
    }
  }

  private publishSceneShell({
    sceneKey,
    shellSpec,
  }: {
    sceneKey: AppRouteSceneInputKey;
    shellSpec: AppRouteSceneStackShellSpec | null;
  }): void {
    const previousSceneInput = this.getWritableSceneInputSnapshot(sceneKey);
    if (areAppRouteSceneShellSpecsEqual(previousSceneInput.shellSpec, shellSpec)) {
      return;
    }

    this.setSceneInputSnapshot({
      sceneKey,
      snapshot: {
        ...previousSceneInput,
        shellSpec,
      },
    });
    this.notifySceneLane(sceneKey, 'shell');
  }

  private publishSceneChrome({
    sceneKey,
    sceneChrome,
  }: {
    sceneKey: AppRouteSceneInputKey;
    sceneChrome: AppRouteSceneChromePublication | null;
  }): void {
    const previousSceneInput = this.getWritableSceneInputSnapshot(sceneKey);
    if (areAppRouteSceneChromePublicationsEqual(previousSceneInput.sceneChrome, sceneChrome)) {
      return;
    }

    this.setSceneInputSnapshot({
      sceneKey,
      snapshot: {
        ...previousSceneInput,
        sceneChrome,
      },
    });
    this.notifySceneLane(sceneKey, 'chrome');
  }

  private publishSceneBody({
    sceneKey,
    sceneBodyContent,
    sceneBodyTransport,
    sceneBodyAdmissionPolicy,
  }: {
    sceneKey: AppRouteSceneInputKey;
    sceneBodyContent: AppRouteSceneBodyContentSpec | null;
    sceneBodyTransport: AppRouteSceneBodyTransportSpec | null;
    sceneBodyAdmissionPolicy?: AppRouteSceneBodyAdmissionPolicy | null;
  }): void {
    const previousSceneInput = this.getWritableSceneInputSnapshot(sceneKey);
    const didBodyContentChange = !areAppRouteSceneBodyContentSpecsEqual(
      previousSceneInput.sceneBodyContent,
      sceneBodyContent
    );
    const didBodyTransportChange = !areAppRouteSceneBodyTransportSpecsEqual(
      previousSceneInput.sceneBodyTransport,
      sceneBodyTransport
    );
    const nextBodyAdmissionPolicy =
      sceneBodyAdmissionPolicy ?? previousSceneInput.sceneBodyAdmissionPolicy;
    const didBodyAdmissionPolicyChange = !areAppRouteSceneBodyAdmissionPoliciesEqual(
      previousSceneInput.sceneBodyAdmissionPolicy,
      nextBodyAdmissionPolicy
    );

    if (!didBodyContentChange && !didBodyTransportChange && !didBodyAdmissionPolicyChange) {
      return;
    }

    this.setSceneInputSnapshot({
      sceneKey,
      snapshot: {
        ...previousSceneInput,
        sceneBodyContent,
        sceneBodyTransport,
        sceneBodyAdmissionPolicy: nextBodyAdmissionPolicy,
      },
    });
    this.notifySceneLane(sceneKey, 'body');
  }

  private clearSceneShell(sceneKey: AppRouteSceneInputKey): void {
    const previousSceneInput = this.currentSnapshot[sceneKey] ?? null;
    if (previousSceneInput?.shellSpec == null) {
      return;
    }

    this.setSceneInputSnapshotOrClear({
      sceneKey,
      snapshot: {
        ...previousSceneInput,
        shellSpec: null,
      },
    });
    this.notifySceneLane(sceneKey, 'shell');
  }

  private clearSceneChrome(sceneKey: AppRouteSceneInputKey): void {
    const previousSceneInput = this.currentSnapshot[sceneKey] ?? null;
    if (previousSceneInput?.sceneChrome == null) {
      return;
    }

    this.setSceneInputSnapshotOrClear({
      sceneKey,
      snapshot: {
        ...previousSceneInput,
        sceneChrome: null,
      },
    });
    this.notifySceneLane(sceneKey, 'chrome');
  }

  private clearSceneBody(sceneKey: AppRouteSceneInputKey): void {
    const previousSceneInput = this.currentSnapshot[sceneKey] ?? null;
    if (
      previousSceneInput == null ||
      (previousSceneInput.sceneBodyContent == null &&
        previousSceneInput.sceneBodyTransport == null &&
        previousSceneInput.sceneBodyAdmissionPolicy == null)
    ) {
      return;
    }

    this.setSceneInputSnapshotOrClear({
      sceneKey,
      snapshot: {
        ...previousSceneInput,
        sceneBodyContent: null,
        sceneBodyTransport: null,
        sceneBodyAdmissionPolicy: null,
      },
    });
    this.notifySceneLane(sceneKey, 'body');
  }

  private clearSceneInput(sceneKey: AppRouteSceneInputKey): void {
    const previousSceneInput = this.currentSnapshot[sceneKey] ?? null;
    if (previousSceneInput == null) {
      return;
    }

    this.currentSnapshot = {
      ...this.currentSnapshot,
      [sceneKey]: null,
    };
    this.notifySceneLane(sceneKey, 'shell');
    this.notifySceneLane(sceneKey, 'chrome');
    this.notifySceneLane(sceneKey, 'body');
  }

  private clearAllSceneInputs(): void {
    const clearedSceneKeys = APP_ROUTE_SCENE_INPUT_KEYS.filter(
      (sceneKey) => this.currentSnapshot[sceneKey] != null
    );

    if (clearedSceneKeys.length === 0) {
      return;
    }

    this.currentSnapshot = {};
    clearedSceneKeys.forEach((sceneKey) => {
      this.notifySceneLane(sceneKey, 'shell');
      this.notifySceneLane(sceneKey, 'chrome');
      this.notifySceneLane(sceneKey, 'body');
    });
  }
}

export const createAppRouteSceneInputController = (): AppRouteSceneInputController =>
  new AppRouteSceneInputController();
