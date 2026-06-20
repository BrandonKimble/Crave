import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import type { Coordinate, MapBounds } from '../types';

// ─── Live model (comment + endorsement + leaderboard) ────────────────────────

/** Gazetteer-resolved span in a comment body → tappable entity deeplink (§6.1). */
export interface EntitySpan {
  start: number;
  end: number;
  text: string;
  entityId: string;
  name: string;
  type: string; // 'restaurant' | 'food' | 'food_attribute' | 'restaurant_attribute'
}

export interface PollCommentUser {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PollComment {
  commentId: string;
  pollId: string;
  parentCommentId: string | null;
  body: string;
  score: number;
  publicId: string;
  entitySpans: EntitySpan[] | null;
  loggedAt: string;
  editedAt: string | null;
  user: PollCommentUser;
  currentUserLiked: boolean;
}

export type PollCommentSort = 'top' | 'new';

export interface PollCreator {
  origin: 'seeded' | 'user' | 'curator';
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export type PollLeaderboardSubjectType = 'entity' | 'connection';

/** One ranked row of the endorsement leaderboard (§5 / §6.2). */
export interface PollLeaderboardEntry {
  rank: number;
  subjectType: PollLeaderboardSubjectType;
  subjectId: string;
  name: string | null;
  type: string | null;
  distinctEndorsers: number;
  /** Whether the viewer has directly endorsed this candidate (tap-to-endorse). */
  currentUserEndorsed: boolean;
}

/** Top-N leaderboard candidate shown inline on the feed card ("see the poll"). */
export interface PollCandidate {
  rank: number;
  subjectType: PollLeaderboardSubjectType;
  subjectId: string;
  name: string | null;
  distinctEndorsers: number;
  currentUserEndorsed: boolean;
}

export type PollTopicType =
  | 'best_dish'
  | 'what_to_order'
  | 'best_dish_attribute'
  | 'best_restaurant_attribute';

export interface PollTopic {
  topicType: PollTopicType;
  targetDishId?: string | null;
  targetRestaurantId?: string | null;
  targetFoodAttributeId?: string | null;
  targetRestaurantAttributeId?: string | null;
  title?: string | null;
  description?: string | null;
  marketKey?: string | null;
}

export interface Poll {
  pollId: string;
  question: string;
  state: string;
  mode?: string | null;
  axis?: unknown;
  marketKey?: string | null;
  marketName?: string | null;
  createdByUserId?: string | null;
  createdAt?: string | null;
  launchedAt?: string | null;
  closedAt?: string | null;
  /** When an active poll will auto-close (launchedAt + auto-close window). */
  closesAt?: string | null;
  graduatedAt?: string | null;
  /** Card stats (from attachPollStats on the list endpoint). */
  commentCount?: number;
  endorserCount?: number;
  creator?: PollCreator;
  /** Top leaderboard candidates ("see the poll" on the feed card). */
  topCandidates?: PollCandidate[];
  topic?: PollTopic | null;
}

export interface UserPollsResponse {
  activity: string;
  polls: Poll[];
}

export type PollQueryResponse = {
  marketKey?: string | null;
  marketName?: string | null;
  marketStatus?: 'resolved' | 'multi_market' | 'no_market' | 'error' | null;
  candidateLocalityName?: string | null;
  candidateBoundaryProvider?: string | null;
  candidateBoundaryId?: string | null;
  candidateBoundaryType?: string | null;
  cta?: {
    kind?: 'create_poll' | 'none' | null;
    label?: string | null;
    prompt?: string | null;
  } | null;
  polls: Poll[];
};

export type PollQueryPayload = {
  marketKey?: string;
  bounds?: MapBounds | null;
  userLocation?: Coordinate | null;
  state?: string;
};

export type PollFeedSource = 'cache' | 'network';

export type PollBootstrapSnapshot = {
  marketKey: string | null;
  marketName: string | null;
  marketStatus?: 'resolved' | 'multi_market' | 'no_market' | 'error' | null;
  candidateLocalityName?: string | null;
  candidateBoundaryProvider?: string | null;
  candidateBoundaryId?: string | null;
  candidateBoundaryType?: string | null;
  cta?: {
    kind?: 'create_poll' | 'none' | null;
    label?: string | null;
    prompt?: string | null;
  } | null;
  polls: Poll[];
  resolvedAtMs: number;
  source: PollFeedSource;
};

type PersistedPollBootstrapCache = {
  byMarketKey: Record<
    string,
    {
      marketKey: string;
      marketName: string | null;
      polls: Poll[];
      resolvedAtMs: number;
    }
  >;
  lastMarketKey: string | null;
};

export type CreatePollPayload = {
  topicType: PollTopicType;
  description?: string;
  marketKey?: string;
  bounds?: MapBounds | null;
  targetDishId?: string;
  targetRestaurantId?: string;
  targetFoodAttributeId?: string;
  targetRestaurantAttributeId?: string;
  targetDishName?: string;
  targetRestaurantName?: string;
  targetFoodAttributeName?: string;
  targetRestaurantAttributeName?: string;
  sessionToken?: string;
};

const normalizePollList = (payload: unknown): Poll[] => {
  if (Array.isArray(payload)) {
    return payload as Poll[];
  }
  if (payload && typeof payload === 'object') {
    const anyPayload = payload as Record<string, unknown>;
    if (Array.isArray(anyPayload.data)) {
      return anyPayload.data as Poll[];
    }
    if (
      anyPayload.polls &&
      typeof anyPayload.polls === 'object' &&
      Array.isArray((anyPayload.polls as Record<string, unknown>).data)
    ) {
      return (anyPayload.polls as { data: Poll[] }).data;
    }
    if (Array.isArray(anyPayload.polls)) {
      return anyPayload.polls as Poll[];
    }
  }
  return [];
};

const normalizePollQueryResponse = (payload: unknown): PollQueryResponse => {
  if (payload && typeof payload === 'object') {
    const anyPayload = payload as Record<string, unknown>;
    if (anyPayload.data) {
      return normalizePollQueryResponse(anyPayload.data);
    }
    if (Array.isArray(anyPayload.polls)) {
      const marketKey = typeof anyPayload.marketKey === 'string' ? anyPayload.marketKey : null;
      const marketName = typeof anyPayload.marketName === 'string' ? anyPayload.marketName : null;
      return {
        marketKey,
        marketName,
        marketStatus:
          anyPayload.marketStatus === 'resolved' ||
          anyPayload.marketStatus === 'multi_market' ||
          anyPayload.marketStatus === 'no_market' ||
          anyPayload.marketStatus === 'error'
            ? anyPayload.marketStatus
            : null,
        candidateLocalityName:
          typeof anyPayload.candidateLocalityName === 'string'
            ? anyPayload.candidateLocalityName
            : null,
        candidateBoundaryProvider:
          typeof anyPayload.candidateBoundaryProvider === 'string'
            ? anyPayload.candidateBoundaryProvider
            : null,
        candidateBoundaryId:
          typeof anyPayload.candidateBoundaryId === 'string'
            ? anyPayload.candidateBoundaryId
            : null,
        candidateBoundaryType:
          typeof anyPayload.candidateBoundaryType === 'string'
            ? anyPayload.candidateBoundaryType
            : null,
        cta:
          anyPayload.cta && typeof anyPayload.cta === 'object'
            ? (anyPayload.cta as PollQueryResponse['cta'])
            : null,
        polls: normalizePollList(anyPayload.polls),
      };
    }
  }

  return {
    marketKey: null,
    marketName: null,
    marketStatus: null,
    candidateLocalityName: null,
    candidateBoundaryProvider: null,
    candidateBoundaryId: null,
    candidateBoundaryType: null,
    cta: null,
    polls: normalizePollList(payload),
  };
};

const normalizePoll = (payload: unknown): Poll | null => {
  if (payload && typeof payload === 'object') {
    if ('pollId' in payload) {
      return payload as Poll;
    }
    const anyPayload = payload as Record<string, unknown>;
    if (anyPayload.data && typeof anyPayload.data === 'object') {
      return normalizePoll(anyPayload.data);
    }
    if (anyPayload.poll) {
      return normalizePoll(anyPayload.poll);
    }
  }
  return null;
};

const POLL_BOOTSTRAP_CACHE_STORAGE_KEY = 'polls:bootstrap-cache:v1';
const POLL_BOOTSTRAP_CACHE_TTL_MS = 30 * 60 * 1000;
const POLL_BOOTSTRAP_CACHE_MAX_ENTRIES = 12;
let pollBootstrapCacheMemory: PersistedPollBootstrapCache | null = null;

export const normalizePollMarketKey = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const createNetworkPollBootstrapSnapshot = (
  response: PollQueryResponse,
  resolvedAtMs: number = Date.now()
): PollBootstrapSnapshot => ({
  marketKey: normalizePollMarketKey(response.marketKey),
  marketName:
    typeof response.marketName === 'string' && response.marketName.trim()
      ? response.marketName.trim()
      : null,
  marketStatus: typeof response.marketStatus === 'string' ? response.marketStatus : null,
  candidateLocalityName:
    typeof response.candidateLocalityName === 'string' && response.candidateLocalityName.trim()
      ? response.candidateLocalityName.trim()
      : null,
  candidateBoundaryProvider:
    typeof response.candidateBoundaryProvider === 'string' &&
    response.candidateBoundaryProvider.trim()
      ? response.candidateBoundaryProvider.trim()
      : null,
  candidateBoundaryId:
    typeof response.candidateBoundaryId === 'string' && response.candidateBoundaryId.trim()
      ? response.candidateBoundaryId.trim()
      : null,
  candidateBoundaryType:
    typeof response.candidateBoundaryType === 'string' && response.candidateBoundaryType.trim()
      ? response.candidateBoundaryType.trim()
      : null,
  cta: response.cta ?? null,
  polls: response.polls ?? [],
  resolvedAtMs,
  source: 'network',
});

const buildPollBootstrapSnapshot = (entry: {
  marketKey: string;
  marketName: string | null;
  polls: Poll[];
  resolvedAtMs: number;
}): PollBootstrapSnapshot => ({
  marketKey: normalizePollMarketKey(entry.marketKey),
  marketName: entry.marketName ?? null,
  marketStatus: 'resolved',
  candidateLocalityName: null,
  candidateBoundaryProvider: null,
  candidateBoundaryId: null,
  candidateBoundaryType: null,
  cta: null,
  polls: entry.polls,
  resolvedAtMs: entry.resolvedAtMs,
  source: 'cache',
});

const readPollBootstrapCache = async (): Promise<PersistedPollBootstrapCache> => {
  if (pollBootstrapCacheMemory) {
    return pollBootstrapCacheMemory;
  }

  try {
    const raw = await AsyncStorage.getItem(POLL_BOOTSTRAP_CACHE_STORAGE_KEY);
    if (!raw) {
      pollBootstrapCacheMemory = { byMarketKey: {}, lastMarketKey: null };
      return pollBootstrapCacheMemory;
    }
    const parsed = JSON.parse(raw) as PersistedPollBootstrapCache;
    const nextByMarketKey: PersistedPollBootstrapCache['byMarketKey'] = {
      ...(parsed?.byMarketKey ?? {}),
    };
    pollBootstrapCacheMemory = {
      byMarketKey: nextByMarketKey,
      lastMarketKey: normalizePollMarketKey(parsed?.lastMarketKey) ?? null,
    };
    return pollBootstrapCacheMemory;
  } catch {
    pollBootstrapCacheMemory = { byMarketKey: {}, lastMarketKey: null };
    return pollBootstrapCacheMemory;
  }
};

const persistPollBootstrapCache = async (cache: PersistedPollBootstrapCache): Promise<void> => {
  pollBootstrapCacheMemory = cache;
  try {
    await AsyncStorage.setItem(POLL_BOOTSTRAP_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore cache persistence failures
  }
};

export const readPollBootstrapSnapshotForMarket = async (
  marketKey: string
): Promise<PollBootstrapSnapshot | null> => {
  const normalizedKey = normalizePollMarketKey(marketKey);
  if (!normalizedKey) {
    return null;
  }
  const cache = await readPollBootstrapCache();
  const entry = cache.byMarketKey[normalizedKey];
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.resolvedAtMs > POLL_BOOTSTRAP_CACHE_TTL_MS) {
    delete cache.byMarketKey[normalizedKey];
    if (cache.lastMarketKey === normalizedKey) {
      cache.lastMarketKey = null;
    }
    await persistPollBootstrapCache(cache);
    return null;
  }
  return buildPollBootstrapSnapshot(entry);
};

export const writePollBootstrapSnapshot = async (
  snapshot: PollBootstrapSnapshot
): Promise<void> => {
  const normalizedKey = normalizePollMarketKey(snapshot.marketKey);
  if (!normalizedKey) {
    return;
  }
  const cache = await readPollBootstrapCache();
  cache.byMarketKey[normalizedKey] = {
    marketKey: normalizedKey,
    marketName: snapshot.marketName ?? null,
    polls: snapshot.polls,
    resolvedAtMs: snapshot.resolvedAtMs,
  };
  cache.lastMarketKey = normalizedKey;

  const sortedKeys = Object.keys(cache.byMarketKey).sort((left, right) => {
    return cache.byMarketKey[right]!.resolvedAtMs - cache.byMarketKey[left]!.resolvedAtMs;
  });
  for (const staleKey of sortedKeys.slice(POLL_BOOTSTRAP_CACHE_MAX_ENTRIES)) {
    delete cache.byMarketKey[staleKey];
  }

  await persistPollBootstrapCache(cache);
};

export const fetchPolls = async (payload: PollQueryPayload): Promise<PollQueryResponse> => {
  const response = await api.post('/polls/query', payload);
  return normalizePollQueryResponse(response.data);
};

export const fetchPoll = async (pollId: string): Promise<Poll> => {
  const response = await api.get(`/polls/${pollId}`);
  const normalized = normalizePoll(response.data);
  if (normalized) {
    return normalized;
  }
  throw new Error('Invalid poll response');
};

export const createPoll = async (body: CreatePollPayload): Promise<Poll> => {
  const response = await api.post('/polls', body);
  const normalized = normalizePoll(response.data);
  return normalized ?? response.data;
};

// ─── Live model: comments, likes, leaderboard ────────────────────────────────

export const listPollComments = async (
  pollId: string,
  sort: PollCommentSort = 'top'
): Promise<PollComment[]> => {
  const response = await api.get<PollComment[]>(`/polls/${pollId}/comments`, {
    params: { sort },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const postPollComment = async (
  pollId: string,
  body: { body: string; parentCommentId?: string }
): Promise<PollComment> => {
  const response = await api.post<PollComment>(`/polls/${pollId}/comments`, body);
  return response.data;
};

export const editPollComment = async (
  commentId: string,
  body: { body: string }
): Promise<PollComment> => {
  const response = await api.patch<PollComment>(`/polls/comments/${commentId}`, body);
  return response.data;
};

export const deletePollComment = async (
  commentId: string
): Promise<{ commentId: string; deleted: boolean }> => {
  const response = await api.delete(`/polls/comments/${commentId}`);
  return response.data;
};

export const togglePollCommentLike = async (
  commentId: string
): Promise<{ commentId: string; liked: boolean; score: number }> => {
  const response = await api.post(`/polls/comments/${commentId}/likes`, {});
  return response.data;
};

export const fetchPollLeaderboard = async (pollId: string): Promise<PollLeaderboardEntry[]> => {
  const response = await api.get<PollLeaderboardEntry[]>(`/polls/${pollId}/leaderboard`);
  return Array.isArray(response.data) ? response.data : [];
};

/**
 * Toggle the viewer's direct endorsement of a leaderboard candidate
 * (tap-to-endorse on the poll bars). Returns the fresh standings so the UI can
 * settle in place. New candidates only enter via discussion — the subject must
 * already be on the leaderboard.
 */
export const togglePollEndorsement = async (
  pollId: string,
  subjectId: string,
  subjectType: PollLeaderboardSubjectType = 'entity'
): Promise<{ endorsed: boolean; leaderboard: PollLeaderboardEntry[] }> => {
  const response = await api.post(`/polls/${pollId}/endorsements`, {
    subjectId,
    subjectType,
  });
  return response.data;
};

export const fetchUserPolls = async (params: {
  activity?: 'created' | 'commented' | 'participated';
  marketKey?: string;
  state?: string;
  limit?: number;
  offset?: number;
}): Promise<UserPollsResponse> => {
  const response = await api.get<UserPollsResponse>('/polls/me', { params });
  return response.data;
};
