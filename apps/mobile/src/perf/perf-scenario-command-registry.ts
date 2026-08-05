type PerfScenarioCommandRegistrySnapshot = {
  closeResults: (() => void) | null;
  setMapCamera:
    | ((input: {
        lat: number;
        lng: number;
        zoom: number;
        bearing?: number | null;
        pitch?: number | null;
        label?: string | null;
      }) => boolean)
    | null;
  animateMapCamera:
    | ((input: {
        lat: number;
        lng: number;
        zoom: number;
        bearing?: number | null;
        pitch?: number | null;
        cameraDurationMs: number;
        label?: string | null;
      }) => boolean)
    | null;
  submitShortcutRestaurants: (() => Promise<void>) | null;
  // Verification harness: drive the restaurant<->dish tab toggle through its REAL flow
  // (scheduleTabToggleCommit) so a deep link can validate the canonical-swap toggle without the
  // GestureDetector that Maestro can't tap.
  toggleTab: ((input: { tab: 'dishes' | 'restaurants' }) => void) | null;
  /** Lens-exit S2 proof lever: the REAL open-now chip write (cause 'chip_open_now'). */
  flipOpenNow: ((input: { openNow: boolean }) => void) | null;
  setScaleProbeMarkers:
    | ((input: {
        count: number;
        lat: number;
        lng: number;
        collide?: boolean;
        spreadDeg?: number | null;
        label?: string | null;
      }) => boolean)
    | null;
  // Verification harness: open an overlay scene in its committed state, so a
  // Maestro flow / deep link can drive into any scene (e.g. pollDetail) without
  // the manual gesture dance the docked-lane preview required.
  openOverlayScene:
    | ((input: { scene: string; routeParam?: string | null; label?: string | null }) => boolean)
    | null;
  // Verification harness: push a CHILD scene into the CURRENT context — mirrors
  // pushRoute with zero choreography (the from-anywhere probe verb).
  pushChildScene: ((input: { scene: string; params: Record<string, unknown> }) => boolean) | null;
  // Verification harness: deterministic results-list scroll (Maestro swipes are consumed by the
  // sheet's gesture handoff and cannot reliably reach the list bottom).
  scrollResults: ((input: { offsetY: number; animated?: boolean | null }) => boolean) | null;
};

const commandRegistry: PerfScenarioCommandRegistrySnapshot = {
  closeResults: null,
  setMapCamera: null,
  animateMapCamera: null,
  submitShortcutRestaurants: null,
  toggleTab: null,
  flipOpenNow: null,
  setScaleProbeMarkers: null,
  openOverlayScene: null,
  pushChildScene: null,
  scrollResults: null,
};

/**
 * What a registrar may hand in. DERIVED from the snapshot, never hand-written.
 *
 * F871 (2026-08-03): this was a SECOND, hand-maintained copy of the snapshot's shape and it
 * had already drifted — `setScaleProbeMarkers` accepts `collide` and `spreadDeg` in the
 * snapshot, the registration omitted both, and PerfScenarioCoordinator passes them. So the
 * registrar compiled against a signature that LIED about what it would receive: the extra
 * fields were invisible to the type system at the registration site, and a rename of either
 * one would have failed silently at runtime rather than at build. One declaration now — a
 * registrar supplies any subset of the snapshot's verbs, each with the snapshot's exact
 * signature, and drift is unrepresentable.
 */
export type PerfScenarioCommandRegistration = {
  [K in keyof PerfScenarioCommandRegistrySnapshot]?: NonNullable<
    PerfScenarioCommandRegistrySnapshot[K]
  >;
};

export const registerPerfScenarioCommands = ({
  closeResults,
  setMapCamera,
  animateMapCamera,
  submitShortcutRestaurants,
  toggleTab,
  flipOpenNow,
  setScaleProbeMarkers,
  openOverlayScene,
  pushChildScene,
  scrollResults,
}: PerfScenarioCommandRegistration): (() => void) => {
  if (closeResults) {
    commandRegistry.closeResults = closeResults;
  }
  if (setMapCamera) {
    commandRegistry.setMapCamera = setMapCamera;
  }
  if (animateMapCamera) {
    commandRegistry.animateMapCamera = animateMapCamera;
  }
  if (submitShortcutRestaurants) {
    commandRegistry.submitShortcutRestaurants = submitShortcutRestaurants;
  }
  if (toggleTab) {
    commandRegistry.toggleTab = toggleTab;
  }
  if (flipOpenNow) {
    commandRegistry.flipOpenNow = flipOpenNow;
  }
  if (setScaleProbeMarkers) {
    commandRegistry.setScaleProbeMarkers = setScaleProbeMarkers;
  }
  if (openOverlayScene) {
    commandRegistry.openOverlayScene = openOverlayScene;
  }
  if (pushChildScene) {
    commandRegistry.pushChildScene = pushChildScene;
  }
  if (scrollResults) {
    commandRegistry.scrollResults = scrollResults;
  }

  return () => {
    if (closeResults && commandRegistry.closeResults === closeResults) {
      commandRegistry.closeResults = null;
    }
    if (setMapCamera && commandRegistry.setMapCamera === setMapCamera) {
      commandRegistry.setMapCamera = null;
    }
    if (animateMapCamera && commandRegistry.animateMapCamera === animateMapCamera) {
      commandRegistry.animateMapCamera = null;
    }
    if (
      submitShortcutRestaurants &&
      commandRegistry.submitShortcutRestaurants === submitShortcutRestaurants
    ) {
      commandRegistry.submitShortcutRestaurants = null;
    }
    if (toggleTab && commandRegistry.toggleTab === toggleTab) {
      commandRegistry.toggleTab = null;
    }
    if (flipOpenNow && commandRegistry.flipOpenNow === flipOpenNow) {
      commandRegistry.flipOpenNow = null;
    }
    if (setScaleProbeMarkers && commandRegistry.setScaleProbeMarkers === setScaleProbeMarkers) {
      commandRegistry.setScaleProbeMarkers = null;
    }
    if (openOverlayScene && commandRegistry.openOverlayScene === openOverlayScene) {
      commandRegistry.openOverlayScene = null;
    }
    if (pushChildScene && commandRegistry.pushChildScene === pushChildScene) {
      commandRegistry.pushChildScene = null;
    }
    if (scrollResults && commandRegistry.scrollResults === scrollResults) {
      commandRegistry.scrollResults = null;
    }
  };
};

export const readPerfScenarioCommandRegistry = (): PerfScenarioCommandRegistrySnapshot => ({
  closeResults: commandRegistry.closeResults,
  setMapCamera: commandRegistry.setMapCamera,
  animateMapCamera: commandRegistry.animateMapCamera,
  submitShortcutRestaurants: commandRegistry.submitShortcutRestaurants,
  toggleTab: commandRegistry.toggleTab,
  flipOpenNow: commandRegistry.flipOpenNow,
  setScaleProbeMarkers: commandRegistry.setScaleProbeMarkers,
  openOverlayScene: commandRegistry.openOverlayScene,
  pushChildScene: commandRegistry.pushChildScene,
  scrollResults: commandRegistry.scrollResults,
});
