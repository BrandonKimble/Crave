import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import { usePerfScenarioRuntimeStore } from '../perf/perf-scenario-runtime-store';
import { withPerfScenarioMetadata } from '../perf/perf-scenario-attribution';
import { getCurrentLocale } from '../i18n/current-locale';
import { logger } from '../utils';
import { useSystemStatusStore } from '../store/systemStatusStore';
import { useEntitlementLapseStore } from '../store/entitlementLapseStore';
import { useSessionLapseStore } from '../store/sessionLapseStore';
import { getOrCreateDeviceKey } from './device-key';
import { resolveApiFailureAction } from './api-failure-policy';
import { useAccountDeletedStore } from '../store/accountDeletedStore';

const DEFAULT_API_URL = 'http://localhost:3000/api/v1';
// PROVENANCE (F839, 2026-08-03): the DEV timeout is deliberately absurd (2 minutes) so a
// breakpoint, a cold Metro bundle, or a locally-running LLM call does not abort mid-debug.
// RELEASE is 15s: past that a user has already decided the app is broken, and the failure
// surface (the system-status banner) is a better answer than a hanging spinner.
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

/**
 * THE REQUEST'S VOICE — one exported pair, chosen at the call site (F805/F831/F832).
 *
 * A failing request either speaks for the whole app or it does not, and that is a property
 * of WHO ASKED, not of the endpoint:
 *
 *   USER_INITIATED — a person is waiting on this. A 5xx here means the app is broken from
 *                    their point of view, so the app-wide "Service temporarily unavailable"
 *                    banner is the right answer. This is the interceptor's DEFAULT, so an
 *                    un-annotated request already behaves this way; passing it explicitly is
 *                    for call sites where the reader would otherwise have to guess.
 *
 *   SILENT         — a TIMER issued this. Nobody is waiting, and a poll must never speak for
 *                    the whole app. Crucially, the banner has a RECOVERY LOOP (the health
 *                    probe at the bottom of this file clears the banner when the API comes
 *                    back); a repeating request that re-reports on every tick DEFEATS that
 *                    loop — the probe clears, the next poll repaints, forever, over unrelated
 *                    screens. That was F831, live, at 5s/15s from the DM panels.
 *
 * F805/F832 (2026-08-03): these flags used to be smuggled as EXTRA keys on the axios request
 * config, with nothing typing a call site into remembering them and no way to see the
 * omission in review. Two services had independently reinvented the same constant
 * (`OPTIONAL_AUTH_REQUEST_CONFIG` in search.ts, an inline object in users.ts) and the other
 * four services did not know it existed. There is now ONE declaration of each voice.
 *
 * NOT DONE, deliberately (F831's stronger form): the DEFAULT is still "speaks". Inverting it
 * — so every request is silent until it opts in — is the shape that makes forgetting
 * impossible, but it would mute the banner for every call site in the app in one step, and
 * "the banner no longer appears when it should" is not a regression any type or unit test in
 * this repo can catch. That inversion wants a sim pass over the real failure matrix
 * (scripts/rig/lifecycle-matrix.sh drives `set_system_offline`), and should land with one.
 */
export type ApiRequestConfig = AxiosRequestConfig & ApiRequestBehaviorConfig;

export const USER_INITIATED: ApiRequestConfig = {
  suppressSystemStatus: false,
  suppressErrorLog: false,
};

/** A timer issued this: no banner, no error log. See USER_INITIATED above. */
export const SILENT: ApiRequestConfig = {
  suppressSystemStatus: true,
  suppressErrorLog: true,
};

