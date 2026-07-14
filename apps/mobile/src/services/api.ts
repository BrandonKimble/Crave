import axios from 'axios';
import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import { usePerfScenarioRuntimeStore } from '../perf/perf-scenario-runtime-store';
import { withPerfScenarioMetadata } from '../perf/perf-scenario-attribution';
import { logger } from '../utils';
import { useSystemStatusStore } from '../store/systemStatusStore';
import { useEntitlementLapseStore } from '../store/entitlementLapseStore';

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

const isPrivateLanIp = (hostname: string) => {
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return false;
  }

  const [a, b, c, d] = match.slice(1).map((part) => Number.parseInt(part, 10));
  if ([a, b, c, d].some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
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
  const sourceCode = (NativeModules as unknown as { SourceCode?: { scriptURL?: string } })
    .SourceCode;
  const scriptURL = sourceCode?.scriptURL;
  const fromScriptUrl = parseHostnameFromHostLike(scriptURL);
  if (fromScriptUrl && !(Constants.isDevice && isLocalhostHostname(fromScriptUrl))) {
    return fromScriptUrl;
  }

  const legacyDebuggerHost = parseHostnameFromHostLike(
    (Constants.manifest as { debuggerHost?: unknown })?.debuggerHost
  );
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
        Constants.isDevice &&
        (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1');

      if (!isDeviceAndLocalhost) {
        if (
          typeof __DEV__ !== 'undefined' &&
          __DEV__ &&
          !Constants.isDevice &&
          isPrivateLanIp(hostname)
        ) {
          const simulatorLocalUrl = new URL(envUrl);
          simulatorLocalUrl.hostname = 'localhost';
          const resolvedUrl = simulatorLocalUrl.toString();
          logger.info(
            'EXPO_PUBLIC_API_URL points to a private LAN host on simulator; using localhost.',
            { envUrl, resolvedUrl }
          );
          return resolvedUrl;
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__ && isTailscaleIp(hostname)) {
          logger.info(
            'EXPO_PUBLIC_API_URL points to a Tailscale IP; ensure your iPhone can reach it.',
            { envUrl }
          );
        }
        return envUrl;
      }

      if (isDeviceAndLocalhost) {
        logger.warn(
          'EXPO_PUBLIC_API_URL is localhost on a device; falling back to Metro host for dev.'
        );
      }
    } catch {
      logger.warn('EXPO_PUBLIC_API_URL is invalid; falling back to Metro host for dev.', {
        envUrl,
      });
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
    logger.warn(
      'No EXPO_PUBLIC_API_URL and could not infer Metro host; falling back to localhost.',
      {
        isDevice: Constants.isDevice,
        scriptURL: (NativeModules as unknown as { SourceCode?: { scriptURL?: string } }).SourceCode
          ?.scriptURL,
        experienceUrl: Constants.experienceUrl,
      }
    );
  }

  return DEFAULT_API_URL;
};

const API_URL = deriveApiUrl();
export const API_BASE_URL = API_URL;
const API_TIMEOUT_MS =
  Number.parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT_MS || '', 10) || DEFAULT_API_TIMEOUT_MS;
const DEV_PERF_SCENARIO_AUTH_TOKEN = 'crave-dev-perf-scenario';

type TokenResolver = () => Promise<string | null>;

let tokenResolver: TokenResolver | null = null;

export const setAuthTokenResolver = (resolver: TokenResolver | null) => {
  tokenResolver = resolver;
};

const getAuthToken = async (): Promise<string | null> => {
  const resolvePerfScenarioToken = () =>
    typeof __DEV__ !== 'undefined' && __DEV__ && usePerfScenarioRuntimeStore.getState().activeConfig
      ? DEV_PERF_SCENARIO_AUTH_TOKEN
      : null;

  if (!tokenResolver) {
    return resolvePerfScenarioToken();
  }
  try {
    return (await tokenResolver()) ?? resolvePerfScenarioToken();
  } catch (error) {
    logger.warn('Failed to resolve auth token', error);
    return resolvePerfScenarioToken();
  }
};

const api = axios.create({
  baseURL: API_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type ApiRequestBehaviorConfig = {
  suppressSystemStatus?: boolean;
  suppressErrorLog?: boolean;
};

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

    const requestFlags = (error?.config as ApiRequestBehaviorConfig | undefined) ?? {};
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

    // App-wide paywall: subscription lapsed mid-session. ONE chokepoint —
    // announce the lapse (the App-root host mounts the paywall takeover) and
    // tag the error so callers/mutation handlers stay quiet (one story, not
    // a generic failure modal on top of the paywall).
    if (status === 403 && errorCode === 'ENTITLEMENT_REQUIRED') {
      useEntitlementLapseStore.getState().announceLapse();
      (error as { isEntitlementLapse?: boolean }).isEntitlementLapse = true;
      return Promise.reject(error);
    }

    if (
      !requestFlags.suppressSystemStatus &&
      typeof status === 'number' &&
      status >= 500 &&
      !systemStatus.isOffline
    ) {
      const scope = errorCode === 'LLM_UNAVAILABLE' ? 'search' : 'global';
      systemStatus.reportServiceIssue({
        scope,
        message: responseMessage || 'Service temporarily unavailable.',
      });
    }

    if (!requestFlags.suppressErrorLog) {
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (scenarioConfig) {
        // eslint-disable-next-line no-console
        console.log(
          `[SearchPerf][Scenario] ${JSON.stringify(
            withPerfScenarioMetadata(scenarioConfig, {
              event: 'api_request_failed_contract',
              message: error.message,
              baseURL: error.config?.baseURL,
              url: error.config?.url,
              method: error.config?.method,
              status: error.response?.status,
            })
          )}`
        );
      }
      logger.error('API request failed', {
        message: error.message,
        baseURL: error.config?.baseURL,
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
      });
    }
    return Promise.reject(error);
  }
);

// ─── Banner recovery probe (wave-4 §1) ───────────────────────────────────────────────────────
// A reported service issue must clear when HEALTH RETURNS — not only when some later user
// action happens to succeed (the old behavior left "Service temporarily unavailable."
// stuck indefinitely on an idle screen). While an issue is live, probe the API's root
// /health every 5s with a bare client (no interceptors — probes never re-report, never
// log, never double-clear); the first healthy response clears the banner and stops the
// loop. The loop exists ONLY while an issue is present, so the idle app makes no traffic.
const HEALTH_PROBE_INTERVAL_MS = 5000;
const HEALTH_URL = `${String(API_URL).replace(/\/api\/v1\/?$/, '')}/health`;
let healthProbeTimer: ReturnType<typeof setInterval> | null = null;

useSystemStatusStore.subscribe((state) => {
  const hasIssue = state.serviceIssue != null;
  if (hasIssue && healthProbeTimer == null) {
    healthProbeTimer = setInterval(() => {
      void axios
        .get(HEALTH_URL, { timeout: 3000 })
        .then(() => {
          useSystemStatusStore.getState().clearServiceIssue();
        })
        .catch(() => {
          // Still down — keep probing.
        });
    }, HEALTH_PROBE_INTERVAL_MS);
  } else if (!hasIssue && healthProbeTimer != null) {
    clearInterval(healthProbeTimer);
    healthProbeTimer = null;
  }
});

export default api;
