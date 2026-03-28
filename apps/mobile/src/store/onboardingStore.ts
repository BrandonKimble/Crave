import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_VERSION,
  type OnboardingAnswers,
  type OnboardingAnswerValue,
  type OnboardingStatus,
  type UserOnboardingProfile,
} from '@crave-search/shared';
import { logger } from '../utils';

export type { OnboardingAnswers, OnboardingAnswerValue, OnboardingStatus, UserOnboardingProfile };

export const DEFAULT_ONBOARDING_STEP_ID = 'hero';

export type OnboardingDraft = {
  version: number;
  currentStepId: string;
  answers: OnboardingAnswers;
  updatedAtMs: number | null;
};

type PersistedLegacyOnboardingState = {
  hasCompletedOnboarding?: boolean;
  currentStepId?: string;
  answers?: OnboardingAnswers;
};

interface OnboardingState {
  status: OnboardingStatus;
  completedAt: string | null;
  selectedCity: string | null;
  previewCity: string | null;
  draft: OnboardingDraft;
  hydrateCompletionFromServer: (profile: UserOnboardingProfile) => void;
  setCurrentStepId: (stepId: string) => void;
  setAnswer: (stepId: string, value: OnboardingAnswerValue) => void;
  toggleMultiValue: (stepId: string, optionId: string) => void;
  addCustomMultiValue: (stepId: string, inputKey: string) => void;
  clearDraft: () => void;
  completeOnboardingLocally: (params?: {
    selectedCity?: string | null;
    previewCity?: string | null;
    completedAt?: string | null;
    onboardingVersion?: number;
  }) => void;
  resetOnboarding: () => void;
  __forceOnboarding: () => void;
}

const createDefaultDraft = (): OnboardingDraft => ({
  version: ONBOARDING_VERSION,
  currentStepId: DEFAULT_ONBOARDING_STEP_ID,
  answers: {},
  updatedAtMs: null,
});

const sanitizeStepId = (value: string | null | undefined): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : DEFAULT_ONBOARDING_STEP_ID;

const sanitizeCity = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const nextDraft = (draft: OnboardingDraft, patch: Partial<OnboardingDraft>): OnboardingDraft => ({
  ...draft,
  ...patch,
  version: ONBOARDING_VERSION,
  updatedAtMs: Date.now(),
});

const buildStateFromLegacy = (
  legacy: PersistedLegacyOnboardingState | null | undefined
): Pick<OnboardingState, 'status' | 'completedAt' | 'selectedCity' | 'previewCity' | 'draft'> => ({
  status: legacy?.hasCompletedOnboarding ? 'completed' : 'not_started',
  completedAt: null,
  selectedCity: null,
  previewCity: null,
  draft: legacy?.hasCompletedOnboarding
    ? createDefaultDraft()
    : {
        version: ONBOARDING_VERSION,
        currentStepId: sanitizeStepId(legacy?.currentStepId),
        answers: legacy?.answers ?? {},
        updatedAtMs: Date.now(),
      },
});

