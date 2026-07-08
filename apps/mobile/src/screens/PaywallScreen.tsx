import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
 *  - packages come from the RC current offering (prices are store config)
 *  - purchase -> RC -> App Store sheet -> RC webhook -> server ledger grant
 *    -> refresh() pulls SERVER truth (never gate on the local result)
 *  - restore for reinstalls
 *  - business model (decided 2026-07-08): SOFT paywall at onboarding end.
 *    Monthly = paid immediately; ANNUAL carries an App Store introductory
 *    free trial (card upfront, store-managed, cancel-anytime — configured
 *    on the product in App Store Connect, RC surfaces eligibility on the
 *    package). Dismissible; declining leaves the user on the free tier.
 *    BILLING_TRIAL_DAYS stays 0 (app-owned trial is the future freemium
 *    pivot, not launch).
 */
export function PaywallScreen({ onClose }: { onClose?: () => void }): ReactElement {
  const access = useAccess();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
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
  }, []);

  const buy = useCallback(
    async (pkg: PurchasesPackage) => {
      setBusy(pkg.identifier);
      setError(null);
      try {
        const result = await purchasePackage(pkg);
        if (result) {
          // Access flips when the webhook lands the ledger grant; poll the
          // server truth a few times so the UI settles without a restart.
          for (let attempt = 0; attempt < 5; attempt += 1) {
            await access.refresh();
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      } catch {
        setError('Purchase failed — you have not been charged twice; try again.');
      } finally {
        setBusy(null);
      }
    },
    [access]
  );

  const restore = useCallback(async () => {
    setBusy('restore');
    setError(null);
    try {
      await restorePurchases();
      await access.refresh();
    } catch {
      setError('Restore failed — try again.');
    } finally {
      setBusy(null);
    }
  }, [access]);

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
