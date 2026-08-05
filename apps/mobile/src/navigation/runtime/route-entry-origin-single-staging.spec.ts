// The scene-switch controller imports react-native for unstable_batchedUpdates only; this
// node-env suite substitutes the one function it uses (same mock as its sibling specs).
jest.mock('react-native', () => ({
  unstable_batchedUpdates: (run: () => void) => run(),
}));

import { createAppOverlayRouteCommandRuntime } from './app-overlay-route-command-runtime';
import { createAppRouteSceneSwitchRuntime } from './app-route-scene-switch-controller';
import { createAppRouteSceneSheetMotionTargetRegistry } from './app-route-scene-sheet-motion-target-registry';
import {
  registerRouteEntryOriginCapturer,
  registerRouteEntryOriginRestorer,
} from './route-entry-origin-capture-delegate';
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';
import type { OverlayKey } from './app-overlay-route-types';

/**
 * F1715 / D61 — ONE POP, ONE STAGING.
 *
 * Every pop used to stage the popped entry's origin restore TWICE: once in the dismiss
 * VERB (before the switch request — the correct instant, because the motion plan reads
 * the remembered-snap ledger during plan resolution) and once more in the scene-switch
 * controller (the reducer's closeActive/popToEntry cases + the bare public pop methods —
 * an "only for bare pops" fallback that was in fact UNCONDITIONAL). Rig proof: every
 * dismiss logged restore→commit→restore→commit with identical payloads 0-1ms apart.
 *
 * The VERB is now the single stager (its pre-plan timing is the rig-proven requirement —
 * staging at commit was a wrong-detent pop); the controller stages nothing. This spec
 * drives the REAL command runtime against the REAL scene-switch controller and counts
 * restorer invocations end-to-end.
 *
 * MUTATION PROOF: restore the controller-side staging (reducer case 'closeActive' →
 * stage-the-popped-entry, or the public closeActiveRouteState staging) and this spec goes
 * RED with 2 stagings for one pop.
 */

const buildOrigin = (departingSceneKey: OverlayKey): OriginSnapshot => ({
  sceneKey: departingSceneKey,
  sceneParams: null,
  detent: 'collapsed',
  segment: null,
  scroll: [],
  anchor: null,
});

describe('F1715 — one pop stages the origin restore exactly once', () => {
  let stagedOrigins: OriginSnapshot[];
  let unregisterCapturer: () => void;
  let unregisterRestorer: () => void;

  beforeEach(() => {
    stagedOrigins = [];
    unregisterCapturer = registerRouteEntryOriginCapturer(buildOrigin);
    unregisterRestorer = registerRouteEntryOriginRestorer((origin) => {
      stagedOrigins.push(origin);
    });
  });

  afterEach(() => {
    unregisterCapturer();
    unregisterRestorer();
  });

  const createHarness = () => {
    const routeSceneSwitchRuntime = createAppRouteSceneSwitchRuntime({
      sheetMotionTargetRegistry: createAppRouteSceneSheetMotionTargetRegistry(),
      resolveSceneRememberedSnap: () => null,
    });
    const commandRuntime = createAppOverlayRouteCommandRuntime({ routeSceneSwitchRuntime });
    return { routeSceneSwitchRuntime, commandRuntime };
  };

  it('closeActiveRoute on a scene-switch pop stages exactly once, with the popped entry origin', () => {
    const { routeSceneSwitchRuntime, commandRuntime } = createHarness();

    // Push a child reveal (real openChild scene switch) — its entry captures the origin.
    commandRuntime.revealRoute('restaurant');
    const pushedState = routeSceneSwitchRuntime.getRouteState();
    expect(pushedState.overlayRouteStack.length).toBeGreaterThan(1);
    expect(pushedState.activeOverlayRoute.origin?.sceneKey).toBe('search');

    commandRuntime.closeActiveRoute();

    // ONE pop → ONE staging (verb-time, pre-plan). Two here = the F1715 double-staging
    // resurrected (controller-side fallback staging again at commit).
    expect(stagedOrigins).toHaveLength(1);
    expect(stagedOrigins[0].sceneKey).toBe('search');
    expect(routeSceneSwitchRuntime.getRouteState().overlayRouteStack).toHaveLength(1);
  });

  it('popToEntryRoute stages exactly once, from the entry above the target', () => {
    const { routeSceneSwitchRuntime, commandRuntime } = createHarness();

    commandRuntime.revealRoute('restaurant');
    const rootEntryId = routeSceneSwitchRuntime.getRouteState().overlayRouteStack[0].entryId;

    commandRuntime.popToEntryRoute(rootEntryId);

    expect(stagedOrigins).toHaveLength(1);
    expect(stagedOrigins[0].sceneKey).toBe('search');
  });
});
