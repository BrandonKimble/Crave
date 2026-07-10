import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import {
  getCurrentOffering,
  isPurchasesAvailable,
  purchasePackage,
  restorePurchases,
} from '../services/purchases';
import { useAccess } from '../hooks/useAccess';

/**
 * FUNCTIONAL paywall skeleton (plans/payments-ideal-shape.md step 5).
 * Visual design + copy belong to the screens thread; the flow contract here
 * is final:
 *  - packages come from the RC current offering (prices are store config —
 *    NEVER hardcode; the 3.1.2 disclosure block renders from
 *    product.priceString + introPrice)
 *  - purchase -> RC -> App Store sheet -> RC webhook -> server ledger grant
 *    -> poll server truth with EARLY EXIT (never gate on the local result)
 *  - after a successful store purchase the buy buttons NEVER re-arm: if the
 *    webhook is slow the screen says "activating" instead of inviting a
 *    double purchase
 *  - restore for reinstalls (same server-truth poll)
 *  - business model (decided 2026-07-08): HARD paywall at onboarding end.
 *    Store-managed introductory free trial with card upfront (Apple charges
 *    at trial end unless cancelled; Apple sends the pre-charge reminder).
 *    BILLING_TRIAL_DAYS stays 0 (app-owned trial is the future freemium
 *    pivot, not launch).
 */

const ACTIVATION_POLL_ATTEMPTS = 8;
const ACTIVATION_POLL_INTERVAL_MS = 1500;

export function PaywallScreen({ onClose }: { onClose?: () => void }): ReactElement {
  const access = useAccess();
  const { userId } = useAuth();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /** Store purchase landed but the server grant hasn't — buy stays disarmed. */
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = isPurchasesAvailable();

  useEffect(() => {
    let mounted = true;
    void getCurrentOffering().then((current) => {
      if (mounted) {
        setOffering(current);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [available]);

  /** Poll server truth until access flips (early exit) or attempts run out. */
  const pollForAccess = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < ACTIVATION_POLL_ATTEMPTS; attempt += 1) {
      const summary = await access.refresh();
      if (summary?.active) return true;
      await new Promise((resolve) => setTimeout(resolve, ACTIVATION_POLL_INTERVAL_MS));
    }
    return false;
  }, [access]);

  const buy = useCallback(
    async (pkg: PurchasesPackage) => {
      if (!userId) {
        setError('Sign in to subscribe.');
        return;
      }
      setBusy(pkg.identifier);
      setError(null);
      try {
        const result = await purchasePackage(pkg, userId);
        if (result) {
          // The store purchase succeeded. From here the buy buttons stay
          // DISARMED — a slow webhook must never invite a second purchase.
          setActivating(true);
          setBusy(null);
          await pollForAccess();
          // If the poll timed out we stay in "activating": server truth
          // arrives via the webhook + next refresh; restore also resolves it.
        } else {
          // User cancelled in the store sheet — no message needed.
          setBusy(null);
        }
      } catch (purchaseError) {
        setBusy(null);
        setError(
          purchaseError instanceof Error && purchaseError.message.includes('identity')
            ? 'Sign-in changed during purchase — please try again.'
            : 'The purchase could not be completed. You have not been charged.'
        );
      }
    },
    [pollForAccess, userId]
  );

  const restore = useCallback(async () => {
    setBusy('restore');
    setError(null);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setActivating(true);
        setBusy(null);
        const activated = await pollForAccess();
        if (!activated) {
          setActivating(false);
          setError('No previous purchases found for this account.');
        }
      } else {
        setBusy(null);
      }
    } catch {
      setBusy(null);
      setError('Restore failed — try again.');
    }
  }, [pollForAccess]);

  if (access.active) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You have Crave+</Text>
        {access.expiresAt ? (
          <Text style={styles.subtitle}>
            Access until {new Date(access.expiresAt).toLocaleDateString()}
          </Text>
        ) : null}
        <Pressable style={styles.secondary} onPress={onClose}>
          <Text style={styles.secondaryText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  if (activating) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
        <Text style={styles.title}>Activating Crave+…</Text>
        <Text style={styles.subtitle}>
          Your purchase went through — access unlocks in a moment. If this takes longer than a
          minute, reopen the app; you will not be charged again.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crave+</Text>
      <Text style={styles.subtitle}>
        The dish layer: ranked dishes across the city, dish scores, and the receipts behind them.
      </Text>

      {!available ? (
        <Text style={styles.notice}>Purchases aren&apos;t available in this build yet.</Text>
      ) : loading ? (
        <ActivityIndicator />
      ) : !offering ? (
        <Text style={styles.notice}>No plans available right now.</Text>
      ) : (
        offering.availablePackages.map((pkg) => (
          <Pressable
            key={pkg.identifier}
            style={styles.primary}
            disabled={busy !== null}
            onPress={() => void buy(pkg)}
          >
            <Text style={styles.primaryText}>
              {busy === pkg.identifier ? '…' : `${pkg.product.title} — ${pkg.product.priceString}`}
            </Text>
          </Pressable>
        ))
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.secondary} disabled={busy !== null} onPress={() => void restore()}>
        <Text style={styles.secondaryText}>Restore purchases</Text>
      </Pressable>
      {onClose ? (
        <Pressable style={styles.secondary} onPress={onClose}>
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', opacity: 0.8 },
  notice: { fontSize: 14, textAlign: 'center', opacity: 0.6 },
  error: { fontSize: 13, textAlign: 'center', color: '#c0392b' },
  primary: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { paddingVertical: 10, alignItems: 'center' },
  secondaryText: { fontSize: 14, opacity: 0.7 },
});
