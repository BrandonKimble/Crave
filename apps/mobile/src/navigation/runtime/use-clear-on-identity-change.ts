import React from 'react';

/**
 * A TAKEOVER BELONGS TO THE PERSON IT WAS RAISED FOR.
 *
 * Every app-wide takeover is announced from the API chokepoint about ONE
 * account: the session lapsed, the entitlement lapsed, the account is deleted.
 * The flag then lives in a store that outlives the account — so if the person
 * signs out and somebody else signs in on the same device, the new user
 * inherits a story about a stranger. For the deleted-account takeover that is
 * not cosmetic: the second person is shown "your account is closed" and handed
 * a button to "restore" an account that was never theirs.
 *
 * The session-lapse coordinator already carried this guard, written inline.
 * The deleted-account takeover was added beside it and did not — which is the
 * signature of a rule that lives in a comment instead of a function. A third
 * takeover would have missed it too.
 *
 * THE RULE: the flag is retired when the identity it was raised for stops
 * being the current one — a sign-out (the person is honestly anonymous now) or
 * a different user id.
 *
 * `undefined` vs `null` is load-bearing: `undefined` means "not yet captured"
 * and `null` means "captured, and there was no signed-in user". Collapsing them
 * would clear the flag on the very render that raised it.
 */
export function useClearOnIdentityChange({
  active,
  currentUserId,
  isSignedIn,
  clear,
}: {
  active: boolean;
  currentUserId: string | null | undefined;
  /** Clerk reports `undefined` until loaded — treated as "not signed in"
   *  would clear the flag during boot, so it is normalised, not coerced. */
  isSignedIn: boolean | undefined;
  clear: () => void;
}): void {
  const raisedForRef = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (!active) {
      raisedForRef.current = undefined;
      return;
    }
    if (raisedForRef.current === undefined) {
      raisedForRef.current = currentUserId ?? null;
      return;
    }
    // `undefined` (still loading) is NOT a sign-out. Treating it as one would
    // retire the takeover on the first render after a cold start, before Clerk
    // has answered — the person would briefly see the app as if nothing were
    // wrong, then have it yanked back.
    if (isSignedIn === undefined) return;
    if (!isSignedIn || (currentUserId ?? null) !== raisedForRef.current) {
      clear();
    }
  }, [active, clear, currentUserId, isSignedIn]);
}
