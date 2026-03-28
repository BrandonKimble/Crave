export type CityViewportSpec = {
  center: [number, number];
  zoom: number;
};

const CITY_VIEWPORTS: Record<string, CityViewportSpec> = {
  austin: {
    center: [-97.7431, 30.2672],
    zoom: 11.4,
  },
  'new york': {
    center: [-74.006, 40.7128],
    zoom: 11.1,
  },
  nyc: {
    center: [-74.006, 40.7128],
    zoom: 11.1,
  },
};

const normalizeCityKey = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const resolveCityViewport = (value: string | null | undefined): CityViewportSpec | null => {
  const normalized = normalizeCityKey(value);
  if (!normalized) {
    return null;
  }
  return CITY_VIEWPORTS[normalized] ?? null;
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
