import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { usersService, type AccessSummary } from '../services/users';

/** User-scoped: an account switch must never serve the previous user's
 *  access state (PurchasesProvider also clears the whole cache on switch —
 *  this is the belt to that suspender). */
export const accessQueryKey = (userId: string | null | undefined) =>
  ['users', 'me', 'access', userId ?? 'anonymous'] as const;

export interface AccessState {
  /** SERVER-TRUTH: does this user currently have Crave+ access. */
  active: boolean;
  /** null while active = lifetime; string ISO expiry otherwise. */
  expiresAt: string | null;
  /** Which grant carries access (trial_base / subscription / comp / ...). */
  source: string | null;
  /** Days until access lapses (undefined for lifetime/inactive). */
  daysRemaining?: number;
  isLoading: boolean;
  /** Force-refetch server truth NOW and return it (purchase/restore polls
   *  await this — unlike invalidate, it works with no observer mounted). */
  refresh: () => Promise<AccessSummary | null>;
}

/**
 * The ONE hook UI gates and paywalls read (plans/payments-ideal-shape.md):
 * access truth comes from the server ledger via the profile payload — never
 * from RevenueCat CustomerInfo (RC can't see comps/rewards/trials).
 */
export function useAccess(): AccessState {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const queryKey = accessQueryKey(userId);
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<AccessSummary | null> => {
      const profile = await usersService.getMe();
      return profile.access ?? null;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const access = query.data ?? null;
  const expiresAt = access?.expiresAt ?? null;
  // Client-side expiry override: a cached "active" whose expiry has passed
  // while cached must read as INACTIVE (the cache can outlive the grant).
  const expired = expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
  const active = (access?.active ?? false) && !expired;
  const daysRemaining =
    active && expiresAt
      ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : undefined;

  return {
    active,
    expiresAt: active ? expiresAt : null,
    source: active ? (access?.source ?? null) : null,
    daysRemaining,
    isLoading: query.isLoading,
    refresh: async () => {
      const fresh = await queryClient.fetchQuery({
        queryKey,
        queryFn: async (): Promise<AccessSummary | null> => {
          const profile = await usersService.getMe();
          return profile.access ?? null;
        },
        staleTime: 0,
      });
      return fresh;
    },
  };
}
