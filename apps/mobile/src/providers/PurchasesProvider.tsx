import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { configurePurchases, logOutPurchases } from '../services/purchases';

/**
 * Keeps DOWNSTREAM identity in lockstep with Clerk:
 * - RevenueCat: signed in -> configure/logIn with the Clerk user id (which
 *   the RC webhook maps back to our user), signed out -> RC logOut.
 * - react-query: the cache is cleared whenever the signed-in user CHANGES
 *   (including sign-out) — without this, user B can render user A's cached
 *   /users/me + access state for minutes after an account switch.
 * Renders nothing; safe when the RC native module isn't in the binary yet
 * (all purchase calls no-op).
 */
export function PurchasesProvider(): null {
  const { isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = isSignedIn && userId ? userId : null;
    const previousUserId = lastUserIdRef.current;
    if (previousUserId !== null && previousUserId !== currentUserId) {
      // Account switched or signed out: nothing cached under the old
      // identity may survive into the new one.
      queryClient.clear();
    }
    lastUserIdRef.current = currentUserId;
    if (currentUserId) {
      void configurePurchases(currentUserId);
    } else {
      void logOutPurchases();
    }
  }, [isSignedIn, userId, queryClient]);

  return null;
}
