import React from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { setAuthTokenResolver } from '../services/api';
import { notificationsService } from '../services/notifications';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

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

  const expoExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
  const manifestExtra = ((Constants.manifest2 as any)?.extra ?? {}) as Record<string, any>;

  return (
    expoExtra.eas?.projectId ??
    expoExtra.expoClient?.projectId ??
    (Constants.easConfig as Record<string, any> | undefined)?.projectId ??
    manifestExtra.eas?.projectId ??
    manifestExtra.expoClient?.projectId ??
    null
  );
};

const PushNotificationRegistrar: React.FC = () => {
  const { userId } = useAuth();
  const lastTokenRef = React.useRef<string | null>(null);

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
          return;
        }

        const projectId = resolveExpoProjectId();
        if (!projectId) {
          console.warn('[Notifications] Missing Expo projectId');
          return;
        }

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

        if (!token || token === lastTokenRef.current) {
          return;
        }

        await notificationsService.registerDevice({
          token,
          userId,
          platform: Platform.OS,
          appVersion: Constants.expoConfig?.version,
          locale: Intl.DateTimeFormat().resolvedOptions().locale,
        });
        lastTokenRef.current = token;
      } catch (error) {
        console.warn('[Notifications] Failed to register push token', error);
      }
    };

    void register();
  }, [userId]);

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
      {children}
    </ClerkProvider>
  );
};
