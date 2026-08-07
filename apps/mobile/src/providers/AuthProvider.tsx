import React from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { setAuthTokenResolver } from '../services/api';
import { notificationsService } from '../services/notifications';
import { usePushPermissionGrantVersion } from '../services/push-permission';
import { useNotificationStore } from '../store/notificationStore';
import SearchHistoryPreload from './SearchHistoryPreload';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const getExtraRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const readProjectId = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record.projectId === 'string' ? (record.projectId as string) : undefined;
};

type ExpoTokenCache = {
  getToken: (key: string) => Promise<string | null>;
  saveToken: (key: string, token: string | null) => Promise<void>;
};

import { captureHandledError } from '../observability/crash-reporting';
import { reportClerkKeyMisconfig } from './auth-config-guard';
/**
 * F1101 instrument (2026-08-03) — prove the APNs environment, don't trust it.
 *
 * `ios/cravesearch/cravesearch.entitlements` hardcodes aps-environment =
 * development, which reads like "TestFlight mints sandbox tokens". It doesn't:
 * expo-notifications decides sandbox-vs-production from the EMBEDDED
 * PROVISIONING PROFILE at runtime (getExpoPushTokenAsync →
 * Application.getIosPushNotificationServiceEnvironmentAsync → EXProvisioningProfile
 * reading embedded.mobileprovision), and a store/ad-hoc profile carries
 * "production". This logs the classification on every registration and RAISES
 * a handled error only for the combination that would actually be broken —
 * a distributed build (App Store/TestFlight, ad-hoc, enterprise) reporting a
 * development APNs environment. It can show RED; that is the point.
 */
const reportPushEnvironmentClassification = async (): Promise<void> => {
  if (Platform.OS !== 'ios') {
    return;
  }
  try {
    const [apsEnvironment, releaseType] = await Promise.all([
      Application.getIosPushNotificationServiceEnvironmentAsync(),
      Application.getIosApplicationReleaseTypeAsync(),
    ]);
    const releaseTypeName = Application.ApplicationReleaseType[releaseType] ?? String(releaseType);
    const isDistributed =
      releaseType === Application.ApplicationReleaseType.APP_STORE ||
      releaseType === Application.ApplicationReleaseType.AD_HOC ||
      releaseType === Application.ApplicationReleaseType.ENTERPRISE;

    console.log(
      `[PushEnv] apsEnvironment=${apsEnvironment ?? 'null'} releaseType=${releaseTypeName}`
    );

    if (isDistributed && apsEnvironment !== 'production') {
      captureHandledError(
        new Error(
          `Distributed build has APNs environment "${apsEnvironment ?? 'null'}" (expected "production") — push tokens are minted against the sandbox gateway and every notification will silently disappear.`
        ),
        { seam: 'push:aps-environment', apsEnvironment, releaseType: releaseTypeName }
      );
    }
  } catch (error) {
    captureHandledError(error, { seam: 'push:aps-environment-probe' });
  }
};

