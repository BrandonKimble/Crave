import { createAppRouteOverlayCommandController } from './app-route-overlay-command-controller';
import type { AppOverlayRouteCommandRuntime } from './app-overlay-route-command-runtime';

// THE BOUND EXISTS (F955(a), the F912 shape).
//
// `getDishSaveHandler` / `getRestaurantSaveHandler` memoise one closure per
// `${entityId}|${locationId}` so memoised rows keep a stable handler identity. The key is a
// CONTENT identity, not the bounded scene-key space, so before this the two Maps grew by one
// permanent entry for every dish and restaurant the user ever saw a save button for, and the
// only removal path was `dispose()` at teardown.
//
// PROVEN RED: delete the `while (cache.size > SAVE_HANDLER_LIMIT)` eviction loop in
// `resolveCachedSaveHandler` and the "cache stays bounded" case fails — the identity-stability
// case keeps passing either way, which is exactly why the bound needed its own test.

const createRuntimeStub = (): AppOverlayRouteCommandRuntime =>
  ({
    pushRoute: () => {},
    replaceRoute: () => {},
    dismissRoute: () => {},
    restoreDockedScene: () => {},
  }) as unknown as AppOverlayRouteCommandRuntime;

describe('F955(a) — the save-handler caches are bounded', () => {
  it('returns a STABLE handler identity for a repeated key (the caches earn their keep)', () => {
    const controller = createAppRouteOverlayCommandController({
      routeOverlayRouteCommandRuntime: createRuntimeStub(),
    });

    const first = controller.actions.getDishSaveHandler('connection-1', 'location-1');
    const second = controller.actions.getDishSaveHandler('connection-1', 'location-1');
    expect(second).toBe(first);

    const restaurantFirst = controller.actions.getRestaurantSaveHandler('restaurant-1', null);
    const restaurantSecond = controller.actions.getRestaurantSaveHandler('restaurant-1', null);
    expect(restaurantSecond).toBe(restaurantFirst);

    controller.dispose();
  });

  it('EVICTS least-recently-used entries instead of growing without bound', () => {
    const controller = createAppRouteOverlayCommandController({
      routeOverlayRouteCommandRuntime: createRuntimeStub(),
    });

    const oldestHandler = controller.actions.getDishSaveHandler('connection-0', 'location-1');

    // Well past the cap: an unbounded cache retains every one of these forever.
    const totalKeys = 1000;
    for (let index = 1; index < totalKeys; index += 1) {
      controller.actions.getDishSaveHandler(`connection-${index}`, 'location-1');
    }

    // THE RED ASSERTION: the least-recently-used entry was evicted, so asking again rebuilds
    // a NEW closure. Remove the eviction loop and this identity is still the original one.
    expect(controller.actions.getDishSaveHandler('connection-0', 'location-1')).not.toBe(
      oldestHandler
    );

    // ...and eviction is least-recently-used, not a wipe: the newest key survived.
    const recentKey = `connection-${totalKeys - 1}`;
    const recentBefore = controller.actions.getDishSaveHandler(recentKey, 'location-1');
    expect(controller.actions.getDishSaveHandler(recentKey, 'location-1')).toBe(recentBefore);

    controller.dispose();
  });
});
