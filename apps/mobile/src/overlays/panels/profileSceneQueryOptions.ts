import { usersService } from '../../services/users';

// The signed-in user's own profile read (getMe). Shared across the profile tab identity chrome,
// the settings subscription line, and the poll surfaces that need the viewer's identity — one
// query key so all consumers hit one cache entry.

const USER_PROFILE_STALE_MS = 1000 * 60;
const USER_PROFILE_GC_MS = 1000 * 60 * 10;

/**
 * USER-SCOPED (F9805). The key used to be a bare `['user-profile']`, while its
 * sibling read of the SAME payload — `accessQueryKey` in hooks/useAccess.ts —
 * was already scoped by Clerk user id, with a comment explaining exactly why:
 * "an account switch must never serve the previous user's access state". Both
 * keys cache `getMe()`. Only one of them obeyed the rule.
 *
 * What the gap costs: sign out of Alice, sign in as Bob, and until the entry
 * goes stale Bob's settings render Alice's subscription line, Alice's avatar,
 * and — since F9800 — Alice's billing rail, which is what "Manage subscription"
 * dispatches on. PurchasesProvider clears the whole cache on a switch; this is
 * the belt to that suspender, the same one useAccess already wears.
 *
 * The userId is a REQUIRED parameter rather than a hook read, so a new consumer
 * cannot quietly reintroduce an unscoped key — omitting it does not compile.
 */
const profileQueryKey = (userId: string | null | undefined) =>
  ['user-profile', userId ?? 'anonymous'] as const;

export const createProfileQueryOptions = (userId: string | null | undefined) => ({
  queryKey: profileQueryKey(userId),
  queryFn: () => usersService.getMe(),
  staleTime: USER_PROFILE_STALE_MS,
  gcTime: USER_PROFILE_GC_MS,
});