const createStorage = () =>
  createJSONStorage(() => {
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
            logger.warn('Onboarding store getItem failed', error);
            return null;
          }
        },
        setItem: async (name: string, value: string) => {
          try {
            await AsyncStorage.setItem(name, value);
          } catch (error) {
            logger.warn('Onboarding store setItem failed', error);
          }
        },
        removeItem: async (name: string) => {
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
      getItem: async (name: string) => memoryStorage.get(name) ?? null,
      setItem: async (name: string, value: string) => {
        memoryStorage.set(name, value);
      },
      removeItem: async (name: string) => {
        memoryStorage.delete(name);
      },
    };
  });

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      status: 'not_started',
      completedAt: null,
      selectedCity: null,
      previewCity: null,
      draft: createDefaultDraft(),
      hydrateCompletionFromServer: (profile) =>
        set((state) => {
          if (profile.status !== 'completed' && state.status === 'completed') {
            return state;
          }
          return {
            status: profile.status,
            completedAt: profile.completedAt,
            selectedCity: sanitizeCity(profile.selectedCity),
            previewCity: sanitizeCity(profile.previewCity),
            draft:
              profile.status === 'completed'
                ? createDefaultDraft()
                : state.draft.version === ONBOARDING_VERSION
                ? state.draft
                : createDefaultDraft(),
          };
        }),
      setCurrentStepId: (stepId) =>
        set((state) => ({
          status: state.status === 'completed' ? state.status : 'in_progress',
          draft: nextDraft(state.draft, {
            currentStepId: sanitizeStepId(stepId),
          }),
        })),
      setAnswer: (stepId, value) =>
        set((state) => ({
          status: state.status === 'completed' ? state.status : 'in_progress',
          draft: nextDraft(state.draft, {
            answers: {
              ...state.draft.answers,
              [stepId]: value,
            },
          }),
        })),
      toggleMultiValue: (stepId, optionId) =>
        set((state) => {
          const existing = state.draft.answers[stepId];
          const current = Array.isArray(existing) ? existing : [];
          const next = current.includes(optionId)
            ? current.filter((value) => value !== optionId)
            : [...current, optionId];
          return {
            status: state.status === 'completed' ? state.status : 'in_progress',
            draft: nextDraft(state.draft, {
              answers: {
                ...state.draft.answers,
                [stepId]: next,
              },
            }),
          };
        }),
      addCustomMultiValue: (stepId, inputKey) =>
        set((state) => {
          const inputValue = state.draft.answers[inputKey];
          const trimmed = typeof inputValue === 'string' ? inputValue.trim() : '';
          if (!trimmed) {
            return state;
          }
          const existing = state.draft.answers[stepId];
          const current = Array.isArray(existing) ? existing : [];
          if (current.some((value) => value.toLowerCase() === trimmed.toLowerCase())) {
            return {
              status: state.status === 'completed' ? state.status : 'in_progress',
              draft: nextDraft(state.draft, {
                answers: {
                  ...state.draft.answers,
                  [inputKey]: '',
                },
              }),
            };
          }
          return {
            status: state.status === 'completed' ? state.status : 'in_progress',
            draft: nextDraft(state.draft, {
              answers: {
                ...state.draft.answers,
                [stepId]: [...current, trimmed],
                [inputKey]: '',
              },
            }),
          };
        }),
      clearDraft: () =>
        set(() => ({
          draft: createDefaultDraft(),
        })),
      completeOnboardingLocally: (params) =>
        set(() => ({
          status: 'completed',
          completedAt: params?.completedAt ?? new Date().toISOString(),
          selectedCity: sanitizeCity(params?.selectedCity),
          previewCity: sanitizeCity(params?.previewCity),
          draft: {
            ...createDefaultDraft(),
            version: params?.onboardingVersion ?? ONBOARDING_VERSION,
          },
        })),
      resetOnboarding: () =>
        set(() => ({
          status: 'not_started',
          completedAt: null,
          selectedCity: null,
          previewCity: null,
          draft: createDefaultDraft(),
        })),
      __forceOnboarding: () => {
        logger.info('Onboarding reset triggered (temporary helper)');
        set({
          status: 'not_started',
          completedAt: null,
          selectedCity: null,
          previewCity: null,
          draft: createDefaultDraft(),
        });
      },
    }),
    {
      name: 'onboarding-store',
      version: 2,
      storage: createStorage(),
      migrate: (persistedState, version) => {
        if (version < 2) {
          return buildStateFromLegacy(persistedState as PersistedLegacyOnboardingState);
        }
        const state = persistedState as Partial<OnboardingState> | null | undefined;
        const draft =
          state?.draft && state.draft.version === ONBOARDING_VERSION
            ? {
                version: ONBOARDING_VERSION,
                currentStepId: sanitizeStepId(state.draft.currentStepId),
                answers: state.draft.answers ?? {},
                updatedAtMs: state.draft.updatedAtMs ?? Date.now(),
              }
            : createDefaultDraft();
        return {
          status: state?.status ?? 'not_started',
          completedAt: state?.completedAt ?? null,
          selectedCity: sanitizeCity(state?.selectedCity),
          previewCity: sanitizeCity(state?.previewCity),
          draft,
        };
      },
      partialize: (state) => ({
        status: state.status,
        completedAt: state.completedAt,
        selectedCity: state.selectedCity,
        previewCity: state.previewCity,
        draft: state.draft,
      }),
    }
  )
);
