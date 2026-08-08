import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePaywallPresentationStore } from '../store/paywallPresentationStore';
import { useAccess } from '../hooks/useAccess';
import { PaywallScreen } from './PaywallScreen';
import { shouldAutoDismissPaywall } from './paywall-auto-dismiss';

/**
 * Full-screen paywall the user OPENED (settings → "Manage subscription" with
 * no live subscription). Dismissible — see paywallPresentationStore for why
 * this is not the lapse wall.
 *
 * Self-closes when access flips active DURING the visit, so a purchase made
 * here does not leave the buyer staring at the plans they just bought — but a
 * reverse-trial user (active, no rail) who opened it deliberately gets to stay
 * and buy. See paywall-auto-dismiss.ts for why that distinction is the whole
 * finding (F9801).
 */
export function PaywallPresentationHost(): React.ReactElement | null {
  const visible = usePaywallPresentationStore((state) => state.visible);
  const dismissPaywall = usePaywallPresentationStore((state) => state.dismissPaywall);
  const access = useAccess();
  // `access.active` as it stood when this presentation began; null while the
  // paywall is closed, so the next open re-samples.
  const activeAtPresentRef = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    if (!visible) {
      activeAtPresentRef.current = null;
      return;
    }
    if (activeAtPresentRef.current === null) {
      activeAtPresentRef.current = access.active;
    }
    if (
      shouldAutoDismissPaywall({
        activeAtPresent: activeAtPresentRef.current,
        activeNow: access.active,
      })
    ) {
      dismissPaywall();
    }
  }, [visible, access.active, dismissPaywall]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.root}>
      <PaywallScreen onClose={dismissPaywall} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    // Below the lapse wall (1100): if the server says access is REQUIRED
    // while this is open, the non-dismissible wall must win.
    zIndex: 1050,
  },
});
