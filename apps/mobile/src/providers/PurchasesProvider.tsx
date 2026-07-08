import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { configurePurchases, logOutPurchases } from '../services/purchases';

/**
 * Keeps the RevenueCat identity in lockstep with Clerk: signed in ->
 * configure/logIn with the Clerk user id (which the RC webhook maps back to
 * our user), signed out -> RC logOut. Renders nothing; safe when the native
 * module isn't in the binary yet (all calls no-op).
 */
export function PurchasesProvider(): null {
  const { isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (isSignedIn && userId) {
      void configurePurchases(userId);
    } else {
      void logOutPurchases();
    }
  }, [isSignedIn, userId]);

  return null;
}
