import axios from 'axios';

import { fetchUserPolls } from '../../services/polls';
import { usersService } from '../../services/users';

export type ProfileSegment = 'created' | 'contributed' | 'favorites';

export const PROFILE_DEFAULT_SEGMENT: ProfileSegment = 'created';

const USER_POLLS_STALE_MS = 1000 * 60;
const USER_POLLS_GC_MS = 1000 * 60 * 10;
const USER_PROFILE_STALE_MS = 1000 * 60;
const USER_PROFILE_GC_MS = 1000 * 60 * 10;

const profileQueryKey = ['user-profile'] as const;

const shouldRetryUserPollsQuery = (failureCount: number, error: unknown) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < 2;
};

export const createProfileQueryOptions = () => ({
  queryKey: profileQueryKey,
  queryFn: () => usersService.getMe(),
  staleTime: USER_PROFILE_STALE_MS,
  gcTime: USER_PROFILE_GC_MS,
});

export const getUserPollsQueryKey = (
  userId: string | null | undefined,
  activity: 'created' | 'participated'
) => ['user-polls', userId ?? 'none', activity] as const;

export const createUserPollsQueryDescriptor = ({
  userId,
  activity,
}: {
  userId: string | null | undefined;
  activity: 'created' | 'participated';
}) => ({
  queryKey: getUserPollsQueryKey(userId, activity),
  queryFn: () => fetchUserPolls({ activity, limit: 50 }),
  staleTime: USER_POLLS_STALE_MS,
  gcTime: USER_POLLS_GC_MS,
  retry: shouldRetryUserPollsQuery,
});
