import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useEntitlementLapseStore } from '../store/entitlementLapseStore';
import { useAccess } from '../hooks/useAccess';
import { captureHandledError } from '../observability/crash-reporting';
import { PaywallScreen } from './PaywallScreen';

/**
 * Full-screen paywall takeover for the LAPSE moment (hard-paywall model):
 * the api client announces ENTITLEMENT_REQUIRED through the lapse store and
 * this host owns the response. Non-dismissible by design — it clears ONLY
 * when server-truth access flips active (post-purchase/restore), or when a
 * refresh proves the 403 was a stale-cache race.
 */
export function EntitlementLapseHost(): React.ReactElement | null {
  const lapsed = useEntitlementLapseStore((state) => state.lapsed);
  const clearLapse = useEntitlementLapseStore((state) => state.clearLapse);
  const access = useAccess();

  // On becoming lapsed, re-check server truth once: a cached-403 race where
  // the user actually has access self-dismisses instead of walling them.
  React.useEffect(() => {
    if (!lapsed) return;
    void access
      .refresh()
      .then((summary) => {
        if (summary?.active) clearLapse();
      })
      // F812 (2026-08-03): this probe had NO `.catch`, inside the paywall takeover. It
      // fires precisely when the server just returned 403 — the likeliest next outcome is
      // that /users/me fails too, which produced an UNHANDLED PROMISE REJECTION on the
      // wall. `.catch(() => {})` is not the fix: the honest answer is that we could not
      // confirm access, so THE WALL STAYS UP (doing nothing here is exactly that), and the
      // reason goes to the crash-reporting seam instead of nowhere.
      .catch((error) => {
        captureHandledError(error, { seam: 'entitlement:lapse-recheck' });
      });
    // access.refresh is stable-enough (fetchQuery wrapper); depending on it
    // would re-fire the probe on every render.
    // F808 (2026-08-03): the bare `// eslint-disable-line` that lived here is DELETED. It
    // named NO RULE, so it disabled EVERY rule on this line — a blanket mute — in order to
    // silence exhaustive-deps, which WAS NOT INSTALLED at the time. Now that the plugin is
    // installed, this hook does produce an exhaustive-deps WARNING (missing 'access' and
    // 'clearLapse'), and that warning is left VISIBLE on purpose: the omission is the
    // deliberate design stated two lines above, and the fix is to make `access` stable at
    // its source, not to re-mute the line. If it is ever suppressed again, it must be with
    // `// eslint-disable-next-line react-hooks/exhaustive-deps` — a named rule, one line.
  }, [lapsed]);

  // Access restored (purchase/restore completed): drop the wall.
  React.useEffect(() => {
    if (lapsed && access.active) {
      clearLapse();
    }
  }, [lapsed, access.active, clearLapse]);

  if (!lapsed) {
    return null;
  }

  return (
    <View style={styles.root}>
      <PaywallScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    zIndex: 1100, // above the dev previews (1000)
  },
});
