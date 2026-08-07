import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { usersService, type AccessSummary } from '../services/users';

/** User-scoped: an account switch must never serve the previous user's
 *  access state (PurchasesProvider also clears the whole cache on switch —
 *  this is the belt to that suspender). */
export const accessQueryKey = (userId: string | null | undefined) =>
  ['users', 'me', 'access', userId ?? 'anonymous'] as const;

export interface AccessState {
  /** SERVER-TRUTH: does this user currently have Crave Premium access. */
  active: boolean;
  /** null while active = lifetime; string ISO expiry otherwise. */
  expiresAt: string | null;
  /** Which grant carries access (trial_base / subscription / comp / ...). */
  source: string | null;
  /** Days until access lapses (undefined for lifetime/inactive). */
  daysRemaining?: number;
  /** Server-owned rollout switch: the app-wide paywall is enforcing. */
  enforced: boolean;
  /**
   * F4501: has server access truth actually been OBSERVED for this user? Both
   * `enforced` and `active` read false when the server says "off" AND when nothing
   * has ever answered (a failed fetch, or a profile payload that omitted the
   * `access` block — it is OPTIONAL on the DTO). Those are not the same fact, and
   * for `enforced` the difference is fail-open vs. walled, so the routing axis
   * needs to be able to tell them apart. See app-route-destination.ts.
   */
  isKnown: boolean;
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
// F1554: the access read was written out TWICE — once for the observed query and once inside
// `refresh` — so the shape of "what access truth is" lived in two places in one file.
const fetchAccessSummary = async (): Promise<AccessSummary | null> => {
  const profile = await usersService.getMe();
  return profile.access ?? null;
};

export function useAccess(): AccessState {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const queryKey = accessQueryKey(userId);
  const query = useQuery({
    queryKey,
    queryFn: fetchAccessSummary,
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

  // F1554: this used to return a FRESH object literal with a FRESH `refresh` closure on every
  // render. All three consumers hold the result as a value and one puts it in a dependency
  // array (PaywallScreen's `pollForAccess` → `buy` → `restore` were re-minted every render
  // because of it). A hook whose identity churns every render is a dependency array that never
  // settles; memoize the return and the closure, and the churn stops at the source.
  const refresh = useCallback(
    () => queryClient.fetchQuery({ queryKey, queryFn: fetchAccessSummary, staleTime: 0 }),
    // `queryKey` is a fresh tuple per render; its CONTENT (the userId) is the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, userId]
  );

  return useMemo(
    () => ({
      active,
      expiresAt: active ? expiresAt : null,
      source: active ? (access?.source ?? null) : null,
      daysRemaining,
      enforced: access?.enforced ?? false,
      isKnown: access !== null,
      isLoading: query.isLoading,
      refresh,
    }),
    [
      // F4501: the whole summary is the dependency now (`isKnown` reads its
      // presence, not one field), which subsumes the two field deps that used to
      // sit here.
      access,
      active,
      daysRemaining,
      expiresAt,
      query.isLoading,
      refresh,
    ]
  );
}
