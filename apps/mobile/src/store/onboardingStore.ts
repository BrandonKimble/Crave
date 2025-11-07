import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils';

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  __forceOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),
      __forceOnboarding: () => {
        logger.info('Onboarding reset triggered (temporary helper)');
        set({ hasCompletedOnboarding: false });
      },
    }),
    {
      name: 'onboarding-store',
      storage: createJSONStorage(() => {
        if (
          AsyncStorage &&
          typeof AsyncStorage.getItem === 'function' &&
          typeof AsyncStorage.setItem === 'function' &&
          typeof AsyncStorage.removeItem === 'function'
        ) {
          return {
            getItem: async (name) => {
              try {
                return (await AsyncStorage.getItem(name)) ?? null;
              } catch (error) {
                logger.warn('Onboarding store getItem failed', error);
                return null;
              }
            },
            setItem: async (name, value) => {
              try {
                await AsyncStorage.setItem(name, value);
              } catch (error) {
                logger.warn('Onboarding store setItem failed', error);
              }
            },
            removeItem: async (name) => {
              try {
                await AsyncStorage.removeItem(name);
              } catch (error) {
                logger.warn('Onboarding store removeItem failed', error);
              }
            },
          };
        }

        logger.warn('AsyncStorage unavailable for onboarding store; using memory storage');
        const memoryStorage = new Map<string, string>();
        return {
          getItem: async (name) => memoryStorage.get(name) ?? null,
          setItem: async (name, value) => {
            memoryStorage.set(name, value);
          },
          removeItem: async (name) => {
            memoryStorage.delete(name);
          },
        };
      }),
    }
  )
);
