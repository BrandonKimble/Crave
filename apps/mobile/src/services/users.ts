import type { OnboardingAnswers, UserOnboardingProfile } from '@crave-search/shared';
import type { AxiosRequestConfig } from 'axios';
import api from './api';
import type { ApiRequestBehaviorConfig } from './api';

export interface UserStats {
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  favoriteListsCount: number;
  favoritesTotalCount: number;
}

export interface AccessSummary {
  entitlementCode: string;
  active: boolean;
  /** null = lifetime while active. ISO string over the wire. */
  expiresAt: string | null;
  source: string | null;
}

export interface UserProfile {
  userId: string;
  email?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  usernameStatus?: string | null;
  onboarding: UserOnboardingProfile;
  stats: UserStats;
  /** SERVER-TRUTH access block (the entitlement ledger). Paywall/trial
   *  countdown render from THIS — never from local purchase state. */
  access?: AccessSummary;
}

export interface UsernameAvailability {
  normalized: string;
  available: boolean;
  reason: string;
  suggestions: string[];
}

type UserServiceRequestConfig = AxiosRequestConfig & ApiRequestBehaviorConfig;

export const usersService = {
  async getMe(): Promise<UserProfile> {
    const requestConfig: UserServiceRequestConfig = {
      suppressSystemStatus: true,
      suppressErrorLog: true,
    };
    const response = await api.get<UserProfile>('/users/me', requestConfig);
    return response.data;
  },
  async updateMe(payload: { displayName?: string; avatarUrl?: string }): Promise<UserProfile> {
    const response = await api.patch<UserProfile>('/users/me', payload);
    return response.data;
  },
  /** Permanent account deletion (Apple 5.1.1(v)). Destroys the Clerk user
   *  and anonymizes server data; App Store subscriptions must be cancelled
   *  by the user in iOS Settings (the confirm dialog says so). */
  async deleteMe(): Promise<{ deleted: true }> {
    const response = await api.delete<{ deleted: true }>('/users/me');
    return response.data;
  },
  async completeOnboarding(payload: {
    status: 'completed';
    onboardingVersion: number;
    selectedCity?: string | null;
    previewCity?: string | null;
    answers?: OnboardingAnswers;
    username?: string | null;
  }): Promise<UserProfile> {
    const requestConfig: UserServiceRequestConfig = {
      suppressSystemStatus: true,
      suppressErrorLog: true,
    };
    const response = await api.put<UserProfile>('/users/me/onboarding', payload, requestConfig);
    return response.data as UserProfile;
  },
  async checkUsername(username: string): Promise<UsernameAvailability> {
    const response = await api.get<UsernameAvailability>('/users/username/check', {
      params: { username },
    });
    return response.data;
  },
  async claimUsername(username: string): Promise<{ username: string }> {
    const response = await api.post('/users/username/claim', { username });
    return response.data;
  },
  async suggestUsername(username: string): Promise<string[]> {
    const response = await api.post<{ suggestions: string[] }>('/users/username/suggest', {
      username,
    });
    return response.data.suggestions ?? [];
  },
};
