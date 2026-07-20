import React from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { setAuthTokenResolver } from '../services/api';
import { notificationsService } from '../services/notifications';
import { usePushPermissionGrantVersion } from '../services/push-permission';
import { useCityStore } from '../store/cityStore';
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

const tokenCache: ExpoTokenCache = {
  async getToken(key: string) {
    try {
      return (await SecureStore.getItemAsync(key)) ?? null;
    } catch (error) {
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
  const selectedCity = useCityStore((state) => state.selectedCity);
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const lastRegistrationRef = React.useRef<{
    token: string;
    city: string | null;
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

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (!token) {
          setPushToken(null);
          return;
        }

        const normalizedCity =
          typeof selectedCity === 'string' && selectedCity.trim().length
            ? selectedCity.trim()
            : null;
        const lastRegistration = lastRegistrationRef.current;
        if (
          lastRegistration &&
          lastRegistration.token === token &&
          lastRegistration.city === normalizedCity &&
          lastRegistration.userId === (userId ?? null) &&
          lastRegistration.homeRefreshNonce === homeRefreshNonce
        ) {
          setPushToken(token);
          return;
        }

        // §4 home-place v1: current location at registration ≈ home (see
        // resolveHomeLocationSignal above for the reading + signal states).
        const homeSignal = await resolveHomeLocationSignal();
        await notificationsService.registerDevice({
          token,
          userId: userId ?? undefined,
          platform: Platform.OS,
          appVersion: Constants.expoConfig?.version,
          locale: Intl.DateTimeFormat().resolvedOptions().locale,
          city: normalizedCity ?? undefined,
          ...(homeSignal.kind === 'coordinate'
            ? { homeLocation: homeSignal.coordinate }
            : homeSignal.kind === 'revoked'
              ? { homeLocation: null }
              : {}),
        });
        if (homeSignal.kind === 'coordinate') {
          homeSentAtMsRef.current = Date.now();
        }
        lastRegistrationRef.current = {
          token,
          city: normalizedCity,
          userId: userId ?? null,
          homeRefreshNonce,
        };
        setPushToken(token);
      } catch (error) {
        console.warn('[Notifications] Failed to register push token', error);
        setPushToken(null);
      }
    };

    void register();
  }, [homeRefreshNonce, pushPermissionGrantVersion, selectedCity, setPushToken, userId]);

  return null;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
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
