import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePaywallPresentationStore } from '../store/paywallPresentationStore';
import { useAccess } from '../hooks/useAccess';
import { PaywallScreen } from './PaywallScreen';

/**
 * Full-screen paywall the user OPENED (settings → "Manage subscription" with
 * no live subscription). Dismissible — see paywallPresentationStore for why
 * this is not the lapse wall.
 *
 * Self-closes when access flips active, so a purchase made here does not
 * leave the buyer staring at the plans they just bought.
 */
export function PaywallPresentationHost(): React.ReactElement | null {
  const visible = usePaywallPresentationStore((state) => state.visible);
  const dismissPaywall = usePaywallPresentationStore((state) => state.dismissPaywall);
  const access = useAccess();

  React.useEffect(() => {
    if (visible && access.active) {
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
