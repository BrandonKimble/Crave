import React from 'react';
import { ClerkProvider, TokenCache, useAuth } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import { setAuthTokenResolver } from '../services/api';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const tokenCache: TokenCache = {
  async getToken(key) {
    try {
      return (await SecureStore.getItemAsync(key)) ?? null;
    } catch (error) {
      console.warn('[AuthProvider] Failed to read token from cache', error);
      return null;
    }
  },
  async saveToken(key, token) {
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkSessionBridge />
      {children}
    </ClerkProvider>
  );
};
