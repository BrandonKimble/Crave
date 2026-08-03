/**
 * F883 — the Mapbox style cache-buster is a DEV tool.
 *
 * RED recipe: drop the `__DEV__` gate in constants/map.ts (make
 * STYLE_CACHE_BUSTER an unconditional `Date.now()`), and the release cases
 * below fail — two release URLs built a millisecond apart stop being equal.
 */

const TOKEN = 'pk.test-token';

const loadBuildMapStyleURL = (dev: boolean) => {
  let build!: (accessToken: string) => string;
  jest.isolateModules(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    build = require('./map').buildMapStyleURL;
  });
  return build;
};

afterEach(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
});

describe('buildMapStyleURL cache-busting', () => {
  it('RELEASE: the style URL is STABLE across module loads, so the style caches', () => {
    const first = loadBuildMapStyleURL(false)(TOKEN);
    const second = loadBuildMapStyleURL(false)(TOKEN);
    expect(first).toBe(second);
  });

  it('RELEASE: no wall-clock cachebuster and no fresh=true', () => {
    const url = loadBuildMapStyleURL(false)(TOKEN);
    expect(url).not.toContain('fresh=true');
    // The stable version token, not a timestamp.
    expect(url).toContain('cachebuster=1');
    expect(url).not.toMatch(/cachebuster=1[0-9]{12}/);
  });

  it('DEV: the URL still busts the cache, so Studio edits appear immediately', () => {
    const url = loadBuildMapStyleURL(true)(TOKEN);
    expect(url).toContain('fresh=true');
    expect(url).toMatch(/cachebuster=1[0-9]{12}/);
  });
});