const tokenCache: ExpoTokenCache = {
  async getToken(key: string) {
    try {
      return (await SecureStore.getItemAsync(key)) ?? null;
    } catch (error) {
      // F813 (2026-08-03): routed through the crash-reporting seam. A `console.warn` in the
      // AUTH/MONEY path is invisible in production — this is the seam App.tsx wires and whose
      // own docstring states the law: "a silent catch plus captureHandledError beats a silent
      // catch alone". The `seam:` tag names which door failed.
      captureHandledError(error, { seam: 'auth:token-cache-read', key });
      console.warn('[AuthProvider] Failed to read token from cache', error);
      return null;
    }
  },
  async saveToken(key: string, token: string | null) {
    try {
      if (token) {
        await SecureStore.setItemAsync(key, token);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      // F813: a token cache that stops persisting silently signs the user out on the
      // next cold start, with nothing anywhere saying why.
      captureHandledError(error, { seam: 'auth:token-cache-write', key });
      console.warn('[AuthProvider] Failed to persist token', error);
    }
  },
};

interface AuthProviderProps {
  children: React.ReactNode;
}

const ClerkSessionBridge: React.FC = () => {
  const { getToken } = useAuth();

  // Register the device token whenever the signed-in user or preferred city changes.
  React.useEffect(() => {
    setAuthTokenResolver(async () => {
      try {
        return await getToken({ template: 'mobile' });
      } catch (error) {
        // F2802: this catch swallows into an UNAUTHENTICATED request downstream
        // (api.ts getAuthToken treats null as "no token"), so a bare
        // console.warn is invisible in the build it matters in. Route through
        // the seam; keep the console line for dev.
        captureHandledError(error, { seam: 'auth:clerk-token-resolve' });
        console.warn('[AuthProvider] Failed to fetch Clerk token', error);
        return null;
      }
    });

    return () => {
      setAuthTokenResolver(null);
    };
  }, [getToken]);

  return null;
};

const resolveExpoProjectId = (): string | null => {
  if (process.env.EXPO_PUBLIC_PROJECT_ID) {
    return process.env.EXPO_PUBLIC_PROJECT_ID;
  }

  const expoExtra = getExtraRecord(Constants.expoConfig?.extra);
  const manifestExtra = getExtraRecord(
    (Constants.manifest2 as { extra?: unknown } | undefined)?.extra
  );
  const easConfigProjectId = readProjectId(Constants.easConfig);

  return (
    readProjectId(expoExtra.eas) ??
    readProjectId(expoExtra.expoClient) ??
    readProjectId(expoExtra) ??
    easConfigProjectId ??
    readProjectId(manifestExtra.eas) ??
    readProjectId(manifestExtra.expoClient) ??
    readProjectId(manifestExtra) ??
    null
  );
};

// §4 home-place registration, v1 READING: the device's CURRENT location at
// registration time ≈ home. Ground truth only — we send a raw coordinate and
// the server judges placeAt (smallestContaining); the client never picks a
// place id. A later leg can refine "home" with dwell clustering; the seam
// (registration carries a coordinate) stays identical.
//
// Signal states mirror the server DTO contract:
//   coordinate → set/refresh homePlaceId
//   revoked    → explicit null: the user turned location off; clear the home
//   unknown    → omit the field: no fix right now; the server keeps its value
type HomeLocationSignal =
  | { kind: 'coordinate'; coordinate: { lat: number; lng: number } }
  | { kind: 'revoked' }
  | { kind: 'unknown' };

// Re-send cadence: piggybacks the registrar (no scheduler) — an app-foreground
// event re-registers only when the last successfully sent home coordinate is
// absent or older than this TTL.
const HOME_LOCATION_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
// Registration is background plumbing — never hold it on a cold GPS acquire.
const HOME_LOCATION_CURRENT_FIX_WAIT_MS = 3_000;

const resolveHomeLocationSignal = async (): Promise<HomeLocationSignal> => {
  try {
    // READ permission only — the OS ask is owned by the location/push
    // permission chokepoints; the registrar never prompts.
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status === Location.PermissionStatus.DENIED) {
      return { kind: 'revoked' };
    }
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return { kind: 'unknown' };
    }
    const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
    if (lastKnown) {
      return {
        kind: 'coordinate',
        coordinate: { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude },
      };
    }
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), HOME_LOCATION_CURRENT_FIX_WAIT_MS)
      ),
    ]);
    if (current) {
      return {
        kind: 'coordinate',
        coordinate: { lat: current.coords.latitude, lng: current.coords.longitude },
      };
    }
    return { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
};

