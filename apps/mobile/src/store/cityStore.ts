import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils';

interface CityState {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
}

const sanitizeCity = (value: string): string => value.trim();

export const useCityStore = create<CityState>()(
  persist(
    (set) => ({
      selectedCity: 'Austin',
      setSelectedCity: (city) => {
        const normalized = sanitizeCity(city);
        set({ selectedCity: normalized });
      },
    }),
    {
      name: 'city-store',
      storage: createJSONStorage(() => {
        if (
          AsyncStorage &&
          typeof AsyncStorage.getItem === 'function' &&
          typeof AsyncStorage.setItem === 'function' &&
          typeof AsyncStorage.removeItem === 'function'
        ) {
          return {
            getItem: async (name: string) => {
              try {
                return (await AsyncStorage.getItem(name)) ?? null;
              } catch (error) {
                logger.warn('City store getItem failed', error);
                return null;
              }
            },
            setItem: async (name: string, value: string) => {
              try {
                await AsyncStorage.setItem(name, value);
              } catch (error) {
                logger.warn('City store setItem failed', error);
              }
            },
            removeItem: async (name: string) => {
              try {
                await AsyncStorage.removeItem(name);
              } catch (error) {
                logger.warn('City store removeItem failed', error);
              }
            },
          };
        }

        logger.warn('AsyncStorage unavailable for city store; using in-memory storage');
        const memoryStorage = new Map<string, string>();
        return {
          getItem: async (name: string) => memoryStorage.get(name) ?? null,
          setItem: async (name: string, value: string) => {
            memoryStorage.set(name, value);
          },
          removeItem: async (name: string) => {
            memoryStorage.delete(name);
          },
        };
      }),
    },
  ),
);
