import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService, type AccessSummary } from '../services/users';

const ACCESS_QUERY_KEY = ['users', 'me', 'access'] as const;

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
  /** Call after a purchase or reward to pull fresh server truth. */
  refresh: () => Promise<void>;
}

/**
 * The ONE hook UI gates and paywalls read (plans/payments-ideal-shape.md):
 * access truth comes from the server ledger via the profile payload — never
 * from RevenueCat CustomerInfo (RC can't see comps/rewards/trials).
 */
export function useAccess(): AccessState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ACCESS_QUERY_KEY,
    queryFn: async (): Promise<AccessSummary | null> => {
      const profile = await usersService.getMe();
      return profile.access ?? null;
    },
    staleTime: 60_000,
  });

  const access = query.data ?? null;
  const active = access?.active ?? false;
  const expiresAt = access?.expiresAt ?? null;
  const daysRemaining =
    active && expiresAt
      ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : undefined;

  return {
    active,
    expiresAt,
    source: access?.source ?? null,
    daysRemaining,
    isLoading: query.isLoading,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEY });
    },
  };
}