const PushNotificationRegistrar: React.FC = () => {
  const { userId } = useAuth();
  const pushPermissionGrantVersion = usePushPermissionGrantVersion();
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const lastRegistrationRef = React.useRef<{
    token: string;
    userId: string | null;
    homeRefreshNonce: number;
  } | null>(null);
  const missingProjectIdWarnedRef = React.useRef(false);
  // When we last successfully SENT a home coordinate (drives the foreground
  // staleness re-register below). Null = never sent one.
  const homeSentAtMsRef = React.useRef<number | null>(null);
  const [homeRefreshNonce, setHomeRefreshNonce] = React.useState(0);

  // Foreground staleness check (§4 home-place v1): piggyback the registrar —
  // when the app foregrounds and the last sent home coordinate is absent or
  // older than the TTL, bump the nonce so the effect below re-registers with
  // a fresh location. No scheduler; byte-identical behavior otherwise.
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }
      const sentAtMs = homeSentAtMsRef.current;
      if (sentAtMs != null && Date.now() - sentAtMs < HOME_LOCATION_REFRESH_TTL_MS) {
        return;
      }
      setHomeRefreshNonce((nonce) => nonce + 1);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  React.useEffect(() => {
    // F9421: this effect fires a network write (registerDevice). It awaits twice
    // before that POST, and its deps (userId, nonces) can change mid-flight. Without
    // cancellation a superseded run would still POST — a double-register window, and
    // with a changed userId, TWO different writes. `cancelled` (set by the cleanup)
    // makes a superseded run bail before every side effect. This is the required
    // shape for an async effect, not a guard over a missing constraint.
    let cancelled = false;
    const register = async () => {
      try {
        if (!Constants.isDevice) {
          setPushToken(null);
          return;
        }

        const projectId = resolveExpoProjectId();
        if (!projectId) {
          if (!missingProjectIdWarnedRef.current) {
            console.warn(
              '[Notifications] Missing Expo projectId. Set EXPO_PUBLIC_PROJECT_ID in apps/mobile/.env (or add extra.eas.projectId) to enable push tokens.'
            );
            missingProjectIdWarnedRef.current = true;
          }
          setPushToken(null);
          return;
        }

        // §8.9: NEVER prompts. The OS ask lives in push-permission.ts and
        // fires at first-contribution moments; this registrar only registers
        // a token when permission is ALREADY granted (and re-runs on the
        // grant signal via pushPermissionGrantVersion below).
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') {
          setPushToken(null);
          return;
        }

        await reportPushEnvironmentClassification();

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (cancelled) return;
        if (!token) {
          setPushToken(null);
          return;
        }

        const lastRegistration = lastRegistrationRef.current;
        if (
          lastRegistration &&
          lastRegistration.token === token &&
          lastRegistration.userId === (userId ?? null) &&
          lastRegistration.homeRefreshNonce === homeRefreshNonce
        ) {
          setPushToken(token);
          return;
        }

        // §4 home-place v1: current location at registration ≈ home (see
        // resolveHomeLocationSignal above for the reading + signal states).
        const homeSignal = await resolveHomeLocationSignal();
        // The one write. A run superseded during the awaits above must NOT POST.
        if (cancelled) return;
        await notificationsService.registerDevice({
          token,
          userId: userId ?? undefined,
          platform: Platform.OS,
          appVersion: Constants.expoConfig?.version,
          locale: Intl.DateTimeFormat().resolvedOptions().locale,
          ...(homeSignal.kind === 'coordinate'
            ? { homeLocation: homeSignal.coordinate }
            : homeSignal.kind === 'revoked'
              ? { homeLocation: null }
              : {}),
        });
        if (cancelled) return;
        if (homeSignal.kind === 'coordinate') {
          homeSentAtMsRef.current = Date.now();
        }
        lastRegistrationRef.current = {
          token,
          userId: userId ?? null,
          homeRefreshNonce,
        };
        setPushToken(token);
      } catch (error) {
        if (cancelled) return;
        // F2802: a failed push registration means the user receives zero push
        // notifications forever with nothing saying why — a bare console.warn
        // dies in production. Route through the seam; keep the dev console line.
        captureHandledError(error, { seam: 'notifications:push-register' });
        console.warn('[Notifications] Failed to register push token', error);
        setPushToken(null);
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, [homeRefreshNonce, pushPermissionGrantVersion, setPushToken, userId]);

  return null;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // F2802: both release-only misconfigs — no Clerk key (the whole app runs
  // UNAUTHENTICATED) and a `pk_test_` key (users hit the test instance) — can
  // only occur in a release build, where a bare console.error does not reach.
  // The guard now records through the crash-reporting seam (see
  // reportClerkKeyMisconfig); dev keeps the permissive path since running
  // without Clerk configured is a normal local state. The key can only arrive
  // from EAS dashboard secrets, which are not versioned in this repo, so
  // "someone forgot" is a live possibility rather than a hypothetical.
  reportClerkKeyMisconfig(publishableKey, __DEV__);

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkSessionBridge />
      <PushNotificationRegistrar />
      <SearchHistoryPreload />
      {children}
    </ClerkProvider>
  );
};
