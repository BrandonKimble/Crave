// F1950: the natural/structured/profile response caches in search.ts keyed only on the
// request payload, even though api.ts sends `Accept-Language: getCurrentLocale()` on every
// request and the backend threads it into response content. A locale change mid-session
// within a cache entry's TTL would silently serve a stale-locale cached response for an
// identical-payload request. This spec proves two requests with IDENTICAL payloads but
// DIFFERENT locales hit the network twice — they must not share a cache entry.
//
// `./api` is mocked to avoid pulling react-native/expo-constants/expo-secure-store (this
// jest project is hermetic — see jest.config.js) transitively through the real api client;
// `../i18n/current-locale` is mocked so the test controls the exact locale cell search.ts
// reads, mirroring the cell api.ts's own interceptor reads for the Accept-Language header.
let currentLocale = 'en-US';

jest.mock('./api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(async () => ({ data: { dishes: [], restaurants: [], metadata: {} } })),
    get: jest.fn(async () => ({ data: {} })),
  },
  SILENT: {},
}));

jest.mock('../i18n/current-locale', () => ({
  __esModule: true,
  getCurrentLocale: () => currentLocale,
}));

import api from './api';
import { searchService } from './search';

describe('search response cache keys fold in the request locale (F1950)', () => {
  beforeEach(() => {
    currentLocale = 'en-US';
    (api.post as jest.Mock).mockClear();
  });

  it('does not share a cache entry across two requests with the same payload but different locales', async () => {
    const payload = { query: 'tacos', entities: {} } as Parameters<typeof searchService.naturalSearch>[0];

    currentLocale = 'en-US';
    await searchService.naturalSearch(payload);
    expect(api.post).toHaveBeenCalledTimes(1);

    currentLocale = 'es-MX';
    await searchService.naturalSearch(payload);
    // If the cache key ignored locale, this second call would be served from the
    // first call's cache entry and api.post would still have been called only once.
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('still serves a cache hit for the same payload AND the same locale', async () => {
    // Distinct query from the first test — the cache Map is module-scoped and
    // persists across tests in this file, so a shared payload would collide.
    const payload = { query: 'ramen', entities: {} } as Parameters<
      typeof searchService.naturalSearch
    >[0];

    currentLocale = 'en-US';
    await searchService.naturalSearch(payload);
    await searchService.naturalSearch(payload);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
