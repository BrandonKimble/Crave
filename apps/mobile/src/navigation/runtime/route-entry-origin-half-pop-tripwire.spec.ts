// The scene-switch controller imports react-native for unstable_batchedUpdates only; this
// node-env suite substitutes the one function it uses (same mock as its sibling specs).
jest.mock('react-native', () => ({
  unstable_batchedUpdates: (run: () => void) => run(),
}));

import { CAMORIGIN_DEBUG_ENABLED } from './pageswitch-debug-flag';
import { createAppOverlayRouteCommandRuntime } from './app-overlay-route-command-runtime';
import { createAppRouteSceneSwitchRuntime } from './app-route-scene-switch-controller';
import { createAppRouteSceneSheetMotionTargetRegistry } from './app-route-scene-sheet-motion-target-registry';
import {
  registerRouteEntryOriginCapturer,
  registerRouteEntryOriginRestorer,
} from './route-entry-origin-capture-delegate';
import { disarmOriginRestoreTripwire } from './route-entry-origin-half-pop-tripwire';
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';
import type { OverlayKey } from './app-overlay-route-types';

/**
 * F5417 — THE HALF-POP TRIPWIRE FIRES WITH THE NARRATIVE FLAG OFF.
 *
 * The tripwire's whole reason to exist is that it must be live in the session where the
 * defect reproduces. Before F5417 it emitted through `logCameraOriginDebug`, gated on
 * `CAMORIGIN_DEBUG_ENABLED = false` — so the instrument that was added because "an
 * instrument that cannot fire is an always-green lie" could not fire in any build.
 *
 * These cases drive the REAL command runtime and the REAL origin seam, and the first thing
 * they assert is the condition that makes the rest meaningful: the narrative flag is OFF.
 * Revert the tripwire to the gated sink and every bark case below goes RED.
 */

const buildOrigin = (departingSceneKey: OverlayKey): OriginSnapshot => ({
  sceneKey: departingSceneKey,
  sceneParams: null,
  detent: 'collapsed',
  segment: null,
  scroll: [],
});

const createHarness = () => {
  const routeSceneSwitchRuntime = createAppRouteSceneSwitchRuntime({
    sheetMotionTargetRegistry: createAppRouteSceneSheetMotionTargetRegistry(),
    resolveSceneRememberedSnap: () => null,
  });
  return {
    routeSceneSwitchRuntime,
    commandRuntime: createAppOverlayRouteCommandRuntime({ routeSceneSwitchRuntime }),
  };
};

const halfPopBarks = (spy: jest.SpyInstance): string[] =>
  spy.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('HALF-POP'));

describe('F5417 — the half-pop tripwire is a correctness assertion, not a debug trace', () => {
  let unregisterCapturer: () => void;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    unregisterCapturer = registerRouteEntryOriginCapturer(buildOrigin);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    unregisterCapturer();
    errorSpy.mockRestore();
  });

  it('the narrative CAMORIGIN flag is OFF — which is exactly the build the tripwire must fire in', () => {
    expect(CAMORIGIN_DEBUG_ENABLED).toBe(false);
  });

  it('a pop whose origin restore never commits BARKS, flag off', () => {
    // No restorer registered: the staged origin is dropped, the sheet pops, the map stays.
    // This is F1505's shape, and it is the shape the pre-F5417 sink could not report.
    const { commandRuntime } = createHarness();
    commandRuntime.revealRoute('restaurant');
    commandRuntime.closeActiveRoute();

    const barks = halfPopBarks(errorSpy);
    expect(barks).toHaveLength(1);
    expect(barks[0]).toContain('[ORIGIN-CONTRACT]');
    expect(barks[0]).toContain("'closeActive'");
  });

  it('a pop whose restore leg completes says NOTHING', () => {
    // The registered restorer stands in for the production restore leg, which disarms at its
    // camera commit — the instant that proves both halves of the pop met.
    const unregisterRestorer = registerRouteEntryOriginRestorer(() => {
      disarmOriginRestoreTripwire();
    });
    try {
      const { commandRuntime } = createHarness();
      commandRuntime.revealRoute('restaurant');
      commandRuntime.closeActiveRoute();
      expect(halfPopBarks(errorSpy)).toHaveLength(0);
    } finally {
      unregisterRestorer();
    }
  });

  it('popToEntry and popToRoot are on the same seam — both bark', () => {
    const { routeSceneSwitchRuntime, commandRuntime } = createHarness();
    commandRuntime.revealRoute('restaurant');
    const rootEntryId = routeSceneSwitchRuntime.getRouteState().overlayRouteStack[0].entryId;
    commandRuntime.popToEntryRoute(rootEntryId);

    commandRuntime.revealRoute('restaurant');
    commandRuntime.popToRootRoute();

    const barks = halfPopBarks(errorSpy);
    expect(barks).toHaveLength(2);
    expect(barks[0]).toContain("'popToEntry'");
    expect(barks[1]).toContain("'popToRoot'");
  });

  it('a pop with NO origin to stage does not arm — a state is not a defect', () => {
    // The ROOT entry departed nothing, and a popToRoot on an already-rooted stack has nothing
    // above it. A tripwire that barked here would be the always-RED twin of the always-green lie.
    const { commandRuntime } = createHarness();
    commandRuntime.popToRootRoute();
    commandRuntime.closeActiveRoute();
    expect(halfPopBarks(errorSpy)).toHaveLength(0);
  });
});
