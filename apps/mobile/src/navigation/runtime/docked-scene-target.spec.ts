// The DOCKED_SCENE_KEY flip pins (home-surface-charter Job 3): the designed
// one-constant retarget landed 2026-07-26 — home is the docked scene; polls is a
// regular content tab. These pins make an accidental revert (or a half-flip
// where the seat registry disagrees with the constant) RED.
import { ALL_TOP_LEVEL_SCENE_KEYS, DOCKED_SCENE_KEY } from './docked-scene-target';
import { APP_ROOT_NAV_ITEMS } from './app-route-root-nav-items';
import { resolveAppRouteSheetScenePolicy } from './app-route-scene-policy-registry';
import { resolveRouteOverlayBottomNavIndex } from './route-overlay-bottom-nav-index';

describe('docked-scene retarget (polls → home)', () => {
  it('THE docked scene is home', () => {
    expect(DOCKED_SCENE_KEY).toBe('home');
    expect(ALL_TOP_LEVEL_SCENE_KEYS).toContain('home');
  });

  it('the docked scene carries the HOME posture seat; polls presents as content', () => {
    expect(resolveAppRouteSheetScenePolicy(DOCKED_SCENE_KEY).postureSeat).toBe('home');
    expect(resolveAppRouteSheetScenePolicy(DOCKED_SCENE_KEY).defaultFirstEntrySnap).toBe(
      'collapsed'
    );
    expect(resolveAppRouteSheetScenePolicy('polls').postureSeat).toBe('content');
    expect(resolveAppRouteSheetScenePolicy('polls').requiresExpandedPresentation).toBe(true);
  });

  it('polls is a tab now; home is NOT a tab (it presents under the search root)', () => {
    const navKeys = APP_ROOT_NAV_ITEMS.map((item) => item.key);
    expect(navKeys).toContain('polls');
    expect(navKeys).not.toContain('home');
  });

  it('nav highlight: home aliases to the search tab; polls owns its own tab index', () => {
    expect(resolveRouteOverlayBottomNavIndex('home')).toBe(
      resolveRouteOverlayBottomNavIndex('search')
    );
    const pollsIndex = resolveRouteOverlayBottomNavIndex('polls');
    expect(APP_ROOT_NAV_ITEMS[pollsIndex].key).toBe('polls');
  });
});
