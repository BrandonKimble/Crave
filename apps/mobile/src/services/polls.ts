import api from './api';

export interface PollOption {
  optionId: string;
  label: string;
  voteCount: number;
  consensus: string | number | null;
}

export type PollTopicType = 'best_dish' | 'what_to_order';

export interface PollTopic {
  topicType: PollTopicType;
  targetDishId?: string | null;
  targetRestaurantId?: string | null;
  title?: string | null;
  city?: string | null;
}

export interface Poll {
  pollId: string;
  question: string;
  state: string;
  city?: string | null;
  options: PollOption[];
  topic?: PollTopic | null;
}

export interface ManualPollPayload {
  question: string;
  topicType: PollTopicType;
  city?: string;
  description?: string;
  allowUserAdditions?: boolean;
  notifySubscribers?: boolean;
  targetDishId?: string;
  targetRestaurantId?: string;
}

const normalizePollList = (payload: unknown): Poll[] => {
  if (Array.isArray(payload)) {
    return payload;
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

export const fetchPolls = async (city?: string): Promise<Poll[]> => {
  const response = await api.get('/polls', {
    params: city ? { city } : undefined,
  });
  return normalizePollList(response.data);
};

export const fetchPoll = async (pollId: string): Promise<Poll> => {
  const response = await api.get(`/polls/${pollId}`);
  const normalized = normalizePoll(response.data);
  if (normalized) {
    return normalized;
  }
  throw new Error('Invalid poll response');
};

export const addPollOption = async (
  pollId: string,
  body: { label: string; restaurantId?: string; dishEntityId?: string }
) => {
  const response = await api.post(`/polls/${pollId}/options`, body);
  return response.data;
};

export const voteOnPoll = async (pollId: string, body: { optionId: string }) => {
  const response = await api.post(`/polls/${pollId}/votes`, body);
  return response.data;
};

export const createManualPoll = async (body: ManualPollPayload) => {
  const response = await api.post('/polls/admin/manual', body);
  const normalized = normalizePoll(response.data);
  return normalized ?? response.data;
};
