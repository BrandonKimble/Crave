import api from './api';
import type { MapBounds } from '../types';

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
  state?: string;
};

export type CreatePollPayload = {
  topicType: PollTopicType;
  description: string;
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
