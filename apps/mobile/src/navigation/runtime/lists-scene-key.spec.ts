// The bookmarks → lists CANONICAL-LANGUAGE rename pins (owner decision 2026-07-26):
// the saved-lists domain's scene/page key is 'lists' everywhere in mobile code. A
// stray 'bookmarks' scene key reappearing (half-revert, stale merge) turns these RED.
// Server-side names (favorite_lists, services/favorite-lists.ts) deliberately keep
// their own naming — that is a separate later decision, not this spec's business.
import { ALL_TOP_LEVEL_SCENE_KEYS } from './docked-scene-target';
import { APP_OVERLAY_ROUTE_METADATA_BY_KEY } from './app-overlay-route-types';
import { APP_ROOT_NAV_ITEMS } from './app-route-root-nav-items';
import { resolveAppRouteSheetScenePolicy } from './app-route-scene-policy-registry';
import { resolveRouteOverlayBottomNavIndex } from './route-overlay-bottom-nav-index';

describe('lists scene key (bookmarks → lists rename)', () => {
  it("'lists' is a registered top-level scene; 'bookmarks' is gone", () => {
    expect(ALL_TOP_LEVEL_SCENE_KEYS).toContain('lists');
    expect(ALL_TOP_LEVEL_SCENE_KEYS).not.toContain('bookmarks');
    expect(APP_OVERLAY_ROUTE_METADATA_BY_KEY.lists).toBeDefined();
    expect(APP_OVERLAY_ROUTE_METADATA_BY_KEY.lists.role).toBe('topLevel');
    expect(
      (APP_OVERLAY_ROUTE_METADATA_BY_KEY as Record<string, unknown>).bookmarks
    ).toBeUndefined();
  });

  it("the nav tab is key 'lists', label 'Lists', with its own tab index", () => {
    const item = APP_ROOT_NAV_ITEMS.find((navItem) => navItem.key === 'lists');
    expect(item?.label).toBe('Lists');
    expect(APP_ROOT_NAV_ITEMS.map((navItem) => navItem.key)).not.toContain('bookmarks');
    const listsIndex = resolveRouteOverlayBottomNavIndex('lists');
    expect(APP_ROOT_NAV_ITEMS[listsIndex].key).toBe('lists');
  });

  it("the root tab over the search scene is labeled 'Home' (key stays 'search' by design)", () => {
    // The runtime key names the search-anchored root architecture; the user-facing
    // page is Home. The docked 'home' scene key already exists — a rename would collide.
    const rootItem = APP_ROOT_NAV_ITEMS.find((navItem) => navItem.key === 'search');
    expect(rootItem?.label).toBe('Home');
  });

  it("'lists' resolves a sheet scene policy (posture seat wired)", () => {
    expect(resolveAppRouteSheetScenePolicy('lists').postureSeat).toBeDefined();
  });
});
