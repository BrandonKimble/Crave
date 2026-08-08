import type { BillingRail, OnboardingAnswers, UserOnboardingProfile } from '@crave-search/shared';
import type { AxiosRequestConfig } from 'axios';
import api from './api';
import { SILENT, type ApiRequestBehaviorConfig } from './api';
import { expectArray, expectArrayAt } from './expect-shape';
import type { AuthorIdentity } from './author-identity';

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
  /** End of ALL coverage (paid + banked days); null = lifetime while
   *  active. ISO string over the wire. */
  expiresAt: string | null;
  /** End of the live PAID window (the renewal/expiry date to show); null
   *  when lifetime or when only banked-day coverage remains. */
  paidUntil: string | null;
  /** Equals expiresAt; distinct so UI can say "then banked days". */
  coverageUntil: string | null;
  source: string | null;
  /** True when the app-wide paywall is enforcing (server-owned rollout
   *  switch) — the paywall routing axis keys off this. */
  enforced?: boolean;
  /**
   * WHICH RAIL BILLS THIS USER — server-derived from the live subscription
   * row (api: identity/billing-rail.ts). `'app_store'` = Apple's own
   * subscription sheet, `'web'` = the Stripe billing portal, `null` = there
   * is nothing to manage (no live subscription, or a comp).
   *
   * The client CANNOT derive this: `source` above says why access exists,
   * never who takes the money. "Manage subscription" dispatches on it.
   *
   * The union itself comes from @crave-search/shared (F9802) — it used to be a
   * second hand-written copy of the server's, and a rail the client had never
   * heard of falls through to "no rail", i.e. the paywall.
   */
  billingRail?: BillingRail | null;
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

/** S-B pages (userProfile/followList): the public profile + follow surfaces. */
export interface PublicUserProfile {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  stats: UserStats;
  /** §8.6: true ONLY on the blocked-pair minimal payload (authed viewer);
   *  absent on the full public payload. */
  unavailable?: boolean;
}

export interface FollowEdge {
  isFollowedByMe: boolean;
  isMe: boolean;
  /** §8.6 blocking flags (viewer-scoped; the anonymous profile GET can't
   *  carry them, so they ride the authed edge). */
  isBlockedByMe?: boolean;
  hasBlockedMe?: boolean;
}

// One shared shape (services/author-identity): these were seven
// near-identical copies, each free to disagree about a deleted person.
export type FollowListUser = AuthorIdentity;

/** §9b profileActions — user report reasons (server-validated enum). */
export type UserReportReason = 'spam' | 'harassment' | 'impersonation' | 'other';

export interface UsernameAvailability {
  normalized: string;
  available: boolean;
  reason: string;
  suggestions: string[];
}

type UserServiceRequestConfig = AxiosRequestConfig & ApiRequestBehaviorConfig;

export const usersService = {
  async getMe(): Promise<UserProfile> {
    // F832: the shared SILENT voice, not a third inline copy of it. /users/me is polled on
    // a schedule by the access lane — a failing poll must not raise the app-wide banner.
    const requestConfig: UserServiceRequestConfig = SILENT;
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

  /**
   * Undo a deletion inside the disclosed 30-day window.
   *
   * The ONE route a deleted account may reach — restore stopped being a side
   * effect of any authenticated request (which let a stray background call
   * un-delete an account nobody meant to bring back) and became a decision.
   */
  async restoreAccount(): Promise<{ restored: true }> {
    const response = await api.post<{ restored: true }>('/users/me/restore');
    return response.data;
  },
  async completeOnboarding(payload: {
    status: 'completed';
    onboardingVersion: number;
    selectedCity?: string | null;
    previewCity?: string | null;
    answers?: OnboardingAnswers;
    username?: string | null;
    /** D40: which lane landed this write — the append-only history records it
     *  verbatim, so "answered at the end of the flow" and "landed later from
     *  the outbox" stay distinguishable forever. */
    source?: 'completion' | 'replay';
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
    // F3716: a broken response must throw, not silently offer zero suggestions.
    return expectArrayAt<string>(response.data, 'suggestions', 'POST /users/username/suggest');
  },
  async getPublicProfile(userId: string): Promise<PublicUserProfile> {
    const response = await api.get<PublicUserProfile>(`/users/${userId}/profile`);
    return response.data;
  },
  async getFollowEdge(userId: string): Promise<FollowEdge> {
    const response = await api.get<FollowEdge>(`/users/${userId}/follow`);
    return response.data;
  },
  async followUser(userId: string): Promise<void> {
    await api.post(`/users/${userId}/follow`);
  },
  async unfollowUser(userId: string): Promise<void> {
    await api.delete(`/users/${userId}/follow`);
  },
  async listFollowers(userId: string): Promise<FollowListUser[]> {
    const response = await api.get<FollowListUser[]>(`/users/${userId}/followers`);
    return expectArray<FollowListUser>(response.data, 'GET /users/:id/followers');
  },
  async listFollowing(userId: string): Promise<FollowListUser[]> {
    const response = await api.get<FollowListUser[]>(`/users/${userId}/following`);
    return expectArray<FollowListUser>(response.data, 'GET /users/:id/following');
  },
  /** §8.6 blocking (page-registry — the Apple 1.2 UGC requirement). */
  async blockUser(userId: string): Promise<void> {
    await api.post(`/users/${userId}/block`);
  },
  async unblockUser(userId: string): Promise<void> {
    await api.delete(`/users/${userId}/block`);
  },
  /** §9b profileActions (Apple 1.2 UGC): report a user. Records only. */
  async reportUser(userId: string, reason: UserReportReason): Promise<{ reported: boolean }> {
    const response = await api.post(`/users/${userId}/report`, { reason });
    return response.data;
  },
  /** W4 settings (§8.6 privacy): my own block list — Settings → Privacy rows. */
  async listMyBlocks(): Promise<FollowListUser[]> {
    const response = await api.get<FollowListUser[]>('/users/me/blocks');
    // F3716: a PRIVACY surface — "you have blocked nobody" must not be
    // indistinguishable from "we could not read your block list".
    return expectArray<FollowListUser>(response.data, 'GET /users/me/blocks');
  },
};
