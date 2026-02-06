const DEFAULT_STYLE_URL = 'mapbox://styles/brandonkimble/cmhjzgs6i00cl01s69ff1fsmf';
const DEFAULT_MAP_CENTER: [number, number] = [-97.7431, 30.2672];

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
      params.push('fresh=true');
      params.push(`cachebuster=${Date.now()}`);
      const joiner = styleEnv.includes('?') ? '&' : '?';
      return `${styleEnv}${joiner}${params.join('&')}`;
    }

    return styleEnv;
  }

  const stylePath = styleEnv.replace('mapbox://styles/', '');
  const params = ['fresh=true', `cachebuster=${Date.now()}`];
  if (accessToken) {
    params.push(`access_token=${encodeURIComponent(accessToken)}`);
  }

  return `https://api.mapbox.com/styles/v1/${stylePath}?${params.join('&')}`;
};

export { DEFAULT_STYLE_URL, DEFAULT_MAP_CENTER, buildMapStyleURL };
