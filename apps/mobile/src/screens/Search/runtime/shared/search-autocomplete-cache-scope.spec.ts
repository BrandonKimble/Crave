/**
 * F6004 — THE AUTOCOMPLETE CACHE IS SCOPED BY ITS KEY, NOT BY AN EFFECT.
 *
 * Entries were keyed by folded query text alone and the scope was applied as a
 * wholesale `cache.clear()` in an effect. Two consequences, both fixed by
 * folding the scope into the key: an effect runs AFTER commit while this map is
 * read during RENDER (so a wrong-scope entry was reachable for one pass), and
 * the scope key omitted `userLocation` — one of the two inputs the request
 * actually carries — so two requests that differ only in where the user is
 * would have shared an entry.
 *
 * The specs below pin the identity claim. The mutation that reds them is
 * dropping `userLocation` from the scope key (or dropping the scope from the
 * entry key): both make a cross-scope lookup HIT.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';
import { useSearchAutocompleteCacheRuntime } from './use-search-autocomplete-cache-runtime';
import { buildAutocompleteScopeKey } from './use-search-autocomplete-runtime';

jest.mock('react', () => createReactHookHarnessModuleMock());
jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Platform: { OS: 'ios', select: (spec: { ios?: unknown }) => spec.ios },
  StyleSheet: { create: (sheet: unknown) => sheet, hairlineWidth: 1, absoluteFillObject: {} },
}));

const noop = () => undefined;

const bounds = {
  northEast: { lat: 30.3, lng: -97.7 },
  southWest: { lat: 30.2, lng: -97.8 },
};

const matches = [{ name: 'tacos' }] as never;

const mountCache = (initialScopeKey: string) => {
  let scopeKey = initialScopeKey;
  const harness = mountHook(() =>
    useSearchAutocompleteCacheRuntime({
      cancelAutocomplete: noop,
      setSuggestions: noop as never,
      cacheScopeKey: scopeKey,
    })
  );
  return {
    runtime: () => harness.latest(),
    moveTo: (nextScopeKey: string) => {
      scopeKey = nextScopeKey;
      return harness.render();
    },
  };
};

describe('F6004 autocomplete cache scope', () => {
  it('puts userLocation in the scope key', () => {
    const here = buildAutocompleteScopeKey(bounds, { lat: 30.25, lng: -97.75 });
    const elsewhere = buildAutocompleteScopeKey(bounds, { lat: 40.71, lng: -74.0 });
    const nowhere = buildAutocompleteScopeKey(bounds, null);

    expect(here).not.toBe(elsewhere);
    expect(here).not.toBe(nowhere);
  });

  it('does not serve an entry across scopes that differ only in userLocation', () => {
    const here = buildAutocompleteScopeKey(bounds, { lat: 30.25, lng: -97.75 });
    const elsewhere = buildAutocompleteScopeKey(bounds, { lat: 40.71, lng: -74.0 });

    const cache = mountCache(here);
    cache.runtime().writeAutocompleteCache('tacos', matches);
    expect(cache.runtime().lookupAutocompleteCache('tacos')).not.toBeNull();

    // Same viewport, different user location: a DIFFERENT request, so a miss —
    // and, unlike the deleted clearing effect, it is a miss in the very same
    // render pass, not only after the next commit.
    cache.moveTo(elsewhere);
    expect(cache.runtime().lookupAutocompleteCache('tacos')).toBeNull();

    // The original scope's entry was never destroyed — moving back HITS.
    cache.moveTo(here);
    expect(cache.runtime().lookupAutocompleteCache('tacos')).not.toBeNull();
  });

  it('does not offer a previous scope entry as a prefix placeholder', () => {
    const here = buildAutocompleteScopeKey(bounds, { lat: 30.25, lng: -97.75 });
    const elsewhere = buildAutocompleteScopeKey(bounds, { lat: 40.71, lng: -74.0 });

    const cache = mountCache(here);
    cache.runtime().writeAutocompleteCache('tac', matches);

    cache.moveTo(elsewhere);
    expect(cache.runtime().lookupAutocompleteCache('tacos')).toBeNull();
  });
});
