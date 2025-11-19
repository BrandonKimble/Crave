import React from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { setAuthTokenResolver } from '../services/api';
import { notificationsService } from '../services/notifications';
import { useCityStore } from '../store/cityStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { useNotificationStore } from '../store/notificationStore';
import { navigationRef } from '../navigation/navigationRef';
import PollNotificationListener from './PollNotificationListener';

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
    easConfigProjectId ??
    readProjectId(manifestExtra.eas) ??
    readProjectId(manifestExtra.expoClient) ??
    null
  );
};

const PushNotificationRegistrar: React.FC = () => {
  const { userId } = useAuth();
  const selectedCity = useCityStore((state) => state.selectedCity);
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const lastRegistrationRef = React.useRef<{
    token: string;
    city: string | null;
    userId: string | null;
  } | null>(null);

  React.useEffect(() => {
    const register = async () => {
      try {
        const permission = await Notifications.getPermissionsAsync();
        let status = permission.status;
        if (status !== 'granted') {
          const request = await Notifications.requestPermissionsAsync();
          status = request.status;
        }
        if (status !== 'granted') {
          setPushToken(null);
          return;
        }

        const projectId = resolveExpoProjectId();
        if (!projectId) {
          console.warn('[Notifications] Missing Expo projectId');
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
          lastRegistration.userId === (userId ?? null)
        ) {
          setPushToken(token);
          return;
        }

        await notificationsService.registerDevice({
          token,
          userId: userId ?? undefined,
          platform: Platform.OS,
          appVersion: Constants.expoConfig?.version,
          locale: Intl.DateTimeFormat().resolvedOptions().locale,
          city: normalizedCity ?? undefined,
        });
        lastRegistrationRef.current = {
          token,
          city: normalizedCity,
          userId: userId ?? null,
        };
        setPushToken(token);
      } catch (error) {
        console.warn('[Notifications] Failed to register push token', error);
        setPushToken(null);
      }
    };

    void register();
  }, [selectedCity, setPushToken, userId]);

  return null;
};

const AuthStateMonitor: React.FC = () => {
  const { isSignedIn } = useAuth();
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);

  React.useEffect(() => {
    if (!navigationRef.isReady()) {
      return;
    }
    if (isSignedIn) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
      return;
    }

    navigationRef.reset({
      index: 0,
      routes: [
        {
          name: hasCompletedOnboarding ? 'SignIn' : 'Onboarding',
        },
      ],
    });
  }, [hasCompletedOnboarding, isSignedIn]);

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
      <AuthStateMonitor />
      <PollNotificationListener />
      {children}
    </ClerkProvider>
  );
};
