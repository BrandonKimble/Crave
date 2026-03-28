import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import type { Coordinate, MapBounds } from '../types';

export interface PollOption {
  optionId: string;
  label: string;
  voteCount: number;
  consensus: string | number | null;
  currentUserVoted?: boolean;
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
  coverageKey?: string | null;
}

export interface Poll {
  pollId: string;
  question: string;
  state: string;
  coverageKey?: string | null;
  coverageName?: string | null;
  createdByUserId?: string | null;
  createdAt?: string | null;
  launchedAt?: string | null;
  options: PollOption[];
  topic?: PollTopic | null;
}

export interface UserPollsResponse {
  activity: string;
  polls: Poll[];
}

export type PollQueryResponse = {
  coverageKey?: string | null;
  coverageName?: string | null;
  polls: Poll[];
};

export type PollQueryPayload = {
  coverageKey?: string;
  bounds?: MapBounds | null;
  fallbackLocation?: Coordinate | null;
  state?: string;
};

export type PollFeedSource = 'cache' | 'network';

export type PollBootstrapSnapshot = {
  coverageKey: string | null;
  coverageName: string | null;
  polls: Poll[];
  resolvedAtMs: number;
  source: PollFeedSource;
};

type PersistedPollBootstrapCache = {
  byCoverageKey: Record<
    string,
    {
      coverageKey: string;
      coverageName: string | null;
      polls: Poll[];
      resolvedAtMs: number;
    }
  >;
  lastCoverageKey: string | null;
};

export type CreatePollPayload = {
  topicType: PollTopicType;
  description?: string;
  coverageKey?: string;
  bounds?: MapBounds | null;
  targetDishId?: string;
  targetRestaurantId?: string;
  targetFoodAttributeId?: string;
  targetRestaurantAttributeId?: string;
  targetDishName?: string;
  targetRestaurantName?: string;
  targetFoodAttributeName?: string;
  targetRestaurantAttributeName?: string;
  topicEntityId?: string;
  topicEntityName?: string;
  topicEntityType?: string;
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
      return {
        coverageKey: typeof anyPayload.coverageKey === 'string' ? anyPayload.coverageKey : null,
        coverageName: typeof anyPayload.coverageName === 'string' ? anyPayload.coverageName : null,
        polls: normalizePollList(anyPayload.polls),
      };
    }
  }

  return {
    coverageKey: null,
    coverageName: null,
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

export const normalizePollCoverageKey = (value: string | null | undefined): string | null => {
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
  coverageKey: normalizePollCoverageKey(response.coverageKey),
  coverageName:
    typeof response.coverageName === 'string' && response.coverageName.trim()
      ? response.coverageName.trim()
      : null,
  polls: response.polls ?? [],
  resolvedAtMs,
  source: 'network',
});

const buildPollBootstrapSnapshot = (entry: {
  coverageKey: string;
  coverageName: string | null;
  polls: Poll[];
  resolvedAtMs: number;
}): PollBootstrapSnapshot => ({
  coverageKey: entry.coverageKey,
  coverageName: entry.coverageName,
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
      pollBootstrapCacheMemory = { byCoverageKey: {}, lastCoverageKey: null };
      return pollBootstrapCacheMemory;
    }
    const parsed = JSON.parse(raw) as PersistedPollBootstrapCache;
    pollBootstrapCacheMemory = {
      byCoverageKey: parsed?.byCoverageKey ?? {},
      lastCoverageKey: normalizePollCoverageKey(parsed?.lastCoverageKey) ?? null,
    };
    return pollBootstrapCacheMemory;
  } catch {
    pollBootstrapCacheMemory = { byCoverageKey: {}, lastCoverageKey: null };
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

export const readPollBootstrapSnapshotForCoverage = async (
  coverageKey: string
): Promise<PollBootstrapSnapshot | null> => {
  const normalizedKey = normalizePollCoverageKey(coverageKey);
  if (!normalizedKey) {
    return null;
  }
  const cache = await readPollBootstrapCache();
  const entry = cache.byCoverageKey[normalizedKey];
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.resolvedAtMs > POLL_BOOTSTRAP_CACHE_TTL_MS) {
    delete cache.byCoverageKey[normalizedKey];
    if (cache.lastCoverageKey === normalizedKey) {
      cache.lastCoverageKey = null;
    }
    await persistPollBootstrapCache(cache);
    return null;
  }
  return buildPollBootstrapSnapshot(entry);
};

export const writePollBootstrapSnapshot = async (
  snapshot: PollBootstrapSnapshot
): Promise<void> => {
  const normalizedKey = normalizePollCoverageKey(snapshot.coverageKey);
  if (!normalizedKey) {
    return;
  }
  const cache = await readPollBootstrapCache();
  cache.byCoverageKey[normalizedKey] = {
    coverageKey: normalizedKey,
    coverageName: snapshot.coverageName,
    polls: snapshot.polls,
    resolvedAtMs: snapshot.resolvedAtMs,
  };
  cache.lastCoverageKey = normalizedKey;

  const sortedKeys = Object.keys(cache.byCoverageKey).sort((left, right) => {
    return cache.byCoverageKey[right]!.resolvedAtMs - cache.byCoverageKey[left]!.resolvedAtMs;
  });
  for (const staleKey of sortedKeys.slice(POLL_BOOTSTRAP_CACHE_MAX_ENTRIES)) {
    delete cache.byCoverageKey[staleKey];
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

export const addPollOption = async (
  pollId: string,
  body: {
    label: string;
    restaurantId?: string;
    dishEntityId?: string;
    restaurantName?: string;
    dishName?: string;
    sessionToken?: string;
  }
) => {
  const response = await api.post(`/polls/${pollId}/options`, body);
  return response.data;
};

export const voteOnPoll = async (pollId: string, body: { optionId: string }) => {
  const response = await api.post(`/polls/${pollId}/votes`, body);
  return response.data;
};

export const fetchUserPolls = async (params: {
  activity?: 'created' | 'voted' | 'option_added' | 'participated';
  coverageKey?: string;
  state?: string;
  limit?: number;
  offset?: number;
}): Promise<UserPollsResponse> => {
  const response = await api.get<UserPollsResponse>('/polls/me', { params });
  return response.data;
};
