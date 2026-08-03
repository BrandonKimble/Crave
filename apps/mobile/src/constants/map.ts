const DEFAULT_STYLE_URL = 'mapbox://styles/brandonkimble/cmhjzgs6i00cl01s69ff1fsmf';
const DEFAULT_MAP_CENTER: [number, number] = [-97.7431, 30.2672];
/**
 * F883: the cache-buster is a DEV tool and must not run in production.
 *
 * `Date.now()` at module load makes every style URL unique, so every cold start
 * re-downloads the Mapbox style instead of reading the disk cache. That is what
 * we want while editing the style in Mapbox Studio; it is pure cost (and a
 * slower first map paint on cellular) for a shipped build.
 *
 * In release the URL carries a STABLE version token instead, so the style IS
 * cached — bump `STYLE_VERSION` deliberately when the published style changes
 * and clients must re-fetch. `fresh=true` (Mapbox's "skip the CDN edge cache"
 * flag) rides the same gate for the same reason.
 */
const STYLE_VERSION = '1';
const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__;
const STYLE_CACHE_BUSTER = isDevBuild ? String(Date.now()) : STYLE_VERSION;

const buildMapStyleURL = (accessToken: string): string => {
  const styleEnv =
    typeof process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL === 'string' &&
    process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL.length > 0
      ? process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL
      : DEFAULT_STYLE_URL;
  if (!styleEnv.startsWith('mapbox://styles/')) {
    // If a raw Mapbox Styles API URL is provided, it can be cached aggressively. Add a cachebuster
    // so edits (e.g. glyph changes for custom fonts) are picked up immediately in dev.
    if (styleEnv.startsWith('https://api.mapbox.com/styles/v1/')) {
      const params: string[] = [];
      if (accessToken && !styleEnv.includes('access_token=')) {
        params.push(`access_token=${encodeURIComponent(accessToken)}`);
      }
      if (isDevBuild) {
        params.push('fresh=true');
      }
      params.push(`cachebuster=${STYLE_CACHE_BUSTER}`);
      const joiner = styleEnv.includes('?') ? '&' : '?';
      return `${styleEnv}${joiner}${params.join('&')}`;
    }

    return styleEnv;
  }

  const stylePath = styleEnv.replace('mapbox://styles/', '');
  const params = isDevBuild
    ? ['fresh=true', `cachebuster=${STYLE_CACHE_BUSTER}`]
    : [`cachebuster=${STYLE_CACHE_BUSTER}`];
  if (accessToken) {
    params.push(`access_token=${encodeURIComponent(accessToken)}`);
  }

  return `https://api.mapbox.com/styles/v1/${stylePath}?${params.join('&')}`;
};

export { DEFAULT_STYLE_URL, DEFAULT_MAP_CENTER, STYLE_VERSION, buildMapStyleURL };
