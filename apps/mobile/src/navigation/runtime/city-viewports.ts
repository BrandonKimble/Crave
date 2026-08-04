// F956(a): this file used to carry a `CITY_VIEWPORTS` table (center + zoom per city) and
// a `resolveCityViewport` reader. Both were dead — symbol grep and bare-string grep over
// apps/mobile/src returned only their own declarations — so the table existed solely to
// feed a resolver nobody called, and the city vocabulary was spelled TWICE in 52 lines
// (the table, and the if-ladder below). The table is deleted; the fitted-or-chosen zooms
// it carried (Austin 11.4 vs NYC 11.1, never explained — F950's class) go with it. If a
// viewport-per-city ever returns, it returns with a live consumer AND a stated derivation
// for the zoom.
//
// What remains is the one thing that HAS consumers: the persisted-city normalizer, now
// the single place the supported-city vocabulary is written.

const normalizeCityKey = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const normalizePersistedCity = (value: string | null | undefined): string | null => {
  const normalized = normalizeCityKey(value);
  if (!normalized) {
    return null;
  }
  if (normalized === 'nyc') {
    return 'New York';
  }
  if (normalized === 'new york') {
    return 'New York';
  }
  if (normalized === 'austin') {
    return 'Austin';
  }
  return null;
};
