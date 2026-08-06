// ─── FALSIFIER: CHILD PUSHES EMIT A PRESS STAMP ──────────────────────────────
//
// The touch-latency instrument's anchor is the PRESS. Tab presses stamped it
// from day one (SearchBottomNav); the heaviest transitions in the app —
// listDetail, pollDetail, restaurant, userProfile, settings, saveList,
// pollCreation — did not, so their honest press->real-rows span was not merely
// ungreen, it was unmeasurable (audit defect 2).
//
// `revealRoute` is the ONE chokepoint every child reveal already flows through
// (`pushRoute` aliases it), which is why the stamp is one line rather than N
// call sites. This spec pins that: it drives the REAL command runtime over a
// stub scene-switch runtime and asserts the stamp exists for every scene the
// three internal branches (pollCreation, pollDetail, metadata child role) route
// through — so a future scene added to any branch inherits the stamp, and a
// branch that grows its own early return without one shows RED here.
//
// RED-PROVEN by mutation (executed 2026-08-05):
//   C1 markTrackNavPress removed from revealRoute -> 7 RED (one per scene)
//   C2 the stamp moved BELOW the pollCreation early return -> 1 RED
//      (pollCreation, the branch that returns first)

import { createAppOverlayRouteCommandRuntime } from './app-overlay-route-command-runtime';
import type { AppRouteSceneSwitchRuntime } from './app-route-scene-switch-controller';
import type { OverlayKey } from './app-overlay-route-types';
import { peekTrackPressSpan, resetTrackPressSpan } from '../../tracksheet/track-entry-prewarm';

const stubSceneSwitchRuntime = (): AppRouteSceneSwitchRuntime =>
  ({
    getRouteState: () => ({
      activeOverlayRoute: { key: 'search', params: undefined },
      overlayRouteStack: [],
      overlayRouteStackLength: 0,
    }),
    getPreviousRouteEntry: () => null,
    requestOverlaySwitch: () => 1,
    requestOverlaySwitchWithSettleCallback: () => 1,
    pushRouteState: () => undefined,
    setRootRouteState: () => undefined,
    updateRouteState: () => undefined,
    closeActiveRouteState: () => undefined,
    popToEntryRouteState: () => undefined,
    popToRootRouteState: () => undefined,
  }) as unknown as AppRouteSceneSwitchRuntime;

/** The three internal branches of revealRoute, by the scenes that take them. */
const CHILD_REVEALS: OverlayKey[] = [
  'pollCreation', // branch 1 (param normalization, returns first)
  'pollDetail', // branch 2 (param normalization)
  'restaurant', // branch 3 (metadata role === 'child')
  'listDetail',
  'userProfile',
  'settings',
  'saveList',
];

describe('revealRoute — the child-push press stamp (the one chokepoint)', () => {
  it.each(CHILD_REVEALS)('stamps the press for a %s reveal', (overlay) => {
    resetTrackPressSpan();
    const runtime = createAppOverlayRouteCommandRuntime({
      routeSceneSwitchRuntime: stubSceneSwitchRuntime(),
    });
    expect(peekTrackPressSpan()).toBeNull();
    runtime.revealRoute(overlay);
    const span = peekTrackPressSpan();
    expect(span).not.toBeNull();
    expect(span?.sceneKey).toBe(overlay);
    // Unconsumed: the paint probe closes it, and if the push lands nowhere the
    // TTL drops it unreported (track-entry-prewarm.ts).
    expect(span?.firstPaintMs).toBeNull();
  });

  it('the legacy `pushRoute` alias is the SAME body, so it stamps too — no call site is off the instrument', () => {
    resetTrackPressSpan();
    const runtime = createAppOverlayRouteCommandRuntime({
      routeSceneSwitchRuntime: stubSceneSwitchRuntime(),
    });
    runtime.pushRoute('listDetail');
    expect(peekTrackPressSpan()?.sceneKey).toBe('listDetail');
  });
});
