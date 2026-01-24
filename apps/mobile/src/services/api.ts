import axios from 'axios';
import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import { logger } from '../utils';
import { useSystemStatusStore } from '../store/systemStatusStore';

const DEFAULT_API_URL = 'http://localhost:3000/api/v1';
const DEFAULT_API_TIMEOUT_MS = typeof __DEV__ !== 'undefined' && __DEV__ ? 120_000 : 15_000;

const isTailscaleIp = (hostname: string) => {
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return false;
  }

  const [a, b, c, d] = match.slice(1).map((part) => Number.parseInt(part, 10));
  if ([a, b, c, d].some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return a === 100 && b >= 64 && b <= 127;
};

const isLocalhostHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const formatHostnameForUrl = (hostname: string) => {
  if (hostname.includes(':') && !hostname.startsWith('[') && !hostname.endsWith(']')) {
    return `[${hostname}]`;
  }
  return hostname;
};

const parseHostnameFromHostLike = (value: unknown) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
      const url = new URL(trimmed);
      return url.hostname || null;
    }
  } catch {
    // Fall through.
  }

  try {
    const url = new URL(`http://${trimmed}`);
    return url.hostname || null;
  } catch {
    return null;
  }
};

const readMetroBundleHostname = () => {
  const sourceCode = (NativeModules as unknown as { SourceCode?: { scriptURL?: string } }).SourceCode;
  const scriptURL = sourceCode?.scriptURL;
  const fromScriptUrl = parseHostnameFromHostLike(scriptURL);
  if (fromScriptUrl && !(Constants.isDevice && isLocalhostHostname(fromScriptUrl))) {
    return fromScriptUrl;
  }

  const legacyDebuggerHost = parseHostnameFromHostLike((Constants.manifest as { debuggerHost?: unknown })?.debuggerHost);
  if (legacyDebuggerHost && !(Constants.isDevice && isLocalhostHostname(legacyDebuggerHost))) {
    return legacyDebuggerHost;
  }

  const fromExperienceUrl = parseHostnameFromHostLike(Constants.experienceUrl);
  if (fromExperienceUrl && !(Constants.isDevice && isLocalhostHostname(fromExperienceUrl))) {
    return fromExperienceUrl;
  }

  const expoConfig = Constants.expoConfig as unknown;
  if (expoConfig && typeof expoConfig === 'object' && !Array.isArray(expoConfig)) {
    const expoConfigRecord = expoConfig as Record<string, unknown>;
    const hostUri = parseHostnameFromHostLike(expoConfigRecord.hostUri);
    if (hostUri) {
      return hostUri;
    }

    const debuggerHost = parseHostnameFromHostLike(expoConfigRecord.debuggerHost);
    if (debuggerHost) {
      return debuggerHost;
    }

    const extra = expoConfigRecord.extra;
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      const extraRecord = extra as Record<string, unknown>;
      const extraHostUri = parseHostnameFromHostLike(extraRecord.hostUri);
      if (extraHostUri) {
        return extraHostUri;
      }

      const extraDebuggerHost = parseHostnameFromHostLike(extraRecord.debuggerHost);
      if (extraDebuggerHost) {
        return extraDebuggerHost;
      }

      const expoClient = extraRecord.expoClient;
      if (expoClient && typeof expoClient === 'object' && !Array.isArray(expoClient)) {
        const expoClientRecord = expoClient as Record<string, unknown>;

        const expoClientHostUri = parseHostnameFromHostLike(expoClientRecord.hostUri);
        if (expoClientHostUri) {
          return expoClientHostUri;
        }

        const expoClientDebuggerHost = parseHostnameFromHostLike(expoClientRecord.debuggerHost);
        if (expoClientDebuggerHost) {
          return expoClientDebuggerHost;
        }
      }
    }
  }

  const manifest2Extra = (Constants.manifest2 as { extra?: unknown } | undefined)?.extra;
  if (manifest2Extra && typeof manifest2Extra === 'object' && !Array.isArray(manifest2Extra)) {
    const extraRecord = manifest2Extra as Record<string, unknown>;

    const hostUri = parseHostnameFromHostLike(extraRecord.hostUri);
    if (hostUri) {
      return hostUri;
    }

    const expoClient = extraRecord.expoClient;
    if (expoClient && typeof expoClient === 'object' && !Array.isArray(expoClient)) {
      const expoClientRecord = expoClient as Record<string, unknown>;

      const expoClientHostUri = parseHostnameFromHostLike(expoClientRecord.hostUri);
      if (expoClientHostUri) {
        return expoClientHostUri;
      }

      const expoClientDebuggerHost = parseHostnameFromHostLike(expoClientRecord.debuggerHost);
      if (expoClientDebuggerHost) {
        return expoClientDebuggerHost;
      }
    }
  }

  return null;
};

const deriveApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      const hostname = parsed.hostname;

      const isDeviceAndLocalhost =
        Constants.isDevice && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1');

      if (!isDeviceAndLocalhost) {
        if (typeof __DEV__ !== 'undefined' && __DEV__ && isTailscaleIp(hostname)) {
          logger.info('EXPO_PUBLIC_API_URL points to a Tailscale IP; ensure your iPhone can reach it.', { envUrl });
        }
        return envUrl;
      }

      if (isDeviceAndLocalhost) {
        logger.warn('EXPO_PUBLIC_API_URL is localhost on a device; falling back to Metro host for dev.');
      }
    } catch {
      logger.warn('EXPO_PUBLIC_API_URL is invalid; falling back to Metro host for dev.', { envUrl });
    }
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const metroHostname = readMetroBundleHostname();
    if (metroHostname) {
      const hostname = formatHostnameForUrl(metroHostname);
      return `http://${hostname}:3000/api/v1`;
    }
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    logger.warn('No EXPO_PUBLIC_API_URL and could not infer Metro host; falling back to localhost.', {
      isDevice: Constants.isDevice,
      scriptURL: (NativeModules as unknown as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL,
      experienceUrl: Constants.experienceUrl,
    });
  }

  return DEFAULT_API_URL;
};

const API_URL = deriveApiUrl();
export const API_BASE_URL = API_URL;
const API_TIMEOUT_MS = Number.parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT_MS || '', 10) || DEFAULT_API_TIMEOUT_MS;

type TokenResolver = () => Promise<string | null>;

let tokenResolver: TokenResolver | null = null;

export const setAuthTokenResolver = (resolver: TokenResolver | null) => {
  tokenResolver = resolver;
};

const getAuthToken = async (): Promise<string | null> => {
  if (!tokenResolver) {
    return null;
  }
  try {
    return await tokenResolver();
  } catch (error) {
    logger.warn('Failed to resolve auth token', error);
    return null;
  }
};

const api = axios.create({
  baseURL: API_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding token
api.interceptors.request.use(
  async (config) => {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    const systemStatus = useSystemStatusStore.getState();
    systemStatus.clearServiceIssue('global');
    return response;
  },
  (error) => {
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const systemStatus = useSystemStatusStore.getState();
    const status: number | undefined =
      typeof error?.response?.status === 'number' ? error.response.status : undefined;
    const responseData: unknown = error?.response?.data;
    const responseRecord: Record<string, unknown> | null =
      responseData && typeof responseData === 'object' && !Array.isArray(responseData)
        ? (responseData as Record<string, unknown>)
        : null;
    const errorCode =
      responseRecord && typeof responseRecord.errorCode === 'string'
        ? responseRecord.errorCode
        : undefined;
    const responseMessage =
      responseRecord && typeof responseRecord.message === 'string'
        ? responseRecord.message
        : undefined;

    if (typeof status === 'number' && status >= 500 && !systemStatus.isOffline) {
      const scope = errorCode === 'LLM_UNAVAILABLE' ? 'search' : 'global';
      systemStatus.reportServiceIssue({
        scope,
        message: responseMessage || 'Service temporarily unavailable.',
      });
    }

    logger.error('API request failed', {
      message: error.message,
      baseURL: error.config?.baseURL,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
    });
    return Promise.reject(error);
  }
);

export default api;
