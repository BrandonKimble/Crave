import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useEntitlementLapseStore } from '../store/entitlementLapseStore';
import { useAccess } from '../hooks/useAccess';
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
    void access.refresh().then((summary) => {
      if (summary?.active) clearLapse();
    });
    // access.refresh is stable-enough (fetchQuery wrapper); depending on it
    // would re-fire the probe on every render.
  }, [lapsed]); // eslint-disable-line

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
