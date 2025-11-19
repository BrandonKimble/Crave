const DEFAULT_STYLE_URL = 'mapbox://styles/brandonkimble/cmhjzgs6i00cl01s69ff1fsmf';
const DEFAULT_MAP_CENTER: [number, number] = [-97.7431, 30.2672];

const buildMapStyleURL = (accessToken: string): string => {
  const styleEnv = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? DEFAULT_STYLE_URL;
  if (!styleEnv.startsWith('mapbox://styles/')) {
    return styleEnv;
  }

  const stylePath = styleEnv.replace('mapbox://styles/', '');
  const params = [`cachebuster=${Date.now()}`];
  if (accessToken) {
    params.push(`access_token=${encodeURIComponent(accessToken)}`);
  }

  return `https://api.mapbox.com/styles/v1/${stylePath}?${params.join('&')}`;
};

export { DEFAULT_STYLE_URL, DEFAULT_MAP_CENTER, buildMapStyleURL };
