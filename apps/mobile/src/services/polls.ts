import api from './api';
import type { MapBounds } from '../types';

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
  /** §6 place-keyed feed: the poll's place + its batch-resolved label. */
  placeId?: string | null;
  placeName?: string | null;
  /** Legacy market fields — still present on non-feed reads (getPoll, topic); the feed renders placeName. */
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

/** §6 cold-start promise: typed state from the server; the COPY is mobile's. */
export type PollFeedPromise = {
  kind: 'weekly_drop_pending';
  placeName: string;
};

/**
 * §22 item-5 feed contract (POST /polls/query): viewport-scoped feed with keyset
 * cursor pagination. The header carries the §2 subjecthood verdict — null renders
 * the first-class "Polls in this area". marketKey/marketName/marketStatus are DEAD.
 */
export type PollQueryResponse = {
  header: { placeName: string | null };
  promise: PollFeedPromise | null;
  polls: Poll[];
  /** Opaque keyset cursor for the next page; null = end of feed. */
  nextCursor: string | null;
};

export type PollFeedSort = 'new' | 'top' | 'trending';
export type PollFeedType = 'all' | 'polls' | 'discussions';
export type PollFeedTime = 'all_time' | 'today' | 'this_week' | 'this_month';

export type PollQueryPayload = {
  /** The request's real subject: the map viewport. Always sent. */
  bounds: MapBounds;
  /** Opaque `nextCursor` from the previous page (omit for the first page). */
  cursor?: string;
  /** Page size (server-validated, ≤100). Omit for the server default. */
  limit?: number;
  state?: string;
  sort?: PollFeedSort;
  type?: PollFeedType;
  time?: PollFeedTime;
};

export type CreatePollPayload = {
  // Free-text question — the LLM infers mode + axis (the default, type-less creation
  // path). When present, the backend ignores topicType/target fields.
  question?: string;
  topicType?: PollTopicType;
  description?: string;
  marketKey?: string;
  bounds?: MapBounds | null;
  closeWindowDays?: number;
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

const normalizePollFeedPromise = (value: unknown): PollFeedPromise | null => {
  if (
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'weekly_drop_pending' &&
    typeof (value as { placeName?: unknown }).placeName === 'string'
  ) {
    return {
      kind: 'weekly_drop_pending',
      placeName: (value as { placeName: string }).placeName,
    };
  }
  return null;
};

const normalizePollQueryResponse = (payload: unknown): PollQueryResponse => {
  if (payload && typeof payload === 'object') {
    const anyPayload = payload as Record<string, unknown>;
    if (anyPayload.data) {
      return normalizePollQueryResponse(anyPayload.data);
    }
    if (Array.isArray(anyPayload.polls)) {
      const header = anyPayload.header as { placeName?: unknown } | undefined;
      return {
        header: {
          placeName:
            header && typeof header.placeName === 'string' && header.placeName.trim()
              ? header.placeName.trim()
              : null,
        },
        promise: normalizePollFeedPromise(anyPayload.promise),
        polls: normalizePollList(anyPayload.polls),
        nextCursor: typeof anyPayload.nextCursor === 'string' ? anyPayload.nextCursor : null,
      };
    }
  }

  return {
    header: { placeName: null },
    promise: null,
    polls: normalizePollList(payload),
    nextCursor: null,
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

// The marketKey-keyed bootstrap cache is DEAD with the §22 item-5 cut. Its whole
// value was instant launch content under a STABLE key (the market); the viewport
// feed has no stable key — startup bounds differ on every launch, so a
// bounds-hash cache would essentially never hit, and a "nearest bucket" key
// would serve another viewport's polls under a place-verdict header it doesn't
// match. Caching adds nothing now: the feed skeletons for one fast query.

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

/** User-profile sections (page-registry §7.3): another user's created polls. */
export interface UserProfilePollRow {
  pollId: string;
  state?: string | null;
  topic?: { title?: string | null; description?: string | null } | null;
}

export const fetchUserCreatedPolls = async (userId: string): Promise<UserProfilePollRow[]> => {
  const response = await api.get<{ polls: UserProfilePollRow[] }>(`/polls/users/${userId}`, {
    params: { activity: 'created' },
  });
  return response.data?.polls ?? [];
};

/** §7.3 Comments section: the user's live comment rows w/ poll context. */
export interface UserProfileCommentRow {
  commentId: string;
  pollId: string;
  body: string;
  score: number;
  loggedAt: string;
  pollTitle: string | null;
}

export const fetchUserComments = async (userId: string): Promise<UserProfileCommentRow[]> => {
  const response = await api.get<UserProfileCommentRow[]>(`/polls/users/${userId}/comments`);
  return response.data ?? [];
};

export const createPoll = async (body: CreatePollPayload): Promise<Poll> => {
  const response = await api.post('/polls', body);
  const normalized = normalizePoll(response.data);
  return normalized ?? response.data;
};

export type PollDuplicateMatch = {
  pollId: string;
  question: string;
  similarity: number;
};

// Stage-1 creation dedup: fast text-similarity check against active polls in the
// market, before the LLM resolves the poll. A non-empty result → route the creator to
// the existing poll instead of spinning up a duplicate (§3).
export const checkPollDuplicate = async (body: {
  question: string;
  marketKey?: string;
}): Promise<{ matches: PollDuplicateMatch[] }> => {
  const response = await api.post('/polls/check-duplicate', body);
  const data = (response.data ?? {}) as { matches?: PollDuplicateMatch[] };
  return { matches: Array.isArray(data.matches) ? data.matches : [] };
};

// ─── Restaurant mentions (W3, page-registry §8.4 Discussions view) ──────────

export interface RestaurantMentionUser {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RestaurantMentionReply {
  commentId: string;
  body: string;
  score: number;
  loggedAt: string;
  user: RestaurantMentionUser;
}

/** One discussion card: a vote-comment framed by its poll question, with
 *  thread-merged mention replies nested (non-mention intermediates skipped). */
export interface RestaurantMentionCard {
  commentId: string;
  body: string;
  score: number;
  loggedAt: string;
  user: RestaurantMentionUser;
  pollId: string;
  pollQuestion: string;
  replies: RestaurantMentionReply[];
}

export interface RestaurantMentionTag {
  entityId: string;
  name: string;
  type: string;
  mentionCount: number;
}

export interface RestaurantMentionsResponse {
  restaurantId: string;
  tags: RestaurantMentionTag[];
  cards: RestaurantMentionCard[];
  totalCount: number;
}

export const fetchRestaurantMentions = async (
  restaurantId: string,
  params: { sort?: 'top' | 'new'; search?: string; tags?: string[] } = {}
): Promise<RestaurantMentionsResponse> => {
  const response = await api.get<RestaurantMentionsResponse>(
    `/polls/restaurants/${restaurantId}/mentions`,
    {
      params: {
        ...(params.sort ? { sort: params.sort } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.tags?.length ? { tags: params.tags.join(',') } : {}),
      },
    }
  );
  return response.data;
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

/** §9b reportContent — comment report reasons (server-validated enum). */
export type PollCommentReportReason = 'spam' | 'harassment' | 'off_topic' | 'other';

export const reportPollComment = async (
  commentId: string,
  reason: PollCommentReportReason
): Promise<{ reported: boolean }> => {
  const response = await api.post(`/polls/comments/${commentId}/report`, { reason });
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
