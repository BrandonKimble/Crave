import { usersService } from '../../services/users';

// The signed-in user's own profile read (getMe). Shared across the profile tab identity chrome,
// the settings subscription line, and the poll surfaces that need the viewer's identity — one
// query key so all consumers hit one cache entry.

const USER_PROFILE_STALE_MS = 1000 * 60;
const USER_PROFILE_GC_MS = 1000 * 60 * 10;

const profileQueryKey = ['user-profile'] as const;

export const createProfileQueryOptions = () => ({
  queryKey: profileQueryKey,
  queryFn: () => usersService.getMe(),
  staleTime: USER_PROFILE_STALE_MS,
  gcTime: USER_PROFILE_GC_MS,
});
