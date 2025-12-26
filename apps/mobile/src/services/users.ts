import api from './api';

export interface UserStats {
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  favoriteListsCount: number;
  favoritesTotalCount: number;
}

export interface UserProfile {
  userId: string;
  email?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  usernameStatus?: string | null;
  stats: UserStats;
}

export interface UsernameAvailability {
  normalized: string;
  available: boolean;
  reason: string;
  suggestions: string[];
}

export const usersService = {
  async getMe(): Promise<UserProfile> {
    const response = await api.get<UserProfile>('/users/me');
    return response.data;
  },
  async updateMe(payload: { displayName?: string; avatarUrl?: string }): Promise<UserProfile> {
    const response = await api.patch<UserProfile>('/users/me', payload);
    return response.data;
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