// Request interceptor for adding token
api.interceptors.request.use(
  async (config) => {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Vote-integrity device signal (plans/vote-integrity-ladder.md): best-
    // effort keychain install id — omitted (never failing) when unavailable.
    const deviceKey = await getOrCreateDeviceKey();
    if (deviceKey) {
      config.headers['x-device-key'] = deviceKey;
    }
    // LOCALE ON THE WIRE (plans/multilingual.md M1, ruling D4): every request
    // carries the resolved BCP 47 locale so the API can negotiate labels, and
    // so any cache that carries rendered text can key on it.
    //
    // Per-REQUEST, not per-session, and read from the same getCurrentLocale()
    // the UI renders with — the failure this prevents is a screen in Spanish
    // asking the API in English (or worse, half a session in each after a
    // profile override). Deliberately NOT the push-device locale row: D4 rules
    // that out because a user who declines notifications has no locale there.
    //
    // Not `config.headers.Accept-Language ??=`: an explicit per-call override
    // wins, and axios lowercases header names on match, so the check is too.
    if (!config.headers['Accept-Language']) {
      config.headers['Accept-Language'] = getCurrentLocale();
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

    // What this failure MEANS is decided in one pure place
    // (api-failure-policy.ts), so the set of outcomes is closed and provable.
    const purgeDueAt =
      responseRecord && typeof responseRecord.purgeDueAt === 'string'
        ? responseRecord.purgeDueAt
        : null;
    const failureAction = resolveApiFailureAction({
      status,
      errorCode,
      purgeDueAt,
    });

    // THE SESSION-LAPSE SEAM (F804): the server says 401 — the token is
    // expired, revoked, for a deleted user, or was never resolved because the
    // Clerk token resolver threw (getAuthToken swallows that into null). ONE
    // chokepoint, mirroring the entitlement branch below: announce the lapse so
    // the route coordinator can show sign-in, and tag the error so callers stay
    // quiet (one story — the sign-in screen — not a generic failure modal on top
    // of it). Before this branch existed the app silently degraded to anonymous
    // and kept making unauthenticated requests forever.
    if (failureAction.kind === 'session_lapse') {
      useSessionLapseStore.getState().announceLapse();
      (error as { isSessionLapse?: boolean }).isSessionLapse = true;
      return Promise.reject(error);
    }

    // Deleted account inside its grace window. ONE chokepoint, mirroring the
    // two lapse branches: announce the story so the app root can offer restore,
    // and tag the error so callers stay quiet — otherwise every in-flight
    // request raises its own "something went wrong" on top of the takeover.
    if (failureAction.kind === 'account_deleted') {
      useAccountDeletedStore.getState().announceDeleted(failureAction.purgeDueAt);
      (error as { isAccountDeleted?: boolean }).isAccountDeleted = true;
      return Promise.reject(error);
    }

    // App-wide paywall: subscription lapsed mid-session. ONE chokepoint —
    // announce the lapse (the App-root host mounts the paywall takeover) and
    // tag the error so callers/mutation handlers stay quiet (one story, not
    // a generic failure modal on top of the paywall).
    if (failureAction.kind === 'entitlement_lapse') {
      useEntitlementLapseStore.getState().announceLapse();
      (error as { isEntitlementLapse?: boolean }).isEntitlementLapse = true;
      return Promise.reject(error);
    }

    if (
      failureAction.kind === 'service_issue' &&
      !requestFlags.suppressSystemStatus &&
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
//
// F806 (2026-08-03): OWNERSHIP MOVED, BEHAVIOR UNCHANGED. This used to be a MODULE-SCOPE
// `useSystemStatusStore.subscribe(...)` sitting right here, so merely IMPORTING the api
// client started a subscription with a `setInterval` as a side effect of module evaluation
// — unstoppable, and unrunnable in the hermetic jest project (which imports this module for
// its pure parts). The behavior was right and the design note was honest; the OWNER was
// wrong. `startBannerRecoveryProbe` is now an explicit, idempotent start that RETURNS ITS
// STOP, mounted by `NetworkStatusListener` beside the other app-lifetime listeners
// (App.tsx:143). The store stays the seam: this reads it and writes it, and nothing else
// changed.
export const HEALTH_PROBE_INTERVAL_MS = 5000;
const HEALTH_URL = `${String(API_URL).replace(/\/api\/v1\/?$/, '')}/health`;

export const startBannerRecoveryProbe = (): (() => void) => {
  let healthProbeTimer: ReturnType<typeof setInterval> | null = null;
  const stopProbe = () => {
    if (healthProbeTimer != null) {
      clearInterval(healthProbeTimer);
      healthProbeTimer = null;
    }
  };
  const unsubscribe = useSystemStatusStore.subscribe((state) => {
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
    } else if (!hasIssue) {
      stopProbe();
    }
  });
  return () => {
    unsubscribe();
    stopProbe();
  };
};

export default api;
